import { readCandidateDependencyBaseline } from '../candidate-consumer/dependency-baseline.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  archiveFiles,
  candidateConsumerCopies,
  digest,
  equalInventory,
  readPhysical,
  sdkNames,
  tree,
} from '../candidate-consumer/files.mjs';
import {
  createCandidateLock,
  installationInventory,
} from '../candidate-consumer/qualify.mjs';
import {
  validateRegistryPackage,
  validateSourceImports,
} from '../live-consumer/verify.mjs';
import {
  readArchive,
  verifyConsumer as verifyNuget,
  validatePublishedPayloads,
} from '../nuget-consumer/verify.mjs';
import { qualifyConsumer as qualifyNuget } from '../nuget-consumer/qualify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const execute = promisify(execFile);
const json = async (file) => JSON.parse(await readPhysical(file));
const inside = (root, file) => file.startsWith(root + path.sep);

/** Reads a sealed public receipt without accepting candidate or source origins. */
export async function readPublicPointer(pointerPath) {
  const bytes = await readPhysical(pointerPath);
  assert.equal(
    digest(bytes),
    (await readPhysical(pointerPath + '.sha256')).toString().trim(),
    'Public pointer anchor changed',
  );
  const pointer = JSON.parse(bytes);
  assert.equal(
    pointer.kind,
    'official-registry',
    'Official registry pointer required',
  );
  const metadata = await readPhysical(pointer.metadata);
  assert.equal(
    digest(metadata),
    pointer.sha256,
    'Public metadata anchor changed',
  );
  const value = JSON.parse(metadata);
  assert.equal(
    value.kind,
    'official-registry',
    'Official registry metadata required',
  );
  return value;
}

/** Fetches a fixed official receipt under a finite non-provider deadline without redirects or credential forwarding. */
async function official(url, maximum = 64 * 1024 * 1024) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, 'Official receipt unavailable');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= maximum, 'Official receipt byte limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Anchors an actual SDK producer independently of the current runner revision using its official source archive. */
export async function qualifyPublicProducer(producer) {
  assert.match(producer.revision, /^[a-f0-9]{40}$/);
  const url = `https://codeload.github.com/liveloveapp/hashbrown/zip/${producer.revision}`;
  assert.equal(
    producer.sourceUrl,
    url,
    'Official producer source URL required',
  );
  const physical = await readPhysical(producer.sourceArchive);
  assert.equal(
    digest(physical),
    producer.sourceArchiveSha256,
    'Producer source archive changed',
  );
  assert.ok(
    (await official(url)).equals(physical),
    'Official producer archive differs',
  );
  const entries = readArchive(physical);
  const prefix = `hashbrown-${producer.revision}/`;
  const sources = Object.fromEntries(
    Object.entries(entries)
      .filter(([name]) => name.startsWith(prefix) && !name.endsWith('/'))
      .map(([name, bytes]) => [name.slice(prefix.length), digest(bytes)]),
  );
  assert.ok(
    sources['package.json'] &&
      sources['packages/dotnet/Hashbrown.AspNetCore.csproj'],
    'Full actual producer archive required',
  );
  const sdkSources = Object.fromEntries(
    Object.entries(sources).filter(([file]) =>
      /^packages\/(?:core|react|angular|dotnet)\//.test(file),
    ),
  );
  for (const [file, hash] of Object.entries(sdkSources))
    assert.equal(
      producer.sources[file],
      hash,
      'Incomplete actual SDK producer source closure',
    );
  assert.equal(
    await fs.realpath(producer.root),
    producer.root,
    'Physical producer checkout required',
  );
  const actualRevision = await execute('git', ['rev-parse', 'HEAD'], {
    cwd: producer.root,
    timeout: 5000,
    env: { PATH: process.env.PATH },
  });
  assert.equal(
    actualRevision.stdout.trim(),
    producer.revision,
    'Actual SDK producer revision differs',
  );
  for (const [file, hash] of Object.entries(producer.sources)) {
    assert.ok(
      file && !file.startsWith('/') && path.posix.normalize(file) === file,
      'Producer source path escape',
    );
    assert.equal(
      sources[file],
      hash,
      `Actual producer source differs: ${file}`,
    );
    assert.equal(
      digest(await readPhysical(path.join(producer.root, file))),
      hash,
      'Physical SDK producer source changed',
    );
  }
  for (const directory of [
    'packages/core/',
    'packages/react/',
    'packages/angular/',
    'packages/dotnet/',
  ])
    assert.ok(
      Object.keys(producer.sources).some((file) => file.startsWith(directory)),
      'SDK producer closure missing',
    );
  for (const name of sdkNames)
    equalInventory(
      await tree(path.join(producer.root, 'dist/packages', name.split('/')[1])),
      producer.packages[name],
      'Physical SDK producer build',
    );
  return {
    revision: producer.revision,
    sourceArchiveSha256: digest(physical),
    sources,
  };
}

