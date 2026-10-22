// Verifies the ten built packages as packed npm artifacts: their manifests,
// tarball contents and README files, then real offline npm installs whose
// collector events go to a loopback capture server. Run after building them:
//   npx nx install-pack-e2e growth
// All installs live in disposable directories with an isolated HOME.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { COLLECTOR_MODULES, POSTINSTALL_SCRIPT } from './assemble-package.mjs';

const require = createRequire(import.meta.url);
const { moduleSource } = require('./bridge.cjs');
const execute = promisify(execFile);

/** Workspace package directories, in build order. */
const PACKAGES = [
  'core',
  'react',
  'angular',
  'openai',
  'anthropic',
  'azure',
  'bedrock',
  'google',
  'ollama',
  'typesafe',
];

/** Install scenarios, each in its own scratch directory. */
const SCENARIOS = ['unknown', 'ci', 'disabled', 'ignore-scripts'];

const CORE = '@hashbrownai/core';
const COLLECT_PATH = '/_/growth/collect/v1/install';
const BRIDGE_MODULES = ['development-install.mjs', 'development-install.cjs'];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_TOKEN = '10000000-0000-4000-8000-000000000001';
const workspaceRoot = resolve(import.meta.dirname, '../../..');

/** The bridge module source expected for a token, keyed by file name. */
const bridgeSources = (token) => ({
  'development-install.mjs': moduleSource(token, 'esm'),
  'development-install.cjs': moduleSource(token, 'cjs'),
});

const run = (command, args, options = {}) =>
  execute(command, args, {
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

/** Starts a loopback server that records collector batches and accepts them. */
async function startCaptureServer() {
  const batches = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      let events = [];
      try {
        assert.equal(request.method, 'POST');
        assert.equal(request.url, COLLECT_PATH);
        assert.equal(request.headers.authorization, undefined);
        assert.equal(request.headers.cookie, undefined);
        const batch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        batches.push(batch);
        events = batch.events ?? [];
      } catch (error) {
        batches.push({ invalid: String(error) });
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          schemaVersion: 1,
          events: events.map(({ eventId }) => ({
            eventId,
            disposition: 'accepted',
          })),
        }),
      );
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    endpoint: `http://127.0.0.1:${port}${COLLECT_PATH}`,
    /** Removes and returns every recorded event so far. */
    drain() {
      const drained = batches.splice(0, batches.length);
      for (const batch of drained)
        assert.equal(batch.invalid, undefined, 'Invalid collector request');
      return drained.flatMap((batch) => batch.events);
    },
    close: () => new Promise((done) => server.close(done)),
  };
}

const tarFile = async (tarball, path) =>
  (await run('tar', ['-xOf', tarball, `package/${path}`])).stdout;

/** Packs one built package and checks its manifest, files and disclosure. */
async function packAndCheck(name, destination) {
  const dist = join(workspaceRoot, 'dist/packages', name);
  const manifest = await readJson(join(dist, 'package.json'));
  const source = await readJson(
    join(workspaceRoot, 'packages', name, 'package.json'),
  );
  assert.equal(
    manifest.scripts?.postinstall,
    POSTINSTALL_SCRIPT,
    `${name} postinstall`,
  );
  assert.equal(
    source.scripts?.postinstall,
    undefined,
    `${name} in-repo postinstall`,
  );

  const [packed] = JSON.parse(
    (
      await run('npm', [
        'pack',
        dist,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        destination,
      ])
    ).stdout,
  );
  const paths = packed.files.map((file) => file.path);
  assert.deepEqual(
    paths.filter((path) => path.startsWith('install/')).sort(),
    COLLECTOR_MODULES.map((file) => `install/${file}`).sort(),
    `${name} must ship exactly the collector modules under install/`,
  );
  const tarball = join(destination, packed.filename);

  const readme = await tarFile(tarball, 'README.md');
  assert.equal(
    readme,
    await readFile(join(workspaceRoot, 'packages', name, 'README.md'), 'utf8'),
    `${name} must ship the current public README`,
  );

  const bridgeFiles = paths.filter((path) =>
    path.startsWith('development-install'),
  );
  if (name === 'core') {
    const expected = {
      ...bridgeSources(null),
      'development-install.null.mjs': moduleSource(null, 'esm'),
      'development-install.null.cjs': moduleSource(null, 'cjs'),
      'development-install.d.ts':
        'export declare const installationToken: string | null;\n',
    };
    assert.deepEqual(bridgeFiles.sort(), Object.keys(expected).sort());
    for (const [file, contents] of Object.entries(expected))
      assert.equal(
        await tarFile(tarball, file),
        contents,
        `Published core must never contain an installation token (${file})`,
      );
  } else {
    assert.deepEqual(bridgeFiles, [], `${name} must not ship bridge files`);
  }

  return { name: manifest.name, version: manifest.version, tarball };
}

