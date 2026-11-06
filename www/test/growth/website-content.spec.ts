import { expect, test } from 'vitest';

import { listBlogPosts } from '../../src/lib/content';
import {
  isKnownWebsiteContent,
  websiteContentCatalog,
} from '../../src/lib/growth/website-content';
import {
  contentIdFor,
  websiteTopic,
} from '../../src/lib/growth/website-metadata';
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
  const expected = new Set([
    '/',
    '/docs',
    '/api',
    '/blog',
    ...listSitemapEntries().map((entry) => entry.url),
    ...listBlogPosts().map((post) => '/blog/' + post.slug),
    ...listApiReferenceEntries().map((entry) => entry.url.split('#')[0]),
  ]);

  const catalog = websiteContentCatalog();

  expect(Object.keys(catalog).sort()).toEqual([...expected].sort());
});

test('C# reference pages have bounded content ids and member search anchors are not pages', () => {
  const entries = listApiReferenceEntries().filter(
    (entry) => entry.package === 'Hashbrown.AspNetCore',
  );

  const catalog = websiteContentCatalog();

  expect(entries.length).toBeGreaterThan(73);
  const pageIds = [
    ...new Set(entries.map((entry) => entry.url.split('#')[0])),
  ].map(contentIdFor);
  expect(pageIds).toHaveLength(73);
  expect(new Set(pageIds).size).toBe(pageIds.length);
  for (const entry of entries) {
    const page = entry.url.split('#')[0];
    expect(catalog[page]).toEqual({
      contentId: contentIdFor(page),
      topic: 'reference',
    });
    expect(contentIdFor(page)).toMatch(/^[a-z0-9][a-z0-9_/-]{0,119}$/);
    if (entry.url.includes('#')) expect(catalog[entry.url]).toBeUndefined();
  }
  expect(
    contentIdFor('/api/dotnet/Hashbrown.AspNetCore.NativeSessionOptions'),
  ).toBe('api/dotnet/hashbrown-aspnetcore-nativesessionoptions');
  expect(contentIdFor('/unrecognized.dotted/path')).toBeUndefined();
  expect(contentIdFor('/api/dotnet/unsafe?query=1')).toBeUndefined();
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

test('the server catalog agrees with the collector helpers on every catalog path', () => {
  const catalog = websiteContentCatalog();

  const mismatches = Object.entries(catalog).filter(
    ([path, entry]) =>
      contentIdFor(path) !== entry.contentId ||
      websiteTopic(path) !== entry.topic,
  );

  expect(Object.keys(catalog).length).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
});
