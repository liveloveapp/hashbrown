import { expect, test } from 'vitest';
import {
  buildSearchIndex,
  formatMarkdownCell,
  formatMarkdownTable,
  listApiReferenceEntries,
  listSitemapEntries,
} from '../../src/lib/search-index';

test('a markdown cell is empty for null and undefined', () => {
  const values = [null, undefined];

  const result = values.map(formatMarkdownCell);

  expect(result).toEqual(['', '']);
});

test('a markdown cell collapses whitespace and escapes pipes', () => {
  const value = '  one\n two |  three ';

  const result = formatMarkdownCell(value);

  expect(result).toBe('one two \\| three');
});

test('a table with no rows is just the header and separator', () => {
  const rows: { url: string; title: string }[] = [];

  const result = formatMarkdownTable(rows, [
    { key: 'url', header: 'url' },
    { key: 'title', header: 'title' },
  ]);

  expect(result).toBe('|url|title|\n|---|---|');
});

test('a table has one row per entry in column order', () => {
  const rows = [
    { url: '/a', title: 'A | B', description: undefined },
    { url: '/b', title: 'B', description: 'about b' },
  ];

  const result = formatMarkdownTable(rows, [
    { key: 'url', header: 'url' },
    { key: 'title', header: 'title' },
    { key: 'description', header: 'description' },
  ]);

  expect(result).toBe(
    [
      '|url|title|description|',
      '|---|---|---|',
      '|/a|A \\| B||',
      '|/b|B|about b|',
    ].join('\n'),
  );
});

test('the sitemap lists every docs page of both SDKs with its frontmatter', () => {
  const entries = listSitemapEntries();

  expect(entries).toHaveLength(77);
  expect(entries).toContainEqual({
    url: '/docs/angular/concept/components',
    title: 'Generative UI with Angular Components: Hashbrown Angular Docs',
    description:
      'Expose trusted , tested , and compliant components to the model.',
  });
  expect(entries).toContainEqual(
    expect.objectContaining({ url: '/docs/react/start/quick' }),
  );
});

test('API references list every symbol except namespaces', () => {
  const entries = listApiReferenceEntries();

  expect(entries).toContainEqual({
    url: '/api/angular/chatResource',
    symbol: 'chatResource',
    kind: 'Function',
    package: '@hashbrownai/angular',
  });
  expect(entries.some((entry) => entry.kind === 'Namespace')).toBe(false);
  expect(entries.some((entry) => entry.url === '/api/core/s')).toBe(false);
  expect(entries.length).toBeGreaterThan(150);
});

test('the search index holds both tables as markdown', () => {
  const index = buildSearchIndex();

  expect(index.sitemap.split('\n')[0]).toBe('|url|title|description|');
  expect(index.sitemap).toContain('|/docs/react/start/quick|');
  expect(index.apiReferences.split('\n')[0]).toBe('|url|symbol|kind|package|');
  expect(index.apiReferences).toContain(
    '|/api/react/useUiChat|useUiChat|Function|@hashbrownai/react|',
  );
});
