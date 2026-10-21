import { expect, test } from 'vitest';

import { listBlogPosts } from '../../src/lib/content';
import {
  isKnownWebsiteContent,
  websiteContentCatalog,
  websiteTopic,
} from '../../src/lib/growth/website-content';
import {
  listApiReferenceEntries,
  listSitemapEntries,
} from '../../src/lib/search-index';

test('the catalog holds docs pages and the home page with their topics', () => {
  const catalog = websiteContentCatalog();

  const components = catalog['/docs/react/concept/components'];
  const home = catalog['/'];

  expect(components).toEqual({
    contentId: 'docs/react/concept/components',
    topic: 'concepts',
  });
  expect(home).toEqual({ contentId: 'home', topic: 'getting_started' });
});

test('the catalog holds every blog post under the blog topic', () => {
  const catalog = websiteContentCatalog();

  const blogEntries = Object.entries(catalog).filter(([path]) =>
    path.startsWith('/blog/'),
  );

  expect(blogEntries.length).toBeGreaterThan(0);
  expect(blogEntries.every(([, entry]) => entry.topic === 'blog')).toBe(true);
});

test('the catalog holds the API reference pages and the api and blog index pages', () => {
  const catalog = websiteContentCatalog();

  const reference = Object.values(catalog).filter((entry) =>
    entry.contentId.startsWith('api/'),
  );

  expect(reference.length).toBeGreaterThan(0);
  expect(reference.every((entry) => entry.topic === 'reference')).toBe(true);
  expect(catalog['/api']).toEqual({ contentId: 'api', topic: 'reference' });
  expect(catalog['/blog']).toEqual({ contentId: 'blog', topic: 'blog' });
});

test('every known page survives the content id filter', () => {
  const expected =
    2 +
    2 +
    listSitemapEntries().length +
    listBlogPosts().length +
    listApiReferenceEntries().length;

  const catalog = websiteContentCatalog();

  expect(Object.keys(catalog).length).toBe(expected);
});

test('topics follow the path rules', () => {
  const paths = [
    '/',
    '/docs',
    '/docs/react/start/quick',
    '/docs/angular/concept/tools',
    '/docs/react/platform/openai',
    '/docs/react/guide/x',
    '/docs/angular/recipes/y',
    '/api/core/s',
    '/api',
    '/blog/post',
    '/blog',
    '/elsewhere',
  ];

  const topics = paths.map(websiteTopic);

  expect(topics).toEqual([
    'getting_started',
    'getting_started',
    'getting_started',
    'concepts',
    'platform',
    'react',
    'angular',
    'reference',
    'reference',
    'blog',
    'blog',
    'other',
  ]);
});

test('a known content id needs its own topic to be accepted', () => {
  const contentId = 'docs/react/concept/components';

  const matching = isKnownWebsiteContent(contentId, 'concepts');
  const wrongTopic = isKnownWebsiteContent(contentId, 'react');
  const unknown = isKnownWebsiteContent('unknown-private-page', 'other');

  expect(matching).toBe(true);
  expect(wrongTopic).toBe(false);
  expect(unknown).toBe(false);
});

test('the catalog is memoized', () => {
  const first = websiteContentCatalog();

  const second = websiteContentCatalog();

  expect(second).toBe(first);
});
