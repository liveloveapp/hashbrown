import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  IDENTITY,
  listSourceFiles,
} from '../tools/conformance/dotnet/nuget-consumer/verify.mjs';

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const phaseNames = [
  'candidate',
  'npm',
  'initial-qualification',
  'docs',
  'upgrade',
  'matrix',
  'regressions',
  'final-qualification',
  'final-npm-qualification',
];
const normalize = (rows) => rows.map((row) => JSON.stringify(row)).sort();

/** Reads bounded regular files without following evidence symlinks. */
async function readFile(root, relative) {
  assert.ok(
    !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'),
    'Relative evidence path required',
  );
  let target = root;
  for (const component of relative.split('/')) {
    target = path.join(target, component);
    assert.ok(
      !(await fs.lstat(target)).isSymbolicLink(),
      'Symlink evidence forbidden',
    );
  }
  const stat = await fs.lstat(target);
  assert.ok(
    stat.isFile() && stat.size <= 32 * 1024 * 1024,
    'Bounded regular evidence required',
  );
  return fs.readFile(target);
}

/** Reads parsed bounded evidence without admitting links. */
async function readJson(root, relative) {
  return JSON.parse((await readFile(root, relative)).toString());
}

/** Selects exactly one acceptance bundle and rejects all linked artifact entries. */
export async function selectReleaseBundle(root) {
  const bundles = [];
  let visited = 0;
  const walk = async (directory) => {
    const stat = await fs.lstat(directory);
    assert.ok(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Artifact directory cannot be linked',
    );
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert.ok(++visited <= 20000, 'Artifact tree exceeds release bound');
      assert.ok(!entry.isSymbolicLink(), 'Symlink evidence forbidden');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name));
      else if (entry.name === 'acceptance.json') bundles.push(directory);
    }
  };
  await walk(root);
  assert.equal(bundles.length, 1, 'Exactly one acceptance bundle required');
  return bundles[0];
}

/** Defines the six original authoritative-deadline regression identities. */
function regressionIdentities() {
  return ['react', 'angular'].flatMap((framework) =>
    ['browser-held', 'browser-held-slow', 'browser-held-hung'].map((mode) => [
      framework,
      'native-approval.spec.ts',
      `genuine native approval browser ${mode} ${mode === 'browser-held-hung' ? 'aborts at the authoritative deadline without a successful terminal' : 'accepts successful terminal before HTTP EOF and rejects damaged captures'}`,
    ]),
  );
}

/** Requires unique exact identities rather than accepting equal scenario counts. */
function exactIdentities(actual, expected) {
  assert.equal(
    new Set(normalize(actual)).size,
    actual.length,
    'Duplicate case identities',
  );
  assert.equal(
    new Set(normalize(expected)).size,
    expected.length,
    'Duplicate golden identities',
  );
  assert.deepEqual(
    normalize(actual),
    normalize(expected),
    'Case identities differ from golden',
  );
}

