import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ChannelAdapter, PostResult } from './channels/types.ts';
import { createMemoryCredentialStore } from './credentials/memory-store.ts';
import {
  createDispatchDependencies,
  DISPATCH_BATCH_SIZE,
  type DispatchDependencies,
  dispatchMarketing,
} from './dispatcher.ts';
import { PostStateError } from './queue/repository.ts';
import type { QueuedPost } from './queue/types.ts';

const repository = vi.hoisted(() => ({
  leaseDuePosts: vi.fn(),
  markPublishing: vi.fn(),
  markPublished: vi.fn(),
  markRetry: vi.fn(),
  markFailed: vi.fn(),
  holdWithDependents: vi.fn(),
  updateBlogDraft: vi.fn(),
}));

vi.mock('./queue/repository.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queue/repository.ts')>()),
  ...repository,
}));

const NOW = new Date('2026-10-29T14:00:00Z');
const HOUR = 60 * 60 * 1000;

function post(overrides: Partial<QueuedPost> = {}): QueuedPost {
  return {
    id: 'p1',
    weekId: 'w1',
    channel: 'x',
    kind: 'take',
    scheduledAt: NOW,
    draft: { channel: 'x', text: 'hello' },
    sources: [],
    dependsOn: null,
    status: 'approved',
    attempts: 0,
    externalId: null,
    externalUrl: null,
    publishedAt: null,
    lastError: null,
    ...overrides,
  };
}

function blog(
  draft: Record<string, unknown> = {},
  overrides: Partial<QueuedPost> = {},
): QueuedPost {
  return post({
    channel: 'blog',
    kind: 'blog',
    draft: {
      channel: 'blog',
      slug: 'my-post',
      title: 'T',
      prNumber: 7,
      ...draft,
    } as QueuedPost['draft'],
    ...overrides,
  });
}

const result: PostResult = {
  channel: 'x',
  postId: 'ext-1',
  url: 'https://x.com/i/status/1',
  postedAt: '2026-10-29T14:00:01Z',
};

function setup(
  options: {
    now?: Date;
    pull?: Partial<
      Awaited<ReturnType<DispatchDependencies['github']['pullState']>>
    >;
    live?: boolean;
    post?: ChannelAdapter['post'];
    dependents?: string[];
    credentials?: Parameters<typeof createMemoryCredentialStore>[0];
  } = {},
) {
  const post = vi.fn(options.post ?? (async () => result));
  const adapter = (id: 'x' | 'linkedin' | 'devto'): ChannelAdapter => ({
    id,
    post,
  });
  const github = {
    updateBranch: vi.fn(async () => undefined),
    pullState: vi.fn(async () => ({
      state: 'open' as const,
      merged: false,
      mergeable: true,
      mergeableState: 'clean',
      ...options.pull,
    })),
    merge: vi.fn(async () => undefined),
    readFile: vi.fn(async () => '---\ntitle: T\n---\n\nBody [link](/docs)\n'),
  };
  const execute = vi.fn(async () => ({
    rows: (options.dependents ?? []).map((id) => ({ id })),
  }));
  const deps: DispatchDependencies = {
    executor: { execute } as never,
    adapters: {
      x: adapter('x'),
      linkedin: adapter('linkedin'),
      devto: adapter('devto'),
    },
    credentials: createMemoryCredentialStore(options.credentials),
    github,
    isLive: vi.fn(async () => options.live ?? false),
    now: () => options.now ?? NOW,
  };
  return { deps, post, github };
}

beforeEach(() => {
  for (const mock of Object.values(repository)) mock.mockReset();
  repository.markRetry.mockResolvedValue('retry');
  repository.holdWithDependents.mockImplementation(async (_e, id: string) => [
    id,
  ]);
});

