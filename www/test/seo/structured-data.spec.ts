import { expect, test } from 'vitest';
import type { BlogPost } from '../../src/lib/content';
import {
  blogPostingJsonLd,
  serializeJsonLd,
} from '../../src/lib/structured-data';

const post: Omit<BlogPost, 'body'> = {
  slug: '2026-10-22-hashbrown-v-0-8-0',
  title: 'Hashbrown v0.8 adds decisions',
  description: 'Decisions land in core.',
  date: '2026-10-22',
  tags: [],
  ogImage: undefined,
  ogImageAlt: undefined,
  team: ['brian', 'mike'],
  youtube: undefined,
};

test('describes a post as a BlogPosting with its share card', () => {
  const data = blogPostingJsonLd(post);

  expect(data).toEqual({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Hashbrown v0.8 adds decisions',
    description: 'Decisions land in core.',
    datePublished: '2026-10-22',
    url: 'https://hashbrown.dev/blog/2026-10-22-hashbrown-v-0-8-0',
    mainEntityOfPage: 'https://hashbrown.dev/blog/2026-10-22-hashbrown-v-0-8-0',
    image:
      'https://hashbrown.dev/blog/2026-10-22-hashbrown-v-0-8-0/opengraph-image',
    author: [
      { '@type': 'Person', name: 'Brian Love' },
      { '@type': 'Person', name: 'Mike Ryan' },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'Hashbrown',
      url: 'https://hashbrown.dev',
    },
  });
});

test('resolves a site-relative frontmatter image against the site URL', () => {
  const custom = { ...post, ogImage: '/blog/image/og/x.png' };

  const data = blogPostingJsonLd(custom);

  expect(data.image).toBe('https://hashbrown.dev/blog/image/og/x.png');
});

test('prefers the frontmatter image and falls back to the publisher as author', () => {
  const custom = {
    ...post,
    ogImage: 'https://hashbrown.dev/image/x.png',
    team: [],
  };

  const data = blogPostingJsonLd(custom);

  expect(data.image).toBe('https://hashbrown.dev/image/x.png');
  expect(data.author).toEqual([
    {
      '@type': 'Organization',
      name: 'Hashbrown',
      url: 'https://hashbrown.dev',
    },
  ]);
});

test('names an unknown team id as itself', () => {
  const data = blogPostingJsonLd({ ...post, team: ['someone'] });

  expect(data.author).toEqual([{ '@type': 'Person', name: 'someone' }]);
});

test('escapes markup when serialized for a script tag', () => {
  const data = blogPostingJsonLd({ ...post, title: '</script><b>' });

  const html = serializeJsonLd(data);

  expect(html).not.toContain('</script>');
  expect(JSON.parse(html).headline).toBe('</script><b>');
});
