import { expect, test, vi } from 'vitest';

import type { BlogDraft, QueuedPost } from '../queue/types.ts';
import { advanceBlogPost, blogUrl, LIVE_GRACE_MS } from './publisher.ts';

const SCHEDULED = new Date('2026-10-29T14:00:00Z');
const MINUTE = 60 * 1000;

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

const at = (offsetMs: number) => new Date(SCHEDULED.getTime() + offsetMs);

test('waits before the slot without checking the page', async () => {
  const isLive = vi.fn();

  expect(await advanceBlogPost(post(), at(-MINUTE), { isLive })).toEqual({
    kind: 'wait',
  });
  expect(isLive).not.toHaveBeenCalled();
});

test('publishes once the page answers', async () => {
  const isLive = vi.fn(async () => true);

  expect(await advanceBlogPost(post(), at(0), { isLive })).toEqual({
    kind: 'published',
    url: 'https://hashbrown.dev/blog/my-post',
    at: at(0),
  });
  expect(isLive).toHaveBeenCalledWith(blogUrl('my-post'));
});

test('keeps waiting for the page within the grace', async () => {
  const isLive = async () => false;

  expect(await advanceBlogPost(post(), at(LIVE_GRACE_MS), { isLive })).toEqual({
    kind: 'wait',
  });
});

test('reports not live after the grace, naming the slot', async () => {
  const step = await advanceBlogPost(post(), at(LIVE_GRACE_MS + MINUTE), {
    isLive: async () => false,
  });

  expect(step).toMatchObject({ kind: 'not_live' });
  expect(step.kind === 'not_live' && step.reason).toContain(
    'publishAt at or before 2026-10-29T14:00:00.000Z',
  );
});

test('lets live-check errors propagate for the retry cap', async () => {
  await expect(
    advanceBlogPost(post(), at(0), {
      isLive: async () => {
        throw new Error('timeout');
      },
    }),
  ).rejects.toThrow('timeout');
});
