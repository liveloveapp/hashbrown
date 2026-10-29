import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

/* eslint-disable @nx/enforce-module-boundaries -- the integration suite reuses growth's migrations and executor */
import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../../../growth/scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../../../growth/src/index.ts';
/* eslint-enable @nx/enforce-module-boundaries */
import {
  approvePosts,
  holdWithDependents,
  importWeek,
  leaseDuePosts,
  markFailed,
  markPublished,
  markPublishing,
  markRetry,
  PostStateError,
  readWeek,
  setPostStatus,
  updateBlogDraft,
  updatePostDraft,
} from './repository.ts';
import type { WeekImport } from './schema.ts';

const url = process.env['TEST_DATABASE_URL'];
const executor = createDatabaseExecutor(url);
// A second pool, so two leases run on separate connections.
const other = createDatabaseExecutor(url);
// Mondays in 1971: no real week in the shared test store uses them, and every
// `now` below is in 1971 so only these rows are ever due.
const WEEK_START = '1971-02-01';
const IMPORT_WEEK_START = '1971-03-01';
const NOW = new Date('1971-02-03T12:00:00Z');
const HOUR = 60 * 60 * 1000;

let weekId: string;

function one<Row>(rows: Row[]): Row {
  const [row] = rows;
  if (!row) throw new Error('expected one row');
  return row;
}

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

beforeEach(async () => {
  await executor.execute(
    'delete from marketing_weeks where week_start in ($1::date, $2::date)',
    [WEEK_START, IMPORT_WEEK_START],
  );
  const { rows } = await executor.execute<{ id: string }>(
    'insert into marketing_weeks (week_start) values ($1::date) returning id',
    [WEEK_START],
  );
  weekId = one(rows).id;
});

afterAll(async () => {
  // Posts cascade with their week.
  await executor.execute(
    'delete from marketing_weeks where week_start in ($1::date, $2::date)',
    [WEEK_START, IMPORT_WEEK_START],
  );
  await executor.close?.();
  await other.close?.();
});

interface PostOptions {
  channel?: 'x' | 'linkedin' | 'blog' | 'devto';
  status?: string;
  scheduledAt?: Date;
  dependsOn?: string;
}

async function insertPost(options: PostOptions = {}): Promise<string> {
  const channel = options.channel ?? 'x';
  const draft =
    channel === 'blog'
      ? { channel, slug: 'a-post', title: 'A post' }
      : { channel, text: 'hi' };
  const { rows } = await executor.execute<{ id: string }>(
    `insert into marketing_posts (week_id, channel, kind, scheduled_at, draft, status, depends_on)
     values ($1::uuid, $2, 'release', $3::timestamptz, $4::jsonb, $5, $6::uuid)
     returning id`,
    [
      weekId,
      channel,
      (options.scheduledAt ?? new Date(NOW.getTime() - HOUR)).toISOString(),
      JSON.stringify(draft),
      options.status ?? 'approved',
      options.dependsOn ?? null,
    ],
  );
  return one(rows).id;
}

async function statusOf(id: string): Promise<Record<string, unknown>> {
  const { rows } = await executor.execute(
    'select * from marketing_posts where id = $1::uuid',
    [id],
  );
  return one(rows);
}

test('does not lease a draft post', async () => {
  await insertPost({ status: 'draft' });

  expect(await leaseDuePosts(executor, NOW, 10)).toEqual([]);
});

test('does not lease a post before its time', async () => {
  await insertPost({ scheduledAt: new Date(NOW.getTime() + HOUR) });

  expect(await leaseDuePosts(executor, NOW, 10)).toEqual([]);
});

test('leases a due post once and sets its lease', async () => {
  const id = await insertPost();

  const leased = await leaseDuePosts(executor, NOW, 10);
  const again = await leaseDuePosts(executor, NOW, 10);

  expect(leased.map((post) => post.id)).toEqual([id]);
  expect(leased[0]).toMatchObject({
    weekId,
    channel: 'x',
    status: 'approved',
    draft: { channel: 'x', text: 'hi' },
    dependsOn: null,
  });
  expect(again).toEqual([]);
  expect((await statusOf(id))['lease_until']).toEqual(
    new Date(NOW.getTime() + 5 * 60 * 1000),
  );
});

test('leases a blog post 2 hours early', async () => {
  const early = await insertPost({
    channel: 'blog',
    scheduledAt: new Date(NOW.getTime() + 2 * HOUR - 1000),
  });
  await insertPost({
    channel: 'blog',
    scheduledAt: new Date(NOW.getTime() + 2 * HOUR + 1000),
  });
  await insertPost({
    channel: 'x',
    scheduledAt: new Date(NOW.getTime() + 2 * HOUR - 1000),
  });

  const leased = await leaseDuePosts(executor, NOW, 10);

  expect(leased.map((post) => post.id)).toEqual([early]);
});

