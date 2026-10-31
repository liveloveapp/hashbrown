import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  buildEnvironment,
  hashFile,
  listFiles,
  validateAncestors,
  acceptsSdk,
  sdkPolicy,
} from './verify.mjs';
import { run } from './prepare.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const manifestPath = path.join(
  here,
  '../tests/fixtures/pre-extraction-host.json',
);

/** Checks every original archived file and the complete closure before any local baseline use. */
export async function verifyBaselineArchive(directory) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.deepEqual(
    (await listFiles(directory)).sort(),
    Object.keys(manifest.archivedFiles).sort(),
    'Historical archive file closure changed',
  );
  for (const [file, hash] of Object.entries(manifest.archivedFiles))
    assert.equal(
      await hashFile(path.join(directory, file)),
      hash,
      `Historical archive hash changed: ${file}`,
    );
  return manifest;
}

/** Prepares the original source host from its immutable Git revision, or an explicitly verified original local archive. */
export async function prepareBaseline(metadata, archivedDirectory) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(manifest.revision, '8f0a710a75cb907c1a07e34eb5527b1834da90ed');
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-pre-extraction-')),
  );
  for (const directory of [
    'logs',
    'source',
    'bin',
    'home',
    'packages',
    'dependency-feed',
    'extracted',
    'observer',
  ])
    await fs.mkdir(path.join(root, directory));
  await validateAncestors(root);
  const environment = buildEnvironment(process.env, root);
  // Always prove the immutable source is available, even when using the preserved local binary archive.
  const archive = spawnSync(
    'git',
    ['archive', manifest.revision, 'tools/conformance/dotnet'],
    { cwd: repository, maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(
    archive.status,
    0,
    'Immutable pre-extraction commit unavailable; CI requires full history',
  );
  await fs.writeFile(path.join(root, 'original.tar'), archive.stdout);
  await run(
    'tar',
    [
      '-xf',
      path.join(root, 'original.tar'),
      '-C',
      path.join(root, 'extracted'),
    ],
    root,
    environment,
    path.join(root, 'logs/archive.log'),
  );
  for (const [file, hash] of Object.entries(manifest.files)) {
    const from = path.join(root, 'extracted/tools/conformance/dotnet', file);
    assert.equal(
      await hashFile(from),
      hash,
      `Immutable source hash differs: ${file}`,
    );
    const to = path.join(root, 'source', file);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
  await fs.rm(path.join(root, 'extracted'), { recursive: true });
  await fs.rm(path.join(root, 'original.tar'));
  const source = path.join(root, 'source');
  // The historical global.json disables roll-forward. Build under the current
  // pin's latestPatch policy, then restore its verified original bytes.
  const pinned = path.join(source, 'global.json');
  const original = await fs.readFile(pinned);
  const policy = sdkPolicy(manifest.sdk);
  await fs.writeFile(pinned, policy);
  const sdk = (
    await run(
      'dotnet',
      ['--version'],
      source,
      environment,
      path.join(root, 'logs/sdk.log'),
    )
  ).trim();
  assert.ok(acceptsSdk(sdk, manifest.sdk), 'Historical SDK pin differs');
  for (const dependency of metadata.closure) {
    const name = `${dependency.id.toLowerCase()}.${dependency.version.toLowerCase()}.nupkg`;
    const file = 'dependency-feed/' + name;
    assert.equal(
      await hashFile(path.join(metadata.root, file)),
      metadata.files[file],
      'Qualified dependency changed',
    );
    await fs.copyFile(path.join(metadata.root, file), path.join(root, file));
  }
  if (archivedDirectory) {
    await verifyBaselineArchive(archivedDirectory);
    await fs.cp(archivedDirectory, path.join(root, 'bin'), { recursive: true });
  } else {
    await run(
      'dotnet',
      [
        'restore',
        '--locked-mode',
        '--source',
        path.join(root, 'dependency-feed'),
        '--configfile',
        path.join(source, 'nuget.config'),
      ],
      source,
      environment,
      path.join(root, 'logs/restore.log'),
    );
    await run(
      'dotnet',
      ['build', '--no-restore', '-c', 'Release', '-o', path.join(root, 'bin')],
      source,
      environment,
      path.join(root, 'logs/build.log'),
    );
  }
  assert.equal(
    await fs.readFile(pinned, 'utf8'),
    policy,
    'Historical source changed while building',
  );
  await fs.writeFile(pinned, original);
  for (const [file, hash] of Object.entries(manifest.files))
    assert.equal(
      await hashFile(path.join(source, file)),
      hash,
      'Historical source changed while building',
    );
  const observer = path.join(root, 'observer');
  for (const file of [
    'Hashbrown.Conformance.csproj',
    'packages.lock.json',
    'nuget.config',
  ])
    await fs.copyFile(path.join(source, file), path.join(observer, file));
  await fs.writeFile(path.join(observer, 'global.json'), policy);
  await fs.copyFile(
    path.join(here, 'observe-database.cs.txt'),
    path.join(observer, 'Program.cs'),
  );
  await run(
    'dotnet',
    [
      'restore',
      '--locked-mode',
      '--source',
      path.join(root, 'dependency-feed'),
    ],
    observer,
    environment,
    path.join(root, 'logs/observer-restore.log'),
  );
  await run(
    'dotnet',
    ['build', '--no-restore', '-c', 'Release'],
    observer,
    environment,
    path.join(root, 'logs/observer-build.log'),
  );
  const executable = path.join(root, 'bin/Hashbrown.Conformance.dll');
  const image = await fs.readFile(executable);
  assert.ok(
    image.includes(Buffer.from(manifest.namespace)),
    'Original assembly namespace missing',
  );
  assert.ok(
    !image.includes(Buffer.from('Hashbrown.AspNetCore')),
    'Extracted package substituted for old host',
  );
  const files = Object.fromEntries(
    await Promise.all(
      (await listFiles(path.join(root, 'bin'))).map(async (file) => [
        file,
        await hashFile(path.join(root, 'bin', file)),
      ]),
    ),
  );
  const descriptor = {
    revision: manifest.revision,
    namespace: manifest.namespace,
    provenance: archivedDirectory
      ? 'original-local-archive'
      : 'immutable-git-build',
    manifestSha256: await hashFile(manifestPath),
    root,
    executable,
    files,
    sources: manifest.files,
    launcher: metadata.roles.fixture.launcher,
    runtimeInputs: metadata.roles.fixture.runtimeInputs,
    environment,
    observerFiles: Object.fromEntries(
      await Promise.all(
        (await listFiles(path.join(observer, 'bin/Release/net10.0'))).map(
          async (file) => [
            file,
            await hashFile(path.join(observer, 'bin/Release/net10.0', file)),
          ],
        ),
      ),
    ),
    observerSourceSha256: await hashFile(path.join(observer, 'Program.cs')),
    observer: path.join(
      observer,
      'bin/Release/net10.0/Hashbrown.Conformance.dll',
    ),
  };
  const descriptorPath = path.join(root, 'baseline.json');
  await fs.writeFile(
    descriptorPath,
    JSON.stringify(descriptor, null, 2) + '\n',
  );
  return {
    kind: 'pre-extraction-test-only',
    descriptor: descriptorPath,
    sha256: await hashFile(descriptorPath),
  };
}
