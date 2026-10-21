import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const bridge = require('./bridge.cjs');

test('moduleSource renders esm and cjs null modules', () => {
  const esm = bridge.moduleSource(null, 'esm');
  const cjs = bridge.moduleSource(null, 'cjs');

  assert.equal(esm, 'export const installationToken = null;\n');
  assert.equal(cjs, "'use strict';\nexports.installationToken = null;\n");
});

test('writeBridge writes both files atomically and returns true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-'));
  const token = '3f2b6c1e-0a4d-4b8e-9c1a-5d7e8f901234';

  const written = await bridge.writeBridge(dir, token);

  assert.equal(written, true);
  assert.deepEqual(bridge.BRIDGE_FILES, [
    'development-install.mjs',
    'development-install.cjs',
  ]);
  assert.equal(
    await readFile(join(dir, 'development-install.mjs'), 'utf8'),
    bridge.moduleSource(token, 'esm'),
  );
  assert.equal(
    await readFile(join(dir, 'development-install.cjs'), 'utf8'),
    bridge.moduleSource(token, 'cjs'),
  );
  assert.deepEqual(
    (await readdir(dir)).sort(),
    [...bridge.BRIDGE_FILES].sort(),
  );
});

test('writeBridge returns false when the package root is a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-'));
  const file = join(dir, 'not-a-directory');
  await writeFile(file, 'x');

  const written = await bridge.writeBridge(file, null);

  assert.equal(written, false);
});
