import { describe, expect, test, vi } from 'vitest';

import type { BlogDraft, QueuedPost } from '../queue/types.ts';
import type { GitHubClient } from './github.ts';
import {
  advanceBlogPost,
  blogUrl,
  LIVE_DEADLINE_MS,
  MERGE_GRACE_MS,
} from './publisher.ts';

const SCHEDULED = new Date('2026-10-29T14:00:00Z');
const HOUR = 60 * 60 * 1000;

function post(
  draft: Partial<BlogDraft> = {},
): QueuedPost & { draft: BlogDraft } {
  return {
    id: 'p1',
    weekId: 'w1',
    channel: 'blog',
    kind: 'blog',
    scheduledAt: SCHEDULED,
    draft: {
      channel: 'blog',
      slug: 'my-post',
      title: 'T',
      prNumber: 5,
      ...draft,
    },
    sources: [],
    dependsOn: null,
    status: 'approved',
    attempts: 0,
    externalId: null,
    externalUrl: null,
    publishedAt: null,
    lastError: null,
  } as QueuedPost & { draft: BlogDraft };
}

function setup(
  state: Partial<Awaited<ReturnType<GitHubClient['pullState']>>> = {},
  live = false,
) {
  const github = {
    updateBranch: vi.fn(async () => undefined),
    pullState: vi.fn(async () => ({
      merged: false,
      mergeable: true,
      mergeableState: 'clean',
      ...state,
    })),
    merge: vi.fn(async () => undefined),
    readFile: vi.fn(async () => ''),
  };
  const isLive = vi.fn(async () => live);
  return { github, isLive, deps: { github, isLive } };
}

const before = new Date(SCHEDULED.getTime() - HOUR);
const at = (ms: number) => new Date(SCHEDULED.getTime() + ms);

test('blogUrl builds the canonical URL', () => {
  expect(blogUrl('a-b')).toBe('https://hashbrown.dev/blog/a-b');
});

test('constants', () => {
  expect(LIVE_DEADLINE_MS).toBe(24 * HOUR);
  expect(MERGE_GRACE_MS).toBe(2 * HOUR);
});

test('fails without a PR number', async () => {
  const { deps } = setup();
  const step = await advanceBlogPost(
    post({ prNumber: undefined }),
    SCHEDULED,
    deps,
  );
  expect(step).toEqual({ kind: 'failed', reason: 'no blog PR' });
});

describe('before scheduledAt', () => {
  test('updates the branch once', async () => {
    const { deps, github } = setup();
    const step = await advanceBlogPost(post(), before, deps);
    expect(step).toEqual({ kind: 'branch_updated', at: before });
    expect(github.updateBranch).toHaveBeenCalledWith(5);
    expect(github.merge).not.toHaveBeenCalled();
  });

  test('waits when the branch was already updated', async () => {
    const { deps, github } = setup();
    const step = await advanceBlogPost(
      post({ branchUpdatedAt: before.toISOString() }),
      before,
      deps,
    );
    expect(step).toEqual({ kind: 'wait' });
    expect(github.updateBranch).not.toHaveBeenCalled();
  });
});