/** Fully rechecks exact registry npm installs, real tarballs, SDK producer receipts and compiled recovery templates. */
export async function qualifyPublicNpm(pointerPath) {
  const metadata = await readPublicPointer(pointerPath);
  const root = await fs.realpath(metadata.root);
  assert.equal(root, metadata.root);
  assert.ok(
    !inside(repository, root) && !inside(root, repository),
    'Isolated public consumer required',
  );
  const producer = await qualifyPublicProducer(metadata.producer);
  assert.equal(metadata.revision, producer.revision);
  const manifest = await json(path.join(root, 'package.json'));
  const lock = await json(path.join(root, 'package-lock.json'));
  const installed = await json(
    path.join(root, 'node_modules/.package-lock.json'),
  );
  const { manifest: baseline, lock: baselineLock } =
    await readCandidateDependencyBaseline();
  const expectedManifest = {
    ...baseline,
    name: manifest.name,
    dependencies: {
      ...baseline.dependencies,
      ...Object.fromEntries(sdkNames.map((name) => [name, '0.9.0'])),
    },
  };
  assert.deepEqual(
    manifest,
    expectedManifest,
    'Public consumer dependency graph differs',
  );
  assert.deepEqual(
    Object.keys(metadata.archives).sort(),
    [...sdkNames].sort(),
    'Public SDK archive inventory differs',
  );
  for (const name of sdkNames) {
    const receipt = metadata.archives[name];
    assert.equal(receipt.version, '0.9.0');
    const pkg = await json(
      path.join(root, 'node_modules', name, 'package.json'),
    );
    validateRegistryPackage(
      name,
      '0.9.0',
      pkg,
      lock.packages[`node_modules/${name}`],
      installed.packages[`node_modules/${name}`],
    );
    const officialMetadata = JSON.parse(
      await official(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/0.9.0`,
        1024 * 1024,
      ),
    );
    assert.equal(officialMetadata.name, name);
    assert.equal(officialMetadata.version, '0.9.0');
    assert.equal(
      officialMetadata.gitHead,
      producer.revision,
      'Actual npm producer receipt differs',
    );
    const expectedUrl = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-0.9.0.tgz`;
    assert.equal(officialMetadata.dist.tarball, expectedUrl);
    assert.equal(receipt.resolved, expectedUrl);
    const bytes = await readPhysical(receipt.archive);
    assert.equal(receipt.sha256, digest(bytes));
    const sri = 'sha512-' + digest(bytes, 'sha512', 'base64');
    assert.equal(receipt.integrity, sri);
    assert.equal(
      officialMetadata.dist.integrity,
      sri,
      'Official npm integrity differs',
    );
    assert.equal(lock.packages[`node_modules/${name}`].integrity, sri);
    assert.ok(
      (await official(expectedUrl)).equals(bytes),
      'Actual registry tarball differs',
    );
    const archived = Object.fromEntries(
      Object.entries(archiveFiles(bytes)).map(([file, value]) => [
        file,
        digest(value),
      ]),
    );
    equalInventory(
      await tree(path.join(root, 'node_modules', name)),
      archived,
      'Actual installed SDK bytes',
    );
    equalInventory(
      archived,
      metadata.producer.packages[name],
      'Actual SDK producer package bytes',
    );
  }
  const expectedLock = createCandidateLock(
    baselineLock,
    metadata.archives,
    manifest,
  );
  for (const name of sdkNames)
    expectedLock.packages[`node_modules/${name}`].resolved =
      metadata.archives[name].resolved;
  assert.deepEqual(
    lock,
    expectedLock,
    'Retained external dependency graph changed',
  );
  for (const [location, pin] of Object.entries(installed.packages)) {
    assert.ok(
      lock.packages[location] && !pin.link,
      'Unexpected public installed origin',
    );
    for (const key of ['version', 'resolved', 'integrity'])
      assert.equal(
        pin[key],
        lock.packages[location][key],
        'Public installed lock differs',
      );
  }
  for (const [location, pin] of Object.entries(lock.packages))
    if (location && !pin.optional)
      assert.ok(
        installed.packages[location],
        'Required public installed package missing',
      );
  equalInventory(
    await installationInventory(root),
    metadata.installation,
    'Public installed bytes',
  );
  const actualConsumer = await tree(root, root, [
    'home',
    'npm-cache',
    'logs',
    'archives',
    'node_modules',
    'release-metadata.json',
  ]);
  equalInventory(
    actualConsumer,
    metadata.consumer,
    'Public consumer source and build',
  );
  for (const [file, template] of Object.entries(candidateConsumerCopies)) {
    const bytes = await readPhysical(path.join(root, file));
    assert.equal(
      digest(bytes),
      digest(
        await readPhysical(
          path.join(here, '../candidate-consumer/templates', template),
        ),
      ),
      'Recovery template changed',
    );
    validateSourceImports(
      file,
      bytes.toString(),
      Object.keys(candidateConsumerCopies).filter((key) =>
        key.startsWith(file.split('/')[0] + '/'),
      ),
    );
  }
  const resolver = createRequire(path.join(root, 'package.json'));
  for (const name of sdkNames)
    assert.ok(
      inside(path.join(root, 'node_modules', name), resolver.resolve(name)),
      'Public SDK source fallback',
    );
  for (const framework of ['react', 'angular']) {
    const ids =
      framework === 'react'
        ? await json(path.join(root, 'react-module-ids.json'))
        : Object.keys(
            (await json(path.join(root, 'dist/angular/browser-stats.json')))
              .inputs,
          );
    const origins = [];
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
        'Unsupported public virtual input',
      );
      const file = path.resolve(root, id.replace(/\?.*$/, ''));
      assert.ok(
        inside(root, file) && (await fs.realpath(file)) === file,
        'Public builder source fallback',
      );
      if (inside(path.join(root, 'node_modules/@hashbrownai'), file))
        origins.push(path.relative(root, file));
    }
    for (const name of ['core', framework])
      assert.ok(
        origins.some((file) =>
          file.startsWith(`node_modules/@hashbrownai/${name}/`),
        ),
        'Public SDK builder origin missing',
      );
    assert.deepEqual(
      origins.sort(),
      metadata.moduleOrigins[framework],
      'Public module origins changed',
    );
  }
  return metadata;
}

