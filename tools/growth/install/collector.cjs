'use strict';
const { join } = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const {
  truthy,
  disabled,
  packageManager,
  environment,
  endpoint,
} = require('./policy.cjs');
const { readBounded } = require('./files.cjs');
const { installationIdentity } = require('./identity.cjs');
const { discoverGit } = require('./git-context.cjs');
const { writeBridge } = require('./bridge.cjs');

/** Published Hashbrown package names that may report an installation. */
const PACKAGES = new Set([
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
  '@hashbrownai/openai',
  '@hashbrownai/typesafe',
  '@hashbrownai/anthropic',
  '@hashbrownai/azure',
  '@hashbrownai/bedrock',
  '@hashbrownai/google',
  '@hashbrownai/ollama',
]);

/** The only package that resets and writes the development install bridge. */
const TOKEN_PACKAGE = '@hashbrownai/core';

/**
 * Posts a batch as JSON to the endpoint. Never rejects, follows redirects,
 * reads the response, or outlives the timeout.
 */
function sendBatch(batch, { timeoutMs = 2500, endpoint: target } = {}) {
  return new Promise((resolve) => {
    let request, timer;
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      const body = JSON.stringify(batch);
      const url = new URL(target);
      const transport = url.protocol === 'http:' ? http : https;
      request = transport.request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
          agent: false,
        },
        (response) => {
          // No redirect following, response identity, or remote configuration.
          response.destroy();
          request.destroy();
          finish();
        },
      );
      request.on('error', finish);
      timer = setTimeout(
        () => {
          request.destroy();
          finish();
        },
        Math.max(1, timeoutMs),
      );
      request.end(body);
    } catch {
      request?.destroy();
      finish();
    }
  });
}

/**
 * Collects one install event for the package at packageRoot and sends it.
 * Honours opt-outs and a deadline, and never throws.
 */
async function collectInstall({
  packageRoot,
  env = process.env,
  getHome = () => os.homedir(),
  readPackage = async (root) =>
    JSON.parse(await readBounded(join(root, 'package.json'))),
  identify = installationIdentity,
  discover = discoverGit,
  send = sendBatch,
  interactive = Boolean(process.stdin.isTTY || process.stdout.isTTY),
  deadline = Date.now() + 4500,
  now = () => new Date(),
  log = console.log,
}) {
  try {
    const pkg = await readPackage(packageRoot);
    if (
      !pkg ||
      !PACKAGES.has(pkg.name) ||
      typeof pkg.version !== 'string' ||
      !/^[0-9][a-zA-Z0-9.+-]{0,63}$/.test(pkg.version)
    )
      return;
    // Clear copied/reinstalled state even when collection is disabled. If the
    // package is read-only, an old token may remain; never register it anew.
    const isTokenPackage = pkg.name === TOKEN_PACKAGE;
    const bridgeReset = isTokenPackage
      ? await writeBridge(packageRoot, null)
      : false;
    if (disabled(env) || Date.now() >= deadline) return;
    const home = getHome();
    const subject = await identify(home);
    const context = await discover({ home, packageRoot, env });
    if (Date.now() >= deadline) return;
    const manager = packageManager(env.npm_config_user_agent);
    const installEnvironment = environment(
      env,
      interactive,
      manager.packageManager,
    );
    let installationToken;
    // A write this close to the deadline could be cut off and leave a token
    // the install event never cites; the null bridge stays in place instead.
    if (
      bridgeReset &&
      deadline - Date.now() >= 200 &&
      installEnvironment.environment !== 'ci' &&
      !truthy(env.HASHBROWN_TELEMETRY_DEBUG)
    ) {
      const candidate = randomUUID();
      if (await writeBridge(packageRoot, candidate))
        installationToken = candidate;
    }
    if (Date.now() >= deadline) return;
    const event = {
      eventId: randomUUID(),
      kind: 'package.installed',
      occurredAt: now().toISOString(),
      collectorVersion: 'install-v1',
      subject: { ...subject, namespace: 'installation' },
      ...(installationToken ? { installationToken } : {}),
      properties: {
        packageName: pkg.name,
        packageVersion: pkg.version,
        osFamily: os.platform(),
        architecture: os.arch(),
        nodeVersion: process.versions.node,
        ...manager,
        ...installEnvironment,
        consumerContext: context.consumerContext,
      },
    };
    if (
      installEnvironment.environment !== 'ci' &&
      Object.keys(context.identity ?? {}).length
    )
      event.identity = context.identity;
    const batch = { schemaVersion: 1, events: [event] };
    const target = endpoint(env);
    if (truthy(env.HASHBROWN_TELEMETRY_DEBUG)) {
      log(JSON.stringify({ endpoint: target, batch }, null, 2));
      return;
    }
    await send(batch, {
      timeoutMs: Math.min(2500, deadline - Date.now()),
      endpoint: target,
    });
  } catch {
    /* Neither discovery nor transport may fail an installation. */
  }
}
module.exports = { collectInstall, sendBatch, PACKAGES, TOKEN_PACKAGE };
