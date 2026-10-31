import { beforeEach, describe, expect, test, vi } from 'vitest';

import { OutcomeUnknownError } from './channels/http.ts';
import type { ChannelAdapter, PostResult } from './channels/types.ts';
import { createMemoryCredentialStore } from './credentials/memory-store.ts';
import {
  createDispatchDependencies,
  DISPATCH_BATCH_SIZE,
  type DispatchDependencies,
  dispatchMarketing,
  MAX_LATENESS_MS,
} from './dispatcher.ts';
import { PostStateError } from './queue/repository.ts';
import type { QueuedPost } from './queue/types.ts';

const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A reviewed example.',
  sha256: 'a'.repeat(64),
};

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
    draft: { channel: 'x', image, text: 'hello' },
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
    dryRun?: boolean;
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
    dryRun: options.dryRun ?? false,
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

  test('an X post 7 hours late is held, not posted', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ scheduledAt: new Date(NOW.getTime() - 7 * HOUR) }),
    ]);
    const { deps, post: adapterPost } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(MAX_LATENESS_MS).toBe(6 * HOUR);
    expect(adapterPost).not.toHaveBeenCalled();
    expect(repository.markPublishing).not.toHaveBeenCalled();
    expect(repository.holdWithDependents).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      'missed its slot by 7 hours',
    );
    expect(outcome).toMatchObject({ leased: 1, published: 0, held: 1 });
  });

  test.each(['linkedin', 'devto'] as const)(
    'a %s post 7 hours late is held, not posted',
    async (channel) => {
      repository.leaseDuePosts.mockResolvedValue([
        post({
          channel,
          scheduledAt: new Date(NOW.getTime() - 7 * HOUR),
          draft:
            channel === 'linkedin'
              ? { channel, text: 'hi' }
              : {
                  channel,
                  blogSlug: 'my-post',
                  article: { title: 'T', tags: [], description: 'D' },
                },
        }),
      ]);
      const { deps, post: adapterPost } = setup();

      const outcome = await dispatchMarketing(deps);

      expect(adapterPost).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ published: 0, held: 1 });
    },
  );

  test('an X post 5 hours late is still posted', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({ scheduledAt: new Date(NOW.getTime() - 5 * HOUR) }),
    ]);
    const { deps, post: adapterPost } = setup();

    const outcome = await dispatchMarketing(deps);

    expect(adapterPost).toHaveBeenCalledTimes(1);
    expect(repository.holdWithDependents).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ published: 1, held: 0 });
  });

  test('a blog post past the lateness bound keeps its own grace logic', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      blog({}, { scheduledAt: new Date(NOW.getTime() - 7 * HOUR) }),
    ]);
    const { deps, github } = setup({ pull: { merged: true }, live: true });

    const outcome = await dispatchMarketing(deps);

    expect(github.pullState).toHaveBeenCalled();
    expect(repository.holdWithDependents).not.toHaveBeenCalled();
    expect(outcome.published).toBe(1);
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
    expect(adapterPost).toHaveBeenCalledWith({
      channel: 'x',
      image,
      text: 'hello',
    });
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

  test('a post published with warnings stores them and raises post_warning', async () => {
    repository.leaseDuePosts.mockResolvedValue([
      post({
        channel: 'linkedin',
        draft: { channel: 'linkedin', image, text: 'hi', firstComment: 'link' },
      }),
    ]);
    const { deps } = setup({
      post: async () => ({
        ...result,
        channel: 'linkedin',
        warnings: ['first comment failed', 'second thing'],
      }),
    });

    const outcome = await dispatchMarketing(deps);

    expect(repository.markPublished).toHaveBeenCalledWith(deps.executor, 'p1', {
      externalId: 'ext-1',
      externalUrl: 'https://x.com/i/status/1',
      publishedAt: new Date('2026-10-29T14:00:01Z'),
      warning: 'first comment failed; second thing',
    });
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ published: 1, failed: 0 });
    expect(outcome.operatorAlerts).toEqual(['post_warning']);
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

  test('an unknown publish outcome fails the post at once and never retries', async () => {
    repository.leaseDuePosts.mockResolvedValue([post()]);
    const { deps, post: adapterPost } = setup({
      post: async () => {
        throw new OutcomeUnknownError('HTTP 503: boom');
      },
    });

    const outcome = await dispatchMarketing(deps);

    expect(adapterPost).toHaveBeenCalledTimes(1);
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      deps.executor,
      'p1',
      'publish outcome unknown, check the channel before retrying: HTTP 503: boom',
    );
    expect(outcome).toMatchObject({
      failed: 1,
      published: 0,
      operatorAlerts: ['post_failed'],
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
  const ENV = {
    DATABASE_URL: 'postgres://user:pass@localhost:1/none',
    MARKETING_CREDENTIALS_KEY: Buffer.alloc(32).toString('base64'),
    MARKETING_GITHUB_TOKEN: 'token',
  };

  test('names every missing variable', () => {
    expect(() => createDispatchDependencies({})).toThrow(
      /DATABASE_URL.*MARKETING_CREDENTIALS_KEY.*MARKETING_GITHUB_TOKEN/,
    );
  });

  test.each(['1', 'true'])('MARKETING_DRY_RUN=%j is a dry run', (value) => {
    // No GitHub token: a dry run does not need one.
    const deps = createDispatchDependencies({
      ...ENV,
      MARKETING_GITHUB_TOKEN: undefined,
      MARKETING_DRY_RUN: value,
    });

    expect(deps.dryRun).toBe(true);
  });

  test.each([undefined, '', '0', 'false'])(
    'MARKETING_DRY_RUN=%j is live',
    (value) => {
      const deps = createDispatchDependencies({
        ...ENV,
        MARKETING_DRY_RUN: value,
      });

      expect(deps.dryRun).toBe(false);
    },
  );

  test.each(['yes', 'TRUE', ' 1', 'no'])(
    'MARKETING_DRY_RUN=%j is a configuration error naming the variable',
    (value) => {
      expect(() =>
        createDispatchDependencies({ ...ENV, MARKETING_DRY_RUN: value }),
      ).toThrow(/MARKETING_DRY_RUN/);
    },
  );
});

describe('dry run', () => {
  test('a due blog post is published with dry-run values and no GitHub or live call', async () => {
    repository.leaseDuePosts.mockResolvedValue([blog()]);
    const { deps, github } = setup({ dryRun: true });

    const outcome = await dispatchMarketing(deps);

    expect(repository.markPublished).toHaveBeenCalledWith(deps.executor, 'p1', {
      externalId: 'dry-run',
      externalUrl: 'https://hashbrown.dev/blog/my-post',
      publishedAt: NOW,
    });
    expect(outcome.published).toBe(1);
    expect(github.pullState).not.toHaveBeenCalled();
    expect(github.updateBranch).not.toHaveBeenCalled();
    expect(github.merge).not.toHaveBeenCalled();
    expect(deps.isLive).not.toHaveBeenCalled();
  });

  test('a blog post before its schedule is left untouched', async () => {
    repository.leaseDuePosts.mockResolvedValue([blog()]);
    const { deps, github } = setup({
      dryRun: true,
      now: new Date(NOW.getTime() - 2 * HOUR),
    });

    const outcome = await dispatchMarketing(deps);

    expect(repository.markPublished).not.toHaveBeenCalled();
    expect(repository.updateBlogDraft).not.toHaveBeenCalled();
    expect(github.pullState).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ leased: 1, published: 0 });
  });

  test('devto posts a placeholder body with the canonical url and never reads GitHub', async () => {
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
    const { deps, post: adapterPost, github } = setup({ dryRun: true });

    await dispatchMarketing(deps);

    expect(github.readFile).not.toHaveBeenCalled();
    expect(adapterPost).toHaveBeenCalledWith({
      channel: 'devto',
      text: 'dry run: https://hashbrown.dev/blog/my-post',
      article: {
        title: 'T',
        tags: ['ai'],
        description: 'D',
        canonicalUrl: 'https://hashbrown.dev/blog/my-post',
      },
    });
  });

  test('createDispatchDependencies in dry run makes no fetch calls and disables GitHub', async () => {
    const fetchSpy = vi.fn();
    const deps = createDispatchDependencies(
      {
        DATABASE_URL: 'postgres://user:pass@localhost:1/none',
        MARKETING_CREDENTIALS_KEY: Buffer.alloc(32).toString('base64'),
        MARKETING_DRY_RUN: '1',
      },
      fetchSpy as unknown as typeof fetch,
    );

    const results = await Promise.all([
      deps.adapters.x.post({ channel: 'x', image, text: 'hello' }),
      deps.adapters.devto.post({
        channel: 'devto',
        text: 'dry run: https://hashbrown.dev/blog/a',
        article: { title: 'T' },
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(deps.dryRun).toBe(true);
    await expect(deps.github.pullState(1)).rejects.toThrow(
      'GitHub is disabled in dry run',
    );
    await expect(deps.github.merge(1)).rejects.toThrow(
      'GitHub is disabled in dry run',
    );
    await expect(deps.github.updateBranch(1)).rejects.toThrow(
      'GitHub is disabled in dry run',
    );
    await expect(deps.github.readFile('a', 'main')).rejects.toThrow(
      'GitHub is disabled in dry run',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
