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

const MERGEABLE_STATES = new Set(['clean', 'unstable', 'has_hooks']);

/**
 * Moves a blog post one step along: update the branch before `scheduledAt`,
 * merge at `scheduledAt` if GitHub says it can merge, then confirm the page
 * is live. Never merges with admin rights; a PR that cannot merge fails.
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
  if (now.getTime() < scheduled) {
    if (branchUpdatedAt) return { kind: 'wait' };
    await github.updateBranch(prNumber);
    return { kind: 'branch_updated', at: now };
  }

  const state = await github.pullState(prNumber);

  if (!state.merged) {
    if (state.mergeable === null) {
      return now.getTime() - scheduled >= MERGE_GRACE_MS
        ? { kind: 'failed', reason: 'merge state still unknown after grace' }
        : { kind: 'wait' };
    }
    const pastGrace = now.getTime() - scheduled >= MERGE_GRACE_MS;
    if (!pastGrace && state.mergeableState === 'behind') {
      await github.updateBranch(prNumber);
      return { kind: 'branch_updated', at: now };
    }
    if (state.mergeable && MERGEABLE_STATES.has(state.mergeableState)) {
      await github.merge(prNumber);
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
