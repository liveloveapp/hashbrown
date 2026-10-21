import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  collectInstall,
  sendBatch,
  PACKAGES,
  TOKEN_PACKAGE,
} = require('./collector.cjs');
const UUID_A = '3f2b6c1e-0a4d-4b8e-9c1a-5d7e8f901234';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STALE = '11111111-2222-4333-8444-555555555555';

async function dirOf(name, version) {
  const root = await mkdtemp(join(tmpdir(), 'collector-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name, version }),
  );
  return root;
}
const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );
const identify = async () => ({ id: UUID_A, scope: 'persistent' });
const discover = async () => ({
  consumerContext: 'checkout',
  identity: { gitEmail: 'dev@example.com', gitConfigOrigin: 'local' },
});
const npmEnv = {
  npm_lifecycle_event: 'postinstall',
  npm_config_user_agent: 'npm/10.0.0 node/v20.0.0',
};

test('PACKAGES holds the ten published names and core is the token package', () => {
  const names = [...PACKAGES].sort();

  assert.equal(names.length, 10);
  assert.ok(names.every((name) => name.startsWith('@hashbrownai/')));
  assert.equal(TOKEN_PACKAGE, '@hashbrownai/core');
  assert.ok(PACKAGES.has(TOKEN_PACKAGE));
});

test('collectInstall posts one package.installed for a provider package without a token', async () => {
  const root = await dirOf('@hashbrownai/openai', '0.7.0');
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: npmEnv,
    interactive: true,
    identify,
    discover,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(sent.length, 1);
  const [event] = sent[0].events;
  assert.equal(event.kind, 'package.installed');
  assert.equal(event.collectorVersion, 'install-v1');
  assert.deepEqual(event.subject, {
    id: UUID_A,
    namespace: 'installation',
    scope: 'persistent',
  });
  assert.equal(event.installationToken, undefined);
  assert.deepEqual(event.properties, {
    packageName: '@hashbrownai/openai',
    packageVersion: '0.7.0',
    osFamily: os.platform(),
    architecture: os.arch(),
    nodeVersion: process.versions.node,
    packageManager: 'npm',
    packageManagerVersion: '10.0.0',
    environment: 'local',
    environmentEvidence: 'interactive_package_manager',
    consumerContext: 'checkout',
  });
  assert.deepEqual(event.identity, {
    gitEmail: 'dev@example.com',
    gitConfigOrigin: 'local',
  });
  assert.equal(await exists(join(root, 'development-install.mjs')), false);
});

test('collectInstall writes a token for core and cites it', async () => {
  const root = await dirOf('@hashbrownai/core', '0.7.0');
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: npmEnv,
    interactive: true,
    identify,
    discover,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  const [event] = sent[0].events;
  assert.match(event.installationToken, UUID_V4);
  assert.equal(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    `export const installationToken = "${event.installationToken}";\n`,
  );
  assert.equal(
    await readFile(join(root, 'development-install.cjs'), 'utf8'),
    `'use strict';\nexports.installationToken = "${event.installationToken}";\n`,
  );
});

test('collectInstall in CI resets the core token to null and sends no identity', async () => {
  const root = await dirOf('@hashbrownai/core', '0.7.0');
  const bridge = require('./bridge.cjs');
  await bridge.writeBridge(root, STALE);
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: { ...npmEnv, GITHUB_ACTIONS: 'true' },
    interactive: false,
    identify,
    discover: async () => ({
      consumerContext: 'checkout',
      identity: { gitEmail: 'ci@example.com', gitConfigOrigin: 'global' },
    }),
    send: async (batch) => {
      sent.push(batch);
    },
  });

  const [event] = sent[0].events;
  assert.equal(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    'export const installationToken = null;\n',
  );
  assert.equal(
    await readFile(join(root, 'development-install.cjs'), 'utf8'),
    "'use strict';\nexports.installationToken = null;\n",
  );
  assert.equal(event.properties.environment, 'ci');
  assert.equal(event.properties.ciProvider, 'github_actions');
  assert.equal(event.installationToken, undefined);
  assert.equal(event.identity, undefined);
});

test('collectInstall sends nothing when disabled but still resets the core token', async () => {
  const root = await dirOf('@hashbrownai/core', '0.7.0');
  const bridge = require('./bridge.cjs');
  await bridge.writeBridge(root, STALE);
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: { ...npmEnv, DO_NOT_TRACK: '1' },
    interactive: true,
    identify,
    discover,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(sent.length, 0);
  assert.equal(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    'export const installationToken = null;\n',
  );
});

test('collectInstall never touches bridge files for a non-core package', async () => {
  const root = await dirOf('@hashbrownai/react', '0.7.0');
  const bridge = require('./bridge.cjs');
  await bridge.writeBridge(root, STALE);
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: { ...npmEnv, DO_NOT_TRACK: '1' },
    identify,
    discover,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(sent.length, 0);
  assert.match(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    new RegExp(STALE),
  );
});

test('collectInstall sends nothing for an unknown package name', async () => {
  const root = await dirOf('@acme/other', '1.0.0');
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: npmEnv,
    identify,
    discover,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(sent.length, 0);
});

test('collectInstall in debug mode logs the payload and sends nothing', async () => {
  const root = await dirOf('@hashbrownai/core', '0.7.0');
  const sent = [];
  const logged = [];

  await collectInstall({
    packageRoot: root,
    env: { ...npmEnv, HASHBROWN_TELEMETRY_DEBUG: '1' },
    interactive: true,
    identify,
    discover,
    log: (line) => logged.push(line),
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(sent.length, 0);
  assert.equal(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    'export const installationToken = null;\n',
  );
  assert.equal(logged.length, 1);
  assert.match(logged[0], /"endpoint"/);
  assert.match(logged[0], /package\.installed/);
});

test('collectInstall swallows a throwing send', async () => {
  const root = await dirOf('@hashbrownai/openai', '0.7.0');

  const result = collectInstall({
    packageRoot: root,
    env: npmEnv,
    identify,
    discover,
    send: async () => {
      throw new Error('boom');
    },
  });

  await assert.doesNotReject(result);
});

test('sendBatch posts JSON to the endpoint with no redirect following', async () => {
  const seen = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      seen.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body,
      });
      response.writeHead(302, { location: 'http://127.0.0.1:1/never' });
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const batch = { schemaVersion: 1, events: [] };

  await sendBatch(batch, {
    timeoutMs: 2000,
    endpoint: `http://127.0.0.1:${port}/x`,
  });
  await new Promise((resolve) => server.close(resolve));

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, '/x');
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0].body), batch);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers.cookie, undefined);
});

test('collectInstall skips the token write when the deadline is near', async () => {
  const root = await dirOf('@hashbrownai/core', '0.7.0');
  const sent = [];

  await collectInstall({
    packageRoot: root,
    env: npmEnv,
    interactive: true,
    identify,
    discover,
    deadline: Date.now() + 100,
    send: async (batch) => {
      sent.push(batch);
    },
  });

  assert.equal(
    await readFile(join(root, 'development-install.mjs'), 'utf8'),
    'export const installationToken = null;\n',
  );
  assert.ok(sent.every((batch) => !batch.events[0].installationToken));
});
