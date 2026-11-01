import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, vi } from 'vitest';

import type { QueuedPost, QueuedWeek } from '../src/queue/types.ts';
import {
  defaultWeekStart,
  mainWeek,
  runWeek,
  type WeekOperations,
  type WeekRunnerDependencies,
} from './week.mts';

const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A reviewed example.',
  sha256: 'a'.repeat(64),
};

const now = new Date('2026-11-04T15:00:00.000Z'); // Wednesday
const weekId = '00000000-0000-4000-8000-000000000001';
const postId = '00000000-0000-4000-8000-0000000000a1';

function post(overrides: Partial<QueuedPost> = {}): QueuedPost {
  return {
    id: postId,
    weekId,
    channel: 'x',
    kind: 'take',
    scheduledAt: new Date('2026-11-09T15:00:00.000Z'),
    draft: { channel: 'x', image, text: 'A plain post.' },
    sources: [{ url: 'https://hashbrown.dev', note: 'docs' }],
    dependsOn: null,
    status: 'draft',
    attempts: 0,
    externalId: null,
    externalUrl: null,
    publishedAt: null,
    lastError: null,
    ...overrides,
  };
}

const week: QueuedWeek = {
  id: weekId,
  weekStart: '2026-11-09',
  status: 'draft',
  researchBrief: {},
  approvedAt: null,
};

function operations(overrides: Partial<WeekOperations> = {}): WeekOperations {
  return {
    readWeek: vi.fn(async () => ({ week, posts: [post()] })),
    readPost: vi.fn(async () => post()),
    importWeek: vi.fn(async () => ({ weekId, postIds: { a: postId } })),
    updatePostDraft: vi.fn(async () => undefined),
    approvePosts: vi.fn(async () => 3),
    setPostStatus: vi.fn(async () => undefined),
    updateBlogDraft: vi.fn(async () => undefined),
    listPostsByStatus: vi.fn(async () => []),
    listPublishedWithWarnings: vi.fn(async () => []),
    expiringWithin: vi.fn(async () => []),
    readBlogBody: vi.fn(async () => undefined),
    ...overrides,
  };
}

function harness(ops: WeekOperations = operations()) {
  const out: string[] = [];
  const err: string[] = [];
  const dependencies: WeekRunnerDependencies = {
    operations: ops,
    now: () => now,
    readFile: (path) => files[path] ?? Promise.reject(new Error('ENOENT')),
    writeOutput: (line) => out.push(line),
    writeError: (line) => err.push(line),
  };
  const files: Record<string, string> = {};
  return {
    ops,
    files,
    out,
    err,
    run: (...argv: string[]) => runWeek(argv, dependencies),
  };
}

const weekFile = {
  weekStart: '2026-11-09',
  researchBrief: {},
  posts: [
    {
      key: 'a',
      channel: 'x',
      kind: 'take',
      scheduledAt: '2026-11-09T10:00:00-05:00',
      draft: { channel: 'x', image, text: 'Signals are fine — mostly.' },
      sources: [{ url: 'https://hashbrown.dev', note: 'docs' }],
    },
  ],
};

test('defaultWeekStart is the next Monday on or after today in New York', () => {
  expect(defaultWeekStart(new Date('2026-11-04T15:00:00Z'))).toBe('2026-11-09');
  expect(defaultWeekStart(new Date('2026-11-09T15:00:00Z'))).toBe('2026-11-09');
  expect(defaultWeekStart(new Date('2026-11-08T12:00:00Z'))).toBe('2026-11-09');
  // Monday 01:00 UTC is still Sunday evening in New York.
  expect(defaultWeekStart(new Date('2026-11-09T01:00:00Z'))).toBe('2026-11-09');
  expect(defaultWeekStart(new Date('2026-11-10T06:00:00Z'))).toBe('2026-11-16');
});

test('approve without --post approves the default week', async () => {
  const h = harness();
  expect(await h.run('approve')).toBe(0);
  expect(h.ops.readWeek).toHaveBeenCalledWith('2026-11-09');
  expect(h.ops.approvePosts).toHaveBeenCalledWith(weekId, undefined);
  expect(JSON.parse(h.out[0])).toEqual({ approved: 3 });
});

test('approve --week approves that week', async () => {
  const h = harness();
  expect(await h.run('approve', '--week', '2026-11-16')).toBe(0);
  expect(h.ops.readWeek).toHaveBeenCalledWith('2026-11-16');
});

