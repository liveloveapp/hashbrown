import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { loadConfigFromFile } from 'vite';

const execFileAsync = promisify(execFile);

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

test('Nitro renderer setup does not pollute machine-readable output', async () => {
  const workspaceDirectory = fileURLToPath(
    new URL('../../../', import.meta.url),
  );
  const configPath = fileURLToPath(
    new URL('../vite.config.ts', import.meta.url),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      [
        "import { resolveConfig } from 'vite';",
        'await resolveConfig(',
        '  { configFile: process.argv[1] },',
        "  'serve',",
        "  'production',",
        "  'production',",
        '  false,',
        ');',
      ].join('\n'),
      configPath,
    ],
    {
      cwd: workspaceDirectory,
      env: { ...process.env, CI: 'true', NO_COLOR: '1' },
    },
  );

  assert.doesNotMatch(stdout, /renderer template/);
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
