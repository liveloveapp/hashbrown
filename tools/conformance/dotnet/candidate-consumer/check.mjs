import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseCandidateArguments } from './browser-runner.mjs';
import {
  archiveFiles,
  digest,
  readPhysical,
  sdkNames,
  sourceInventory,
  tree,
} from './files.mjs';
import { candidateEnvironment, run } from './prepare.mjs';
import { qualifyNpmCandidate, qualifyNugetCandidate } from './qualify.mjs';
import { validateArchiveFiles } from './verify.mjs';

/** Creates a fresh cache/home outside repository ancestry for each actual negative consumer. */
async function negativeRoot(parent, name, candidate) {
  const root = path.join(parent, name);
  await fs.mkdir(root);
  for (const directory of ['home', 'npm-cache', 'logs'])
    await fs.mkdir(path.join(root, directory));
  for (const file of ['empty.npmrc', 'empty-global.npmrc'])
    await fs.writeFile(path.join(root, file), '');
  for (const directory of ['react', 'angular'])
    await fs.cp(
      path.join(candidate.root, directory),
      path.join(root, directory),
      { recursive: true },
    );
  for (const file of ['contracts.ts', 'tsconfig.contracts.json'])
    await fs.copyFile(path.join(candidate.root, file), path.join(root, file));
  return { root, environment: candidateEnvironment(root) };
}

/** Writes a controlled alternate archive selection without resolving any third-party versions. */
async function installSelection(
  subject,
  candidate,
  selections,
  offline = false,
) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(candidate.root, 'package.json')),
  );
  const lock = JSON.parse(
    await fs.readFile(path.join(candidate.root, 'package-lock.json')),
  );
  for (const [name, record] of Object.entries(selections)) {
    manifest.dependencies[name] = record.resolved ?? 'file:' + record.archive;
    lock.packages[''].dependencies[name] = manifest.dependencies[name];
    Object.assign(lock.packages[`node_modules/${name}`], {
      resolved: manifest.dependencies[name],
      integrity: record.integrity,
      version: record.version,
    });
  }
  await fs.writeFile(
    path.join(subject.root, 'package.json'),
    JSON.stringify(manifest, null, 2),
  );
  await fs.writeFile(
    path.join(subject.root, 'package-lock.json'),
    JSON.stringify(lock, null, 2),
  );
  await run(
    'npm',
    [
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...(offline ? ['--offline'] : []),
    ],
    subject.root,
    subject.environment,
    path.join(subject.root, 'logs/npm-ci.log'),
  );
  for (const [name, record] of Object.entries(selections)) {
    const expected =
      record.expectedFiles ??
      Object.fromEntries(
        Object.entries(archiveFiles(await readPhysical(record.archive))).map(
          ([file, bytes]) => [file, digest(bytes)],
        ),
      );
    assert.deepEqual(
      await tree(path.join(subject.root, 'node_modules', name)),
      expected,
      'Negative control did not install the selected actual package bytes',
    );
  }
}

