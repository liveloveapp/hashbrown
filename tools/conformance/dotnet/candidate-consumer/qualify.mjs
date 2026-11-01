import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  archiveFiles,
  candidateConsumerCopies,
  digest,
  equalInventory,
  readPhysical,
  repository,
  sdkNames,
  sourceInventory,
  tree,
} from './files.mjs';
import { validateArchiveFiles, validateManifest } from './verify.mjs';
import { qualifyConsumer as qualifyNuget } from '../nuget-consumer/qualify.mjs';
import { verifyConsumer as verifyNuget } from '../nuget-consumer/verify.mjs';
import { validateSourceImports } from '../live-consumer/verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const inside = (root, file) => file.startsWith(root + path.sep);

/** Requires the selected installed package resolution without altering identity or integrity checks. */
export function validateInstalledResolution(installed, selected, context) {
  const sdk = sdkNames.find(
    (name) => context.location === `node_modules/${name}`,
  );
  if (sdk) {
    const archive = context.archives[sdk]?.archive;
    assert.ok(
      typeof archive === 'string' &&
        path.isAbsolute(archive) &&
        path.resolve(archive) === archive &&
        path.dirname(archive) === path.join(context.root, 'archives') &&
        selected === `file:${archive}`,
      'Candidate installed archive selection differs',
    );
    const relative = path.relative(context.root, archive);
    if (installed === `file:${relative}`) return;
  }
  assert.equal(
    installed,
    selected,
    `Installed ${context.location} resolved differs`,
  );
}

/** Collects consumer source and build files for exact qualification comparison. */
export async function consumerInventory(root) {
  return tree(root, root, [
    'home',
    'npm-cache',
    'logs',
    'archives',
    'node_modules',
    'candidate-metadata.json',
  ]);
}

