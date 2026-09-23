import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseArgs, verifyNpmRelease } from './verify-npm-release.mjs';

const EXPECTED_REPOSITORY_URL = 'https://github.com/liveloveapp/hashbrown.git';

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createWorkspace() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'hashbrown-npm-release-'));
  const packages = {
    'packages/core': '@hashbrownai/core',
    'packages/react': '@hashbrownai/react',
  };

  await writeJson(join(workspaceRoot, 'nx.json'), {
    release: {
      projects: Object.keys(packages),
    },
  });

  for (const [projectRoot, packageName] of Object.entries(packages)) {
    await mkdir(join(workspaceRoot, projectRoot), { recursive: true });
    await writeJson(join(workspaceRoot, projectRoot, 'project.json'), {
      name: projectRoot.replace('packages/', ''),
      targets: {
        'nx-release-publish': {
          options: {
            packageRoot: `dist/${projectRoot}`,
          },
        },
      },
    });
    await writeJson(join(workspaceRoot, projectRoot, 'package.json'), {
      name: packageName,
      version: '0.6.0',
      repository: {
        type: 'git',
        url: EXPECTED_REPOSITORY_URL,
      },
      publishConfig: {
        access: 'public',
      },
      dependencies:
        packageName === '@hashbrownai/react'
          ? {
              '@hashbrownai/core': '0.6.0',
            }
          : undefined,
    });
  }

  return workspaceRoot;
}

test('accepts packages published at the release version with the requested dist tag', async () => {
  const workspaceRoot = await createWorkspace();
  const viewedPackages = [];

  const result = await verifyNpmRelease({
    workspaceRoot,
    tag: 'latest',
    viewPackage: async ({ packageName, version }) => {
      viewedPackages.push(`${packageName}@${version}`);

      return {
        version,
        'dist-tags': {
          latest: version,
        },
      };
    },
  });

  assert.deepEqual(result, {
    version: '0.6.0',
    tag: 'latest',
    packages: ['@hashbrownai/core', '@hashbrownai/react'],
  });
  assert.deepEqual(viewedPackages, [
    '@hashbrownai/core@0.6.0',
    '@hashbrownai/react@0.6.0',
  ]);
});

test('rejects packages missing from the npm registry at the release version', async () => {
  const workspaceRoot = await createWorkspace();

  await assert.rejects(
    verifyNpmRelease({
      workspaceRoot,
      viewPackage: async ({ packageName, version }) => {
        if (packageName === '@hashbrownai/react') {
          throw new Error(`${packageName}@${version} was not found`);
        }

        return {
          version,
          'dist-tags': {
            latest: version,
          },
        };
      },
    }),
    /@hashbrownai\/react@0\.6\.0 was not found/,
  );
});

test('rejects packages whose dist tag does not point at the release version', async () => {
  const workspaceRoot = await createWorkspace();

  await assert.rejects(
    verifyNpmRelease({
      workspaceRoot,
      tag: 'latest',
      viewPackage: async ({ version }) => ({
        version,
        'dist-tags': {
          latest: '0.5.0',
        },
      }),
    }),
    /expected latest to point at 0\.6\.0, found 0\.5\.0/,
  );
});

test('parses the tag and registry in both the spaced and the equals form', () => {
  const spaced = ['--tag', 'latest', '--registry', 'https://r.example/'];
  const equals = ['--tag=latest', '--registry=https://r.example/'];

  const fromSpaced = parseArgs(spaced);
  const fromEquals = parseArgs(equals);

  // The publish workflow passes `--tag=latest`; the equals form must work.
  assert.deepEqual(fromSpaced, {
    tag: 'latest',
    registry: 'https://r.example/',
  });
  assert.deepEqual(fromEquals, {
    tag: 'latest',
    registry: 'https://r.example/',
  });
});

test('rejects unknown and incomplete arguments', () => {
  assert.throws(
    () => parseArgs(['--tags=latest']),
    /Unknown or incomplete argument: --tags=latest/,
  );
  assert.throws(
    () => parseArgs(['--tag']),
    /Unknown or incomplete argument: --tag/,
  );
  assert.throws(
    () => parseArgs(['--tag=']),
    /Unknown or incomplete argument: --tag=/,
  );
});