describe('dispatchMarketing', () => {
  test('a post left in publishing after its lease is failed and not re-posted', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ status: 'publishing' }),
    ]);
    const { deps, post: adapterPost } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(adapterPost).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      'publish outcome unknown, check the channel before retrying',
    );
    expect(outcome).toMatchObject({ leased: 1, failed: 1, published: 0 });
    expect(outcome.operatorAlerts).toEqual(['post_failed']);
  });

  test('a social post is marked publishing, posted, then marked published', async () => {
    repository.leaseDuePosts.mockResolvedValue([post()]);
    const { deps, post: adapterPost } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(repository.leaseDuePosts).toHaveBeenCalledWith(
      deps.executor,
      NOW,
      DISPATCH_BATCH_SIZE,
    );
    expect(adapterPost).toHaveBeenCalledWith({ channel: 'x', text: 'hello' });
    expect(repository.markPublished).toHaveBeenCalledWith(deps.executor, 'p1', {
      externalId: 'ext-1',
      externalUrl: 'https://x.com/i/status/1',
      publishedAt: new Date('2026-10-29T14:00:01Z'),
    });
    expect(outcome).toEqual({
      leased: 1,
      published: 1,
      failed: 0,
      held: 0,
      operatorAlerts: [],
    });
  });

  test('an adapter error schedules a retry', async () => {
    repository.leaseDuePosts.mockResolvedValue([post()]);
    const { deps } = setup({
      post: async () => {
        throw new Error('boom');
      },
    });

    const outcome = await dispatchMarketing(deps);

    expect(repository.markRetry).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      'boom',
      NOW,
    );
    expect(repository.markPublished).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      failed: 0,
      published: 0,
      operatorAlerts: [],
    });
  });

  test('the third adapter error fails the post and raises post_failed', async () => {
    repository.leaseDuePosts.mockResolvedValue([post({ attempts: 2 })]);
    repository.markRetry.mockResolvedValue('failed');
    const { deps } = setup({
      post: async () => {
        throw new Error('boom');
      },
    });

    const outcome = await dispatchMarketing(deps);

    expect(outcome).toMatchObject({
      failed: 1,
      operatorAlerts: ['post_failed'],
    });
  });

  test('a blog post that is not live after 24 hours holds its dependents and raises blog_not_live', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      blog({ mergedAt: new Date(NOW.getTime() - 25 * HOUR).toISOString() }),
    ]);
    repository.holdWithDependents.mockResolvedValue(['p1', 'p2']);
    const { deps } = setup({ pull: { merged: true }, live: false });

    const outcome = await dispatchMarketing(deps);

    expect(repository.holdWithDependents).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      expect.stringContaining('not live'),
    );
    expect(outcome).toMatchObject({
      held: 2,
      failed: 0,
      operatorAlerts: ['blog_not_live'],
    });
  });

  test('a blog PR that is not mergeable at publish time fails the post and holds its dependents', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      blog({ branchUpdatedAt: 'x' }),
    ]);
    repository.holdWithDependents.mockResolvedValue(['d1', 'd2']);
    const { deps, github } = setup({
      now: new Date(NOW.getTime() + 3 * HOUR),
      pull: { mergeable: false, mergeableState: 'dirty' },
      dependents: ['d1'],
    });

    const outcome = await dispatchMarketing(deps);

    expect(github.merge).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      expect.stringContaining('cannot merge'),
    );
    expect(repository.holdWithDependents).not.toHaveBeenCalledWith(
      deps.executor,
      'p1',
      expect.anything(),
    );
    expect(outcome).toMatchObject({
      failed: 1,
      held: 2,
      operatorAlerts: ['post_failed'],
    });
  });

  test('blog progress is written to the draft and the lease simply expires', async () => {
    repository.leaseDuePosts.mockResolvedValue([blog()]);
    const early = new Date(NOW.getTime() - 2 * HOUR);
    const { deps } = setup({ now: early });

    const outcome = await dispatchMarketing(deps);

    expect(repository.updateBlogDraft).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      {
        branchUpdatedAt: early.toISOString(),
      },
    );
    expect(repository.markPublishing).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ leased: 1, published: 0 });
  });

  test('a live merged blog is published with its url', async () => {
    repository.leaseDuePosts.mockResolvedValue([blog()]);
    const { deps } = setup({ pull: { merged: true }, live: true });

    const outcome = await dispatchMarketing(deps);

    expect(repository.markPublished).toHaveBeenCalledWith(deps.executor, 'p1', {
      externalId: 'my-post',
      externalUrl: 'https://hashbrown.dev/blog/my-post',
      publishedAt: NOW,
    });
    expect(outcome.published).toBe(1);
  });

  test('a GitHub error retries the blog post', async () => {
    repository.leaseDuePosts.mockResolvedValue([blog()]);
    const { deps, github } = setup();
    github.pullState.mockRejectedValue(new Error('rate limited'));

    const outcome = await dispatchMarketing(deps);

    expect(repository.markRetry).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      'rate limited',
      NOW,
    );
    expect(outcome).toMatchObject({ failed: 0, operatorAlerts: [] });
  });

  test('devto posts the converted blog body with the canonical url', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({
        channel: 'devto',
        draft: {
          channel: 'devto',
          blogSlug: 'my-post',
          article: { title: 'T', tags: ['ai'], description: 'D' },
        },
      }),
    ]);
    const { deps, post: adapterPost, github } = setup();

    await dispatchMarketing(deps);

    expect(github.readFile).toHaveBeenCalledWith(
      'www/content/blog/my-post.md',
      'main',
    );
    const [draft] = adapterPost.mock.calls[0] as [
      import('./channels/types.ts').Draft,
    ];
    expect(draft.channel).toBe('devto');
    expect(draft.article).toEqual({
      title: 'T',
      tags: ['ai'],
      description: 'D',
      canonicalUrl: 'https://hashbrown.dev/blog/my-post',
    });
    expect(draft.text).toContain('https://hashbrown.dev/docs');
    expect(draft.text).not.toContain('title: T');
  });

  test('an expiring LinkedIn credential raises credential_expiring once', async () => {
    repository.leaseDuePosts.mockResolvedValue([]);
    const { deps } = setup({
      credentials: {
        linkedin: {
          accessToken: 'a',
          expiresAt: new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString(),
        },
      },
    });

    const outcome = await dispatchMarketing(deps);

    expect(outcome.operatorAlerts).toEqual(['credential_expiring']);
  });

  test('a post whose state changed is skipped and the batch continues', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ id: 'a' }),
      post({ id: 'b' }),
    ]);
    repository.markPublishing.mockRejectedValueOnce(
      new PostStateError('a', 'held'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(warn).toHaveBeenCalledWith(
      '[marketing-dispatch] state changed',
      'a',
    );
    expect(repository.markPublished).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ leased: 2, published: 1, failed: 0 });
    warn.mockRestore();
  });

  test('an unexpected error for one post does not abort the batch', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ id: 'a' }),
      post({ id: 'b' }),
    ]);
    repository.markPublished.mockRejectedValueOnce(new Error('db down'));
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { deps } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(outcome).toMatchObject({ leased: 2, published: 1 });
    error.mockRestore();
  });

  test('an aborted signal stops new posts', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ id: 'a' }),
      post({ id: 'b' }),
    ]);
    const controller = new AbortController();
    const { deps } = setup({
      post: async () => {
        controller.abort();
        return result;
      },
    });

    const outcome = await dispatchMarketing(deps, controller.signal);

    expect(outcome).toMatchObject({ leased: 2, published: 1 });
  });

  test('a failing credential check does not fail the tick', async () => {
    repository.leaseDuePosts.mockResolvedValue([]);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { deps } = setup();
    deps.credentials = {
      ...deps.credentials,
      expiringWithin: async () => {
        throw new Error('db');
      },
    };

    const outcome = await dispatchMarketing(deps);

    expect(outcome.operatorAlerts).toEqual([]);
    error.mockRestore();
  });
});

describe('createDispatchDependencies', () => {
  test('names every missing variable', () => {
    expect(() => createDispatchDependencies({})).toThrow(
      /DATABASE_URL.*MARKETING_CREDENTIALS_KEY.*MARKETING_GITHUB_TOKEN/,
    );
  });
});
