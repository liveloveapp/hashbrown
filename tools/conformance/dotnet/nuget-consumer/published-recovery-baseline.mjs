import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  readArchive,
  buildEnvironment,
  hashFile,
  verifyConsumer,
} from './verify.mjs';
import { sanitize } from './run.mjs';

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const revision = 'df1340f713d3b65165a494eb09e53246298df858';
const origin = 'https://github.com/liveloveapp/hashbrown.git';
const signedSha =
  '288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57';
const dllSha =
  '37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2';
const packageName = 'Hashbrown.AspNetCore.0.1.0-preview.1';
const pins = {
  [`${packageName}.nupkg`]: {
    bytes: 236816,
    sha256: '0d0116c35045ad64243e82cf8eecd89bb98d6532ff94042ddce6d51d3e1d1647',
    entries: [
      '_rels/.rels',
      'Hashbrown.AspNetCore.nuspec',
      'LICENSE',
      'README.md',
      'lib/net10.0/Hashbrown.AspNetCore.dll',
      'lib/net10.0/Hashbrown.AspNetCore.xml',
      '[Content_Types].xml',
      'package/services/metadata/core-properties/nuget.psmdcp',
    ],
  },
  [`${packageName}.snupkg`]: {
    bytes: 60682,
    sha256: 'd8b34b750f7edcc932d88540ea8b0ab8ae89a00cbc91d3093ba6658c4e4c140a',
    entries: [
      '_rels/.rels',
      'Hashbrown.AspNetCore.nuspec',
      'lib/net10.0/Hashbrown.AspNetCore.pdb',
      '[Content_Types].xml',
      'package/services/metadata/core-properties/nuget.psmdcp',
    ],
  },
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Verifies original own-release bytes, fixed provenance and exact inventories before any registry or consumer work. */
export async function verifyPublishedRecoveryBaseline(directory) {
  try {
    const provenancePath = path.join(directory, 'provenance.json');
    assert.ok(
      (await fs.lstat(provenancePath)).isFile() &&
        !(await fs.lstat(provenancePath)).isSymbolicLink(),
    );
    const provenance = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
    assert.equal(provenance.schema, 1);
    assert.equal(provenance.id, 'Hashbrown.AspNetCore');
    assert.equal(provenance.version, '0.1.0-preview.1');
    assert.equal(provenance.producerRevision, revision);
    assert.equal(provenance.signedPublicArchiveSha256, signedSha);
    assert.equal(provenance.runtimeDllSha256, dllSha);
    assert.deepEqual(provenance.files, pins);
    for (const [name, pin] of Object.entries(pins)) {
      const file = path.join(directory, name);
      const stat = await fs.lstat(file);
      assert.ok(stat.isFile() && !stat.isSymbolicLink());
      assert.equal(stat.size, pin.bytes);
      const bytes = await fs.readFile(file);
      assert.equal(digest(bytes), pin.sha256);
      const entries = readArchive(bytes);
      assert.deepEqual(Object.keys(entries).sort(), [...pin.entries].sort());
      const nuspec = entries['Hashbrown.AspNetCore.nuspec'].toString('utf8');
      assert.ok(
        nuspec.includes('<id>Hashbrown.AspNetCore</id>') &&
          nuspec.includes('<version>0.1.0-preview.1</version>') &&
          nuspec.includes(`commit="${revision}"`),
      );
      if (name.endsWith('.nupkg'))
        assert.equal(
          digest(entries['lib/net10.0/Hashbrown.AspNetCore.dll']),
          dllSha,
        );
    }
    return { ...provenance, provenanceSha256: await hashFile(provenancePath) };
  } catch (error) {
    throw new Error(
      'PUBLISHED_BASELINE_INTEGRITY: immutable original archive/provenance mismatch',
      { cause: error },
    );
  }
}

/** Copies already-installed builder tooling as regular files; no consumer dependency or workspace alias is introduced. */
async function copyTooling(source, destination) {
  const stat = await fs.lstat(source);
  assert.ok(
    !stat.isSymbolicLink(),
    'Published baseline tooling symlink refused',
  );
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const file of await fs.readdir(source))
      await copyTooling(path.join(source, file), path.join(destination, file));
  } else {
    assert.ok(stat.isFile(), 'Published baseline tooling must be regular');
    await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

/** Extracts one final structured absolute-path result without treating log text as instructions. */
function finalRecord(output, field) {
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line);
      if (typeof value[field] === 'string' && path.isAbsolute(value[field]))
        return value;
    } catch {
      /* Earlier child progress is not a result record. */
    }
  }
  throw new Error(`Published baseline is missing ${field}`);
}