/** Rechecks actual public NuGet signature, official package bytes, canonical payload, symbols and loaded producer witnesses. */
export async function qualifyPublicNuget(pointerPath) {
  const binding = await readPublicPointer(pointerPath);
  const producer = await qualifyPublicProducer(binding.producer);
  const raw = await json(binding.packagePointer);
  assert.equal(
    digest(await readPhysical(binding.packagePointer)),
    binding.packagePointerSha256,
    'Public NuGet raw pointer changed',
  );
  const metadata = await verifyNuget(raw);
  assert.equal(metadata.identity.id, 'Hashbrown.AspNetCore');
  assert.equal(metadata.identity.version, '0.1.0-preview.2');
  assert.equal(metadata.revision, producer.revision);
  for (const [file, hash] of Object.entries(metadata.sources))
    assert.equal(producer.sources[file], hash, 'NuGet producer source differs');
  const published = metadata.published;
  assert.equal(published?.signatureVerification, 'passed');
  assert.equal(published?.payloadEquality, 'passed');
  assert.equal(
    published?.repositorySignatureUrl,
    'https://api.nuget.org/v3/index.json',
  );
  const archivePath = path.join(metadata.root, metadata.archive);
  const bytes = await readPhysical(archivePath);
  const qualified = await readPhysical(
    path.join(metadata.root, published.qualifiedArchive),
  );
  assert.ok(
    (
      await official(
        'https://api.nuget.org/v3-flatcontainer/hashbrown.aspnetcore/0.1.0-preview.2/hashbrown.aspnetcore.0.1.0-preview.2.nupkg',
      )
    ).equals(bytes),
    'Official NuGet archive differs',
  );
  validatePublishedPayloads(
    readArchive(bytes),
    readArchive(qualified),
    metadata.identity,
    producer.revision,
  );
  const symbolsPath = path.join(
    metadata.root,
    'candidate-feed/Hashbrown.AspNetCore.0.1.0-preview.2.snupkg',
  );
  const symbols = readArchive(await readPhysical(symbolsPath));
  assert.ok(
    symbols['lib/net10.0/Hashbrown.AspNetCore.pdb']?.length,
    'Qualified symbols missing',
  );
  const nuspec = symbols['Hashbrown.AspNetCore.nuspec']?.toString() ?? '';
  assert.ok(
    nuspec.includes('<version>0.1.0-preview.2</version>') &&
      nuspec.includes(`commit="${producer.revision}"`),
    'Qualified symbols producer differs',
  );
  // The helper and its full executable/source closure are already anchored by verifyNuget.
  const helper = path.join(
    metadata.root,
    'package-hash/bin/Release/net10.0/PackageHash.dll',
  );
  assert.ok(
    metadata.files[path.relative(metadata.root, helper)],
    'Qualified hash helper missing',
  );
  const dotnet = path.join(
    metadata.sdkRoot,
    process.platform === 'win32' ? 'dotnet.exe' : 'dotnet',
  );
  await execute(dotnet, ['nuget', 'verify', '--all', archivePath], {
    env: metadata.environment,
    cwd: metadata.root,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  const actual = await execute(
    dotnet,
    [
      helper,
      '--published-archive',
      archivePath,
      path.join(metadata.root, published.qualifiedArchive),
    ],
    {
      env: metadata.environment,
      cwd: metadata.root,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const receipts = JSON.parse(actual.stdout.trim().split('\n').at(-1));
  assert.equal(
    receipts[archivePath].repositorySignatureUrl,
    'https://api.nuget.org/v3/index.json',
  );
  assert.equal(receipts[archivePath].contentHash, metadata.sha512);
  assert.equal(
    receipts[path.join(metadata.root, published.qualifiedArchive)].contentHash,
    metadata.sha512,
  );
  assert.equal(published.canonicalHash, metadata.sha512);
  await qualifyNuget(binding.packagePointer);
  return {
    ...metadata,
    packagePointer: binding.packagePointer,
    producerArchiveSha256: producer.sourceArchiveSha256,
  };
}
