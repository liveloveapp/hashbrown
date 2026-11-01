import { expect, test } from 'vitest';

import { WeekImport } from './schema.ts';

const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A reviewed example.',
  sha256: 'a'.repeat(64),
};

// Monday 2026-11-02; the clocks went back on Sunday 2026-11-01.
const WEEK_START = '2026-11-02';

function week(overrides: Record<string, unknown> = {}, scheduledAt?: string) {
  return {
    weekStart: WEEK_START,
    researchBrief: { themes: ['signals'] },
    posts: [
      {
        key: 'x-1',
        channel: 'x',
        kind: 'release',
        scheduledAt: scheduledAt ?? '2026-11-03T09:00:00-05:00',
        draft: { channel: 'x', image, text: 'Hashbrown ships.' },
        sources: [{ url: 'https://hashbrown.dev/blog', note: 'Release notes' }],
      },
    ],
    ...overrides,
  };
}

test('accepts a well-formed week', () => {
  expect(WeekImport.safeParse(week()).success).toBe(true);
});

test('rejects scheduledAt without an offset', () => {
  const result = WeekImport.safeParse(week({}, '2026-11-03T09:00:00'));

  expect(result.success).toBe(false);
});

test('rejects a Tuesday weekStart', () => {
  const result = WeekImport.safeParse(
    week({ weekStart: '2026-11-03' }, '2026-11-04T09:00:00-05:00'),
  );

  expect(result.success).toBe(false);
});

test('rejects a post scheduled the following week', () => {
  const result = WeekImport.safeParse(week({}, '2026-11-09T09:00:00-05:00'));

  expect(result.success).toBe(false);
});

test('rejects a post scheduled the week before', () => {
  const result = WeekImport.safeParse(week({}, '2026-11-01T23:00:00-05:00'));

  expect(result.success).toBe(false);
});

test('accepts a post on Sunday 23:00 at -05:00 after the November DST change', () => {
  // 2026-11-09T04:00:00Z is already Monday in UTC but still Sunday in New York.
  const result = WeekImport.safeParse(week({}, '2026-11-08T23:00:00-05:00'));

  expect(result.success).toBe(true);
});

test('rejects an unknown dependsOnKey', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({ posts: [{ ...post, dependsOnKey: 'missing' }] }),
  );

  expect(result.success).toBe(false);
});

test('rejects a draft whose channel differs from the post channel', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [{ ...post, draft: { channel: 'linkedin', image, text: 'Hi' } }],
    }),
  );

  expect(result.success).toBe(false);
});

test('rejects an x draft without text', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({ posts: [{ ...post, draft: { channel: 'x' } }] }),
  );

  expect(result.success).toBe(false);
});

test('rejects firstComment on an x draft', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [
        {
          ...post,
          draft: { channel: 'x', image, text: 'Hi', firstComment: 'Hey' },
        },
      ],
    }),
  );

  expect(result.success).toBe(false);
});

test('rejects firstComment on a linkedin draft, because comments need partner API access', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [
        {
          ...post,
          channel: 'linkedin',
          draft: {
            channel: 'linkedin',
            image,
            text: 'Hi',
            firstComment: 'Link',
          },
        },
      ],
    }),
  );

  expect(result.success).toBe(false);
  expect(result.error?.issues[0]?.message).toMatch(/put the URL in text/);
});

test('accepts a URL in linkedin text', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [
        {
          ...post,
          channel: 'linkedin',
          draft: {
            channel: 'linkedin',
            image,
            text: 'Read it: https://hashbrown.dev/blog/a',
          },
        },
      ],
    }),
  );

  expect(result.success).toBe(true);
});

test('accepts a blog draft without a prNumber and a devto draft', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [
        {
          ...post,
          key: 'blog',
          channel: 'blog',
          kind: 'blog',
          draft: { channel: 'blog', slug: 'signals', title: 'Signals' },
        },
        {
          ...post,
          key: 'devto',
          channel: 'devto',
          kind: 'blog_promo',
          dependsOnKey: 'blog',
          draft: {
            channel: 'devto',
            blogSlug: 'signals',
            article: { title: 'Signals', tags: ['angular'], description: 'D' },
          },
        },
      ],
    }),
  );

  expect(result.success).toBe(true);
});

test('rejects two posts with the same key', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(week({ posts: [post, post] }));

  expect(result.success).toBe(false);
});

test('rejects a link on an x draft, pointing at text', () => {
  const [post] = week().posts;
  const result = WeekImport.safeParse(
    week({
      posts: [
        {
          ...post,
          draft: {
            channel: 'x',
            image,
            text: 'Hi',
            link: { url: 'https://hashbrown.dev' },
          },
        },
      ],
    }),
  );

  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.message).join('\n')).toMatch(
    /put the URL in text/,
  );
});

function devtoWeek(tags: string[]) {
  const [post] = week().posts;
  return week({
    posts: [
      {
        ...post,
        key: 'devto',
        channel: 'devto',
        kind: 'blog',
        draft: {
          channel: 'devto',
          blogSlug: 'signals',
          article: { title: 'Signals', tags, description: 'D' },
        },
      },
    ],
  });
}

test('accepts four dev.to tags of lowercase letters and digits', () => {
  const result = WeekImport.safeParse(
    devtoWeek(['angular', 'react', 'ai', 'a'.repeat(30)]),
  );

  expect(result.success).toBe(true);
});

test.each([
  ['five tags', ['a', 'b', 'c', 'd', 'e']],
  ['an uppercase tag', ['Angular']],
  ['a hyphenated tag', ['gen-ui']],
  ['an empty tag', ['']],
  ['a tag over 30 characters', ['a'.repeat(31)]],
])('rejects a dev.to draft with %s', (_, tags) => {
  const result = WeekImport.safeParse(devtoWeek(tags));

  expect(result.success).toBe(false);
});
