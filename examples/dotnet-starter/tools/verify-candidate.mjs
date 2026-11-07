import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  archiveFiles,
  tree,
} from '../../../tools/conformance/dotnet/candidate-consumer/files.mjs';
import {
  installationInventory,
  qualifyNpmCandidate,
  qualifyNugetCandidate,
  validateInstalledResolution,
  validateLockGraph,
} from '../../../tools/conformance/dotnet/candidate-consumer/qualify.mjs';
import {
  createConfig,
  validateArchive,
  validateLock,
  validateSourceMetadata,
} from '../../../tools/conformance/dotnet/nuget-consumer/verify.mjs';
import { createArchiveManifest } from './candidate-contract.mjs';
import {
  digest,
  inventory,
  options,
  repository,
  sourceRoot,
} from './consumer.mjs';

const within = (root, file) => file.startsWith(root + path.sep);
/** Verifies exact installed/archive/source/build provenance without preparing or silently resolving packages. */
export async function verifyPrepared(pointer) {
  assert.ok(
    typeof pointer === 'string' && path.isAbsolute(pointer),
    'Explicit absolute prepared metadata pointer required.',
  );
  assert.equal(
    await fs.realpath(pointer),
    pointer,
    'Metadata alias forbidden.',
  );
  const bytes = await fs.readFile(pointer);
  assert.equal(
    digest(bytes),
    (await fs.readFile(pointer + '.sha256', 'utf8')).trim(),
    'Starter metadata anchor changed.',
  );
  const metadata = JSON.parse(bytes);
  assert.equal(metadata.schema, 1);
  assert.equal(
    metadata.kind,
    'starter-source-candidate',
    'Starter candidate selection required; no public provenance claim.',
  );
  const { root } = metadata;
  assert.ok(
    path.isAbsolute(root) &&
      path.resolve(root) === root &&
      !within(repository, root) &&
      !within(root, repository) &&
      root !== repository,
    'Starter must have a separate external owned root.',
  );
  assert.equal(await fs.realpath(root), root, 'Owned root alias forbidden.');
  assert.equal(
    digest(await fs.readFile(metadata.npmPointer)),
    metadata.npmPointerSha256,
    'Selected npm pointer changed.',
  );
  assert.equal(
    digest(await fs.readFile(metadata.nugetPointer)),
    metadata.nugetPointerSha256,
    'Selected NuGet pointer changed.',
  );
  const npm = await qualifyNpmCandidate(metadata.npmPointer);
  const nuget = await qualifyNugetCandidate(metadata.nugetPointer);
  assert.deepEqual(
    await inventory(sourceRoot),
    metadata.sources,
    'Starter source changed; prepare fresh artifacts.',
  );
  await verifyBuildEntrypoint(root, metadata.sources['tools/build.mjs']);
  for (const [filename, expected] of Object.entries(metadata.sources)) {
    const file = path.join(root, filename);
    if (filename === 'package.json') continue; // Explicit external archive transform, checked against the frozen graph below.
    assert.equal(
      await fs.realpath(file),
      file,
      'Copied source alias forbidden.',
    );
    assert.equal(
      digest(await fs.readFile(file)),
      expected,
      'Copied starter source differs: ' + filename,
    );
  }
  const baseline = JSON.parse(
    await fs.readFile(
      path.join(
        repository,
        'tools/conformance/dotnet/live-consumer/package.json',
      ),
    ),
  );
  const baselineLock = JSON.parse(
    await fs.readFile(
      path.join(
        repository,
        'tools/conformance/dotnet/live-consumer/package-lock.json',
      ),
    ),
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'package.json')),
  );
  assert.deepEqual(
    manifest,
    createArchiveManifest(baseline, metadata.archives),
    'Starter manifest graph changed.',
  );
  const lock = JSON.parse(
    await fs.readFile(path.join(root, 'package-lock.json')),
  );
  validateLockGraph(lock, baselineLock, metadata.archives, manifest);
  const installed = JSON.parse(
    await fs.readFile(path.join(root, 'node_modules/.package-lock.json')),
  );
  const resolver = createRequire(path.join(root, 'package.json'));
  for (const [location, record] of Object.entries(installed.packages)) {
    const expected = lock.packages[location];
    assert.ok(expected && !record.link, 'Unexpected installed graph entry.');
    for (const field of ['version', 'integrity'])
      assert.equal(
        record[field],
        expected[field],
        'Installed package identity differs.',
      );
    validateInstalledResolution(record.resolved, expected.resolved, {
      root,
      location,
      archives: metadata.archives,
    });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(root, location, 'package.json')))
        .version,
      expected.version,
      'Installed package version differs.',
    );
  }
  for (const [location, record] of Object.entries(lock.packages))
    if (location && !record.optional)
      assert.ok(
        installed.packages[location],
        'Required installed package missing.',
      );
  for (const [name, archive] of Object.entries(metadata.archives)) {
    assert.equal(
      path.dirname(archive.archive),
      path.join(root, 'archives'),
      'SDK archive must be owned.',
    );
    assert.equal(
      archive.sha256,
      npm.archives[name].sha256,
      'Selected npm archive identity differs.',
    );
    const packed = await fs.readFile(archive.archive);
    assert.equal(digest(packed), archive.sha256, 'SDK archive hash differs.');
    assert.equal(
      'sha512-' + digest(packed, 'sha512', 'base64'),
      archive.integrity,
      'SDK archive integrity differs.',
    );
    assert.deepEqual(
      await tree(path.join(root, 'node_modules', name)),
      Object.fromEntries(
        Object.entries(archiveFiles(packed)).map(([filename, data]) => [
          filename,
          digest(data),
        ]),
      ),
      'Installed SDK bytes differ from archive.',
    );
    assert.ok(
      within(path.join(root, 'node_modules', name), resolver.resolve(name)),
      'SDK resolution escaped owned packages.',
    );
  }
  assert.deepEqual(
    await installationInventory(root),
    metadata.installation,
    'Installed package bytes changed.',
  );
  for (const directory of ['candidate-feed', 'dependency-feed'])
    assert.deepEqual(
      await inventory(path.join(root, directory)),
      metadata.feeds[directory],
      'Owned feed bytes changed.',
    );
  for (const directory of ['dist', 'server/bin', 'tests/bin'])
    assert.deepEqual(
      await inventory(path.join(root, directory)),
      metadata.outputs[directory],
      'Built artifacts changed.',
    );
  assert.equal(
    await fs.readFile(path.join(root, 'NuGet.Config'), 'utf8'),
    createConfig(root, nuget.closure),
    'NuGet source mapping/fallback changed.',
  );
  assert.deepEqual(metadata.nuget.identity, nuget.identity);
  assert.deepEqual(metadata.nuget.closure, nuget.closure);
  const archive = await fs.readFile(path.join(root, metadata.nuget.archive));
  assert.equal(digest(archive), nuget.sha256, 'NuGet archive differs.');
  assert.equal(
    digest(archive, 'sha512', 'base64'),
    nuget.sha512,
    'NuGet archive content hash differs.',
  );
  assert.equal(
    digest(validateArchive(archive, nuget.identity, nuget.revision)),
    metadata.nuget.archiveDllSha256,
    'SDK archive DLL differs.',
  );
  assert.equal(
    digest(
      await fs.readFile(
        path.join(root, 'server/bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
      ),
    ),
    metadata.nuget.archiveDllSha256,
    'Application SDK differs from archive.',
  );
  validateLock(
    JSON.parse(await fs.readFile(path.join(root, 'server/packages.lock.json'))),
    nuget.identity,
    nuget.closure,
    nuget.sha512,
  );
  const assets = JSON.parse(
    await fs.readFile(path.join(root, 'server/obj/project.assets.json')),
  );
  const expected = Object.fromEntries([
    ...nuget.closure.map((item) => [
      `${item.id}/${item.version}`,
      item.contentHash,
    ]),
    [`${nuget.identity.id}/${nuget.identity.version}`, nuget.sha512],
  ]);
  assert.deepEqual(
    Object.keys(assets.libraries).sort(),
    Object.keys(expected).sort(),
    'Assets package closure differs.',
  );
  for (const [name, library] of Object.entries(assets.libraries)) {
    assert.equal(library.type, 'package', 'Project fallback forbidden.');
    assert.equal(
      library.sha512,
      expected[name],
      'Assets package hash differs.',
    );
  }
  assert.deepEqual(
    Object.keys(assets.packageFolders).map((file) => path.resolve(file)),
    [path.join(root, 'packages')],
    'NuGet cache fallback forbidden.',
  );
  assert.equal(
    assets.project.restore.projectPath,
    path.join(root, 'server/Starter.csproj'),
    'Stale project assets.',
  );
  assert.deepEqual(
    Object.keys(assets.project.restore.sources).sort(),
    [root + '/candidate-feed', root + '/dependency-feed'].sort(),
    'Restore source fallback forbidden.',
  );
  assert.ok(
    !assets.project.restore.fallbackFolders?.length,
    'Fallback folders forbidden.',
  );
  for (const item of [
    ...nuget.closure,
    { ...nuget.identity, contentHash: nuget.sha512 },
  ]) {
    const packageRoot = path.join(
      root,
      'packages',
      item.id.toLowerCase(),
      item.version.toLowerCase(),
    );
    const source =
      item.id === nuget.identity.id ? 'candidate-feed' : 'dependency-feed';
    validateSourceMetadata(
      JSON.parse(await fs.readFile(path.join(packageRoot, '.nupkg.metadata'))),
      path.join(root, source),
      item.contentHash,
    );
  }
  const deps = JSON.parse(
    await fs.readFile(
      path.join(root, 'server/bin/Release/net10.0/Starter.deps.json'),
    ),
  );
  assert.deepEqual(
    Object.keys(deps.libraries).sort(),
    ['Starter/1.0.0', ...Object.keys(expected)].sort(),
    'Runtime library closure differs.',
  );
  for (const [name, library] of Object.entries(deps.libraries))
    assert.equal(
      library.type,
      name === 'Starter/1.0.0' ? 'project' : 'package',
      'Runtime source fallback forbidden.',
    );
  verifyEvaluation(metadata.evaluation, metadata);
  await verifyModuleOrigins(root);
  return metadata;
}
/** Binds the executed standalone builder to independently inventoried physical source bytes. */
export async function verifyBuildEntrypoint(root, expectedSha256) {
  assert.match(
    expectedSha256,
    /^[a-f0-9]{64}$/,
    'Inventoried build entrypoint source hash is required.',
  );
  assert.equal(
    await fs.realpath(root),
    root,
    'Build entrypoint root must be physical.',
  );
  const file = path.join(root, 'build.mjs');
  assert.equal(
    await fs.realpath(file),
    file,
    'Build entrypoint must be physical without aliases or symlinks.',
  );
  assert.ok(
    (await fs.lstat(file)).isFile(),
    'Build entrypoint must be an ordinary file.',
  );
  assert.equal(
    digest(await fs.readFile(file)),
    expectedSha256,
    'Executed build entrypoint hash differs from inventoried source.',
  );
}

