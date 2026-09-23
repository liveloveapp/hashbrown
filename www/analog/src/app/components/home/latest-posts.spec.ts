import { expect, test } from 'vitest';
import { selectLatestPosts } from './latest-posts';

const post = (slug: string) => ({
  filename: `/src/content/blog/${slug}.md`,
  slug,
  attributes: { slug, title: slug, description: '', tags: [], team: [] },
});

test('returns the newest posts first, limited to the count', () => {
  const files = [
    post('2025-06-25-launch'),
    post('2026-07-09-v5'),
    post('2025-12-16-v4'),
    post('2025-10-22-grid'),
  ];

  const result = selectLatestPosts(files, 3);

  expect(result.map((p) => p.attributes.slug)).toEqual([
    '2026-07-09-v5',
    '2025-12-16-v4',
    '2025-10-22-grid',
  ]);
});

test('adds a date parsed from the slug', () => {
  const files = [post('2026-07-09-v5')];

  const [result] = selectLatestPosts(files, 3);

  expect(result.attributes.date?.toISOString().slice(0, 10)).toBe('2026-07-09');
});

test('does not mutate the input', () => {
  const files = [post('2025-06-25-launch'), post('2026-07-09-v5')];
  const before = files.map((p) => p.attributes.slug);

  selectLatestPosts(files, 1);

  expect(files.map((p) => p.attributes.slug)).toEqual(before);
});
