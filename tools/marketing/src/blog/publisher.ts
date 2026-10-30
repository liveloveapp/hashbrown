import type { BlogDraft, QueuedPost } from '../queue/types.ts';
import type { GitHubClient } from './github.ts';

/** A merged post that is still not live after this long goes to `held`. */
export const LIVE_DEADLINE_MS = 24 * 60 * 60 * 1000;

/**
 * How long after `scheduledAt` a PR that cannot merge yet may keep waiting
 * (checks still running) before the post fails.
 */
export const MERGE_GRACE_MS = 2 * 60 * 60 * 1000;

export type BlogStep =
  | { kind: 'wait' }
  | { kind: 'branch_updated'; at: Date }
  | { kind: 'merged'; at: Date }
  | { kind: 'published'; url: string; at: Date }
  | { kind: 'failed'; reason: string }
  | { kind: 'not_live'; reason: string };

export function blogUrl(slug: string): string {
  return `https://hashbrown.dev/blog/${slug}`;
}

/** A failed GitHub write waits for the next tick until the grace is spent. */
function retryOrFail(
  operation: string,
  err: unknown,
  pastGrace: boolean,
): BlogStep {
  if (!pastGrace) return { kind: 'wait' };
  const message = err instanceof Error ? err.message : String(err);
  return { kind: 'failed', reason: `${operation} failed: ${message}` };
}

const MERGEABLE_STATES = new Set(['clean', 'unstable', 'has_hooks']);

/**
 * Moves a blog post one step along: update the branch before `scheduledAt`,
 * merge at `scheduledAt` if GitHub says it can merge, then confirm the page
 * is live. Never merges with admin rights; a PR that cannot merge fails.
 *
 * Errors from `updateBranch` and `merge` are absorbed: `wait` until
 * `scheduledAt + MERGE_GRACE_MS`, then `failed`. Errors from `pullState` and
 * `isLive` propagate; the dispatcher's retry cap handles them.
 */
export async function advanceBlogPost(
  post: QueuedPost & { draft: BlogDraft },
  now: Date,
  deps: {
    github: GitHubClient;
    isLive: (url: string) => Promise<boolean>;
  },
): Promise<BlogStep> {
  const { github, isLive } = deps;
  const { prNumber, branchUpdatedAt, mergedAt, slug } = post.draft;
  if (prNumber === undefined) return { kind: 'failed', reason: 'no blog PR' };

  const scheduled = post.scheduledAt.getTime();
  const pastGrace = now.getTime() - scheduled >= MERGE_GRACE_MS;

  const state = await github.pullState(prNumber);
  if (state.state === 'closed' && !state.merged) {
    return { kind: 'failed', reason: 'PR closed without merge' };
  }

  if (!state.merged) {
    if (now.getTime() < scheduled) {
      if (branchUpdatedAt) return { kind: 'wait' };
      try {
        await github.updateBranch(prNumber);
      } catch (err) {
        return retryOrFail('updateBranch', err, pastGrace);
      }
      return { kind: 'branch_updated', at: now };
    }

    if (state.mergeable === null) {
      return pastGrace
        ? { kind: 'failed', reason: 'merge state still unknown after grace' }
        : { kind: 'wait' };
    }
    if (!pastGrace && state.mergeableState === 'behind') {
      try {
        await github.updateBranch(prNumber);
      } catch (err) {
        return retryOrFail('updateBranch', err, pastGrace);
      }
      return { kind: 'branch_updated', at: now };
    }
    if (state.mergeable && MERGEABLE_STATES.has(state.mergeableState)) {
      try {
        await github.merge(prNumber);
      } catch (err) {
        return retryOrFail('merge', err, pastGrace);
      }
      return { kind: 'merged', at: now };
    }
    if (!pastGrace && state.mergeable && state.mergeableState === 'blocked') {
      return { kind: 'wait' };
    }
    return {
      kind: 'failed',
      reason: `PR ${prNumber} cannot merge: mergeable_state ${state.mergeableState}`,
    };
  }

  const url = blogUrl(slug);
  if (await isLive(url)) return { kind: 'published', url, at: now };

  // A PR merged by hand has no `mergedAt`; count the deadline from the schedule.
  const mergedMs = mergedAt ? Date.parse(mergedAt) : scheduled;
  if (now.getTime() - mergedMs > LIVE_DEADLINE_MS) {
    return { kind: 'not_live', reason: `${url} not live within 24h of merge` };
  }
  return { kind: 'wait' };
}
