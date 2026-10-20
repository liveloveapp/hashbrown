import { expect, test } from 'vitest';
import { searchSystemPrompt } from '../../src/components/search/search-prompt';
import { SEARCH_RESULT_COMPONENTS } from '../../src/components/search/SearchResults';

const index = {
  sitemap:
    '|url|title|description|\n|---|---|---|\n|/docs/react/concept/components|Components|Expose components|',
  apiReferences:
    '|url|symbol|kind|package|\n|---|---|---|---|\n|/api/react/useUiChat|useUiChat|Function|@hashbrownai/react|',
};

test('the search system prompt is a plain string with the sitemap and API tables', () => {
  const input = index;

  const system = searchSystemPrompt(input);

  expect(typeof system).toBe('string');
  expect(system).toContain(index.sitemap);
  expect(system).toContain(index.apiReferences);
});

test('the search system prompt sends refusals and empty results to www-markdown', () => {
  const input = index;

  const lines = searchSystemPrompt(input).split('\n');

  expect(
    lines.find((line) => line.includes('not related to hashbrown')),
  ).toContain('www-markdown');
  expect(
    lines.find((line) => line.includes('If there are no results')),
  ).toContain('www-markdown');
});

test('the search system prompt only names components the overlay exposes', () => {
  const exposed = new Set<string>(
    SEARCH_RESULT_COMPONENTS.map((component) => component.name),
  );

  const named = searchSystemPrompt(index).match(/www-[a-z-]+/g) ?? [];

  expect(named.length).toBeGreaterThan(0);
  expect(named.filter((name) => !exposed.has(name))).toEqual([]);
});
