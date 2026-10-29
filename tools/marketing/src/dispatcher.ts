import { advanceBlogPost, blogUrl } from './blog/publisher.ts';
import { toDevtoMarkdown } from './blog/devto-markdown.ts';
import { createGitHubClient, type GitHubClient } from './blog/github.ts';
import { createAdapters } from './channels/registry.ts';
import type { ChannelAdapter, Draft, SocialChannel } from './channels/types.ts';
import {
  createCredentialStore,
  type CredentialStore,
} from './credentials/store.ts';
import { createDatabaseExecutor, type SqlExecutor } from './growth.ts';
import {
  holdWithDependents,
  leaseDuePosts,
  markFailed,
  markPublished,
  markPublishing,
  markRetry,
  PostStateError,
  updateBlogDraft,
} from './queue/repository.ts';
import type { BlogDraft, DevtoDraft, QueuedPost } from './queue/types.ts';

/** The most posts one tick leases. */
export const DISPATCH_BATCH_SIZE = 5;

/** Days ahead a stored credential's expiry raises `credential_expiring`. */
const CREDENTIAL_WARNING_DAYS = 14;
/** How long the `isLive` HEAD request may take. */
const LIVE_CHECK_TIMEOUT_MS = 10_000;

/** What the dispatcher needs; tests inject fakes for each. */
export interface DispatchDependencies {
  executor: SqlExecutor;
  adapters: Record<SocialChannel, ChannelAdapter>;
  credentials: CredentialStore;
  github: GitHubClient;
  isLive: (url: string) => Promise<boolean>;
  now: () => Date;
}

/** What one tick did; `operatorAlerts` is de-duplicated. */
export interface DispatchResult {
  leased: number;
  published: number;
  failed: number;
  held: number;
  operatorAlerts: Array<
    'post_failed' | 'blog_not_live' | 'credential_expiring'
  >;
}

type OperatorAlert = DispatchResult['operatorAlerts'][number];

