import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('package peers support every maintained Angular major', () => {
  const packageJson = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'packages/angular/package.json'),
      'utf8',
    ),
  ) as { peerDependencies: Record<string, string> };

  expect(packageJson.peerDependencies['@angular/common']).toBe(
    '^20.0.0 || ^21.0.0 || ^22.0.0',
  );
  expect(packageJson.peerDependencies['@angular/core']).toBe(
    '^20.0.0 || ^21.0.0 || ^22.0.0',
  );
});
