import { expect, test } from 'vitest';
import { DEFAULT_OG_IMAGE, pageMetadata } from '../src/lib/site-metadata';

test('sets the title and Open Graph fields from one source', () => {
  const metadata = pageMetadata({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
  });

  expect(metadata.title).toBe('Home: Hashbrown Docs');
  expect(metadata.description).toBe('Hashbrown Docs.');
  expect(metadata.openGraph).toMatchObject({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
    images: [DEFAULT_OG_IMAGE],
  });
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