/** Seeds an exact candidate tarball through a separate owned HTTP cache-control identity. */
async function seedHttpCache(subject, bytes) {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/core-0.8.3.tgz') {
      response.writeHead(404).end();
      return;
    }
    requests++;
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'public, max-age=31536000',
    });
    response.end(bytes);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(
    address && typeof address !== 'string',
    'Owned cache-control listener required',
  );
  const url = `http://127.0.0.1:${address.port}/core-0.8.3.tgz`;
  try {
    // Await an asynchronous child so the owned fixture can actually serve its bytes.
    const result = await promisify(execFile)('npm', ['cache', 'add', url], {
      cwd: subject.root,
      env: subject.environment,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    await fs.writeFile(
      path.join(subject.root, 'logs/cache-add.log'),
      result.stdout + result.stderr,
    );
    assert.ok(
      requests > 0,
      'Cache seed must fetch the actual owned HTTP tarball',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(
    server.listening,
    false,
    'Cache-control source must stop before offline installation',
  );
  return { url, requests, sourceClosed: true };
}

/** Captures real TypeScript diagnostics; only missing recovery APIs establish old-package isolation. */
async function typecheck(subject, log) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '-p',
      'tsconfig.contracts.json',
    ],
    {
      cwd: subject.root,
      env: subject.environment,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ok(!result.error, 'TypeScript compiler must actually start');
  const diagnostics = (result.stdout ?? '') + (result.stderr ?? '');
  await fs.writeFile(log, diagnostics);
  return { status: result.status, diagnostics };
}

/** Runs a temporary exact-byte mutation, restoring the original file even on assertion failure. */
async function mutateFile(file, operation) {
  const bytes = await readPhysical(file);
  const mode = (await fs.stat(file)).mode;
  try {
    await fs.chmod(file, 0o600);
    await operation(bytes);
  } finally {
    await fs.rm(file, { force: true });
    await fs.writeFile(file, bytes, { mode });
    await fs.chmod(file, mode);
  }
}

/** Runs actual packed consumer compilation and controlled negative qualifications without browsers. */
export async function checkCandidateConsumers(
  npmMetadataPath,
  nugetMetadataPath,
) {
  const candidate = await qualifyNpmCandidate(npmMetadataPath);
  const nuget = await qualifyNugetCandidate(nugetMetadataPath);
  const parent = await fs.realpath(
    await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        'hashbrown-candidate-isolation-',
      ),
    ),
  );
  const records = [];
  const beforeSources = await sourceInventory();
  const pointerHashes = Object.fromEntries(
    await Promise.all(
      [
        npmMetadataPath,
        npmMetadataPath + '.sha256',
        nugetMetadataPath,
        nugetMetadataPath + '.sha256',
      ].map(async (file) => [file, digest(await readPhysical(file))]),
    ),
  );
  const prepared = {
    root: candidate.root,
    environment: candidateEnvironment(candidate.root),
  };
  const green = await typecheck(
    prepared,
    path.join(parent, 'candidate-typecheck.log'),
  );
  assert.equal(
    green.status,
    0,
    'Actual candidate declaration consumer must compile',
  );
  records.push({
    id: 'actual-candidate-public-contracts',
    status: 'passed',
    log: path.join(parent, 'candidate-typecheck.log'),
  });
  const publicDirectory = path.join(parent, 'published-archives');
  await fs.mkdir(publicDirectory);
  for (const name of sdkNames) {
    const subject = await negativeRoot(
      parent,
      'old-' + name.split('/')[1],
      candidate,
    );
    const expected = candidate.baselineLock.packages[`node_modules/${name}`];
    const packed = JSON.parse(
      await run(
        'npm',
        [
          'pack',
          expected.resolved,
          '--json',
          '--ignore-scripts',
          '--pack-destination',
          publicDirectory,
        ],
        subject.root,
        subject.environment,
        path.join(subject.root, 'logs/public-pack.log'),
      ),
    );
    assert.equal(
      packed.length,
      1,
      'Exactly one actual public archive required',
    );
    const archive = path.join(
      publicDirectory,
      path.basename(packed[0].filename),
    );
    const bytes = await readPhysical(archive);
    assert.equal(
      'sha512-' + digest(bytes, 'sha512', 'base64'),
      expected.integrity,
      'Actual public 0.8.3 archive differs from frozen integrity',
    );
    const pkg = JSON.parse(archiveFiles(bytes)['package.json']);
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, '0.8.3');
    await installSelection(subject, candidate, {
      [name]: { archive, version: pkg.version, integrity: expected.integrity },
    });
    const log = path.join(subject.root, 'logs/missing-feature.log');
    const result = await typecheck(subject, log);
    assert.notEqual(
      result.status,
      0,
      'Public 0.8.3 must lack candidate recovery APIs',
    );
    assert.match(
      result.diagnostics,
      name === '@hashbrownai/core'
        ? /TS2305[^\n]*(?:PendingConversationRecovery|BrowserRecoveryOutcome|ResumeConversationRecoveryOptions)/
        : /TS2339[^\n]*(?:pendingConversationRecovery|resumeConversationRecovery)/,
      'Actual compile failure must name missing recovery APIs',
    );
    assert.doesNotMatch(
      result.diagnostics,
      /TS2307|Cannot find module/,
      'Module-resolution failure is not feature isolation evidence',
    );
    records.push({
      id: 'old-public-missing-api.' + name.split('/')[1],
      status: 'passed',
      archive,
      archiveSha256: digest(bytes),
      log,
    });
  }
  const control = await negativeRoot(
    parent,
    'usable-cache-sentinel',
    candidate,
  );
  await fs.cp(
    path.join(candidate.root, 'npm-cache'),
    path.join(control.root, 'npm-cache'),
    { recursive: true },
  );
  const original = candidate.archives['@hashbrownai/core'];
  const sentinel = path.join(control.root, 'cached-core-0.8.3.tgz');
  await fs.copyFile(original.archive, sentinel);
  const sentinelBytes = await readPhysical(sentinel);
  const expectedFiles = Object.fromEntries(
    Object.entries(archiveFiles(sentinelBytes)).map(([file, bytes]) => [
      file,
      digest(bytes),
    ]),
  );
  const cached = await seedHttpCache(control, sentinelBytes);
  await fs.rm(sentinel);
  try {
    await assert.rejects(fs.access(sentinel), /ENOENT/);
    await installSelection(
      control,
      candidate,
      {
        '@hashbrownai/core': {
          ...original,
          archive: sentinel,
          resolved: cached.url,
          expectedFiles,
        },
      },
      true,
    );
    const usable = await typecheck(
      control,
      path.join(control.root, 'logs/usable-candidate.log'),
    );
    assert.equal(
      usable.status,
      0,
      'Cache-only same-version sentinel must compile with HTTP source stopped and archive absent',
    );
  } finally {
    await fs.writeFile(sentinel, sentinelBytes);
  }
  await mutateFile(original.archive, async () => {
    await fs.rm(original.archive);
    await assert.rejects(
      validateArchiveFiles(candidate.root, candidate.archives),
      /ENOENT|missing|archive/i,
    );
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /ENOENT|missing|archive/i,
    );
  });
  records.push({
    id: 'missing-archive-with-usable-cache',
    status: 'passed',
    sentinel,
    cacheOnlyControl: cached,
    selectedArchiveAbsentDuringInstall: true,
    log: path.join(control.root, 'logs/usable-candidate.log'),
  });
  await mutateFile(original.archive, async () => {
    await fs.writeFile(original.archive, 'tampered archive');
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /hash|integrity|changed/i,
    );
  });
  records.push({ id: 'archive-tamper', status: 'passed' });
  await mutateFile(original.archive, async () => {
    await fs.rm(original.archive);
    await fs.symlink(sentinel, original.archive);
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /symlink|link|origin/i,
    );
  });
  records.push({ id: 'archive-symlink', status: 'passed' });
  const configFile = path.join(candidate.root, 'react/tsconfig.json');
  await mutateFile(configFile, async (bytes) => {
    const config = JSON.parse(bytes);
    config.compilerOptions.paths = {
      '@hashbrownai/core': [
        path.join(candidate.repository, 'packages/core/src/index.ts'),
      ],
    };
    await fs.writeFile(configFile, JSON.stringify(config));
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /inventory|alias|changed/i,
    );
  });
  records.push({ id: 'workspace-path-alias', status: 'passed' });
  const sourceFile = path.join(candidate.root, 'react/src/app.tsx');
  await mutateFile(sourceFile, async () => {
    await fs.rm(sourceFile);
    await fs.symlink(
      path.join(candidate.repository, 'packages/react/src/index.ts'),
      sourceFile,
    );
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /symlink|link|origin/i,
    );
  });
  records.push({ id: 'consumer-source-symlink', status: 'passed' });
  const packageFile = path.join(
    candidate.root,
    'node_modules/@hashbrownai/core/package.json',
  );
  await mutateFile(packageFile, async () => {
    await fs.rm(packageFile);
    await fs.symlink(
      path.join(candidate.repository, 'packages/core/package.json'),
      packageFile,
    );
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /symlink|link|origin/i,
    );
  });
  records.push({ id: 'installed-sdk-symlink', status: 'passed' });
  const added = path.join(candidate.root, 'react/src/unreviewed.ts');
  try {
    await fs.writeFile(added, 'export const unexpected = true;', {
      flag: 'wx',
    });
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /inventory|changed/i,
    );
  } finally {
    await fs.rm(added, { force: true });
  }
  records.push({ id: 'added-consumer-source', status: 'passed' });
  for (const name of ['unreviewed.ts', 'tsconfig.extra.json', '.npmrc']) {
    const rootFile = path.join(candidate.root, name);
    try {
      await fs.writeFile(rootFile, 'Unreviewed root source/config', {
        flag: 'wx',
      });
      await assert.rejects(
        qualifyNpmCandidate(npmMetadataPath),
        /inventory|changed/i,
      );
    } finally {
      await fs.rm(rootFile, { force: true });
    }
    records.push({ id: 'added-consumer-root.' + name, status: 'passed' });
  }
  await mutateFile(path.join(candidate.root, 'empty.npmrc'), async () => {
    await fs.writeFile(
      path.join(candidate.root, 'empty.npmrc'),
      'node-options=unapproved',
    );
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /inventory|changed/i,
    );
  });
  records.push({ id: 'owned-npm-config-tamper', status: 'passed' });
  const addedProducerSource = path.join(
    candidate.repository,
    'tools/conformance/dotnet/candidate-consumer',
    `.qualification-negative-${path.basename(parent)}.txt`,
  );
  try {
    await fs.writeFile(
      addedProducerSource,
      'Unreviewed source inventory negative control',
      { flag: 'wx' },
    );
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /source|inventory|changed/i,
    );
    await assert.rejects(
      qualifyNugetCandidate(nugetMetadataPath),
      /source|inventory|changed/i,
    );
  } finally {
    await fs.rm(addedProducerSource, { force: true });
  }
  records.push({ id: 'added-producer-source', status: 'passed' });
  await mutateFile(npmMetadataPath, async (bytes) => {
    const pointer = JSON.parse(bytes);
    pointer.kind = 'published';
    await fs.writeFile(npmMetadataPath, JSON.stringify(pointer));
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /anchor|pointer|candidate/i,
    );
  });
  records.push({ id: 'descriptor-tamper', status: 'passed' });
  const pointer = JSON.parse(await readPhysical(npmMetadataPath));
  await mutateFile(pointer.metadata, async (bytes) => {
    const changed = JSON.parse(bytes);
    changed.sourceIdentity.workingTreeSha256 = '0'.repeat(64);
    await fs.writeFile(pointer.metadata, JSON.stringify(changed));
    await assert.rejects(
      qualifyNpmCandidate(npmMetadataPath),
      /anchor|metadata|changed/i,
    );
  });
  records.push({ id: 'metadata-source-hash-tamper', status: 'passed' });
  for (const role of ['library', 'executable']) {
    const file = path.join(nuget.root, nuget.roles.fixture[role]);
    await mutateFile(file, async () => {
      await fs.writeFile(file, 'Substituted candidate role bytes');
      await assert.rejects(qualifyNugetCandidate(nugetMetadataPath));
    });
    records.push({ id: 'nuget-role-substitution.' + role, status: 'passed' });
  }
  assert.equal(
    nuget.restoreNegative?.status,
    'rejected',
    'Actual NuGet missing-feed usable-cache negative evidence required',
  );
  assert.match(
    (
      await readPhysical(path.join(nuget.root, nuget.restoreNegative.log))
    ).toString(),
    /NU1101|NU1102/,
    'NuGet negative must report actual missing candidate',
  );
  for (const [file, hash] of Object.entries(pointerHashes))
    assert.equal(
      digest(await readPhysical(file)),
      hash,
      'Candidate pointer changed during isolation checks',
    );
  assert.deepEqual(
    await sourceInventory(),
    beforeSources,
    'Repository source changed during isolation checks',
  );
  await qualifyNpmCandidate(npmMetadataPath);
  await qualifyNugetCandidate(nugetMetadataPath);
  const evidence = {
    schema: 1,
    kind: 'source-candidate-isolation',
    npmMetadataPath,
    nugetMetadataPath,
    candidateRevision: candidate.revision,
    records,
    nugetRestoreNegative: nuget.restoreNegative,
  };
  const output = path.join(parent, 'isolation-evidence.json');
  await fs.writeFile(output, JSON.stringify(evidence, null, 2), {
    flag: 'wx',
    mode: 0o444,
  });
  return { evidence: output, records: records.map((record) => record.id) };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = parseCandidateArguments(process.argv.slice(2));
    console.log(
      JSON.stringify(
        await checkCandidateConsumers(
          args.npmMetadataPath,
          args.nugetMetadataPath,
        ),
      ),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
