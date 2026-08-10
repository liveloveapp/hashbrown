import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageDirectory = new URL(
  '../../../dist/packages/angular/',
  import.meta.url,
);

test('published package declares the Angular 22 compatibility boundary', async () => {
  const [packageContents, bundle] = await Promise.all([
    readFile(new URL('package.json', packageDirectory), 'utf8'),
    readFile(
      new URL('fesm2022/hashbrownai-angular.mjs', packageDirectory),
      'utf8',
    ),
  ]);
  const packageJson = JSON.parse(packageContents);

  assert.equal(packageJson.peerDependencies['@angular/core'], '^22.0.0');
  assert.equal(packageJson.peerDependencies['@angular/common'], '^22.0.0');
  assert.match(bundle, /ChangeDetectionStrategy\.Eager/);
});