test('approve --post approves that one post in its week', async () => {
  const h = harness(operations({ approvePosts: vi.fn(async () => 1) }));
  expect(await h.run('approve', '--post', postId)).toBe(0);
  expect(h.ops.approvePosts).toHaveBeenCalledWith(weekId, postId);
  expect(JSON.parse(h.out[0])).toEqual({ approved: 1 });
});

test('approve of an unknown week is an error', async () => {
  const h = harness(operations({ readWeek: vi.fn(async () => undefined) }));
  expect(await h.run('approve')).toBe(1);
  expect(JSON.parse(h.err[0]).error).toContain('2026-11-09');
});

test('show lists posts with voice issues, reading blog bodies', async () => {
  const blog = post({
    channel: 'blog',
    kind: 'blog',
    draft: { channel: 'blog', slug: 'hello', title: 'Hello' },
  });
  const ops = operations({
    readWeek: vi.fn(async () => ({
      week,
      posts: [
        post({ draft: { channel: 'x', image, text: 'Pause — then go.' } }),
        blog,
      ],
    })),
    readBlogBody: vi.fn(async () => 'Body with — a dash.'),
  });
  const h = harness(ops);
  expect(await h.run('show')).toBe(0);
  const result = JSON.parse(h.out[0]);
  expect(result.week.weekStart).toBe('2026-11-09');
  expect(
    result.posts[0].voiceIssues.map((i: { rule: string }) => i.rule),
  ).toContain('em_dash');
  expect(ops.readBlogBody).toHaveBeenCalledWith('hello');
  expect(
    result.posts[1].voiceIssues.map((i: { rule: string }) => i.rule),
  ).toContain('em_dash');
});

test('edit prints voice issues for an em dash', async () => {
  const edited = post({
    draft: { channel: 'x', image, text: 'Ship it — now.' },
  });
  const ops = operations({
    readPost: vi
      .fn()
      .mockResolvedValueOnce(post())
      .mockResolvedValueOnce(edited),
  });
  const h = harness(ops);
  h.files['patch.json'] = JSON.stringify({
    draft: { channel: 'x', image, text: 'Ship it — now.' },
  });
  expect(await h.run('edit', '--post', postId, '--file', 'patch.json')).toBe(0);
  expect(ops.updatePostDraft).toHaveBeenCalledWith(postId, {
    draft: { channel: 'x', image, text: 'Ship it — now.' },
  });
  const result = JSON.parse(h.out[0]);
  expect(result.post.id).toBe(postId);
  expect(result.voiceIssues.map((i: { rule: string }) => i.rule)).toContain(
    'em_dash',
  );
});

test('edit rejects a draft for another channel', async () => {
  const h = harness();
  h.files['patch.json'] = JSON.stringify({
    draft: { channel: 'linkedin', image, text: 'Hello' },
  });
  expect(await h.run('edit', '--post', postId, '--file', 'patch.json')).toBe(1);
  expect(JSON.parse(h.err[0]).error).toContain('channel');
  expect(h.ops.updatePostDraft).not.toHaveBeenCalled();
});

test('edit rejects a scheduledAt without an offset', async () => {
  const h = harness();
  h.files['patch.json'] = JSON.stringify({
    scheduledAt: '2026-11-09T10:00:00',
  });
  expect(await h.run('edit', '--post', postId, '--file', 'patch.json')).toBe(1);
  expect(JSON.parse(h.err[0]).error).toContain('scheduledAt');
  expect(h.ops.updatePostDraft).not.toHaveBeenCalled();
});

test('edit passes a scheduledAt as a Date', async () => {
  const h = harness();
  h.files['patch.json'] = JSON.stringify({
    scheduledAt: '2026-11-09T10:00:00-05:00',
  });
  expect(await h.run('edit', '--post', postId, '--file', 'patch.json')).toBe(0);
  expect(h.ops.updatePostDraft).toHaveBeenCalledWith(postId, {
    scheduledAt: new Date('2026-11-09T15:00:00.000Z'),
  });
});

test('check reports voice issues per key without writing', async () => {
  const h = harness();
  h.files['week.json'] = JSON.stringify(weekFile);
  expect(await h.run('check', '--file', 'week.json')).toBe(0);
  const result = JSON.parse(h.out[0]);
  expect(result.voiceIssues.a.map((i: { rule: string }) => i.rule)).toContain(
    'em_dash',
  );
  expect(h.ops.importWeek).not.toHaveBeenCalled();
});

