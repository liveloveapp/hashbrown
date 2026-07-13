import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyReleaseVersions } from './verify-release-versions.mjs';

const EXPECTED_REPOSITORY_URL = 'https://github.com/liveloveapp/hashbrown.git';

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createWorkspace({
  releaseProjects = ['packages/core', 'packages/react'],
  packages = {
    'packages/core': {
      name: '@hashbrownai/core',
      version: '0.5.0',
      publishRoot: 'dist/packages/core',
      repository: {
        type: 'git',
        url: EXPECTED_REPOSITORY_URL,
      },
    },
    'packages/react': {
      name: '@hashbrownai/react',
      version: '0.5.0',
      publishRoot: 'dist/packages/react',
      repository: {
        type: 'git',
        url: EXPECTED_REPOSITORY_URL,
      },
      dependencies: {
        '@hashbrownai/core': '0.5.0',
      },
    },
  },
} = {}) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'hashbrown-release-'));

  await writeJson(join(workspaceRoot, 'nx.json'), {
    release: {
      projects: releaseProjects,
    },
  });

  for (const [projectRoot, packageInfo] of Object.entries(packages)) {
    await mkdir(join(workspaceRoot, projectRoot), { recursive: true });
    await writeJson(join(workspaceRoot, projectRoot, 'project.json'), {
      name: projectRoot.replace('packages/', ''),
      targets: packageInfo.publishRoot
        ? {
            'nx-release-publish': {
              options: {
                packageRoot: packageInfo.publishRoot,
              },
            },
          }
        : {},
    });
    await writeJson(join(workspaceRoot, projectRoot, 'package.json'), {
      name: packageInfo.name,
      version: packageInfo.version,
      private: packageInfo.private,
      repository: packageInfo.repository ?? {
        type: 'git',
        url: EXPECTED_REPOSITORY_URL,
      },
      publishConfig: packageInfo.publishConfig ?? {
        access: 'public',
      },
      dependencies: packageInfo.dependencies,
      peerDependencies: packageInfo.peerDependencies,
    });
  }

  return workspaceRoot;
}

test('accepts the fixed Hashbrown release set when every package is versioned together', async () => {
  const workspaceRoot = await createWorkspace();

  const result = await verifyReleaseVersions({
    workspaceRoot,
    expectedTag: 'v0.5.0',
  });

  assert.deepEqual(result, {
    version: '0.5.0',
    packages: ['@hashbrownai/core', '@hashbrownai/react'],
  });
});

test('rejects a release tag that does not match the package version', async () => {
  const workspaceRoot = await createWorkspace();

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot, expectedTag: 'npm/latest' }),
    /Release tag npm\/latest does not match package version 0\.5\.0/,
  );
});

test('rejects mixed versions inside the release set', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.1',
        publishRoot: 'dist/packages/react',
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /Hashbrown release packages must share one version/,
  );
});

test('rejects public publishable packages missing from the release set', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
      },
      'packages/openai': {
        name: '@hashbrownai/openai',
        version: '0.5.0',
        publishRoot: 'dist/packages/openai',
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /Public package @hashbrownai\/openai is not included in nx\.json release\.projects/,
  );
});

test('ignores private Hashbrown packages outside the release set', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
      },
      'packages/vox': {
        name: '@hashbrownai/vox',
        version: '0.0.1',
        private: true,
      },
    },
  });

  const result = await verifyReleaseVersions({ workspaceRoot });

  assert.deepEqual(result.packages, [
    '@hashbrownai/core',
    '@hashbrownai/react',
  ]);
});

test('rejects release packages that publish from a non-dist package root', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'packages/core',
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /Release project "core" must publish from dist\/packages\/core/,
  );
});

test('rejects internal Hashbrown dependency versions that are not aligned', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
        dependencies: {
          '@hashbrownai/core': '0.5.0-beta.4',
        },
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /@hashbrownai\/react depends on @hashbrownai\/core at 0\.5\.0-beta\.4, expected 0\.5\.0/,
  );
});

test('rejects release packages whose repository URL does not match the trusted publisher repository', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
        repository: {
          type: 'git',
          url: 'https://github.com/hashbrownai/hashbrown.git',
        },
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
        repository: {
          type: 'git',
          url: EXPECTED_REPOSITORY_URL,
        },
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /@hashbrownai\/core repository URL must be https:\/\/github\.com\/liveloveapp\/hashbrown\.git/,
  );
});

test('rejects release packages that are not configured for public npm publishing', async () => {
  const workspaceRoot = await createWorkspace({
    packages: {
      'packages/core': {
        name: '@hashbrownai/core',
        version: '0.5.0',
        publishRoot: 'dist/packages/core',
        publishConfig: {
          access: 'restricted',
        },
      },
      'packages/react': {
        name: '@hashbrownai/react',
        version: '0.5.0',
        publishRoot: 'dist/packages/react',
      },
    },
  });

  await assert.rejects(
    verifyReleaseVersions({ workspaceRoot }),
    /@hashbrownai\/core must set publishConfig\.access to "public"/,
  );
});
