import { expect, test } from 'vitest';
import { GET } from '../../src/app/blog/rss.xml/route';
import { listBlogPosts } from '../../src/lib/content';

async function feed() {
  const response = GET();
  return { response, xml: await response.text() };
}

test('serves RSS 2.0 as application/rss+xml', async () => {
  const { response, xml } = await feed();

  expect(response.headers.get('content-type')).toBe(
    'application/rss+xml; charset=utf-8',
  );
  expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
  expect(xml).toContain('<title>Hashbrown blog</title>');
  expect(xml).toContain('<link>https://hashbrown.dev/blog</link>');
  expect(xml).toContain(
    '<atom:link href="https://hashbrown.dev/blog/rss.xml" rel="self" type="application/rss+xml"/>',
  );
});

test('has one item per post, newest first', async () => {
  const posts = listBlogPosts();
  const { xml } = await feed();

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  expect(items).toHaveLength(posts.length);
  expect(items[0]).toContain(
    `<link>https://hashbrown.dev/blog/${posts[0].slug}</link>`,
  );
  expect(items[0]).toContain(
    `<guid>https://hashbrown.dev/blog/${posts[0].slug}</guid>`,
  );
  expect(items[0]).toContain(
    `<pubDate>${new Date(posts[0].date + 'T00:00:00Z').toUTCString()}</pubDate>`,
  );
});

test('escapes XML special characters in text fields', async () => {
  const { xml } = await feed();

  // Every post title that contains a special character appears escaped.
  const special = listBlogPosts().filter((post) =>
    /[&<>"']/.test(post.title + post.description),
  );
  expect(special.length).toBeGreaterThan(0);
  for (const post of special) {
    expect(xml).toContain(
      `<title>${post.title
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')}</title>`,
    );
  }
  expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  expect(xml).not.toContain('CDATA');
  // Well-formed: with the tags removed, no stray angle brackets remain.
  const text = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<[^<>]+>/g, '');
  expect(text).not.toMatch(/[<>]/);
});
