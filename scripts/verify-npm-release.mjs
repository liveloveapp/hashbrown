#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { verifyReleaseVersions } from './verify-release-versions.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

async function defaultViewPackage({ packageName, version, registry }) {
  const { stdout } = await execFileAsync('npm', [
    'view',
    `${packageName}@${version}`,
    'version',
    'dist-tags',
    '--json',
    `--registry=${registry}`,
  ]);

  return JSON.parse(stdout);
}

/**
 * How long to wait before each retry. The registry can take several minutes
 * to serve a version (and move its dist tag) after `npm publish` returns, so
 * the verification keeps checking for about ten minutes before it fails.
 */
export const DEFAULT_RETRY_DELAYS_MS = [
  15_000, 30_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000,
  60_000,
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyPackage({
  packageName,
  version,
  tag,
  registry,
  viewPackage,
}) {
  const packageInfo = await viewPackage({ packageName, version, registry });
  const publishedVersion = packageInfo.version;
  const taggedVersion = packageInfo['dist-tags']?.[tag];

  if (publishedVersion !== version) {
    throw new Error(
      `${packageName}@${version} expected registry version ${version}, found ${publishedVersion}.`,
    );
  }

  if (taggedVersion !== version) {
    throw new Error(
      `${packageName}@${version} expected ${tag} to point at ${version}, found ${taggedVersion}.`,
    );
  }
}

/**
 * Verify every package in the release group is published at the release
 * version with `tag` pointing at it, retrying while the registry catches up.
 */
export async function verifyNpmRelease({
  workspaceRoot = process.cwd(),
  tag = 'latest',
  registry = DEFAULT_REGISTRY,
  viewPackage = defaultViewPackage,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = wait,
  log = (message) => console.warn(message),
} = {}) {
  const release = await verifyReleaseVersions({ workspaceRoot });

  for (const packageName of release.packages) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await verifyPackage({
          packageName,
          version: release.version,
          tag,
          registry,
          viewPackage,
        });
        break;
      } catch (error) {
        if (attempt >= retryDelaysMs.length) {
          throw error;
        }

        const delay = retryDelaysMs[attempt];
        log(
          `${error instanceof Error ? error.message : error} Retrying in ${delay / 1000}s (${attempt + 1}/${retryDelaysMs.length}).`,
        );
        await sleep(delay);
      }
    }
  }

  return {
    version: release.version,
    tag,
    packages: release.packages,
  };
}

const OPTIONS = { '--tag': 'tag', '--registry': 'registry' };

/**
 * Parse `--tag <value>` / `--tag=<value>` and `--registry <value>` /
 * `--registry=<value>`. The publish workflow passes the equals form.
 */
export function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const key = Object.hasOwn(OPTIONS, flag) ? OPTIONS[flag] : undefined;
    const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1);
    if (!key || !value) {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
    options[key] = value;
    if (equals === -1) index += 1;
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyNpmRelease(parseArgs(process.argv.slice(2)));
    console.log(
      `Hashbrown npm release ${result.version} is published on ${result.tag}: ${result.packages.join(', ')}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
