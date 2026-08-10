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

test('production mode declares the client build entry', async () => {
  const configPath = fileURLToPath(
    new URL('../vite.config.ts', import.meta.url),
  );
  const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));

  const result = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    configPath,
  );
  const clientInput =
    result?.config.environments?.client?.build?.rollupOptions?.input;
  const ssrEntryFileNames =
    result?.config.environments?.ssr?.build?.rollupOptions?.output
      ?.entryFileNames;

  assert.equal(clientInput, indexPath);
  assert.equal(ssrEntryFileNames, '[name].mjs');
});

test('production serve uses the source renderer template', async () => {
  const configPath = fileURLToPath(
    new URL('../vite.config.ts', import.meta.url),
  );

  const result = await loadConfigFromFile(
    { command: 'serve', mode: 'production' },
    configPath,
  );
  const nitroPlugin = result?.config.plugins
    ?.flat()
    .find((plugin) => plugin?.name === '@analogjs/nitro');

  assert.equal(typeof nitroPlugin?.config, 'function');
  assert.equal(typeof nitroPlugin?.load, 'function');

  await nitroPlugin.config(result.config);
  const ssrEntry = await nitroPlugin.load(
    '\0virtual:@analogjs/nitro/ssr-entry',
  );

  assert.match(ssrEntry, /\/src\/main\.ts/);
  assert.doesNotMatch(ssrEntry, /\/assets\/[^"']+\.js/);
});
