import { expect, test } from 'vitest';
import { pageMetadata, SITE_TITLE_TEMPLATE } from '../src/lib/site-metadata';

test('sets the title and Open Graph fields from one source', () => {
  const metadata = pageMetadata({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
  });

  expect(metadata.title).toEqual({ absolute: 'Home: Hashbrown Docs' });
  expect(metadata.description).toBe('Hashbrown Docs.');
  expect(metadata.openGraph).toMatchObject({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
  });
  expect(metadata.openGraph).not.toHaveProperty('images');
});

test('uses a custom image and published time when given', () => {
  const metadata = pageMetadata({
    title: 'Post',
    description: 'About it',
    image: 'https://hashbrown.dev/blog/image/article/x.png',
    publishedTime: '2026-09-23',
  });

  expect(metadata.openGraph).toMatchObject({
    images: ['https://hashbrown.dev/blog/image/article/x.png'],
    publishedTime: '2026-09-23',
    type: 'article',
  });
});

test('describes a custom image with its alt text when given', () => {
  const metadata = pageMetadata({
    title: 'Post',
    image: '/blog/image/og/x.png',
    imageAlt: 'Decide, then generate.',
    publishedTime: '2026-10-27',
  });

  expect(metadata.openGraph).toMatchObject({
    images: [{ url: '/blog/image/og/x.png', alt: 'Decide, then generate.' }],
  });
});

test('sets a canonical URL from the page path', () => {
  const metadata = pageMetadata({
    title: 'Post',
    path: '/blog/2026-10-22-hashbrown-v-0-8-0',
  });

  expect(metadata.alternates).toEqual({
    canonical: '/blog/2026-10-22-hashbrown-v-0-8-0',
  });
});

test('omits the canonical URL when no path is given', () => {
  const metadata = pageMetadata({ title: 'Home: Hashbrown Docs' });

  expect(metadata).not.toHaveProperty('alternates');
});

test('leaves unbranded titles to the site title template', () => {
  const metadata = pageMetadata({ title: 'Hashbrown v0.8 adds decisions' });

  expect(metadata.title).toBe('Hashbrown v0.8 adds decisions');
  expect(SITE_TITLE_TEMPLATE.replace('%s', 'Post')).toBe('Post: Hashbrown');
});

test.each([
  'Tool Calling: Hashbrown React Docs',
  'Home: Hashbrown Blog',
  'Privacy: Hashbrown',
  'Hashbrown: AI chat and agents for React and Angular',
])('keeps the already-branded title %s out of the template', (title) => {
  const metadata = pageMetadata({ title });

  expect(metadata.title).toEqual({ absolute: title });
  expect(metadata.openGraph).toMatchObject({ title });
});
