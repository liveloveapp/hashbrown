import { expect, test } from 'vitest';
import {
  isPublished,
  listAllBlogPosts,
  listBlogPosts,
  listDocs,
  readBlogPost,
  readDoc,
} from '../src/lib/content';

test('lists every React docs page as a slug path', () => {
  const docs = listDocs('react');

  expect(docs).toContainEqual(['start', 'quick']);
  expect(docs.length).toBeGreaterThan(30);
});

test('reads a docs page with its frontmatter title and description', () => {
  const doc = readDoc('react', ['start', 'quick']);

  expect(doc?.title).toBe('React Quickstart: Hashbrown React Docs');
  expect(doc?.description).toBe(
    'Generate a two-step plan in an ordinary app using one trusted component and a streaming endpoint.',
  );
  expect(doc?.body).toContain('# React Quickstart');
});

test('returns undefined for a docs page that does not exist', () => {
  const doc = readDoc('react', ['nope']);

  expect(doc).toBeUndefined();
});

test('rejects slugs that try to escape the docs directory', () => {
  const doc = readDoc('react', ['..', 'angular', 'start', 'quick']);

  expect(doc).toBeUndefined();
});

test('lists blog posts newest first', () => {
  const posts = listBlogPosts();

  expect(posts[0].slug).toBe('2026-11-01-web-llms');
  expect(posts.map((p) => p.slug)).toEqual(
    [...posts.map((p) => p.slug)].sort().reverse(),
  );
});

test('reads a blog post by slug', () => {
  const post = readBlogPost('2026-09-23-hashbrown-v-0-6-0');

  expect(post?.title).toBe('Hashbrown v0.6 speaks AG-UI end to end');
  expect(post?.body).toContain('Today we are releasing Hashbrown v0.6.');
});

test('reads a share card and its alt text from post frontmatter', () => {
  const post = readBlogPost('2026-10-27-decision-models-with-hashbrown');

  expect(post?.ogImage).toBe(
    '/blog/image/og/2026-10-27-decision-models-with-hashbrown.png',
  );
  expect(post?.ogImageAlt).toMatch(/^Decide, then generate\./);
});

test('leaves the alt text undefined for posts without their own card', () => {
  const post = readBlogPost('2026-09-23-hashbrown-v-0-6-0');

  expect(post?.ogImage).toBeUndefined();
  expect(post?.ogImageAlt).toBeUndefined();
});

test('uses the file name as the post slug, like the Analog site', () => {
  const posts = listBlogPosts();

  const slugs = posts.map((p) => p.slug);

  expect(slugs).toContain('2025-06-25-hashbrown-launch');
  expect(slugs).not.toContain('2025-06-25-Hashbrown-launch');
});

test('every post file is marked published, so none is hidden by accident', () => {
  const drafts = listAllBlogPosts()
    .filter((post) => !post.published)
    .map((post) => post.slug);

  expect(drafts).toEqual([]);
});

test('a post is public only when published and its publishAt has passed', () => {
  const publishAt = new Date('2026-11-04T15:00:00Z');

  expect(
    isPublished(
      { published: true, publishAt },
      new Date('2026-11-04T15:00:00Z'),
    ),
  ).toBe(true);
  expect(
    isPublished(
      { published: true, publishAt },
      new Date('2026-11-04T14:59:59Z'),
    ),
  ).toBe(false);
  expect(
    isPublished(
      { published: false, publishAt },
      new Date('2026-11-05T00:00:00Z'),
    ),
  ).toBe(false);
});

test('without publishAt a post goes public at 00:00 UTC on its file-name date', () => {
  const post = listAllBlogPosts().find(
    (p) => p.slug === '2026-09-23-hashbrown-v-0-6-0',
  );

  expect(post?.publishAt.toISOString()).toBe('2026-09-23T00:00:00.000Z');
});

test('leaves scheduled posts out of the list and the slug lookup', () => {
  const before = new Date('2026-09-22T23:59:59Z');

  expect(listBlogPosts(before).map((p) => p.slug)).not.toContain(
    '2026-09-23-hashbrown-v-0-6-0',
  );
  expect(readBlogPost('2026-09-23-hashbrown-v-0-6-0', before)).toBeUndefined();
  expect(readBlogPost('2026-09-23-hashbrown-v-0-6-0')).toBeDefined();
});
