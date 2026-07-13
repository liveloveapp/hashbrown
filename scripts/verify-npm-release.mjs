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

export async function verifyNpmRelease({
  workspaceRoot = process.cwd(),
  tag = 'latest',
  registry = DEFAULT_REGISTRY,
  viewPackage = defaultViewPackage,
} = {}) {
  const release = await verifyReleaseVersions({ workspaceRoot });

  for (const packageName of release.packages) {
    const packageInfo = await viewPackage({
      packageName,
      version: release.version,
      registry,
    });
    const publishedVersion = packageInfo.version;
    const taggedVersion = packageInfo['dist-tags']?.[tag];

    if (publishedVersion !== release.version) {
      throw new Error(
        `${packageName}@${release.version} expected registry version ${release.version}, found ${publishedVersion}.`,
      );
    }

    if (taggedVersion !== release.version) {
      throw new Error(
        `${packageName}@${release.version} expected ${tag} to point at ${release.version}, found ${taggedVersion}.`,
      );
    }
  }

  return {
    version: release.version,
    tag,
    packages: release.packages,
  };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tag' && argv[index + 1]) {
      options.tag = argv[index + 1];
      index += 1;
    } else if (arg === '--registry' && argv[index + 1]) {
      options.registry = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
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
