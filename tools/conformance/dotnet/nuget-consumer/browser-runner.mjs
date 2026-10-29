import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qualifyConsumer } from './qualify.mjs';
import { hashFile } from './verify.mjs';
import { qualifyConsumer as qualifyNpm } from '../live-consumer/qualify.mjs';
import { startLiveStaticServer } from '../harness/live-static-server.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');

/** Keeps raw Playwright failure artifacts alongside the private package evidence. */
export function packagePlaywrightArguments(config, evidence, kind) {
  return [
    path.join(repository, 'node_modules/playwright/cli.js'),
    'test',
    '--config',
    path.join(here, '..', config),
    '--output',
    path.join(evidence, `${kind}-playwright`),
  ];
}

/** Propagates the resolved private root to every package fixture and native wire-evidence sink. */
export function packageEvidenceEnvironment(evidence, kind) {
  return {
    HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY: evidence,
    DOTNET_NATIVE_BROWSER_EVIDENCE: path.join(evidence, `${kind}-native`),
  };
}

/** Runs the exact package suite with full NuGet/npm qualification on both sides and bounded owned static origins. */
export async function runPackageBrowser(args = process.argv.slice(2)) {
  let metadata;
  let npmMetadata = process.env.HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA;
  let regressions = false;
  let smoke = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--regressions') regressions = true;
    else if (arg === '--smoke') smoke = true;
    else if (arg === '--metadata') metadata = args[++index];
    else if (arg.startsWith('--metadata='))
      metadata = arg.slice('--metadata='.length);
    else if (arg === '--npm-metadata') npmMetadata = args[++index];
    else if (arg.startsWith('--npm-metadata='))
      npmMetadata = arg.slice('--npm-metadata='.length);
    else throw Error(`Unexpected package browser argument: ${arg}`);
  }
  assert.ok(!(smoke && regressions), 'Select one package browser suite');
  assert.ok(
    metadata && path.isAbsolute(metadata),
    'Explicit NuGet metadata required',
  );
  assert.ok(
    npmMetadata && path.isAbsolute(npmMetadata),
    'Explicit already prepared npm metadata required',
  );
  const expected = await hashFile(metadata);
  const before = await qualifyConsumer(metadata);
  const npmBefore = await qualifyNpm(npmMetadata);
  const servers = [];
  const kind = regressions ? 'regressions' : smoke ? 'smoke' : 'matrix';
  const evidenceDirectory =
    process.env.HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY ??
    path.join(before.root, 'browser-reports');
  await fs.mkdir(evidenceDirectory, { recursive: true });
  const evidence = await fs.realpath(evidenceDirectory);
  assert.ok(
    evidence !== repository && !evidence.startsWith(repository + path.sep),
    'Private package evidence must remain outside the workspace',
  );
  let status = -1;
  let failure;
  try {
    const origins = {};
    for (const framework of ['react', 'angular']) {
      const server = await startLiveStaticServer(
        npmBefore.artifacts[framework],
      );
      servers.push(server);
      origins[framework] = server.url;
    }
    const environment = {
      ...process.env,
      ...packageEvidenceEnvironment(evidence, kind),
      HASHBROWN_DOTNET_HOST_MODE: 'package',
      HASHBROWN_DOTNET_CONSUMER_METADATA: metadata,
      HASHBROWN_DOTNET_CONSUMER_SHA256: expected,
      HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA: npmMetadata,
      HASHBROWN_PACKAGE_REACT_URL: origins.react,
      HASHBROWN_PACKAGE_ANGULAR_URL: origins.angular,
      HASHBROWN_PACKAGE_SUITE: kind,
      HASHBROWN_PACKAGE_OUTCOME_REPORT: path.join(
        evidence,
        `${kind}-outcomes.json`,
      ),
      HASHBROWN_PACKAGE_SPAWN_REPORT: path.join(
        evidence,
        `${kind}-spawns.jsonl`,
      ),
      FixtureOrigins: `${origins.react},${origins.angular}`,
    };
    const config = regressions
      ? 'local-native-approval.playwright.config.ts'
      : smoke
        ? 'package-smoke.playwright.config.ts'
        : 'package.playwright.config.ts';
    status = await new Promise((accept, reject) => {
      const child = spawn(
        process.execPath,
        packagePlaywrightArguments(config, evidence, kind),
        { cwd: repository, env: environment, stdio: 'inherit' },
      );
      child.once('error', reject);
      child.once('exit', (code) => accept(code ?? -1));
    });
  } catch (error) {
    failure = error;
  } finally {
    for (const server of servers.reverse()) await server.stop();
    const after = await qualifyConsumer(metadata);
    const npmAfter = await qualifyNpm(npmMetadata);
    assert.equal(
      await hashFile(metadata),
      expected,
      'Candidate descriptor changed during browser run',
    );
    assert.deepEqual(after, before, 'Candidate changed during browser run');
    assert.deepEqual(
      npmAfter,
      npmBefore,
      'npm installation changed during browser run',
    );
    await fs.writeFile(
      path.join(evidence, `${kind}-provenance.json`),
      JSON.stringify(
        {
          descriptor: expected,
          before,
          after,
          npmMetadata,
          npmBefore,
          npmAfter,
          status,
          failure: failure?.message,
        },
        null,
        2,
      ),
    );
  }
  if (failure) throw failure;
  assert.equal(status, 0, `Package ${kind} failed`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runPackageBrowser();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