interface Tally {
  published: number;
  failed: number;
  held: number;
  alerts: Set<OperatorAlert>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Holds the posts that depend on `postId`, leaving `postId` itself alone. */
async function holdDependents(
  deps: DispatchDependencies,
  postId: string,
  reason: string,
  tally: Tally,
): Promise<void> {
  const { rows } = await deps.executor.execute<{ id: string }>(
    'select id from marketing_posts where depends_on = $1::uuid',
    [postId],
  );
  for (const row of rows) {
    const held = await holdWithDependents(deps.executor, row.id, reason);
    tally.held += held.length;
  }
}

async function failBlog(
  deps: DispatchDependencies,
  post: QueuedPost,
  reason: string,
  tally: Tally,
): Promise<void> {
  tally.failed += 1;
  tally.alerts.add('post_failed');
  await holdDependents(deps, post.id, reason, tally);
}

async function dispatchBlog(
  deps: DispatchDependencies,
  post: QueuedPost & { draft: BlogDraft },
  now: Date,
  tally: Tally,
): Promise<void> {
  const { executor } = deps;
  let step;
  try {
    step = await advanceBlogPost(post, now, deps);
  } catch (error) {
    const outcome = await markRetry(
      executor,
      post.id,
      messageOf(error),
      deps.now(),
    );
    if (outcome === 'failed') {
      await failBlog(deps, post, messageOf(error), tally);
    }
    return;
  }

  switch (step.kind) {
    case 'wait':
      return;
    case 'branch_updated':
      await updateBlogDraft(executor, post.id, {
        branchUpdatedAt: step.at.toISOString(),
      });
      return;
    case 'merged':
      await updateBlogDraft(executor, post.id, {
        mergedAt: step.at.toISOString(),
      });
      return;
    case 'published':
      await markPublished(executor, post.id, {
        externalId: post.draft.slug,
        externalUrl: blogUrl(post.draft.slug),
        publishedAt: step.at,
      });
      tally.published += 1;
      return;
    case 'failed':
      await markFailed(executor, post.id, step.reason);
      await failBlog(deps, post, step.reason, tally);
      return;
    case 'not_live': {
      const held = await holdWithDependents(executor, post.id, step.reason);
      tally.held += held.length;
      tally.alerts.add('blog_not_live');
      return;
    }
  }
}

async function buildDraft(
  deps: DispatchDependencies,
  post: QueuedPost,
): Promise<Draft> {
  if (post.draft.channel !== 'devto') return post.draft as Draft;
  const { blogSlug, article } = post.draft as DevtoDraft;
  const markdown = await deps.github.readFile(
    `www/content/blog/${blogSlug}.md`,
    'main',
  );
  const url = blogUrl(blogSlug);
  return {
    channel: 'devto',
    text: toDevtoMarkdown(markdown, url),
    article: { ...article, canonicalUrl: url },
  };
}

async function dispatchSocial(
  deps: DispatchDependencies,
  post: QueuedPost,
  tally: Tally,
): Promise<void> {
  const { executor } = deps;
  await markPublishing(executor, post.id);

  let result;
  try {
    const draft = await buildDraft(deps, post);
    const adapter = deps.adapters[draft.channel];
    result = await adapter.post(draft);
  } catch (error) {
    const outcome = await markRetry(
      executor,
      post.id,
      messageOf(error),
      deps.now(),
    );
    if (outcome === 'failed') {
      tally.failed += 1;
      tally.alerts.add('post_failed');
    }
    return;
  }

  await markPublished(executor, post.id, {
    externalId: result.postId,
    externalUrl: result.url,
    publishedAt: new Date(result.postedAt),
  });
  tally.published += 1;
}

async function dispatchPost(
  deps: DispatchDependencies,
  post: QueuedPost,
  now: Date,
  tally: Tally,
): Promise<void> {
  if (post.status === 'publishing') {
    // The lease expired mid-publish: the post may be live. Never re-post.
    await markFailed(
      deps.executor,
      post.id,
      'publish outcome unknown, check the channel before retrying',
    );
    tally.failed += 1;
    tally.alerts.add('post_failed');
    return;
  }
  if (post.channel === 'blog') {
    await dispatchBlog(
      deps,
      post as QueuedPost & { draft: BlogDraft },
      now,
      tally,
    );
    return;
  }
  await dispatchSocial(deps, post, tally);
}

/**
 * One marketing tick: leases the due approved posts, publishes each and
 * records the outcome. One post's failure never aborts the batch, and a post
 * whose state changed meanwhile (held, cancelled) is skipped.
 *
 * @param signal - Stops starting new posts once aborted.
 */
export async function dispatchMarketing(
  deps: DispatchDependencies,
  signal?: AbortSignal,
): Promise<DispatchResult> {
  const now = deps.now();
  const posts = await leaseDuePosts(deps.executor, now, DISPATCH_BATCH_SIZE);
  const tally: Tally = { published: 0, failed: 0, held: 0, alerts: new Set() };

  for (const post of posts) {
    if (signal?.aborted) break;
    try {
      await dispatchPost(deps, post, now, tally);
    } catch (error) {
      if (error instanceof PostStateError) {
        console.warn('[marketing-dispatch] state changed', post.id);
      } else {
        console.error(
          '[marketing-dispatch] post failed to dispatch',
          post.id,
          messageOf(error),
        );
      }
    }
  }

  try {
    const expiring = await deps.credentials.expiringWithin(
      now,
      CREDENTIAL_WARNING_DAYS,
    );
    if (expiring.length > 0) tally.alerts.add('credential_expiring');
  } catch (error) {
    console.error(
      '[marketing-dispatch] credential check failed',
      messageOf(error),
    );
  }

  return {
    leased: posts.length,
    published: tally.published,
    failed: tally.failed,
    held: tally.held,
    operatorAlerts: [...tally.alerts],
  };
}

async function headIsLive(url: string): Promise<boolean> {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS),
  });
  return response.status === 200;
}

/**
 * Builds the tick's dependencies from the environment.
 *
 * @throws When `DATABASE_URL`, `MARKETING_CREDENTIALS_KEY` or
 *   `MARKETING_GITHUB_TOKEN` is missing, naming each.
 */
export function createDispatchDependencies(
  env: Readonly<Record<string, string | undefined>>,
): DispatchDependencies {
  const required = [
    'DATABASE_URL',
    'MARKETING_CREDENTIALS_KEY',
    'MARKETING_GITHUB_TOKEN',
  ] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  const executor = createDatabaseExecutor(env['DATABASE_URL']);
  const credentials = createCredentialStore(
    executor,
    env['MARKETING_CREDENTIALS_KEY'] as string,
  );
  return {
    executor,
    credentials,
    adapters: createAdapters({
      credentials,
      env,
      dryRun: env['MARKETING_DRY_RUN'] === '1',
    }),
    github: createGitHubClient(env['MARKETING_GITHUB_TOKEN'] as string),
    isLive: headIsLive,
    now: () => new Date(),
  };
}
