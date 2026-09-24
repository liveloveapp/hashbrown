import { expect, test } from 'vitest';
import {
  BLOG_FILTERS,
  filterPosts,
  toggleFilter,
} from '../../src/components/blog/blog-filters';

const post = (slug: string, tags: string[]) => ({
  slug,
  date: slug.slice(0, 10),
  tags,
});

const posts = [
  post('2025-06-05-a', ['talk']),
  post('2026-09-23-b', ['release']),
  post('2025-06-25-c', ['story', 'release']),
];

test('the filters match the Angular blog index', () => {
  const filters = BLOG_FILTERS;

  const labels = filters.map((f) => [f.text, f.query]);

  expect(labels).toEqual([
    ['All blogs', ''],
    ['Stories', 'story'],
    ['Talks', 'talk'],
    ['Releases', 'release'],
  ]);
});

test('the all filter keeps every post, newest first', () => {
  const all = BLOG_FILTERS[0];

  const result = filterPosts(posts, all);

  expect(result.map((p) => p.slug)).toEqual([
    '2026-09-23-b',
    '2025-06-25-c',
    '2025-06-05-a',
  ]);
});

test('a tag filter keeps only posts with that tag, newest first', () => {
  const releases = BLOG_FILTERS[3];

  const result = filterPosts(posts, releases);

  expect(result.map((p) => p.slug)).toEqual(['2026-09-23-b', '2025-06-25-c']);
});

test('filtering does not mutate the input', () => {
  const input = [...posts];

  filterPosts(input, BLOG_FILTERS[0]);

  expect(input).toEqual(posts);
});

test('clicking a new filter selects it', () => {
  const [all, stories] = BLOG_FILTERS;

  const next = toggleFilter(all, stories);

  expect(next).toBe(stories);
});

test('clicking the selected filter goes back to all blogs', () => {
  const [all, , talks] = BLOG_FILTERS;

  const next = toggleFilter(talks, talks);

  expect(next).toBe(all);
});