/** Revalidates the full immutable sanitized acceptance proof before OIDC or public verification. */
export async function validateReleaseProof(
  directory,
  { revision, sources, golden, expectedArchiveSha256, expectedSymbolsSha256 },
) {
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(
    await selectReleaseBundle(directory),
    directory,
    'Acceptance proof must be at selected root',
  );
  const report = await readJson(directory, 'acceptance.json');
  assert.equal(report.schema, 1);
  assert.equal(report.profile, 'full', 'Only full acceptance may publish');
  assert.equal(report.status, 'passed');
  assert.equal(report.packInvocations, 1);
  assert.equal(report.npmPreparations, 1);
  assert.deepEqual(report.exportErrors, []);
  assert.deepEqual(
    report.phases.map((row) => row.name),
    phaseNames,
  );
  assert.ok(
    report.phases.every((row) => row.status === 0),
    'Every phase must pass',
  );
  assert.equal(report.documentationPrograms, 32);
  const provenance = await readJson(directory, 'candidate-provenance.json');
  assert.equal(
    provenance.revision,
    revision,
    'Candidate revision differs from dispatch SHA',
  );
  assert.deepEqual(provenance.identity, IDENTITY);
  assert.deepEqual(
    provenance.sources,
    sources,
    'Source manifest differs from exact Git revision',
  );
  const descriptorSha256 = digest(await readFile(directory, 'candidate.json'));
  assert.equal(
    report.candidate.descriptorSha256,
    descriptorSha256,
    'Candidate descriptor differs',
  );
  const archive = `${IDENTITY.id}.${IDENTITY.version}.nupkg`;
  const symbols = archive.replace('.nupkg', '.snupkg');
  assert.deepEqual(
    Object.keys(report.archives).sort(),
    [archive, symbols].sort(),
    'Exact release archives required',
  );
  const actualArchives = (await fs.readdir(directory)).filter((name) =>
    /\.(?:nupkg|snupkg)$/i.test(name),
  );
  assert.deepEqual(
    actualArchives.sort(),
    [archive, symbols].sort(),
    'Ambiguous release archives',
  );
  assert.equal(provenance.archive, 'candidate-feed/' + archive);
  assert.equal(report.candidate.archive, provenance.archive);
  const archiveSha256 = digest(await readFile(directory, archive));
  const symbolsSha256 = digest(await readFile(directory, symbols));
  for (const [name, hash] of [
    [archive, archiveSha256],
    [symbols, symbolsSha256],
  ]) {
    assert.equal(
      report.archives[name],
      hash,
      'Archive hash differs from proof',
    );
    assert.equal(
      provenance.files['candidate-feed/' + name],
      hash,
      'Archive hash differs from source provenance',
    );
  }
  assert.equal(provenance.sha256, archiveSha256);
  assert.equal(report.candidate.sha256, archiveSha256);
  if (expectedArchiveSha256 !== undefined)
    assert.equal(
      archiveSha256,
      expectedArchiveSha256,
      'Archive differs from qualification job output',
    );
  if (expectedSymbolsSha256 !== undefined)
    assert.equal(
      symbolsSha256,
      expectedSymbolsSha256,
      'Symbols differ from qualification job output',
    );
  assert.equal(golden.length, 664, 'Full original golden required');
  for (const [kind, expected] of [
    ['matrix', golden],
    ['regressions', regressionIdentities()],
  ]) {
    const file = `browser/${kind}-outcomes.json`;
    const result = await readJson(directory, file);
    assert.equal(report.outcomes[kind].count, expected.length);
    assert.equal(
      report.outcomes[kind].sha256,
      digest(await readFile(directory, file)),
    );
    assert.equal(result.status, 'passed');
    assert.equal(result.descriptor, descriptorSha256);
    assert.equal(result.npmMetadata, report.npm.metadataPath);
    exactIdentities(result.expected, expected);
    exactIdentities(
      result.outcomes.map((row) => row.identity),
      expected,
    );
    assert.ok(
      result.outcomes.every(
        (row) =>
          row.status === 'passed' &&
          row.expectedStatus === 'passed' &&
          row.retry === 0 &&
          Array.isArray(row.errors) &&
          row.errors.length === 0,
      ),
      'Every outcome must pass without errors or retry',
    );
    assert.deepEqual(result.diagnostics, []);
  }
  const docs = (await fs.readdir(directory)).filter((name) =>
    name.startsWith('docs-'),
  );
  assert.equal(docs.length, 1, 'One shared documentation consumer required');
  const declared = await readJson(
    directory,
    `${docs[0]}/declared-programs.json`,
  );
  assert.equal(declared.length, 32);
  for (let index = 0; index < 32; index++) {
    const result = await readJson(
      directory,
      `${docs[0]}/qualified-${index}.json`,
    );
    assert.match(declared[index].sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.candidateSha256, archiveSha256);
    assert.equal(result.sourceSha256, declared[index].sourceSha256);
  }
  assert.equal(
    (await readJson(directory, 'upgrade/qualification.json')).status,
    0,
    'Historical upgrade must pass',
  );
  return Object.freeze({
    archive,
    symbols,
    archiveSha256,
    symbolsSha256,
    proofDirectory: path.basename(directory),
  });
}

/** Requires completed successful PR/Main CI for this exact main dispatch revision and workflow. */
export function assertSuccessfulMainCI(runs, revision) {
  assert.ok(
    runs.some(
      (run) =>
        run.path === '.github/workflows/pr-main.yml' &&
        run.head_sha === revision &&
        run.head_branch === 'main' &&
        ['push', 'workflow_dispatch'].includes(run.event) &&
        run.status === 'completed' &&
        run.conclusion === 'success',
    ),
    'Successful exact-SHA PR/Main CI on main is required',
  );
}