/** Creates a synthetic consumer checkout with a local git config. */
async function createConsumer(cwd) {
  await mkdir(join(cwd, '.git'), { recursive: true });
  await mkdir(join(cwd, 'home'));
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'synthetic-consumer',
      version: '1.0.0',
      private: true,
    }),
  );
  await writeFile(
    join(cwd, '.git/config'),
    '[user]\nname=Synthetic Developer\nemail=developer@example.invalid\n[remote "origin"]\nurl=https://secret@github.com/synthetic/private-repository.git\n',
  );
}

/** Reads core's installed bridge modules, keyed by file name. */
async function installedBridge(cwd) {
  const root = join(cwd, 'node_modules', CORE);
  return Object.fromEntries(
    await Promise.all(
      BRIDGE_MODULES.map(async (file) => [
        file,
        await readFile(join(root, file), 'utf8'),
      ]),
    ),
  );
}

/** Asserts the events of one install scenario and the files it left behind. */
async function checkInstall(scenario, cwd, events, packages) {
  const home = join(cwd, 'home');
  const bridge = await installedBridge(cwd);

  for (const { name } of packages.filter(({ name }) => name !== CORE))
    for (const file of BRIDGE_MODULES)
      assert.equal(
        await exists(join(cwd, 'node_modules', name, file)),
        false,
        `${name} must not write ${file}`,
      );

  if (scenario === 'disabled' || scenario === 'ignore-scripts') {
    assert.equal(events.length, 0, `${scenario} must send nothing`);
    assert.equal(
      await exists(join(home, '.hashbrown')),
      false,
      `${scenario} wrote ~/.hashbrown`,
    );
    assert.deepEqual(bridge, bridgeSources(null));
    return;
  }

  assert.equal(
    events.length,
    packages.length,
    `Expected one event per package in ${scenario}`,
  );
  assert.deepEqual(
    events.map((event) => event.properties.packageName).sort(),
    packages.map(({ name }) => name).sort(),
  );
  assert.equal(new Set(events.map((event) => event.subject.id)).size, 1);
  const storedId = (
    await readFile(join(home, '.hashbrown/installation-id'), 'utf8')
  ).trim();
  assert.equal(events[0].subject.id, storedId);

  for (const event of events) {
    const { version } = packages.find(
      ({ name }) => name === event.properties.packageName,
    );
    assert.equal(event.kind, 'package.installed');
    assert.equal(event.properties.packageVersion, version);
    assert.equal(event.properties.environment, scenario);
    assert.equal(event.properties.consumerContext, 'checkout');
    assert.equal(event.subject.scope, 'persistent');
    assert(
      !JSON.stringify(event).includes('secret'),
      'Payload carries a credential',
    );
    assert(
      !JSON.stringify(event).includes('private-repository'),
      'Payload carries a repository name',
    );
    if (scenario === 'ci') {
      assert.equal(
        event.identity,
        undefined,
        'CI events must carry no identity',
      );
    } else {
      assert.deepEqual(event.identity, {
        gitDisplayName: 'Synthetic Developer',
        gitEmail: 'developer@example.invalid',
        gitConfigOrigin: 'local',
        repositoryProvider: 'github',
        repositoryOwner: 'synthetic',
      });
    }
  }

  const tokened = events.filter((event) => 'installationToken' in event);
  if (scenario === 'ci') {
    assert.deepEqual(tokened, [], 'CI events must carry no installation token');
    assert.deepEqual(bridge, bridgeSources(null));
  } else {
    assert.equal(tokened.length, 1, 'Exactly one installation token');
    const [{ installationToken, properties }] = tokened;
    assert.equal(properties.packageName, CORE);
    assert.match(installationToken, UUID);
    assert.deepEqual(bridge, bridgeSources(installationToken));
  }
}

