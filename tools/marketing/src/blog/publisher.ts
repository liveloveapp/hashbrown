import type { BlogDraft, QueuedPost } from '../queue/types.ts';

/**
 * How long after `scheduledAt` a blog post may take to appear before it and
 * its dependents go to `held`: the scheduled `Blog Publish` workflow's tick,
 * plus a www deploy, with room for GitHub's scheduler running late.
 */
export const LIVE_GRACE_MS = 2 * 60 * 60 * 1000;

export type BlogStep =
  | { kind: 'wait' }
  | { kind: 'published'; url: string; at: Date }
  | { kind: 'not_live'; reason: string };

export function blogUrl(slug: string): string {
  return `https://hashbrown.dev/blog/${slug}`;
}

/**
 * Checks a blog post once its time has come. The post ships by Brian merging
 * its PR with `published: true` and `publishAt` at `scheduledAt`; the site
 * hides it until then and the `Blog Publish` workflow redeploys www once it is
 * due. This only waits for the page to answer, so the dev.to cross-post and
 * promos that depend on it never link to a 404.
 *
 * Errors from `isLive` propagate; the dispatcher's retry cap handles them.
 */
export async function advanceBlogPost(
  post: QueuedPost & { draft: BlogDraft },
  now: Date,
  deps: { isLive: (url: string) => Promise<boolean> },
): Promise<BlogStep> {
  const scheduled = post.scheduledAt.getTime();
  if (now.getTime() < scheduled) return { kind: 'wait' };

  const url = blogUrl(post.draft.slug);
  if (await deps.isLive(url)) return { kind: 'published', url, at: now };

  if (now.getTime() - scheduled > LIVE_GRACE_MS) {
    return {
      kind: 'not_live',
      reason: `${url} not live within 2h of its slot; is its PR merged with publishAt at or before ${post.scheduledAt.toISOString()}?`,
    };
  }
  return { kind: 'wait' };
}
