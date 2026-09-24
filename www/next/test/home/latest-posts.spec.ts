import { expect, test } from 'vitest';
import {
  formatPostDate,
  selectLatestPosts,
} from '../../src/components/home/latest-posts';

const post = (slug: string) => ({ slug, title: slug });

test('returns the newest posts first, limited to the count', () => {
  const posts = [
    post('2025-06-25-launch'),
    post('2026-07-09-v5'),
    post('2025-12-16-v4'),
    post('2025-10-22-grid'),
  ];

  const result = selectLatestPosts(posts, 3);

  expect(result.map((p) => p.slug)).toEqual([
    '2026-07-09-v5',
    '2025-12-16-v4',
    '2025-10-22-grid',
  ]);
});

test('adds a date parsed from the slug', () => {
  const posts = [post('2026-07-09-v5')];

  const [result] = selectLatestPosts(posts, 3);

  expect(result.date.toISOString().slice(0, 10)).toBe('2026-07-09');
});

test('does not mutate the input', () => {
  const posts = [post('2025-06-25-launch'), post('2026-07-09-v5')];
  const before = posts.map((p) => ({ ...p }));

  selectLatestPosts(posts, 1);

  expect(posts).toEqual(before);
});

test('formats dates like Angular mediumDate in UTC', () => {
  const date = new Date('2026-07-09');

  const result = formatPostDate(date);

  expect(result).toBe('Jul 9, 2026');
});
