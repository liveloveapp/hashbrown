import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source =
  process.env.HASHBROWN_STARTER_SOURCE ??
  path.resolve('examples/dotnet-starter');

async function contract() {
  const filename = path.join(source, 'tools/candidate-contract.mjs');
  const exists = await fs.access(filename).then(
    () => true,
    () => false,
  );
  assert.ok(
    exists,
    'starter must implement explicit exact-archive selection and owned-root safety',
  );
  return import(pathToFileURL(filename).href);
}

const baseline = {
  name: 'hashbrown-dotnet-live-consumer',
  version: '1.0.0',
  private: true,
  type: 'module',
  dependencies: {
    '@hashbrownai/core': '0.8.3',
    '@hashbrownai/react': '0.8.3',
    '@hashbrownai/angular': '0.8.3',
    react: '19.3.1',
    '@angular/core': '22.2.3',
    vite: '8.3.4',
  },
};

test('starter manifest changes only root name and the three exact Hashbrown selections', async () => {
  const { createStarterManifest } = await contract();
  const input = structuredClone(baseline);

  const manifest = createStarterManifest(input);

  assert.deepEqual(input, baseline);
  assert.deepEqual(manifest, {
    ...baseline,
    name: 'hashbrown-dotnet-starter',
    dependencies: {
      ...baseline.dependencies,
      '@hashbrownai/core': '0.9.0',
      '@hashbrownai/react': '0.9.0',
      '@hashbrownai/angular': '0.9.0',
    },
  });
});

test('starter refuses a missing frozen framework package rather than adding a new graph', async () => {
  const { createStarterManifest } = await contract();
  const input = structuredClone(baseline);
  delete input.dependencies['@hashbrownai/angular'];

  assert.throws(() => createStarterManifest(input), /angular|graph|selection/i);
});

test('starter candidate selection requires both explicit qualified artifact pointers', async () => {
  const { validateCandidateSelection } = await contract();

  for (const input of [{}, { npm: '/tmp/npm' }, { nuget: '/tmp/nuget' }]) {
    assert.throws(
      () => validateCandidateSelection(input),
      /explicit|npm|nuget/i,
    );
  }
});

test('starter refuses registry-looking ranges and latest as candidate pointers', async () => {
  const { validateCandidateSelection } = await contract();

  for (const npm of [
    'latest',
    '^0.9.0',
    '0.9.0',
    'https://registry.npmjs.org',
  ]) {
    assert.throws(
      () => validateCandidateSelection({ npm, nuget: '/tmp/nuget' }),
      /path|pointer|candidate/i,
    );
  }
});

test('starter verifies actual archive, output and loaded SDK binary equality', async () => {
  const { assertLoadedSdkIdentity } = await contract();
  const identity = {
    archiveDllSha256: 'a'.repeat(64),
    outputDllSha256: 'a'.repeat(64),
    loadedDllSha256: 'a'.repeat(64),
    assemblyName: 'Hashbrown.AspNetCore',
    packageVersion: '0.1.0-preview.2',
    informationalVersion: '0.1.0-preview.2+0123456789abcdef',
  };

  assert.doesNotThrow(() => assertLoadedSdkIdentity(identity));
  for (const key of [
    'archiveDllSha256',
    'outputDllSha256',
    'loadedDllSha256',
  ]) {
    assert.throws(
      () => assertLoadedSdkIdentity({ ...identity, [key]: 'b'.repeat(64) }),
      /binary|hash|identity/i,
    );
  }
  assert.throws(
    () =>
      assertLoadedSdkIdentity({
        ...identity,
        packageVersion: '0.1.0-preview.1',
      }),
    /version|identity/i,
  );
  assert.throws(
    () =>
      assertLoadedSdkIdentity({
        ...identity,
        informationalVersion: '0.1.0-preview.1',
      }),
    /version|identity/i,
  );
});

