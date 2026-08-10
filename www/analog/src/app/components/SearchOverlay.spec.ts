import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('loads search documentation with the Vite 8 raw query', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'www/analog/src/app/components/SearchOverlay.ts'),
    'utf8',
  );
  const docsGlob = source.match(
    /const DOCS_FILES = import\.meta\.glob\([\s\S]*?\n\}\);/,
  )?.[0];

  expect(docsGlob).toContain("query: '?raw'");
  expect(docsGlob).toContain("import: 'default'");
  expect(docsGlob).not.toContain("as: 'raw'");
});
