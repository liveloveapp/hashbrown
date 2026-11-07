import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Remaps only the three exact SDK selections while preserving the complete approved graph. */
export function createStarterManifest(baseline) {
  const dependencies = { ...baseline.dependencies };
  for (const name of [
    '@hashbrownai/core',
    '@hashbrownai/react',
    '@hashbrownai/angular',
  ]) {
    assert.equal(
      dependencies[name],
      '0.8.3',
      `Frozen graph selection missing: ${name}`,
    );
    dependencies[name] = '0.9.0';
  }
  return {
    ...structuredClone(baseline),
    name: 'hashbrown-dotnet-starter',
    dependencies,
  };
}
/** Selects copied archive paths only in the external candidate consumer manifest. */
export function createArchiveManifest(baseline, archives) {
  const manifest = createStarterManifest(baseline);
  return {
    ...manifest,
    dependencies: Object.fromEntries(
      Object.entries(manifest.dependencies).map(([name, version]) => {
        if (
          ![
            '@hashbrownai/core',
            '@hashbrownai/react',
            '@hashbrownai/angular',
          ].includes(name)
        )
          return [name, version];
        const archive = archives[name];
        assert.ok(
          archive &&
            archive.version === '0.9.0' &&
            path.isAbsolute(archive.archive) &&
            path.resolve(archive.archive) === archive.archive,
          'Exact copied candidate archive path required.',
        );
        return [name, 'file:' + archive.archive];
      }),
    ),
  };
}
/** Requires explicit local source-candidate pointers; registry selections are not candidate evidence. */
export function validateCandidateSelection(selection) {
  for (const kind of ['npm', 'nuget'])
    assert.ok(
      typeof selection[kind] === 'string' &&
        path.isAbsolute(selection[kind]) &&
        path.resolve(selection[kind]) === selection[kind],
      `Explicit absolute ${kind} candidate pointer path required.`,
    );
}
/** Checks the actual application's loaded SDK witness against archived and built bytes. */
export function assertLoadedSdkIdentity(identity) {
  assert.equal(
    identity.assemblyName,
    'Hashbrown.AspNetCore',
    'Loaded assembly identity differs.',
  );
  assert.equal(
    identity.packageVersion,
    '0.1.0-preview.2',
    'Package version differs.',
  );
  assert.match(
    identity.informationalVersion,
    /^0\.1\.0-preview\.2(?:\+[^\s]+)?$/,
    'Loaded version identity differs.',
  );
  for (const field of [
    'archiveDllSha256',
    'outputDllSha256',
    'loadedDllSha256',
  ])
    assert.match(
      identity[field],
      /^[a-f0-9]{64}$/,
      'Missing binary hash identity.',
    );
  assert.equal(
    identity.outputDllSha256,
    identity.archiveDllSha256,
    'Output binary hash differs.',
  );
  assert.equal(
    identity.loadedDllSha256,
    identity.archiveDllSha256,
    'Loaded binary hash differs.',
  );
}
/** Selects only a physical built client within its owned prepared root. */
export async function validateStaticRoot(root, framework) {
  assert.ok(
    ['react', 'angular'].includes(framework),
    'Framework must be react or angular.',
  );
  assert.equal(await fs.realpath(root), root, 'Owned root must be physical.');
  const selected = path.join(
    root,
    'dist',
    framework,
    ...(framework === 'angular' ? ['browser'] : []),
  );
  const physical = await fs.realpath(selected).catch(() => {
    throw Error('Built client root must exist.');
  });
  assert.equal(
    physical,
    selected,
    'Static root must stay physical within the owned root.',
  );
  assert.ok(
    (await fs.stat(path.join(physical, 'index.html'))).isFile(),
    'Built client index is missing.',
  );
  return physical;
}

/** Resolves only explicit prepared bindings; serving never adopts an ambient selection. */
export function resolvePreparedMetadata(mode, selection, environment) {
  const metadata =
    selection.metadata ??
    (['build', 'test'].includes(mode)
      ? environment.HASHBROWN_STARTER_METADATA
      : undefined);
  assert.ok(
    typeof metadata === 'string' && metadata.length > 0,
    'Explicit prepared metadata is required; serve and lint-candidate require CLI --metadata.',
  );
  assert.ok(
    path.isAbsolute(metadata) && path.resolve(metadata) === metadata,
    'Prepared metadata must be a normalized absolute path.',
  );
  return metadata;
}