test('check fails on an invalid week file', async () => {
  const h = harness();
  h.files['week.json'] = JSON.stringify({
    ...weekFile,
    weekStart: '2026-11-10',
  });
  expect(await h.run('check', '--file', 'week.json')).toBe(1);
  expect(JSON.parse(h.err[0]).error).toContain('Monday');
});

test('import writes the week and prints ids and voice issues', async () => {
  const h = harness();
  h.files['week.json'] = JSON.stringify(weekFile);
  expect(await h.run('import', '--file', 'week.json')).toBe(0);
  expect(h.ops.importWeek).toHaveBeenCalledOnce();
  const result = JSON.parse(h.out[0]);
  expect(result.weekId).toBe(weekId);
  expect(result.postIds).toEqual({ a: postId });
  expect(result.voiceIssues.a.length).toBeGreaterThan(0);
});

test('hold and cancel set the post status', async () => {
  const h = harness();
  expect(await h.run('hold', '--post', postId)).toBe(0);
  expect(await h.run('cancel', '--post', postId)).toBe(0);
  expect(h.ops.setPostStatus).toHaveBeenNthCalledWith(1, postId, 'held');
  expect(h.ops.setPostStatus).toHaveBeenNthCalledWith(2, postId, 'cancelled');
  expect(JSON.parse(h.out[0])).toEqual({ id: postId, status: 'held' });
});

test('set-pr records the PR number on the blog draft', async () => {
  const h = harness();
  expect(await h.run('set-pr', '--post', postId, '--pr', '123')).toBe(0);
  expect(h.ops.updateBlogDraft).toHaveBeenCalledWith(postId, { prNumber: 123 });
  expect(await h.run('set-pr', '--post', postId, '--pr', 'abc')).toBe(1);
});

test('status groups last week by status and lists failed and held posts', async () => {
  const failed = post({ status: 'failed', lastError: 'boom' });
  const ops = operations({
    readWeek: vi.fn(async () => ({
      week,
      posts: [post(), failed],
    })),
    listPostsByStatus: vi.fn(async () => [failed]),
    expiringWithin: vi.fn(async () => [
      { channel: 'x' as const, expiresAt: '2026-11-10T00:00:00.000Z' },
    ]),
  });
  const h = harness(ops);
  expect(await h.run('status')).toBe(0);
  expect(ops.readWeek).toHaveBeenCalledWith('2026-11-02');
  expect(ops.listPostsByStatus).toHaveBeenCalledWith(['failed', 'held']);
  expect(ops.expiringWithin).toHaveBeenCalledWith(now, 14);
  const result = JSON.parse(h.out[0]);
  expect(Object.keys(result.lastWeek.byStatus).sort()).toEqual([
    'draft',
    'failed',
  ]);
  expect(result.attention[0].lastError).toBe('boom');
  expect(result.credentials).toEqual([
    { channel: 'x', expiresAt: '2026-11-10T00:00:00.000Z' },
  ]);
});

test('status lists published posts that carry a warning, with the reason', async () => {
  const failed = post({ status: 'failed', lastError: 'boom' });
  const warned = post({
    id: '00000000-0000-4000-8000-0000000000b2',
    channel: 'linkedin',
    status: 'published',
    externalUrl: 'https://www.linkedin.com/feed/update/1/',
    lastError: 'first comment failed; add it by hand',
  });
  const ops = operations({
    listPostsByStatus: vi.fn(async () => [failed]),
    listPublishedWithWarnings: vi.fn(async () => [warned]),
  });
  const h = harness(ops);

  expect(await h.run('status')).toBe(0);

  expect(ops.listPublishedWithWarnings).toHaveBeenCalledWith(
    new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
  );
  const { attention } = JSON.parse(h.out[0]);
  expect(attention).toHaveLength(2);
  expect(attention[1]).toMatchObject({
    id: warned.id,
    channel: 'linkedin',
    status: 'published',
    externalUrl: 'https://www.linkedin.com/feed/update/1/',
    lastError: 'first comment failed; add it by hand',
  });
});

test('status reports credentials as unavailable without a key', async () => {
  const h = harness(operations({ expiringWithin: undefined }));
  expect(await h.run('status')).toBe(0);
  expect(JSON.parse(h.out[0]).credentials).toBe(
    'unavailable: MARKETING_CREDENTIALS_KEY not set',
  );
});

