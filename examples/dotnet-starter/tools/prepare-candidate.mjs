import { readCandidateDependencyBaseline } from '../../../tools/conformance/dotnet/candidate-consumer/dependency-baseline.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCandidateLock,
  installationInventory,
  qualifyNpmCandidate,
  qualifyNugetCandidate,
  validateLockGraph,
} from '../../../tools/conformance/dotnet/candidate-consumer/qualify.mjs';
import { candidateEnvironment } from '../../../tools/conformance/dotnet/candidate-consumer/prepare.mjs';
import {
  buildEnvironment,
  createConfig,
  validateArchive,
  validateLock,
} from '../../../tools/conformance/dotnet/nuget-consumer/verify.mjs';
import {
  createArchiveManifest,
  validateCandidateSelection,
} from './candidate-contract.mjs';
import {
  digest,
  inventory,
  options,
  run,
  sourceRoot,
  writePointer,
} from './consumer.mjs';
import { verifyBuildEntrypoint, verifyPrepared } from './verify-candidate.mjs';

/** Prepares a fresh independent archive-only consumer; never edits public or candidate sources. */
export async function prepareCandidate(selection) {
  validateCandidateSelection(selection);
  assert.ok(
    selection.metadata && path.isAbsolute(selection.metadata),
    'Explicit fresh --metadata pointer required.',
  );
  for (const file of [selection.metadata, selection.metadata + '.sha256'])
    await fs.lstat(file).then(
      () => {
        throw Error('Existing metadata selection cannot be replaced.');
      },
      (error) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  const npm = await qualifyNpmCandidate(selection.npm);
  const nuget = await qualifyNugetCandidate(selection.nuget);
  const root = await fs.realpath(
    await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), 'hashbrown-dotnet-starter-'),
    ),
  );
  console.error(`STARTER_ROOT ${root}`);
  for (const directory of [
    'archives',
    'candidate-feed',
    'dependency-feed',
    'home',
    'logs',
    'packages',
    'http',
    'plugins',
    'npm-cache',
  ])
    await fs.mkdir(path.join(root, directory));
  for (const filename of ['empty.npmrc', 'empty-global.npmrc'])
    await fs.writeFile(path.join(root, filename), '');
  const sources = await inventory(sourceRoot);
  for (const filename of Object.keys(sources)) {
    await fs.mkdir(path.dirname(path.join(root, filename)), {
      recursive: true,
    });
    await fs.copyFile(
      path.join(sourceRoot, filename),
      path.join(root, filename),
    );
  }
  await fs.copyFile(
    path.join(root, 'tools/build.mjs'),
    path.join(root, 'build.mjs'),
  );
  const { manifest: baseline, lock: baselineLock } =
    await readCandidateDependencyBaseline();
  const archives = {};
  for (const [name, archive] of Object.entries(npm.archives)) {
    const target = path.join(root, 'archives', path.basename(archive.archive));
    await fs.copyFile(archive.archive, target);
    assert.equal(
      digest(await fs.readFile(target)),
      archive.sha256,
      'Copied npm archive differs.',
    );
    archives[name] = { ...archive, archive: target };
  }
  const manifest = createArchiveManifest(baseline, archives);
  const lock = createCandidateLock(baselineLock, archives, manifest);
  validateLockGraph(lock, baselineLock, archives, manifest);
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify(lock, null, 2) + '\n',
  );
  const environment = {
    ...candidateEnvironment(root),
    ...buildEnvironment(process.env, root),
  };
  await run(
    'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    root,
    environment,
    'npm-ci.log',
  );
  for (const config of ['react/tsconfig.json', 'angular/tsconfig.json'])
    await run(
      process.execPath,
      ['node_modules/typescript/bin/tsc', '--noEmit', '-p', config],
      root,
      environment,
      config.replace('/', '-') + '.log',
    );
  await verifyBuildEntrypoint(root, sources['tools/build.mjs']);
  await run(
    process.execPath,
    ['build.mjs'],
    root,
    environment,
    'clients-build.log',
  );

  const archivePath = path.join(
    root,
    'candidate-feed',
    path.basename(nuget.archive),
  );
  const nugetBytes = await fs.readFile(path.join(nuget.root, nuget.archive));
  assert.equal(
    digest(nugetBytes),
    nuget.sha256,
    'Qualified NuGet archive differs.',
  );
  await fs.writeFile(archivePath, nugetBytes);
  for (const filename of await fs.readdir(
    path.join(nuget.root, 'dependency-feed'),
  )) {
    assert.match(
      filename,
      /^[a-zA-Z0-9_.-]+\.nupkg$/,
      'Unexpected dependency feed entry.',
    );
    await fs.copyFile(
      path.join(nuget.root, 'dependency-feed', filename),
      path.join(root, 'dependency-feed', filename),
    );
  }
  await fs.writeFile(
    path.join(root, 'NuGet.Config'),
    createConfig(root, nuget.closure),
  );
  await run(
    'dotnet',
    [
      'restore',
      'server/Starter.csproj',
      '--configfile',
      'NuGet.Config',
      '--use-lock-file',
    ],
    root,
    environment,
    'server-restore-lock.log',
  );
  validateLock(
    JSON.parse(await fs.readFile(path.join(root, 'server/packages.lock.json'))),
    nuget.identity,
    nuget.closure,
    nuget.sha512,
  );
  await run(
    'dotnet',
    [
      'restore',
      'server/Starter.csproj',
      '--configfile',
      'NuGet.Config',
      '--locked-mode',
    ],
    root,
    environment,
    'server-restore-locked.log',
  );
  await run(
    'dotnet',
    ['build', 'server/Starter.csproj', '--no-restore', '-c', 'Release'],
    root,
    environment,
    'server-build.log',
  );
  await run(
    'dotnet',
    ['restore', 'tests/Starter.Tests.csproj', '--configfile', 'NuGet.Config'],
    root,
    environment,
    'tests-restore.log',
  );
  await run(
    'dotnet',
    ['build', 'tests/Starter.Tests.csproj', '--no-restore', '-c', 'Release'],
    root,
    environment,
    'tests-build.log',
  );
  const evaluation = JSON.parse(
    await run(
      'dotnet',
      [
        'msbuild',
        'server/Starter.csproj',
        '-t:ResolveReferences',
        '-p:Configuration=Release',
        '-getProperty:MSBuildAllProjects,RestoreFallbackFolders,RestoreAdditionalProjectSources,RestoreAdditionalProjectFallbackFolders',
        '-getItem:Compile,Reference,ReferencePath,ProjectReference',
      ],
      root,
      environment,
      'server-evaluation.log',
    ),
  );
  const archiveDllSha256 = digest(
    validateArchive(nugetBytes, nuget.identity, nuget.revision),
  );
  assert.equal(
    digest(
      await fs.readFile(
        path.join(root, 'server/bin/Release/net10.0/Hashbrown.AspNetCore.dll'),
      ),
    ),
    archiveDllSha256,
    'Built application SDK differs from archive.',
  );
  const metadata = {
    schema: 1,
    kind: 'starter-source-candidate',
    root,
    npmPointer: selection.npm,
    nugetPointer: selection.nuget,
    npmPointerSha256: digest(await fs.readFile(selection.npm)),
    nugetPointerSha256: digest(await fs.readFile(selection.nuget)),
    sources,
    archives,
    nuget: {
      identity: nuget.identity,
      sha256: nuget.sha256,
      sha512: nuget.sha512,
      archive: path.relative(root, archivePath),
      archiveDllSha256,
      closure: nuget.closure,
      sdkRoot: nuget.sdkRoot,
    },
    environment,
    evaluation,
    installation: await installationInventory(root),
    feeds: await feedInventory(root),
    outputs: await outputInventory(root),
  };
  await writePointer(selection.metadata, metadata);
  await verifyPrepared(selection.metadata);
  return metadata;
}
/** Captures all copied package feed bytes for later qualification. */
export async function feedInventory(root) {
  return Object.fromEntries(
    await Promise.all(
      ['candidate-feed', 'dependency-feed'].map(async (directory) => [
        directory,
        await inventory(path.join(root, directory)),
      ]),
    ),
  );
}
/** Captures actual build artifacts independently from public sources. */
export async function outputInventory(root) {
  return Object.fromEntries(
    await Promise.all(
      ['dist', 'server/bin', 'tests/bin'].map(async (directory) => [
        directory,
        await inventory(path.join(root, directory)),
      ]),
    ),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const metadata = await prepareCandidate(
    options(process.argv.slice(2), ['npm', 'nuget', 'metadata']),
  );
  console.log(JSON.stringify({ root: metadata.root, kind: metadata.kind }));
}
