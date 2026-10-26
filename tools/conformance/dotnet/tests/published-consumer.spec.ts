import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const verifier = resolve(__dirname, '../live-consumer/verify.mjs');

/** Executes the standalone verifier in its native ESM runtime. */
function probe(body: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import * as v from ${JSON.stringify(`file://${verifier}`)}; ${body}`,
    ],
    { encoding: 'utf8' },
  );
}

test('requires exact published SDK pins and rejects dependency overrides', () => {
  const body = `
const good = {
  dependencies: Object.fromEntries(v.SDK_NAMES.map((n) => [n, '0.8.2'])),
};
v.validateManifest(good);
for (const bad of ['^0.8.2', 'file:../core', 'workspace:*', 'link:../core']) {
  try {
    v.validateManifest({
      dependencies: { ...good.dependencies, '@hashbrownai/core': bad },
    });
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
}
for (const extra of [{ overrides: {} }, { workspaces: [] }]) {
  try {
    v.validateManifest({ ...good, ...extra });
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
}
console.log('passed');
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects relative source imports outside the explicit copied closure', () => {
  const body = `
v.validateSourceImports('src/app.ts', "import './ok';", [
  'src/app.ts',
  'src/ok.ts',
]);
for (const text of [
  "import '../secret';",
  "export * from './hidden';",
  "import('./hidden')",
  "require('./hidden')",
  "import '/repo/packages/core';",
]) {
  try {
    v.validateSourceImports('src/app.ts', text, ['src/app.ts', 'src/ok.ts']);
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
}
console.log('passed');
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects provenance escapes, missing SDK modules and symbolic links', () => {
  const body = `
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'consumer-unit-')),
);
try {
  const file = path.join(root, 'node_modules/@hashbrownai/core/index.js');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '');
  await v.validateModuleOrigins(root, [file]);
  for (const ids of [
    [],
    ['/repo/packages/core/index.js'],
    [path.join(root, 'node_modules/@hashbrownai/core/../../outside.js')],
  ]) {
    try {
      await v.validateModuleOrigins(root, ids);
      throw Error('accepted');
    } catch (e) {
      if (e.message === 'accepted') throw e;
    }
  }
  await fs.rename(file, file + '.real');
  await fs.symlink(file + '.real', file);
  try {
    await v.validateModuleOrigins(root, [file]);
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
  console.log('passed');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('requires consumer isolation outside repository ancestry', () => {
  const body = `
v.validateIsolation('/private/tmp/consumer', '/repo/project');
for (const root of ['/repo/project/tmp', '/repo', '/repo/project']) {
  try {
    v.validateIsolation(root, '/repo/project');
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
}
console.log('passed');
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('rejects tampered lock or installed package identity and integrity', () => {
  const body = `
const name = '@hashbrownai/core',
  version = '0.8.2';
const pin = {
  version,
  resolved: 'https://registry.npmjs.org/@hashbrownai/core/-/core-0.8.2.tgz',
  integrity: 'sha512-YWJjZA==',
};
const pkg = { name, version };
v.validateRegistryPackage(name, version, pkg, pin, pin);
for (const [p, l, i] of [
  [{ ...pkg, version: '0.8.3' }, pin, pin],
  [pkg, { ...pin, version: '0.8.3' }, pin],
  [pkg, { ...pin, resolved: 'file:../core' }, pin],
  [pkg, pin, { ...pin, integrity: 'sha512-bad' }],
  [pkg, pin, { ...pin, link: true }],
  [pkg, { ...pin, integrity: '' }, pin],
]) {
  try {
    v.validateRegistryPackage(name, version, p, l, i);
    throw Error('accepted');
  } catch (e) {
    if (e.message === 'accepted') throw e;
  }
}
console.log('passed');
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});

test('build children receive no provider or identity environment variables', () => {
  const prepare = resolve(__dirname, '../live-consumer/prepare.mjs');
  const body = `import {buildEnvironment} from ${JSON.stringify(`file://${prepare}`)};const result=buildEnvironment({PATH:'/bin',HOME:'/tmp',OPENAI_API_KEY:'canary',AZURE_API_KEY:'canary',IDENTITY_ENDPOINT:'canary',NODE_OPTIONS:'canary',npm_config_registry:'canary'});console.log(JSON.stringify(result));`;

  const result = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', body],
    { encoding: 'utf8' },
  );

  expect(JSON.parse(result)).toEqual({ PATH: '/bin', HOME: '/tmp' });
});

test('rejects repository SDK aliases in actual builder metadata before filtering package IDs', () => {
  const body = `
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'consumer-metadata-')),
);
const repository = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'consumer-repository-')),
);
try {
  const repositoryFile = repository + '/packages/core/src/index.ts';
  await fs.mkdir(path.dirname(repositoryFile), { recursive: true });
  await fs.writeFile(repositoryFile, '');
  await fs.symlink(repositoryFile, root + '/external-alias.js');
  const dependencies = Object.fromEntries(
    v.SDK_NAMES.map((name) => [name, '0.8.2']),
  );
  const packages = {};
  await fs.mkdir(root + '/node_modules', { recursive: true });
  for (const name of v.SDK_NAMES) {
    const location = 'node_modules/' + name;
    packages[location] = {
      version: '0.8.2',
      resolved:
        'https://registry.npmjs.org/' +
        name +
        '/-/' +
        name.split('/').at(-1) +
        '-0.8.2.tgz',
      integrity: 'sha512-YWJjZA==',
    };
    await fs.mkdir(root + '/' + location, { recursive: true });
    await fs.writeFile(
      root + '/' + location + '/package.json',
      JSON.stringify({ name, version: '0.8.2' }),
    );
    await fs.writeFile(root + '/' + location + '/index.js', '');
  }
  await fs.writeFile(root + '/package.json', JSON.stringify({ dependencies }));
  await fs.writeFile(root + '/package-lock.json', JSON.stringify({ packages }));
  await fs.writeFile(
    root + '/node_modules/.package-lock.json',
    JSON.stringify({ packages }),
  );
  await fs.mkdir(root + '/dist/angular', { recursive: true });
  for (const directory of ['react/src', 'angular/src', 'templates'])
    await fs.mkdir(root + '/' + directory, { recursive: true });
  const core = root + '/node_modules/@hashbrownai/core/index.js';
  for (const builder of [
    'react',
    'angular',
    'react-symlink',
    'angular-symlink',
  ]) {
    await fs.writeFile(
      root + '/react-module-ids.json',
      JSON.stringify([
        core,
        root + '/node_modules/@hashbrownai/react/index.js',
        ...(builder.startsWith('react')
          ? [
              builder.endsWith('symlink')
                ? root + '/external-alias.js'
                : repositoryFile,
            ]
          : []),
      ]),
    );
    await fs.writeFile(
      root + '/dist/angular/browser-stats.json',
      JSON.stringify({
        inputs: {
          [core]: {},
          [root + '/node_modules/@hashbrownai/angular/index.js']: {},
          ...(builder.startsWith('angular')
            ? {
                [builder.endsWith('symlink')
                  ? root + '/external-alias.js'
                  : repository + '/dist/packages/core/index.js']: {},
              }
            : {}),
        },
      }),
    );
    await assert.rejects(
      () => v.verifyConsumer(root, repository),
      /Repository module in consumer build/,
    );
  }
  console.log('passed');
} finally {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(repository, { recursive: true, force: true });
}
`;

  const result = probe(body);

  expect(result.trim()).toBe('passed');
});