test('usage errors exit 1 with a JSON error', async () => {
  const h = harness();
  expect(await h.run('bogus')).toBe(1);
  expect(await h.run('show', '--nope', 'x')).toBe(1);
  expect(await h.run('hold')).toBe(1);
  expect(await h.run('show', '--week', '2026-11-10')).toBe(1);
  expect(h.err).toHaveLength(4);
  for (const line of h.err) expect(JSON.parse(line).error).toBeTruthy();
});

test('operation failures are reported without the connection string', async () => {
  const h = harness(
    operations({
      readWeek: vi.fn(async () => {
        throw new Error('connection failed');
      }),
    }),
  );
  expect(await h.run('show')).toBe(1);
  expect(JSON.parse(h.err[0])).toEqual({ error: 'connection failed' });
});

test('mainWeek checks without a database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'week-'));
  const file = join(dir, 'week.json');
  writeFileSync(file, JSON.stringify(weekFile));
  const out: string[] = [];
  const createExecutor = vi.fn();
  const code = await mainWeek(['check', '--file', file], {
    createOperations: createExecutor,
    readBlogBody: async () => undefined,
    readFile: async (path) =>
      (await import('node:fs/promises')).readFile(path, 'utf8'),
    now: () => now,
    writeOutput: (line) => out.push(line),
    writeError: () => undefined,
  });
  expect(code).toBe(0);
  expect(createExecutor).not.toHaveBeenCalled();
  expect(JSON.parse(out[0]).voiceIssues.a).toBeDefined();
});

test('mainWeek closes the database and reports setup failures', async () => {
  const close = vi.fn(async () => undefined);
  const errors: string[] = [];
  const ok = await mainWeek(['show'], {
    createOperations: () => ({ operations: operations(), close }),
    readBlogBody: async () => undefined,
    readFile: async () => '',
    now: () => now,
    writeOutput: () => undefined,
    writeError: (line) => errors.push(line),
  });
  expect(ok).toBe(0);
  expect(close).toHaveBeenCalledOnce();

  const failed = await mainWeek(['show'], {
    createOperations: () => {
      throw new Error('DATABASE_URL is required and must be nonempty');
    },
    readBlogBody: async () => undefined,
    readFile: async () => '',
    now: () => now,
    writeOutput: () => undefined,
    writeError: (line) => errors.push(line),
  });
  expect(failed).toBe(1);
  expect(JSON.parse(errors[0]).error).toContain('DATABASE_URL');
});

test.each(['single', 'week'] as const)(
  'approval refuses image-free stored rows before changing state: %s',
  async (mode) => {
    const legacy = post({
      draft: { channel: 'x', text: 'Legacy text-only post.' },
    });
    const ops = operations({
      readPost: vi.fn(async () => legacy),
      readWeek: vi.fn(async () => ({ week, posts: [legacy] })),
    });
    const h = harness(ops);

    const result = await h.run(
      'approve',
      ...(mode === 'single' ? ['--post', postId] : ['--week', '2026-11-09']),
    );

    expect(result).toBe(1);
    expect(ops.approvePosts).not.toHaveBeenCalled();
    expect(h.err.join('')).toContain('image');
  },
);

test.each([
  {
    name: 'an X post over 280 characters',
    stored: post({ draft: { channel: 'x', image, text: 'a'.repeat(281) } }),
  },
  {
    name: 'a blank LinkedIn post',
    stored: post({
      channel: 'linkedin',
      draft: { channel: 'linkedin', image, text: '   ' },
    }),
  },
  {
    name: 'a dev.to title over 128 characters',
    stored: post({
      channel: 'devto',
      draft: {
        channel: 'devto',
        blogSlug: 'a-post',
        article: { title: 't'.repeat(129), tags: [], description: '' },
      },
    }),
  },
])(
  'approval refuses $name, which dispatch would reject, before changing state',
  async ({ stored }) => {
    for (const mode of ['single', 'week'] as const) {
      const ops = operations({
        readPost: vi.fn(async () => stored),
        readWeek: vi.fn(async () => ({ week, posts: [stored] })),
      });
      const h = harness(ops);

      const result = await h.run(
        'approve',
        ...(mode === 'single' ? ['--post', postId] : ['--week', '2026-11-09']),
      );

      expect(result).toBe(1);
      expect(ops.approvePosts).not.toHaveBeenCalled();
    }
  },
);