/** Inventories installed bytes, allowing only owned npm-generated bin links. */
export async function installationInventory(
  root,
  directory = path.join(root, 'node_modules'),
) {
  const result = {};
  for (const entry of (
    await fs.readdir(directory, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (entry.isSymbolicLink()) {
      assert.equal(
        path.basename(directory),
        '.bin',
        'Installed package symlink forbidden',
      );
      assert.ok(
        inside(path.join(root, 'node_modules'), await fs.realpath(file)),
        'Installed bin link escapes consumer',
      );
      result[relative] = 'link:' + (await fs.readlink(file));
    } else if (entry.isDirectory())
      Object.assign(result, await installationInventory(root, file));
    else result[relative] = digest(await readPhysical(file));
  }
  return result;
}

/** Requires the full retained third-party lock graph, changing only the three SDK records. */
export function validateLockGraph(lock, baseline, archives, manifest) {
  assert.equal(
    lock.lockfileVersion,
    baseline.lockfileVersion,
    'Candidate lock format changed',
  );
  assert.equal(lock.name, manifest.name, 'Candidate lock name differs');
  assert.equal(
    lock.version,
    baseline.version,
    'Candidate lock version changed',
  );
  assert.equal(
    lock.requires,
    baseline.requires,
    'Candidate lock resolution policy changed',
  );
  assert.deepEqual(
    Object.keys(lock.packages).sort(),
    Object.keys(baseline.packages).sort(),
    'Candidate dependency inventory changed',
  );
  assert.deepEqual(
    lock.packages[''],
    {
      ...baseline.packages[''],
      name: manifest.name,
      dependencies: manifest.dependencies,
    },
    'Candidate root lock declarations changed',
  );
  for (const [location, record] of Object.entries(baseline.packages)) {
    if (!location) continue;
    const name = sdkNames.find((sdk) => location === `node_modules/${sdk}`);
    const expected = name
      ? {
          ...record,
          version: archives[name].version,
          resolved: 'file:' + archives[name].archive,
          integrity: archives[name].integrity,
        }
      : record;
    assert.deepEqual(
      lock.packages[location],
      expected,
      `Candidate lock differs from frozen graph: ${location}`,
    );
    assert.ok(
      !lock.packages[location].link,
      'Package lock symlink alias forbidden',
    );
  }
}

/** Checks candidate installed packages, source/build closures and actual builder origins. */
export async function verifyCandidate(metadata) {
  assert.equal(metadata.schema, 1, 'Candidate schema required');
  assert.equal(
    metadata.kind,
    'source-candidate',
    'Source candidate metadata required',
  );
  assert.equal(
    metadata.repository,
    repository,
    'Candidate producer repository differs',
  );
  assert.match(
    metadata.revision,
    /^[a-f0-9]{40}$/,
    'Actual source revision required',
  );
  const root = metadata.root;
  assert.ok(
    path.isAbsolute(root) &&
      path.resolve(root) === root &&
      (await fs.realpath(root)) === root,
    'Physical candidate root required',
  );
  assert.ok(
    !inside(repository, root) &&
      !inside(root, repository) &&
      root !== repository,
    'Candidate must be outside repository ancestry',
  );
  assert.ok(
    inside(await fs.realpath(os.tmpdir()), root),
    'Candidate root must be OS temp',
  );
  equalInventory(await sourceInventory(), metadata.sources, 'Candidate source');
  assert.equal(
    metadata.sourceIdentity.baseRevision,
    metadata.revision,
    'Candidate source base differs',
  );
  assert.equal(
    metadata.sourceIdentity.workingTreeSha256,
    digest(JSON.stringify(metadata.sources)),
    'Candidate working tree identity differs',
  );
  assert.equal(
    metadata.node.version,
    process.version,
    'Candidate Node version changed',
  );
  assert.equal(
    await fs.realpath(process.execPath),
    metadata.node.executable,
    'Candidate Node executable changed',
  );
  assert.equal(
    digest(await readPhysical(metadata.node.executable)),
    metadata.node.sha256,
    'Candidate Node bytes changed',
  );
  for (const [file, hash] of Object.entries(metadata.checkLogs)) {
    assert.ok(
      file.startsWith('logs/') && path.posix.normalize(file) === file,
      'Candidate check log escape',
    );
    assert.equal(
      digest(await readPhysical(path.join(root, file))),
      hash,
      'Candidate executable check evidence changed',
    );
  }
  const baseline = JSON.parse(
    await readPhysical(path.join(here, '../live-consumer/package.json')),
  );
  const baselineLock = JSON.parse(
    await readPhysical(path.join(here, '../live-consumer/package-lock.json')),
  );
  assert.deepEqual(
    metadata.baselineManifest,
    baseline,
    'Frozen dependency manifest changed',
  );
  assert.deepEqual(
    metadata.baselineLock,
    baselineLock,
    'Frozen dependency lock changed',
  );
  const manifest = JSON.parse(
    await readPhysical(path.join(root, 'package.json')),
  );
  validateManifest(manifest, metadata.archives, baseline);
  await validateArchiveFiles(root, metadata.archives);
  const archiveRoot = path.join(root, 'archives');
  const expectedArchives = {};
  for (const record of Object.values(metadata.archives)) {
    assert.equal(
      path.dirname(record.archive),
      archiveRoot,
      'Candidate archive must belong to its explicit owned directory',
    );
    expectedArchives[path.basename(record.archive)] = record.sha256;
  }
  equalInventory(
    await tree(archiveRoot),
    expectedArchives,
    'Candidate archive directory',
  );
  const lock = JSON.parse(
    await readPhysical(path.join(root, 'package-lock.json')),
  );
  validateLockGraph(lock, baselineLock, metadata.archives, manifest);
  const installedLock = JSON.parse(
    await readPhysical(path.join(root, 'node_modules/.package-lock.json')),
  );
  for (const [location, record] of Object.entries(installedLock.packages)) {
    const expected = lock.packages[location];
    assert.ok(
      expected && !record.link,
      `Unexpected installed package: ${location}`,
    );
    for (const key of ['version', 'integrity'])
      assert.equal(
        record[key],
        expected[key],
        `Installed ${location} ${key} differs`,
      );
    validateInstalledResolution(record.resolved, expected.resolved, {
      root,
      location,
      archives: metadata.archives,
    });
    const packageFile = path.join(root, location, 'package.json');
    const pkg = JSON.parse(await readPhysical(packageFile));
    assert.equal(
      pkg.version,
      expected.version,
      'Installed package version differs',
    );
  }
  for (const [location, record] of Object.entries(lock.packages))
    if (location && !record.optional)
      assert.ok(
        installedLock.packages[location],
        `Required installed package missing: ${location}`,
      );
  const resolver = createRequire(path.join(root, 'package.json'));
  for (const name of sdkNames) {
    const record = metadata.archives[name];
    const files = archiveFiles(await readPhysical(record.archive));
    const expected = Object.fromEntries(
      Object.entries(files).map(([file, bytes]) => [file, digest(bytes)]),
    );
    for (const [file, hash] of Object.entries(expected))
      assert.equal(
        metadata.producer[name.split('/')[1]][file],
        hash,
        `Packed file differs from actual SDK build: ${name}/${file}`,
      );
    equalInventory(
      await tree(path.join(root, 'node_modules', name)),
      expected,
      `Installed SDK ${name}`,
    );
    const resolved = resolver.resolve(name);
    assert.ok(
      inside(path.join(root, 'node_modules', name), resolved),
      'SDK resolved outside installed package',
    );
    await readPhysical(resolved);
    equalInventory(
      await tree(path.join(repository, 'dist/packages', name.split('/')[1])),
      metadata.producer[name.split('/')[1]],
      'Producer build',
    );
  }
  const consumer = await consumerInventory(root);
  equalInventory(consumer, metadata.consumer, 'Consumer source/build');
  const copies = candidateConsumerCopies;
  for (const [file, template] of Object.entries(copies)) {
    assert.equal(
      digest(await readPhysical(path.join(root, file))),
      digest(await readPhysical(path.join(here, 'templates', template))),
      'Candidate copied source differs',
    );
    const framework = file.split('/')[0];
    const closure = Object.keys(copies).filter((value) =>
      value.startsWith(framework + '/'),
    );
    validateSourceImports(
      file,
      (await readPhysical(path.join(root, file))).toString(),
      closure,
    );
  }
  assert.equal(
    digest(await readPhysical(path.join(root, 'build.mjs'))),
    digest(await readPhysical(path.join(here, 'build.mjs'))),
    'Candidate build driver differs',
  );
  for (const config of [
    'tsconfig.contracts.json',
    'react/tsconfig.json',
    'angular/tsconfig.json',
  ]) {
    const value = JSON.parse(await readPhysical(path.join(root, config)));
    assert.ok(
      !value.extends &&
        !value.compilerOptions.paths &&
        !value.compilerOptions.baseUrl &&
        !value.compilerOptions.plugins,
      'Consumer compiler alias/extension forbidden',
    );
  }
  const origins = {};
  for (const framework of ['react', 'angular']) {
    const ids =
      framework === 'react'
        ? JSON.parse(
            await readPhysical(path.join(root, 'react-module-ids.json')),
          )
        : Object.keys(
            JSON.parse(
              await readPhysical(
                path.join(root, 'dist/angular/browser-stats.json'),
              ),
            ).inputs,
          );
    const sdkInputs = [];
    for (const id of ids) {
      if (
        [
          '\0vite/modulepreload-polyfill.js',
          '\0vite/preload-helper.js',
          'angular:styles/global:styles',
        ].includes(id)
      )
        continue;
      assert.ok(
        !id.startsWith('\0') && !id.startsWith('angular:'),
        'Unexpected virtual build input',
      );
      const file = path.resolve(root, id.replace(/\?.*$/, ''));
      assert.ok(
        inside(root, file) && !inside(repository, file),
        'Build module escaped candidate',
      );
      await readPhysical(file);
      if (inside(path.join(root, 'node_modules/@hashbrownai'), file))
        sdkInputs.push(path.relative(root, file));
    }
    for (const name of ['core', framework])
      assert.ok(
        sdkInputs.some((file) =>
          file.startsWith(`node_modules/@hashbrownai/${name}/`),
        ),
        `Missing actual ${framework} ${name} builder origin`,
      );
    origins[framework] = sdkInputs.sort();
  }
  const installed = await installationInventory(root);
  if (metadata.installation)
    equalInventory(
      installed,
      metadata.installation,
      'Installed dependency bytes',
    );
  if (metadata.moduleOrigins)
    assert.deepEqual(origins, metadata.moduleOrigins, 'Module origins changed');
  return { installation: installed, moduleOrigins: origins };
}

/** Reads an independently anchored physical candidate pointer without regenerating it. */
export async function readCandidatePointer(pointerPath) {
  const bytes = await readPhysical(pointerPath);
  assert.equal(
    digest(bytes),
    (await readPhysical(pointerPath + '.sha256')).toString().trim(),
    'Candidate pointer anchor changed',
  );
  const pointer = JSON.parse(bytes);
  assert.equal(
    pointer.kind,
    'source-candidate',
    'Published/source fallback pointer forbidden',
  );
  const metadata = await readPhysical(pointer.metadata);
  assert.equal(
    digest(metadata),
    pointer.sha256,
    'Candidate metadata anchor changed',
  );
  return JSON.parse(metadata);
}

/** Fully requalifies a prepared npm candidate without installation or fallback. */
export async function qualifyNpmCandidate(pointerPath) {
  const metadata = await readCandidatePointer(pointerPath);
  assert.ok(
    metadata.installation && metadata.moduleOrigins,
    'Complete candidate installation provenance required',
  );
  await verifyCandidate(metadata);
  return metadata;
}

/** Qualifies source-packed NuGet bytes and actual loaded public smoke, rejecting published packages. */
export async function qualifyNugetCandidate(pointerPath, underlying = false) {
  let selected = pointerPath;
  if (!underlying) {
    const binding = await readCandidatePointer(pointerPath);
    assert.equal(
      binding.kind,
      'source-candidate',
      'Candidate NuGet binding required',
    );
    equalInventory(
      await sourceInventory(),
      binding.sources,
      'Candidate NuGet source binding',
    );
    selected = binding.packagePointer;
    assert.equal(
      digest(await readPhysical(selected)),
      binding.packagePointerSha256,
      'Candidate NuGet package pointer changed',
    );
  }
  const raw = JSON.parse(await readPhysical(selected));
  const metadata = await verifyNuget(raw);
  assert.ok(
    !metadata.published && !metadata.rawSha512,
    'Published NuGet cannot qualify pending browser recovery',
  );
  await qualifyNuget(selected);
  return { ...metadata, packagePointer: selected };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const mode = args.shift();
  const match = args.length === 1 && args[0].match(/^--metadata=(\/.*)$/);
  if (!match || !['npm', 'nuget'].includes(mode))
    throw Error(
      'Use qualify.mjs <npm|nuget> --metadata=<absolute candidate pointer>',
    );
  try {
    const metadata =
      mode === 'npm'
        ? await qualifyNpmCandidate(match[1])
        : await qualifyNugetCandidate(match[1]);
    console.log(
      JSON.stringify({
        kind: 'source-candidate',
        qualified: true,
        root: metadata.root,
        revision: metadata.revision,
      }),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