/** Polls the exact public package and gallery owners with bounded anonymous requests into a fresh root. */
export async function downloadPublicPackage({
  directory,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 40,
}) {
  assert.ok(Number.isInteger(attempts) && attempts > 0 && attempts <= 40);
  await fs.mkdir(directory, { recursive: false });
  const id = IDENTITY.id.toLowerCase();
  const url = `https://api.nuget.org/v3-flatcontainer/${id}/${IDENTITY.version}/${id}.${IDENTITY.version}.nupkg`;
  const galleryUrl = `https://www.nuget.org/packages/${IDENTITY.id}/${IDENTITY.version}`;
  let last = 'Public package not indexed';
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
        redirect: 'error',
      });
      if (!response.ok) throw Error(`Public download HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(
        bytes.length > 0 && bytes.length <= 32 * 1024 * 1024,
        'Public package exceeds bounds',
      );
      const gallery = await fetchImpl(galleryUrl, {
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
        redirect: 'error',
      });
      assert.ok(gallery.ok, `Gallery HTTP ${gallery.status}`);
      const html = await gallery.text();
      assert.ok(
        html.length <= 4 * 1024 * 1024,
        'Gallery response exceeds bounds',
      );
      const ownerLists = [
        ...html.matchAll(
          /<ul\b[^>]*class=["'][^"']*\bowner-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi,
        ),
      ];
      assert.equal(ownerLists.length, 1, 'Gallery owner list required');
      const owners = [
        ...new Set(
          [
            ...ownerLists[0][1].matchAll(
              /<a\b[^>]*href=["']\/profiles\/([a-z0-9_.-]+)["'][^>]*>/gi,
            ),
          ].map((match) => match[1].toLowerCase()),
        ),
      ].sort();
      assert.ok(
        owners.includes('liveloveapp'),
        'Public NuGet package must be owned by liveloveapp',
      );
      const archive = path.join(
        directory,
        `${IDENTITY.id}.${IDENTITY.version}.nupkg`,
      );
      await fs.writeFile(archive, bytes, { flag: 'wx', mode: 0o444 });
      const record = {
        url,
        galleryUrl,
        owners,
        rawSha256: digest(bytes),
        bytes: bytes.length,
        archive,
        downloaded: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(directory, 'public-download.json'),
        JSON.stringify(record, null, 2) + '\n',
        { flag: 'wx' },
      );
      return record;
    } catch (error) {
      last = error.message;
      if (attempt + 1 < attempts) await sleep(15000);
    }
  }
  throw Error(
    `Public NuGet availability/ownership verification exhausted: ${last}`,
  );
}

/** Computes the current source closure from immutable Git objects rather than trusting artifact counts. */
async function sourceManifest(revision) {
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    revision,
    'Checkout must match dispatch revision',
  );
  return Object.fromEntries(
    await Promise.all(
      (await listSourceFiles(repository)).map(async (name) => [
        name,
        digest(
          execFileSync('git', ['show', `${revision}:${name}`], {
            cwd: repository,
            maxBuffer: 32 * 1024 * 1024,
          }),
        ),
      ]),
    ),
  );
}

/** Runs the closed release commands used by the manual workflow; credentials never enter evidence. */
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const revision = process.env.GITHUB_SHA;
  if (command === 'require-ci') {
    assert.equal(args.length, 1);
    assertSuccessfulMainCI(
      JSON.parse(await fs.readFile(args[0], 'utf8')).workflow_runs,
      revision,
    );
    return;
  }
  if (command === 'download-public') {
    assert.equal(args.length, 1);
    const record = await downloadPublicPackage({
      directory: path.resolve(args[0]),
    });
    if (process.env.GITHUB_OUTPUT)
      await fs.appendFile(
        process.env.GITHUB_OUTPUT,
        `archive=${record.archive}\n`,
      );
    console.log(JSON.stringify(record));
    return;
  }
  assert.equal(command, 'validate', 'Unknown release command');
  assert.equal(args.length, 1);
  const root = path.resolve(args[0]);
  const directory = await selectReleaseBundle(root);
  const result = await validateReleaseProof(directory, {
    revision,
    sources: await sourceManifest(revision),
    golden: JSON.parse(
      await fs.readFile(
        path.join(
          repository,
          'tools/conformance/dotnet/tests/fixtures/package-identities.json',
        ),
        'utf8',
      ),
    ).identities,
    expectedArchiveSha256: process.env.EXPECTED_ARCHIVE_SHA256,
    expectedSymbolsSha256: process.env.EXPECTED_SYMBOLS_SHA256,
  });
  const proofDirectory = path.relative(root, directory) || '.';
  assert.match(
    proofDirectory,
    /^(?:\.|[a-zA-Z0-9_-]+)$/,
    'Safe proof directory required',
  );
  const outputs = {
    ...result,
    proofDirectory,
    archive: path.posix.join(proofDirectory, result.archive),
    symbols: path.posix.join(proofDirectory, result.symbols),
  };
  if (process.env.GITHUB_OUTPUT)
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  console.log(JSON.stringify(outputs));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
