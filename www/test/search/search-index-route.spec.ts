import { expect, test } from 'vitest';
import { dynamic, GET } from '../../src/app/%5F/search-index/route';
import { buildSearchIndex } from '../../src/lib/search-index';

test('the search index route is prerendered at build time', () => {
  const mode = dynamic;

  expect(mode).toBe('force-static');
});

test('the search index route serves the index as JSON', async () => {
  const expected = buildSearchIndex();

  const response = GET();

  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual(expected);
});