/** Validates evaluated compile/reference/import boundaries of the real public starter. */
function verifyEvaluation(evaluation, metadata) {
  const { root } = metadata;
  const sdk = metadata.nuget.sdkRoot;
  const items = evaluation.Items ?? {};
  assert.equal(
    (items.ProjectReference ?? []).length,
    0,
    'ProjectReference fallback forbidden.',
  );
  assert.ok(items.Compile?.length > 0, 'No evaluated compile inputs.');
  for (const item of items.Compile)
    assert.ok(
      Object.keys(metadata.sources)
        .filter((file) => file.startsWith('server/') && file.endsWith('.cs'))
        .map((file) => path.join(root, file))
        .includes(item.FullPath) ||
        /^server\/obj\/Release\/net10\.0\/(?:Starter\.(?:GlobalUsings\.g|AssemblyInfo)\.cs|\.NETCoreApp,Version=v10\.0\.AssemblyAttributes\.cs)$/.test(
          path.relative(root, item.FullPath),
        ),
      'Compile input escaped starter source.',
    );
  for (const item of [
    ...(items.Reference ?? []),
    ...(items.ReferencePath ?? []),
  ]) {
    const file = item.HintPath || item.FullPath || item.Identity;
    assert.ok(
      file &&
        !within(repository, file) &&
        (within(path.join(root, 'packages'), file) ||
          within(path.join(sdk, 'packs'), file)),
      'Reference/HintPath escaped approved package cache or framework.',
    );
  }
  const properties = evaluation.Properties ?? {};
  for (const name of [
    'RestoreFallbackFolders',
    'RestoreAdditionalProjectSources',
    'RestoreAdditionalProjectFallbackFolders',
  ])
    assert.ok(!properties[name], 'Restore fallback property forbidden.');
  for (const file of (properties.MSBuildAllProjects ?? '')
    .split(';')
    .filter(Boolean))
    assert.ok(
      !/Directory\.(Build|Packages)\./i.test(file) &&
        (within(sdk, file) ||
          within(path.join(root, 'packages'), file) ||
          [
            path.join(root, 'server/Starter.csproj'),
            path.join(root, 'server/obj/Starter.csproj.nuget.g.props'),
            path.join(root, 'server/obj/Starter.csproj.nuget.g.targets'),
          ].includes(file)),
      'MSBuild import escaped owned inputs.',
    );
}
/** Requires real installed framework SDK module inputs and rejects repository/source aliases. */
export async function verifyModuleOrigins(root) {
  const react = JSON.parse(
    await fs.readFile(path.join(root, 'react-module-ids.json')),
  );
  const stats = JSON.parse(
    await fs.readFile(path.join(root, 'dist/angular/browser-stats.json')),
  );
  const angular = Object.keys(stats.inputs ?? {});
  assert.ok(
    react.length > 0 && angular.length > 0,
    'Actual framework build input inventories required.',
  );
  for (const [framework, inputs] of [
    ['react', react],
    ['angular', angular],
  ]) {
    const physical = [];
    for (const input of inputs) {
      if (
        [
          '\0vite/modulepreload-polyfill.js',
          '\0vite/preload-helper.js',
          'angular:styles/global:styles',
        ].includes(input)
      )
        continue;
      assert.ok(
        !input.startsWith('\0') &&
          !input.startsWith('virtual:') &&
          !input.startsWith('angular:'),
        'Unexpected synthetic framework build input origin.',
      );
      const file = path.resolve(root, input.split('?')[0]);
      assert.ok(
        within(root, file) && !within(repository, file),
        'Framework build imported repository or outside source.',
      );
      assert.equal(
        await fs.realpath(file),
        file,
        'Framework input alias forbidden.',
      );
      physical.push(file);
    }
    for (const name of ['core', framework])
      assert.ok(
        physical.some((file) =>
          within(path.join(root, 'node_modules/@hashbrownai', name), file),
        ),
        'Actual installed Hashbrown framework input missing.',
      );
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const selected = options(process.argv.slice(2), ['metadata']);
  const metadata = await verifyPrepared(selected.metadata);
  console.log(
    JSON.stringify({
      verified: true,
      kind: metadata.kind,
      root: metadata.root,
    }),
  );
}