describe('at or after scheduledAt, not merged', () => {
  test('waits while mergeable is null', async () => {
    const { deps, github } = setup({
      mergeable: null,
      mergeableState: 'unknown',
    });
    expect(await advanceBlogPost(post(), SCHEDULED, deps)).toEqual({
      kind: 'wait',
    });
    expect(github.merge).not.toHaveBeenCalled();
  });

  test('updates the branch again when behind', async () => {
    const { deps, github } = setup({ mergeableState: 'behind' });
    const now = at(10 * 60 * 1000);
    expect(await advanceBlogPost(post(), now, deps)).toEqual({
      kind: 'branch_updated',
      at: now,
    });
    expect(github.updateBranch).toHaveBeenCalledWith(5);
    expect(github.merge).not.toHaveBeenCalled();
  });

  test.each(['clean', 'unstable', 'has_hooks'])('merges when %s', async (s) => {
    const { deps, github } = setup({ mergeableState: s });
    expect(await advanceBlogPost(post(), SCHEDULED, deps)).toEqual({
      kind: 'merged',
      at: SCHEDULED,
    });
    expect(github.merge).toHaveBeenCalledWith(5);
  });

  test('does not merge a clean state with mergeable false', async () => {
    const { deps, github } = setup({
      mergeable: false,
      mergeableState: 'clean',
    });
    const step = await advanceBlogPost(post(), at(HOUR), deps);
    expect(step.kind).toBe('failed');
    expect(github.merge).not.toHaveBeenCalled();
  });

  test('waits on blocked inside the grace period', async () => {
    const { deps } = setup({ mergeableState: 'blocked' });
    expect(await advanceBlogPost(post(), at(HOUR), deps)).toEqual({
      kind: 'wait',
    });
  });

  test('fails blocked at the grace period with the state', async () => {
    const { deps } = setup({ mergeableState: 'blocked' });
    const step = await advanceBlogPost(post(), at(MERGE_GRACE_MS), deps);
    expect(step).toMatchObject({ kind: 'failed' });
    expect((step as { reason: string }).reason).toContain('blocked');
  });

  test.each(['dirty', 'draft'])('fails %s immediately', async (s) => {
    const { deps, github } = setup({ mergeableState: s });
    const step = await advanceBlogPost(post(), SCHEDULED, deps);
    expect(step.kind).toBe('failed');
    expect((step as { reason: string }).reason).toContain(s);
    expect(github.merge).not.toHaveBeenCalled();
  });

  test('fails an unrecognised state inside the grace period', async () => {
    const { deps } = setup({ mergeableState: 'weird' });
    const step = await advanceBlogPost(post(), at(HOUR), deps);
    expect(step.kind).toBe('failed');
  });

  test('fails mergeable false immediately', async () => {
    const { deps } = setup({ mergeable: false, mergeableState: 'blocked' });
    expect((await advanceBlogPost(post(), SCHEDULED, deps)).kind).toBe(
      'failed',
    );
  });

  test.each([
    ['behind', true],
    ['unknown', null],
  ])('fails %s at the grace period', async (s, mergeable) => {
    const { deps, github } = setup({ mergeableState: s, mergeable });
    const step = await advanceBlogPost(post(), at(MERGE_GRACE_MS), deps);
    expect(step.kind).toBe('failed');
    expect(github.updateBranch).not.toHaveBeenCalled();
  });
});

describe('merged', () => {
  const mergedAt = new Date(SCHEDULED.getTime() + 5 * 60 * 1000).toISOString();

  test('publishes when live', async () => {
    const { deps, isLive } = setup({ merged: true }, true);
    const now = at(HOUR);
    expect(await advanceBlogPost(post({ mergedAt }), now, deps)).toEqual({
      kind: 'published',
      url: 'https://hashbrown.dev/blog/my-post',
      at: now,
    });
    expect(isLive).toHaveBeenCalledWith('https://hashbrown.dev/blog/my-post');
  });

  test('counts a PR merged by hand as merged', async () => {
    const { deps, github } = setup({ merged: true }, true);
    const step = await advanceBlogPost(post(), at(HOUR), deps);
    expect(step.kind).toBe('published');
    expect(github.merge).not.toHaveBeenCalled();
  });

  test('waits when not live yet', async () => {
    const { deps } = setup({ merged: true }, false);
    expect(await advanceBlogPost(post({ mergedAt }), at(HOUR), deps)).toEqual({
      kind: 'wait',
    });
  });

  test('is not_live after the deadline', async () => {
    const { deps } = setup({ merged: true }, false);
    const now = new Date(Date.parse(mergedAt) + LIVE_DEADLINE_MS + 1);
    const step = await advanceBlogPost(post({ mergedAt }), now, deps);
    expect(step.kind).toBe('not_live');
  });

  test('waits exactly at the deadline', async () => {
    const { deps } = setup({ merged: true }, false);
    const now = new Date(Date.parse(mergedAt) + LIVE_DEADLINE_MS);
    expect(await advanceBlogPost(post({ mergedAt }), now, deps)).toEqual({
      kind: 'wait',
    });
  });
});
