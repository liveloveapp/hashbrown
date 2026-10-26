import { expect, test } from 'vitest';
import {
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

  expect(posts[0].slug).toBe('2026-10-22-hashbrown-v-0-8-0');
  expect(posts.map((p) => p.slug)).toEqual(
    [...posts.map((p) => p.slug)].sort().reverse(),
  );
});

test('reads a blog post by slug', () => {
  const post = readBlogPost('2026-09-23-hashbrown-v-0-6-0');

  expect(post?.title).toBe('Hashbrown v0.6 speaks AG-UI end to end');
  expect(post?.body).toContain('Today we are releasing Hashbrown v0.6.');
});

test('uses the file name as the post slug, like the Analog site', () => {
  const posts = listBlogPosts();

  const slugs = posts.map((p) => p.slug);

  expect(slugs).toContain('2025-06-25-hashbrown-launch');
  expect(slugs).not.toContain('2025-06-25-Hashbrown-launch');
});
