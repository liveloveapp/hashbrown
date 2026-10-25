import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('Threadplane recorder uses installed consumers and distinct actual framework captures', () => {
  const source = readFileSync(
    new URL('../../src/tools/record-docs-threadplane.ts', import.meta.url),
    'utf8',
  );

  expect(source).toContain('createRequire');
  expect(source).toContain('package-lock.json');
  expect(source).toContain('createThreadplaneApp');
  expect(source).toContain('createThreadplaneProviderEvents');
  expect(source).toContain('DOCS_SKIP_RECORDING');
  expect(source).toContain('DOCS_DEMO_MODES');
  expect(source).toContain('threadplane-react');
  expect(source).toContain('threadplane-angular');
  expect(source).not.toContain('dist/packages');
  expect(source).not.toContain('packages/core/src');
  expect(source).toContain('1440');
  expect(source).toContain('cropRecipeScreenshot');
});