test('leases a publishing post only after its lease expires', async () => {
  const id = await insertPost({ status: 'publishing' });
  await executor.execute(
    'update marketing_posts set lease_until = $2::timestamptz where id = $1::uuid',
    [id, new Date(NOW.getTime() + 60_000).toISOString()],
  );

  const held = await leaseDuePosts(executor, NOW, 10);
  const expired = await leaseDuePosts(
    executor,
    new Date(NOW.getTime() + 2 * 60_000),
    10,
  );

  expect(held).toEqual([]);
  expect(expired.map((post) => post.id)).toEqual([id]);
});

test('two concurrent leases never return the same post', async () => {
  const ids = await Promise.all([insertPost(), insertPost(), insertPost()]);

  const [first, second] = await Promise.all([
    leaseDuePosts(executor, NOW, 3),
    leaseDuePosts(other, NOW, 3),
  ]);
  const leased = [...first, ...second].map((post) => post.id);

  expect(new Set(leased).size).toBe(leased.length);
  expect([...leased].sort()).toEqual([...ids].sort());
});

test('does not lease a dependent until its dependency is published', async () => {
  const blog = await insertPost({ channel: 'blog', status: 'held' });
  const devto = await insertPost({ channel: 'devto', dependsOn: blog });

  expect(await leaseDuePosts(executor, NOW, 10)).toEqual([]);

  await markPublished(executor, blog, {
    externalId: '1',
    externalUrl: 'https://hashbrown.dev/blog/a-post',
    publishedAt: NOW,
  });
  const leased = await leaseDuePosts(executor, NOW, 10);

  expect(leased.map((post) => post.id)).toEqual([devto]);
});

test('does not lease a post waiting for its next attempt', async () => {
  const id = await insertPost();
  expect(await markRetry(executor, id, 'boom', NOW)).toBe('retry');

  const early = await leaseDuePosts(executor, NOW, 10);
  const later = await leaseDuePosts(
    executor,
    new Date(NOW.getTime() + 3 * 60_000),
    10,
  );

  expect(early).toEqual([]);
  expect(later.map((post) => post.id)).toEqual([id]);
});

test('markPublishing keeps the lease', async () => {
  const id = await insertPost();
  await leaseDuePosts(executor, NOW, 10);

  await markPublishing(executor, id);
  const row = await statusOf(id);

  expect(row['status']).toBe('publishing');
  expect(row['lease_until']).toEqual(new Date(NOW.getTime() + 5 * 60 * 1000));
});

test('markPublished records the result and clears the lease', async () => {
  const id = await insertPost();
  await leaseDuePosts(executor, NOW, 10);

  await markPublished(executor, id, {
    externalId: '99',
    externalUrl: 'https://x.com/i/status/99',
    publishedAt: NOW,
  });
  const row = await statusOf(id);

  expect(row).toMatchObject({
    status: 'published',
    external_id: '99',
    external_url: 'https://x.com/i/status/99',
    published_at: NOW,
    lease_until: null,
  });
});

test('markFailed records the error and clears the lease', async () => {
  const id = await insertPost();
  await leaseDuePosts(executor, NOW, 10);

  await markFailed(executor, id, 'not mergeable');
  const row = await statusOf(id);

  expect(row).toMatchObject({
    status: 'failed',
    last_error: 'not mergeable',
    lease_until: null,
  });
});

test('markRetry fails the post on the third attempt', async () => {
  const id = await insertPost();

  const outcomes = [
    await markRetry(executor, id, 'one', NOW),
    await markRetry(executor, id, 'two', NOW),
    await markRetry(executor, id, 'three', NOW),
  ];
  const row = await statusOf(id);

  expect(outcomes).toEqual(['retry', 'retry', 'failed']);
  expect(row).toMatchObject({
    status: 'failed',
    attempts: 3,
    last_error: 'three',
  });
});

test('markRetry backs off 2^attempts minutes and clears the lease', async () => {
  const id = await insertPost();
  await leaseDuePosts(executor, NOW, 10);

  await markRetry(executor, id, 'one', NOW);
  const first = await statusOf(id);
  await markRetry(executor, id, 'two', NOW);
  const second = await statusOf(id);

  expect(first).toMatchObject({ status: 'approved', lease_until: null });
  expect(first['next_attempt_at']).toEqual(
    new Date(NOW.getTime() + 2 * 60_000),
  );
  expect(second['next_attempt_at']).toEqual(
    new Date(NOW.getTime() + 4 * 60_000),
  );
});

