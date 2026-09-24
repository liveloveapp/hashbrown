import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { BlogIndex } from '../../src/components/blog/BlogIndex';
import { formatPostDate } from '../../src/components/blog/post-date';
import {
  PostPreview,
  toPostSummary,
} from '../../src/components/blog/PostPreview';
import BlogIndexPage, { metadata } from '../../src/app/blog/page';
import { listBlogPosts } from '../../src/lib/content';

const findPost = (slug: string) => {
  const post = listBlogPosts().find((p) => p.slug === slug);
  if (!post) {
    throw new Error(`missing post ${slug}`);
  }
  return post;
};

const postHrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="(\/blog\/[^"]*)"/g)].map((m) => m[1]);

test('the blog index renders every post, newest first', () => {
  const posts = listBlogPosts();

  const html = renderToStaticMarkup(<BlogIndexPage />);

  expect(postHrefs(html)).toEqual(posts.map((p) => `/blog/${p.slug}`));
  expect(postHrefs(html)[0]).toBe('/blog/2026-09-23-hashbrown-v-0-6-0');
});

test('the blog index renders the filter buttons with all blogs selected', () => {
  const posts = listBlogPosts();

  const html = renderToStaticMarkup(<BlogIndex posts={posts} />);

  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)];
  expect(buttons.map((m) => m[1])).toEqual([
    'All blogs',
    'Stories',
    'Talks',
    'Releases',
  ]);
  expect(buttons[0][0]).toContain('aria-pressed="true"');
  expect(buttons[1][0]).toContain('aria-pressed="false"');
});

test('post summaries for the client drop the markdown body', () => {
  const post = findPost('2026-09-23-hashbrown-v-0-6-0');

  const summary = toPostSummary(post);

  expect(summary).not.toHaveProperty('body');
  expect(summary.title).toBe(post.title);
  expect(summary.team).toEqual(post.team);
});

test('blog index metadata matches the Angular routeMeta', () => {
  const meta = metadata;

  const og = meta.openGraph as { title?: string; images?: unknown };

  expect(meta.title).toBe('Home: Hashbrown Blog');
  expect(meta.description).toBe('Hashbrown Blog.');
  expect(og.title).toBe('Home: Hashbrown Blog');
  expect(og.images).toEqual([
    'https://hashbrown.dev/image/meta/og-default.png',
  ]);
});

test('a post preview shows title, date, description, team and youtube icon', () => {
  const post = findPost('2025-06-05-angular-air');

  const html = renderToStaticMarkup(<PostPreview post={post} size="lg" />);

  expect(html).toContain('href="/blog/2025-06-05-angular-air"');
  expect(html).toContain('<h2>Hashbrown on Angular Air</h2>');
  expect(html).toContain('<time dateTime="2025-06-05">Jun 5, 2025</time>');
  expect(html).toContain('Watch Ben, Brian, and Mike present Hashbrown');
  expect(html).toContain('src="/image/team/brian.png"');
  expect(html).toContain('data-icon="brand-youtube"');
});

test('a post preview without a video has no youtube icon', () => {
  const post = findPost('2025-06-25-hashbrown-launch');

  const html = renderToStaticMarkup(<PostPreview post={post} />);

  expect(html).not.toContain('data-icon="brand-youtube"');
  expect(html).toContain('src="/image/team/brian.png"');
  expect(html).toContain('src="/image/team/mike.png"');
});

test('post dates format like Angular DatePipe MMM d, yyyy', () => {
  const date = '2026-09-23';

  const formatted = formatPostDate(date);

  expect(formatted).toBe('Sep 23, 2026');
});
