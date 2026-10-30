import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('server error messages never mention a local server', () => {
  const source = readFileSync(
    new URL('../examples/quickstart/server/workbench-app.ts', import.meta.url),
    'utf8',
  );

  const mentions = source.match(/local server/gi) ?? [];

  expect(mentions).toEqual([]);
});