test('holdWithDependents holds the post and every post depending on it', async () => {
  const blog = await insertPost({ channel: 'blog', status: 'publishing' });
  const devto = await insertPost({ channel: 'devto', dependsOn: blog });
  const promo = await insertPost({ dependsOn: devto });
  const unrelated = await insertPost();

  const held = await holdWithDependents(executor, blog, 'not live in 24h');

  expect([...held].sort()).toEqual([blog, devto, promo].sort());
  expect(await statusOf(blog)).toMatchObject({
    status: 'held',
    last_error: 'not live in 24h',
    lease_until: null,
  });
  expect((await statusOf(promo))['status']).toBe('held');
  expect((await statusOf(unrelated))['status']).toBe('approved');
});

test('editing an approved post sets it back to draft', async () => {
  const id = await insertPost();

  await updatePostDraft(executor, id, {
    draft: { channel: 'x', text: 'edited' },
    kind: 'take',
    sources: [{ url: 'https://example.com', note: 'n' }],
  });
  const row = await statusOf(id);

  expect(row).toMatchObject({
    status: 'draft',
    kind: 'take',
    draft: { channel: 'x', text: 'edited' },
    sources: [{ url: 'https://example.com', note: 'n' }],
  });
});

test('editing a published post throws', async () => {
  const id = await insertPost({ status: 'published' });

  await expect(
    updatePostDraft(executor, id, { draft: { channel: 'x', text: 'no' } }),
  ).rejects.toThrow(/published/);
});

test.each(['publishing', 'cancelled'])(
  'editing a %s post throws',
  async (status) => {
    const id = await insertPost({ status });

    await expect(
      updatePostDraft(executor, id, { kind: 'take' }),
    ).rejects.toThrow(status);
  },
);

test('updateBlogDraft merges into the draft without changing status', async () => {
  const id = await insertPost({ channel: 'blog' });

  await updateBlogDraft(executor, id, {
    prNumber: 42,
    branchUpdatedAt: '1971-02-03T10:00:00.000Z',
  });
  const row = await statusOf(id);

  expect(row).toMatchObject({
    status: 'approved',
    draft: {
      channel: 'blog',
      slug: 'a-post',
      title: 'A post',
      prNumber: 42,
      branchUpdatedAt: '1971-02-03T10:00:00.000Z',
    },
  });
});

test('updateBlogDraft refuses a post that is not a blog post', async () => {
  const id = await insertPost({ channel: 'x' });

  await expect(
    updateBlogDraft(executor, id, { prNumber: 1 }),
  ).rejects.toThrow();
});

test('approve without postId skips held posts and approves the week', async () => {
  const draft = await insertPost({ status: 'draft' });
  const heldPost = await insertPost({ status: 'held' });
  const cancelled = await insertPost({ status: 'cancelled' });

  const count = await approvePosts(executor, weekId);
  const week = await readWeek(executor, WEEK_START);

  expect(count).toBe(1);
  expect((await statusOf(draft))['status']).toBe('approved');
  expect((await statusOf(heldPost))['status']).toBe('held');
  expect((await statusOf(cancelled))['status']).toBe('cancelled');
  expect(week?.week.status).toBe('approved');
  expect(week?.week.approvedAt).toBeInstanceOf(Date);
});

test('approve with postId approves only that post and not the week', async () => {
  const one = await insertPost({ status: 'draft' });
  const two = await insertPost({ status: 'draft' });

  const count = await approvePosts(executor, weekId, one);
  const week = await readWeek(executor, WEEK_START);

  expect(count).toBe(1);
  expect((await statusOf(one))['status']).toBe('approved');
  expect((await statusOf(two))['status']).toBe('draft');
  expect(week?.week.status).toBe('draft');
});

test('setPostStatus holds a post and refuses a published one', async () => {
  const id = await insertPost();
  const published = await insertPost({ status: 'published' });

  await setPostStatus(executor, id, 'held');

  expect((await statusOf(id))['status']).toBe('held');
  await expect(
    setPostStatus(executor, published, 'cancelled'),
  ).rejects.toThrow();
});

function weekImport(overrides: Partial<WeekImport> = {}): WeekImport {
  return {
    weekStart: IMPORT_WEEK_START,
    researchBrief: { themes: ['signals'] },
    posts: [
      {
        key: 'blog',
        channel: 'blog',
        kind: 'blog',
        scheduledAt: '1971-03-02T14:00:00-05:00',
        draft: { channel: 'blog', slug: 'signals', title: 'Signals' },
        sources: [{ url: 'https://hashbrown.dev', note: 'home' }],
      },
      {
        key: 'devto',
        channel: 'devto',
        kind: 'blog_promo',
        scheduledAt: '1971-03-02T15:00:00-05:00',
        draft: {
          channel: 'devto',
          blogSlug: 'signals',
          article: { title: 'Signals', tags: ['angular'], description: 'd' },
        },
        sources: [],
        dependsOnKey: 'blog',
      },
    ],
    ...overrides,
  };
}

