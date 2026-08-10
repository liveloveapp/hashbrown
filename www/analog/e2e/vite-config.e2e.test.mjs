import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadConfigFromFile } from 'vite';

test('test mode excludes Nitro build plugins', async () => {
  const configPath = fileURLToPath(
    new URL('../vite.config.ts', import.meta.url),
  );

  const result = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    configPath,
  );
  const pluginNames = (result?.config.plugins ?? [])
    .flat(Infinity)
    .filter(Boolean)
    .map((plugin) => plugin.name);

  assert.equal(
    pluginNames.some((name) => name?.startsWith('nitro:')),
    false,
  );
});