test('starter refuses static roots outside the owned prepared directory', async () => {
  const { validateStaticRoot } = await contract();
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-root-test-')),
  );
  const outside = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-outside-test-')),
  );
  await fs.mkdir(path.join(root, 'dist/react'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'dist/react/index.html'),
    '<div id="root"></div>',
  );
  await fs.writeFile(path.join(outside, 'index.html'), '<div>outside</div>');
  await fs.symlink(outside, path.join(root, 'escape'));

  try {
    assert.equal(
      await validateStaticRoot(root, 'react'),
      path.join(root, 'dist/react'),
    );
    await assert.rejects(
      validateStaticRoot(root, '../outside'),
      /framework|react|angular/i,
    );
    await assert.rejects(
      validateStaticRoot(root, 'angular'),
      /exist|client|index|root/i,
    );
    await fs.rm(path.join(root, 'dist/react'), { recursive: true });
    await fs.symlink(outside, path.join(root, 'dist/react'));
    await assert.rejects(
      validateStaticRoot(root, 'react'),
      /owned|outside|root/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('external candidate manifest selects only copied owned archive paths without changing public pins', async () => {
  const helpers = await contract();
  const archives = Object.fromEntries(
    ['core', 'react', 'angular'].map((name) => [
      `@hashbrownai/${name}`,
      { archive: `/private/tmp/owned/archives/${name}.tgz`, version: '0.9.0' },
    ]),
  );

  assert.equal(
    typeof helpers.createArchiveManifest,
    'function',
    'External candidate manifest must explicitly select copied archives.',
  );
  const manifest = helpers.createArchiveManifest(baseline, archives);

  for (const [name, archive] of Object.entries(archives))
    assert.equal(manifest.dependencies[name], 'file:' + archive.archive);
  assert.equal(manifest.dependencies.react, baseline.dependencies.react);
  assert.equal(
    helpers.createStarterManifest(baseline).dependencies['@hashbrownai/core'],
    '0.9.0',
  );
});

async function smokeHelpers() {
  return import(pathToFileURL(path.join(source, 'tools/smoke.mjs')).href);
}

function providerContinuation(
  browserOutput,
  nativeOutput = JSON.stringify({
    code: 'SFO',
    name: 'San Francisco International Airport',
    city: 'San Francisco',
  }),
) {
  const scenario = 'starter-smoke-cold-known';
  return [
    { scenario, body: { input: [] } },
    {
      scenario,
      body: {
        input: [
          { type: 'function_call', call_id: scenario + '-native' },
          { type: 'function_call', call_id: scenario + '-browser' },
          {
            type: 'function_call_output',
            call_id: scenario + '-native',
            output: nativeOutput,
          },
          {
            type: 'function_call_output',
            call_id: scenario + '-browser',
            output: browserOutput,
          },
        ],
      },
    },
  ];
}

test('smoke rejects matching call IDs when actual provider known-result payload is wrong', async () => {
  const { assertOriginalResults } = await smokeHelpers();
  const expected = {
    browserOutcome: 'known',
    browserValue: { note: 'known result' },
  };

  assert.throws(
    () =>
      assertOriginalResults(
        providerContinuation('{}'),
        'starter-smoke-cold-known',
        ['native', 'browser'],
        expected,
      ),
    /result|payload|note/i,
  );
  assert.doesNotThrow(() =>
    assertOriginalResults(
      providerContinuation(JSON.stringify(expected.browserValue)),
      'starter-smoke-cold-known',
      ['native', 'browser'],
      expected,
    ),
  );
});

test('smoke rejects matching call IDs when actual native result payload is empty', async () => {
  const { assertOriginalResults } = await smokeHelpers();
  const expected = {
    browserOutcome: 'known',
    browserValue: { note: 'known result' },
  };

  assert.throws(
    () =>
      assertOriginalResults(
        providerContinuation(JSON.stringify(expected.browserValue), '{}'),
        'starter-smoke-cold-known',
        ['native', 'browser'],
        expected,
      ),
    /native|airport|result|payload/i,
  );
});

test('smoke distinguishes explicit unavailable uncertainty from a known browser result', async () => {
  const { assertOriginalResults } = await smokeHelpers();
  const marker = JSON.stringify({
    hashbrownRecovery: {
      version: 1,
      status: 'result-unavailable',
      effect: 'unknown',
      message:
        'The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed.',
    },
  });

  assert.throws(
    () =>
      assertOriginalResults(
        providerContinuation(JSON.stringify({ note: 'known result' })),
        'starter-smoke-cold-known',
        ['native', 'browser'],
        { browserOutcome: 'unavailable' },
      ),
    /unavailable|uncertainty|result|payload/i,
  );
  assert.doesNotThrow(() =>
    assertOriginalResults(
      providerContinuation(marker),
      'starter-smoke-cold-known',
      ['native', 'browser'],
      { browserOutcome: 'unavailable' },
    ),
  );
});

test('smoke attempts every acquired cleanup even when multiple cleanups fail', async () => {
  const helpers = await smokeHelpers();
  const attempted = [];
  assert.equal(
    typeof helpers.cleanupResources,
    'function',
    'Smoke must aggregate cleanup failures without leaking later resources.',
  );

  const result = helpers.cleanupResources([
    async () => {
      attempted.push('worker');
      throw Error('first failure');
    },
    async () => {
      attempted.push('browser');
      throw Error('second failure');
    },
    async () => {
      attempted.push('upstream');
    },
    async () => {
      attempted.push('database');
    },
  ]);

  await assert.rejects(
    result,
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(attempted, ['worker', 'browser', 'upstream', 'database']);
});

test('both clients submit the exact complete native approved-object wire decisions', async () => {
  const filename = path.join(source, 'shared/native-decisions.mjs');
  assert.ok(
    await fs.access(filename).then(
      () => true,
      () => false,
    ),
    'Shared native approval decisions must preserve the exact public wire contract.',
  );
  const { nativeDecisions } = await import(pathToFileURL(filename).href);
  const interrupts = [{ id: 'native-a' }, { id: 'native-b' }];

  const approved = nativeDecisions(interrupts, 'approve');
  const declined = nativeDecisions(interrupts, 'decline');
  const cancelled = nativeDecisions(interrupts, 'cancel');

  assert.deepEqual(
    approved,
    interrupts.map((item) => ({
      interruptId: item.id,
      status: 'resolved',
      payload: { approved: true },
    })),
  );
  assert.deepEqual(
    declined,
    interrupts.map((item) => ({
      interruptId: item.id,
      status: 'resolved',
      payload: { approved: false },
    })),
  );
  assert.deepEqual(
    cancelled,
    interrupts.map((item) => ({ interruptId: item.id, status: 'cancelled' })),
  );
  assert.deepEqual(interrupts, [{ id: 'native-a' }, { id: 'native-b' }]);
});

test('smoke scopes provider evidence to the current actual framework run', async () => {
  const { assertOriginalResults } = await smokeHelpers();
  const value = { note: 'second framework result' };
  const earlier = providerContinuation(
    JSON.stringify({ note: 'first framework result' }),
  );
  const current = providerContinuation(JSON.stringify(value));

  assert.doesNotThrow(() =>
    assertOriginalResults(
      [...earlier, ...current],
      'starter-smoke-cold-known',
      ['native', 'browser'],
      {
        requestStart: earlier.length,
        browserOutcome: 'known',
        browserValue: value,
      },
    ),
  );
});

test('build and test accept only an explicit CLI or explicit starter metadata environment selection', async () => {
  const helpers = await contract();
  assert.equal(
    typeof helpers.resolvePreparedMetadata,
    'function',
    'Starter task selection must use an explicit prepared artifact binding.',
  );

  assert.equal(
    helpers.resolvePreparedMetadata(
      'build',
      {},
      { HASHBROWN_STARTER_METADATA: '/private/tmp/starter.json' },
    ),
    '/private/tmp/starter.json',
  );
  assert.equal(
    helpers.resolvePreparedMetadata(
      'test',
      { metadata: '/private/tmp/cli.json' },
      { HASHBROWN_STARTER_METADATA: '/private/tmp/starter.json' },
    ),
    '/private/tmp/cli.json',
  );
  assert.throws(
    () => helpers.resolvePreparedMetadata('build', {}, {}),
    /explicit|metadata/i,
  );
  assert.throws(
    () =>
      helpers.resolvePreparedMetadata(
        'test',
        {},
        { HASHBROWN_STARTER_METADATA: 'latest' },
      ),
    /absolute|metadata|path/i,
  );
});

test('serve never adopts an ambient metadata binding or starts hidden preparation', async () => {
  const helpers = await contract();
  assert.equal(
    typeof helpers.resolvePreparedMetadata,
    'function',
    'Serve must require an explicit CLI selection.',
  );

  assert.throws(
    () =>
      helpers.resolvePreparedMetadata(
        'serve',
        {},
        { HASHBROWN_STARTER_METADATA: '/private/tmp/starter.json' },
      ),
    /explicit|CLI|metadata/i,
  );
  assert.equal(
    helpers.resolvePreparedMetadata(
      'serve',
      { metadata: '/private/tmp/cli.json' },
      {},
    ),
    '/private/tmp/cli.json',
  );
});

test('cold smoke rejects unentered browser work instead of accepting two missing counters', async () => {
  const helpers = await smokeHelpers();
  assert.equal(
    typeof helpers.assertBrowserEntered,
    'function',
    'Cold smoke must positively observe actual original browser handler entry.',
  );

  assert.throws(
    () =>
      helpers.assertBrowserEntered({
        beforeEntries: null,
        afterEntries: null,
        pending: false,
      }),
    /browser|entry|entered/i,
  );
  assert.throws(
    () =>
      helpers.assertBrowserEntered({
        beforeEntries: 0,
        afterEntries: 0,
        pending: true,
      }),
    /browser|entry|entered/i,
  );
  assert.throws(
    () =>
      helpers.assertBrowserEntered({
        beforeEntries: 0,
        afterEntries: 1,
        pending: false,
      }),
    /browser|entry|entered/i,
  );
  assert.doesNotThrow(() =>
    helpers.assertBrowserEntered({
      beforeEntries: 0,
      afterEntries: 1,
      pending: true,
    }),
  );
});

test('executed standalone build entrypoint rejects tampering while trusted source stays unchanged', async () => {
  const helpers = await import(
    pathToFileURL(path.join(source, 'tools/verify-candidate.mjs')).href
  );
  assert.equal(
    typeof helpers.verifyBuildEntrypoint,
    'function',
    'The executed build entrypoint must be independently bound to inventoried source bytes.',
  );
  const { createHash } = await import('node:crypto');
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-build-entrypoint-')),
  );
  const trusted = Buffer.from('export const build = "trusted";\n');
  await fs.mkdir(path.join(root, 'tools'));
  await fs.writeFile(path.join(root, 'tools/build.mjs'), trusted);
  await fs.writeFile(path.join(root, 'build.mjs'), trusted);
  const expected = createHash('sha256').update(trusted).digest('hex');

  try {
    await helpers.verifyBuildEntrypoint(root, expected);
    await fs.writeFile(
      path.join(root, 'build.mjs'),
      'export const build = "tampered";\n',
    );

    await assert.rejects(
      helpers.verifyBuildEntrypoint(root, expected),
      /build|entrypoint|hash|source/i,
    );
    assert.deepEqual(
      await fs.readFile(path.join(root, 'tools/build.mjs')),
      trusted,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('executed standalone build entrypoint rejects a symlink even when trusted bytes match', async () => {
  const helpers = await import(
    pathToFileURL(path.join(source, 'tools/verify-candidate.mjs')).href
  );
  assert.equal(
    typeof helpers.verifyBuildEntrypoint,
    'function',
    'The executed build entrypoint must have a physical source origin.',
  );
  const { createHash } = await import('node:crypto');
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-build-alias-')),
  );
  const trusted = Buffer.from('export const build = "trusted";\n');
  await fs.mkdir(path.join(root, 'tools'));
  await fs.writeFile(path.join(root, 'tools/build.mjs'), trusted);
  await fs.symlink(
    path.join(root, 'tools/build.mjs'),
    path.join(root, 'build.mjs'),
  );
  const expected = createHash('sha256').update(trusted).digest('hex');

  try {
    await assert.rejects(
      helpers.verifyBuildEntrypoint(root, expected),
      /build|entrypoint|physical|alias|symlink/i,
    );
    assert.deepEqual(
      await fs.readFile(path.join(root, 'tools/build.mjs')),
      trusted,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** Creates only physical inert module-origin fixtures; no module is executed. */
async function moduleOriginFixture(reactVirtual = [], angularVirtual = []) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-module-origins-')),
  );
  const sdk = {};
  for (const name of ['core', 'react', 'angular']) {
    const file = path.join(root, 'node_modules/@hashbrownai', name, 'index.js');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'export {};\n');
    sdk[name] = file;
  }
  await fs.mkdir(path.join(root, 'dist/angular'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'react-module-ids.json'),
    JSON.stringify([sdk.core, sdk.react, ...reactVirtual]),
  );
  await fs.writeFile(
    path.join(root, 'dist/angular/browser-stats.json'),
    JSON.stringify({
      inputs: Object.fromEntries(
        [sdk.core, sdk.angular, ...angularVirtual].map((id) => [id, {}]),
      ),
    }),
  );
  return root;
}

test('module origins accept only the three recognized synthetic builder identities', async () => {
  const { verifyModuleOrigins } = await import(
    pathToFileURL(path.join(source, 'tools/verify-candidate.mjs')).href
  );
  assert.equal(
    typeof verifyModuleOrigins,
    'function',
    'Actual builder origin verification must expose its narrow filesystem seam.',
  );
  const root = await moduleOriginFixture(
    ['\0vite/modulepreload-polyfill.js', '\0vite/preload-helper.js'],
    ['angular:styles/global:styles'],
  );

  try {
    await verifyModuleOrigins(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const alias of [
  '\0unreviewed-plugin',
  'virtual:unreviewed-source',
  'angular:unreviewed-source',
]) {
  test(
    'module origins reject unrecognized synthetic input ' +
      JSON.stringify(alias),
    async () => {
      const { verifyModuleOrigins } = await import(
        pathToFileURL(path.join(source, 'tools/verify-candidate.mjs')).href
      );
      assert.equal(
        typeof verifyModuleOrigins,
        'function',
        'Actual builder origin verification must expose its narrow filesystem seam.',
      );
      const root = await moduleOriginFixture([alias]);

      try {
        await assert.rejects(
          verifyModuleOrigins(root),
          /virtual|origin|input|module|ENOENT/i,
        );
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
}

test('module origins reject physical source fallback outside the owned consumer', async () => {
  const { verifyModuleOrigins } = await import(
    pathToFileURL(path.join(source, 'tools/verify-candidate.mjs')).href
  );
  assert.equal(
    typeof verifyModuleOrigins,
    'function',
    'Actual builder origin verification must expose its narrow filesystem seam.',
  );
  const outside = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-outside-module-')),
  );
  const file = path.join(outside, 'workspace-source.js');
  await fs.writeFile(file, 'export {};\n');
  const root = await moduleOriginFixture([file]);

  try {
    await assert.rejects(
      verifyModuleOrigins(root),
      /escaped|outside|source|origin|module/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('actual Nx graph serializes starter test after build and forwards the explicit metadata selection', async () => {
  const { spawnSync } = await import('node:child_process');
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'starter-task-graph-')),
  );
  const graphPath = path.join(directory, 'tasks.json');
  const metadata = '/absolute/planner-only.json';
  const environment = Object.fromEntries(
    [
      'PATH',
      'HOME',
      'TMPDIR',
      'TMP',
      'TEMP',
      'SystemRoot',
      'COMSPEC',
      'LANG',
      'NX_ISOLATE_PLUGINS',
    ]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );

  try {
    const planned = spawnSync(
      'npx',
      [
        '--no-install',
        'nx',
        'run-many',
        '-t',
        'build,test',
        '-p',
        'dotnet-starter',
        '--metadata=' + metadata,
        '--graph=' + graphPath,
      ],
      {
        cwd: path.resolve(source, '../..'),
        env: { ...environment, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' },
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.equal(
      planned.error,
      undefined,
      'Actual Nx task graph could not be planned.',
    );
    assert.equal(
      planned.status,
      0,
      planned.stderr ||
        planned.stdout ||
        'Actual Nx planning must finish before asserting dependency semantics.',
    );
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));

    assert.ok(
      graph.tasks.dependencies['dotnet-starter:test'].includes(
        'dotnet-starter:build',
      ),
      'Starter tests must wait for actual builds in the Nx scheduler.',
    );
    assert.equal(
      graph.tasks.tasks['dotnet-starter:build'].overrides.metadata,
      metadata,
      'The dependent build must retain the explicit CLI metadata selection.',
    );
    assert.equal(
      graph.tasks.tasks['dotnet-starter:test'].overrides.metadata,
      metadata,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('protected cold recovery requires observed unchanged browser counts and disabled execution', async () => {
  const helpers = await smokeHelpers();
  assert.equal(
    typeof helpers.assertBrowserInert,
    'function',
    'Protected cold recovery must positively observe browser inactivity.',
  );

  for (const witness of [
    { beforeEntries: null, afterEntries: null, pending: false },
    { beforeEntries: -1, afterEntries: -1, pending: false },
    { beforeEntries: 0.5, afterEntries: 0.5, pending: false },
    { beforeEntries: 1, afterEntries: 2, pending: false },
    { beforeEntries: 1, afterEntries: 1, pending: true },
  ])
    assert.throws(
      () => helpers.assertBrowserInert(witness),
      /browser|inert|entry|count/i,
    );
  assert.doesNotThrow(() =>
    helpers.assertBrowserInert({
      beforeEntries: 0,
      afterEntries: 0,
      pending: false,
    }),
  );
  assert.doesNotThrow(() =>
    helpers.assertBrowserInert({
      beforeEntries: 1,
      afterEntries: 1,
      pending: false,
    }),
  );
});

test('cold recovery captures the first normal configuration without adopting resumed wire properties', async () => {
  const helpers = await smokeHelpers();
  assert.equal(
    typeof helpers.captureRecoveryConfiguration,
    'function',
    'The first normal recovery configuration must remain independent from continuation wire state.',
  );
  const initial = {
    messages: [{ role: 'system', content: 'trusted system' }],
    tools: [{ name: 'readBrowserNote' }],
    forwardedProps: { responseSchema: { type: 'object' } },
  };
  const resumed = {
    ...structuredClone(initial),
    resume: [
      {
        interruptId: 'native',
        status: 'resolved',
        payload: { approved: true },
      },
    ],
    forwardedProps: { hashbrown: { recovery: { serverRevision: 8 } } },
  };
  const before = structuredClone({ initial, resumed });

  const selected = helpers.captureRecoveryConfiguration(undefined, initial);
  const afterResume = helpers.captureRecoveryConfiguration(selected, resumed);

  assert.deepEqual(selected, {
    system: 'trusted system',
    tools: initial.tools,
    forwardedProps: initial.forwardedProps,
  });
  assert.equal(afterResume, selected);
  assert.deepEqual({ initial, resumed }, before);
  initial.tools[0].name = 'mutated caller data';
  assert.equal(selected.tools[0].name, 'readBrowserNote');
  assert.equal(
    helpers.captureRecoveryConfiguration(undefined, resumed),
    undefined,
  );
});