test('importWeek creates the week and links dependents', async () => {
  const { weekId: id, postIds } = await importWeek(executor, weekImport());
  const read = await readWeek(executor, IMPORT_WEEK_START);

  expect(read?.week).toMatchObject({
    id,
    weekStart: IMPORT_WEEK_START,
    status: 'draft',
    researchBrief: { themes: ['signals'] },
  });
  expect(read?.posts.map((post) => post.id)).toEqual([
    postIds['blog'],
    postIds['devto'],
  ]);
  expect(read?.posts[1]).toMatchObject({
    dependsOn: postIds['blog'],
    status: 'draft',
    scheduledAt: new Date('1971-03-02T20:00:00Z'),
  });
});

test('importWeek replaces draft posts of an existing week', async () => {
  const first = await importWeek(executor, weekImport());

  const second = await importWeek(
    executor,
    weekImport({ researchBrief: { themes: ['again'] } }),
  );
  const read = await readWeek(executor, IMPORT_WEEK_START);

  expect(second.weekId).toBe(first.weekId);
  expect(second.postIds['blog']).not.toBe(first.postIds['blog']);
  expect(read?.posts).toHaveLength(2);
  expect(read?.week.researchBrief).toEqual({ themes: ['again'] });
});

test('importWeek refuses a week with a post past draft', async () => {
  const { postIds } = await importWeek(executor, weekImport());
  await approvePosts(
    executor,
    (await readWeek(executor, IMPORT_WEEK_START))?.week.id ?? '',
    postIds['blog'],
  );

  await expect(importWeek(executor, weekImport())).rejects.toThrow(
    /past draft/,
  );
  expect((await readWeek(executor, IMPORT_WEEK_START))?.posts).toHaveLength(2);
});

test('readWeek returns undefined for an unknown week', async () => {
  expect(await readWeek(executor, '1971-04-05')).toBeUndefined();
});

test('markRetry on a held post leaves it held', async () => {
  const id = await insertPost({ status: 'held' });

  await expect(markRetry(executor, id, 'late', NOW)).rejects.toBeInstanceOf(
    PostStateError,
  );
  expect(await statusOf(id)).toMatchObject({ status: 'held', attempts: 0 });
});

test.each(['markRetry', 'markFailed'] as const)(
  '%s on a cancelled post leaves it cancelled',
  async (name) => {
    const id = await insertPost({ status: 'cancelled' });

    const call =
      name === 'markRetry'
        ? markRetry(executor, id, 'late', NOW)
        : markFailed(executor, id, 'late');

    await expect(call).rejects.toBeInstanceOf(PostStateError);
    expect(await statusOf(id)).toMatchObject({
      status: 'cancelled',
      last_error: null,
    });
  },
);

test('markPublished on a cancelled post leaves it cancelled', async () => {
  const id = await insertPost({ status: 'cancelled' });

  await expect(
    markPublished(executor, id, {
      externalId: '1',
      externalUrl: 'https://x.com/i/status/1',
      publishedAt: NOW,
    }),
  ).rejects.toBeInstanceOf(PostStateError);
  expect(await statusOf(id)).toMatchObject({
    status: 'cancelled',
    external_id: null,
  });
});

test('approving a held post by id approves it', async () => {
  const id = await insertPost({ status: 'held' });

  const count = await approvePosts(executor, weekId, id);

  expect(count).toBe(1);
  expect((await statusOf(id))['status']).toBe('approved');
});

test('approving a failed post by id resets its attempts', async () => {
  const id = await insertPost({ status: 'approved' });
  await markRetry(executor, id, 'one', NOW);
  await markRetry(executor, id, 'two', NOW);
  await markRetry(executor, id, 'three', NOW);
  expect(await statusOf(id)).toMatchObject({ status: 'failed', attempts: 3 });

  await approvePosts(executor, weekId, id);

  expect(await statusOf(id)).toMatchObject({
    status: 'approved',
    attempts: 0,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
  });
});

test('approving by id does not approve a cancelled or published post', async () => {
  const cancelled = await insertPost({ status: 'cancelled' });
  const published = await insertPost({ status: 'published' });

  expect(await approvePosts(executor, weekId, cancelled)).toBe(0);
  expect(await approvePosts(executor, weekId, published)).toBe(0);
});

test('bulk approval skips held and failed posts', async () => {
  const heldPost = await insertPost({ status: 'held' });
  const failed = await insertPost({ status: 'failed' });

  expect(await approvePosts(executor, weekId)).toBe(0);
  expect((await statusOf(heldPost))['status']).toBe('held');
  expect((await statusOf(failed))['status']).toBe('failed');
});