/** Prepares a separate pinned public consumer using the unchanged original producer and committed original archives. */
export async function preparePublishedRecoveryBaseline(evidenceDirectory) {
  assert.ok(
    path.isAbsolute(evidenceDirectory),
    'Absolute private baseline evidence directory required',
  );
  const originals = path.join(
    repository,
    'tools/conformance/dotnet/published-baselines/0.1.0-preview.1',
  );
  const provenance = await verifyPublishedRecoveryBaseline(originals);
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-published-recovery-')),
  );
  const producer = path.join(root, 'producer');
  const environment = buildEnvironment(process.env, path.join(root, 'builder'));
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(path.join(root, 'builder'), { recursive: true });
  const receipts = [];
  async function run(
    name,
    command,
    args,
    cwd,
    values = environment,
    timeout = 600_000,
  ) {
    const started = Date.now();
    let result;
    try {
      result = await execute(command, args, {
        cwd,
        env: values,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      });
      receipts.push({ name, status: 0, milliseconds: Date.now() - started });
      await fs.writeFile(
        path.join(evidenceDirectory, `${name}.log`),
        sanitize(result.stdout + result.stderr),
      );
      return result.stdout;
    } catch (error) {
      receipts.push({
        name,
        status: error.code ?? 'failed',
        milliseconds: Date.now() - started,
      });
      await fs.writeFile(
        path.join(evidenceDirectory, `${name}.log`),
        sanitize(
          `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`,
        ),
      );
      throw error;
    } finally {
      await fs.writeFile(
        path.join(evidenceDirectory, 'substeps.json'),
        JSON.stringify(receipts, null, 2),
      );
    }
  }
  await run(
    'clone',
    'git',
    ['clone', '--no-hardlinks', '--no-checkout', repository, producer],
    root,
  );
  await run('checkout', 'git', ['checkout', '--detach', revision], producer);
  await run('origin', 'git', ['remote', 'set-url', 'origin', origin], producer);
  assert.equal(
    (await run('head', 'git', ['rev-parse', 'HEAD'], producer)).trim(),
    revision,
  );
  assert.equal(
    (
      await run(
        'origin-check',
        'git',
        ['remote', 'get-url', 'origin'],
        producer,
      )
    ).trim(),
    origin,
  );
  assert.equal(
    (
      await run(
        'clean-before',
        'git',
        ['status', '--porcelain', '--untracked-files=no'],
        producer,
      )
    ).trim(),
    '',
  );
  const packageDirectory = path.join(producer, 'packages/dotnet');
  assert.equal(
    (await run('sdk', 'dotnet', ['--version'], packageDirectory)).trim(),
    '10.0.402',
    'Historical helper SDK must be exactly 10.0.402',
  );
  const tooling = path.join(repository, 'node_modules/typescript');
  assert.equal(
    JSON.parse(await fs.readFile(path.join(tooling, 'package.json'), 'utf8'))
      .version,
    '6.0.3',
  );
  await copyTooling(tooling, path.join(producer, 'node_modules/typescript'));
  const qualification = path.join(root, 'originals');
  await fs.mkdir(qualification);
  for (const name of Object.keys(pins))
    await fs.copyFile(
      path.join(originals, name),
      path.join(qualification, name),
      fs.constants.COPYFILE_EXCL,
    );
  const downloaded = finalRecord(
    await run(
      'public-download',
      process.execPath,
      [
        path.join(producer, 'scripts/nuget-release.mjs'),
        'download-public',
        path.join(root, 'signed'),
      ],
      packageDirectory,
    ),
    'archive',
  );
  assert.equal(
    await hashFile(downloaded.archive),
    signedSha,
    'Exact official signed preview1 archive required',
  );
  const nuget = path.join(root, 'published.json');
  await run(
    'public-import',
    process.execPath,
    [
      path.join(
        producer,
        'tools/conformance/dotnet/nuget-consumer/prepare.mjs',
      ),
      '--metadata',
      nuget,
      '--published-archive',
      downloaded.archive,
      '--qualified-archive',
      path.join(qualification, `${packageName}.nupkg`),
    ],
    packageDirectory,
  );
  await run(
    'public-qualification',
    process.execPath,
    [
      path.join(
        producer,
        'tools/conformance/dotnet/nuget-consumer/qualify.mjs',
      ),
      '--metadata',
      nuget,
    ],
    packageDirectory,
  );
  const pointer = JSON.parse(await fs.readFile(nuget, 'utf8'));
  const metadata = await verifyConsumer(pointer);
  assert.equal(metadata.loaded.sha256, dllSha);
  assert.equal(metadata.revision, revision);
  assert.equal(metadata.published.signatureVerification, 'passed');
  // The npm parent must be a sibling of the producer root, never its ancestor.
  const npmParent = await fs.realpath(
    await fs.mkdtemp(
      path.join(os.tmpdir(), 'hashbrown-published-recovery-npm-'),
    ),
  );
  await fs.writeFile(
    path.join(evidenceDirectory, 'npm-owner.json'),
    JSON.stringify({ npmParent, producer, baselineRoot: root }, null, 2),
  );
  const npm = finalRecord(
    await run(
      'npm-prepare',
      process.execPath,
      [
        path.join(
          producer,
          'tools/conformance/dotnet/live-consumer/prepare.mjs',
        ),
        '--directory',
        npmParent,
      ],
      packageDirectory,
    ),
    'metadataPath',
  ).metadataPath;
  await run(
    'npm-qualification',
    process.execPath,
    [
      path.join(producer, 'tools/conformance/dotnet/live-consumer/qualify.mjs'),
      npm,
    ],
    packageDirectory,
  );
  assert.equal(
    (
      await run(
        'clean-after',
        'git',
        ['status', '--porcelain', '--untracked-files=no'],
        producer,
      )
    ).trim(),
    '',
  );
  await verifyPublishedRecoveryBaseline(originals);
  const result = {
    root,
    producer,
    revision,
    provenance,
    nuget,
    nugetSha256: await hashFile(nuget),
    npm,
    npmParent,
    npmRoot: path.dirname(npm),
    npmSha256: await hashFile(npm),
    loaded: metadata.loaded,
    receipts,
  };
  await fs.writeFile(
    path.join(evidenceDirectory, 'baseline.json'),
    JSON.stringify(result, null, 2),
  );
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(await preparePublishedRecoveryBaseline(process.argv[2])),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
