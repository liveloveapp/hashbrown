import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { installationIdentity } = require('./identity.cjs');
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('installationIdentity creates then reuses a persistent id', async () => {
  const home = await mkdtemp(join(tmpdir(), 'identity-'));

  const first = await installationIdentity(home);
  const second = await installationIdentity(home);

  assert.match(first.id, UUID);
  assert.equal(first.scope, 'persistent');
  assert.deepEqual(second, first);
  const mode = (await stat(join(home, '.hashbrown', 'installation-id'))).mode;
  assert.equal(mode & 0o777, 0o600);
});

test('installationIdentity falls back to memory when home is unwritable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'identity-'));
  const home = join(dir, 'file');
  await writeFile(home, 'x');

  const identity = await installationIdentity(home);

  assert.match(identity.id, UUID);
  assert.equal(identity.scope, 'memory');
});
