import { expect, test } from 'vitest';

import {
  isKnownWebsiteContent,
  websiteContentCatalog,
  websiteTopic,
} from '../../src/lib/growth/website-content';

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

test('every content id matches the collection contract pattern', () => {
  const catalog = websiteContentCatalog();

  const ids = Object.values(catalog).map((entry) => entry.contentId);

  expect(ids.every((id) => /^[a-z0-9][a-z0-9_/-]{0,119}$/u.test(id))).toBe(
    true,
  );
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
    '/blog/post',
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
