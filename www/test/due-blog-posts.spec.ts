import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  LOOKBACK_MS,
  needsRedeploy,
  readSchedule,
  recentlyDue,
} from '../scripts/due-blog-posts.mjs';
import { listAllBlogPosts } from '../src/lib/content';
import { repoRoot } from '../src/lib/repo-root';

const post = (front: string) => `---\ntitle: T\n${front}\n---\n\nBody`;

test('agrees with the site on every post file', () => {
  const blogDir = join(repoRoot(), 'www/content/blog');

  for (const site of listAllBlogPosts()) {
    const file = join(blogDir, `${site.slug}.md`);
    const schedule = readSchedule(file, readFileSync(file, 'utf8'));

    expect(schedule.published).toBe(site.published);
    expect(schedule.publishAt.toISOString()).toBe(site.publishAt.toISOString());
  }
});

test('reads quoted and unquoted publishAt, else the file-name date', () => {
  const quoted = readSchedule(
    '2026-11-04-a.md',
    post("published: true\npublishAt: '2026-11-04T10:00:00-05:00'"),
  );
  const bare = readSchedule(
    '2026-11-04-b.md',
    post('published: true\npublishAt: 2026-11-04T15:00:00Z'),
  );
  const dated = readSchedule('2026-11-04-c.md', post('published: false'));

  expect(quoted.publishAt.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  expect(bare.publishAt.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  expect(dated).toMatchObject({ slug: '2026-11-04-c', published: false });
  expect(dated.publishAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');
});

test('rejects a publishAt without an offset', () => {
  expect(() =>
    readSchedule('2026-11-04-a.md', post("publishAt: '2026-11-04T10:00:00'")),
  ).toThrow(/offset/);
});

test('only published posts due within the lookback count', () => {
  const now = new Date('2026-11-04T15:30:00Z');
  const at = (iso: string, published = true) => ({
    slug: iso,
    published,
    publishAt: new Date(iso),
  });

  const due = recentlyDue(
    [
      at('2026-11-04T15:00:00Z'),
      at('2026-11-04T16:00:00Z'),
      at('2026-11-04T15:00:00Z', false),
      at(new Date(now.getTime() - LOOKBACK_MS - 1).toISOString()),
    ],
    now,
  );

  expect(due.map((p) => p.slug)).toEqual(['2026-11-04T15:00:00Z']);
});

test('redeploys only while a due post still answers 404', async () => {
  const now = new Date('2026-11-04T15:30:00Z');
  const posts = [
    {
      slug: 'due',
      published: true,
      publishAt: new Date('2026-11-04T15:00:00Z'),
    },
  ];
  const answer = (status: number) => async (url: string) => {
    expect(url).toBe('https://hashbrown.dev/blog/due');
    return new Response(null, { status });
  };

  expect(await needsRedeploy(posts, now, answer(404) as typeof fetch)).toBe(
    true,
  );
  expect(await needsRedeploy(posts, now, answer(200) as typeof fetch)).toBe(
    false,
  );
  expect(await needsRedeploy([], now, answer(404) as typeof fetch)).toBe(false);
});