/** Plants a stale token in core and asserts what `npm rebuild` leaves behind. */
async function checkStaleRebuild(scenario, cwd, events, rebuild) {
  const root = join(cwd, 'node_modules', CORE);
  for (const [file, contents] of Object.entries(bridgeSources(STALE_TOKEN)))
    await writeFile(join(root, file), contents);

  await rebuild();

  const bridge = await installedBridge(cwd);
  const replayed = events();
  if (scenario === 'ignore-scripts') {
    assert.deepEqual(replayed, []);
    assert.deepEqual(bridge, bridgeSources(STALE_TOKEN));
  } else if (scenario === 'unknown') {
    assert.equal(replayed.length, 1);
    const [{ installationToken }] = replayed;
    assert.match(installationToken, UUID);
    assert.notEqual(installationToken, STALE_TOKEN);
    assert.deepEqual(bridge, bridgeSources(installationToken));
  } else {
    assert.equal(replayed.length, scenario === 'ci' ? 1 : 0);
    assert(replayed.every((event) => !('installationToken' in event)));
    assert.deepEqual(bridge, bridgeSources(null));
  }
}

const temporary = await mkdtemp(join(tmpdir(), 'hashbrown-install-pack-'));
const capture = await startCaptureServer();
try {
  const cache = (await run('npm', ['config', 'get', 'cache'])).stdout.trim();
  const packages = [];
  for (const name of PACKAGES)
    packages.push(await packAndCheck(name, temporary));
  const tarballs = packages.map(({ tarball }) => tarball);
  console.log(
    `packed: ${packages.length} tarballs; manifest, file and README checks passed`,
  );

  // Resolve dependency metadata once, scripts disabled, so the scenarios can
  // install strictly offline. Provider packages peer-depend on vendor SDKs.
  const prime = join(temporary, 'dependency-cache');
  await mkdir(prime);
  await writeFile(
    join(prime, 'package.json'),
    JSON.stringify({ private: true }),
  );
  await run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      ...tarballs,
    ],
    { cwd: prime },
  );

  for (const scenario of SCENARIOS) {
    const cwd = join(temporary, scenario);
    const home = join(cwd, 'home');
    await createConsumer(cwd);
    // A minimal environment so the runner's own CI or opt-out variables never leak in.
    const env = {
      PATH: process.env.PATH,
      HOME: home,
      USERPROFILE: home,
      npm_config_cache: cache,
      HASHBROWN_TELEMETRY_ENDPOINT: capture.endpoint,
      ...(scenario === 'ci' ? { CI: 'true', GITHUB_ACTIONS: 'true' } : {}),
      ...(scenario === 'disabled' ? { DO_NOT_TRACK: '1' } : {}),
    };
    const scripts = scenario === 'ignore-scripts' ? ['--ignore-scripts'] : [];
    capture.drain();

    await run(
      'npm',
      [
        'install',
        '--offline',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        '--foreground-scripts',
        ...scripts,
        ...tarballs,
      ],
      { cwd, env },
    );
    const events = capture.drain();
    await checkInstall(scenario, cwd, events, packages);

    await checkStaleRebuild(
      scenario,
      cwd,
      () => capture.drain(),
      () =>
        run(
          'npm',
          ['rebuild', CORE, '--offline', '--foreground-scripts', ...scripts],
          {
            cwd,
            env,
          },
        ),
    );
    console.log(
      `${scenario}: ${events.length} install events; install and stale-token rebuild checks passed`,
    );
  }
  console.log('All ten packed artifacts passed clean npm installation checks.');
} finally {
  await capture.close();
  await rm(temporary, { recursive: true, force: true });
}
