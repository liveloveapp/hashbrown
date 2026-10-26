import { expect, test } from 'vitest';
import robots from '../../src/app/robots';
import sitemap from '../../src/app/sitemap';
import { listSymbolPages } from '../../src/lib/api-reference';
import { listBlogPosts, listDocs } from '../../src/lib/content';

test('lists the home page, blog, docs and API reference', () => {
  const posts = listBlogPosts();

  const urls = sitemap().map((entry) => entry.url);

  expect(urls).toContain('https://hashbrown.dev/');
  expect(urls).toContain('https://hashbrown.dev/blog');
  expect(urls).toContain('https://hashbrown.dev/api');
  expect(urls).toContain('https://hashbrown.dev/docs/react/start/quick');
  expect(urls).toContain('https://hashbrown.dev/docs/angular/start/quick');
  expect(urls).toContain(`https://hashbrown.dev/blog/${posts[0].slug}`);
  expect(urls).toContain('https://hashbrown.dev/api/core/s.string');
});

test('has one entry per page and no duplicates', () => {
  const expected =
    4 +
    listBlogPosts().length +
    listDocs('react').length +
    listDocs('angular').length +
    listSymbolPages().length;

  const urls = sitemap().map((entry) => entry.url);

  expect(new Set(urls).size).toBe(urls.length);
  expect(urls).toHaveLength(expected);
});

test('dates each blog post from its publish date', () => {
  const [post] = listBlogPosts();

  const entry = sitemap().find(
    (e) => e.url === `https://hashbrown.dev/blog/${post.slug}`,
  );

  expect(entry?.lastModified).toBe(post.date);
});

test('robots allows crawling, hides internal routes and points at the sitemap', () => {
  const result = robots();

  expect(result).toEqual({
    rules: { userAgent: '*', allow: '/', disallow: '/_/' },
    sitemap: 'https://hashbrown.dev/sitemap.xml',
    host: 'https://hashbrown.dev',
  });
});
