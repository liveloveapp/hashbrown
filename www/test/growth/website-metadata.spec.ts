import { expect, test } from 'vitest';

import {
  acquisitionProperties,
  contentIdFor,
  websiteTopic,
} from '../../src/lib/growth/website-metadata';

test('acquisitionProperties lowercases and validates utm fields and referrerHost', () => {
  const search =
    '?utm_source=Newsletter&utm_medium=em ail&utm_campaign=Launch_1';

  const valid = acquisitionProperties(search, 'https://News.Example.com/a?b=1');
  const invalid = acquisitionProperties('?utm_source=-bad', 'not a url');

  expect(valid).toEqual({
    campaignSource: 'newsletter',
    campaignName: 'launch_1',
    referrerHost: 'news.example.com',
  });
  expect(invalid).toEqual({});
});

test('websiteTopic maps every rule in the Global Constraints', () => {
  const table: [string, string][] = [
    ['/', 'getting_started'],
    ['/docs', 'getting_started'],
    ['/docs/react/start/quick', 'getting_started'],
    ['/docs/angular/start/quick', 'getting_started'],
    ['/docs/react/concept/tools', 'concepts'],
    ['/docs/angular/platform/openai', 'platform'],
    ['/docs/react/guide/x', 'react'],
    ['/docs/angular/guide/x', 'angular'],
    ['/api', 'reference'],
    ['/api/core/x', 'reference'],
    ['/blog', 'blog'],
    ['/blog/post', 'blog'],
    ['/pricing', 'other'],
  ];

  const topics = table.map(([path]) => [path, websiteTopic(path)]);

  expect(topics).toEqual(table);
});

test('contentIdFor drops the slashes, lowercases, and maps the root to home', () => {
  const ids = ['/', '/Docs/React/', '/blog/a_b', '/%%%'].map(contentIdFor);

  expect(ids).toEqual(['home', 'docs/react', 'blog/a_b', undefined]);
});

test('acquisitionProperties drops referrer hosts the server would reject', () => {
  const hosts = ['example.com.', '-a.com', 'a-.com', 'a..b', 'exa_mple.com'];

  const results = hosts.map((host) =>
    acquisitionProperties('', `https://${host}/path`),
  );

  expect(results).toEqual(hosts.map(() => ({})));
});
