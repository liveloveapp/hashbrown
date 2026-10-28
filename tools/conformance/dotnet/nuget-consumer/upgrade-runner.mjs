import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qualifyConsumer } from './qualify.mjs';
import { prepareBaseline } from './prepare-baseline.mjs';
import { hashFile, verifyConsumer } from './verify.mjs';

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** Qualifies both sides of a real immutable-source to packaged-host PostgreSQL upgrade. */
export async function runUpgrade(args = process.argv.slice(2)) {
  let pointerPath;
  let archive;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--metadata') pointerPath = args[++index];
    else if (arg.startsWith('--metadata='))
      pointerPath = arg.slice('--metadata='.length);
    else if (arg === '--baseline-archive') archive = args[++index];
    else if (arg.startsWith('--baseline-archive='))
      archive = arg.slice('--baseline-archive='.length);
    else throw Error(`Unexpected upgrade argument: ${arg}`);
  }
  assert.ok(
    pointerPath && path.isAbsolute(pointerPath),
    'Explicit candidate pointer required',
  );
  const expected = await hashFile(pointerPath);
  const before = await qualifyConsumer(pointerPath);
  const metadata = await verifyConsumer(
    JSON.parse(await fs.readFile(pointerPath, 'utf8')),
  );
  const historical = await prepareBaseline(metadata, archive);
  const directory =
    process.env.HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY ??
    path.join(metadata.root, 'upgrade');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'preparation.json'),
    JSON.stringify({ before, historical }, null, 2) + '\n',
  );
  const status = await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repository, 'node_modules/jest/bin/jest.js'),
        '--config',
        'tools/conformance/dotnet/jest.config.ts',
        '--runInBand',
        '--testPathPatterns=package-upgrade',
      ],
      {
        cwd: repository,
        stdio: 'inherit',
        env: {
          ...process.env,
          HASHBROWN_DOTNET_HOST_MODE: 'package',
          HASHBROWN_DOTNET_CONSUMER_METADATA: pointerPath,
          HASHBROWN_DOTNET_CONSUMER_SHA256: expected,
          HASHBROWN_PACKAGE_REACT_URL: 'http://127.0.0.1:4431',
          HASHBROWN_PACKAGE_ANGULAR_URL: 'http://127.0.0.1:4432',
          HASHBROWN_UPGRADE_HISTORICAL: JSON.stringify(historical),
          HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY: directory,
          HASHBROWN_PACKAGE_SPAWN_REPORT: path.join(directory, 'spawns.jsonl'),
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => accept(code ?? 1));
  });
  const after = await qualifyConsumer(pointerPath);
  assert.equal(
    await hashFile(pointerPath),
    expected,
    'Candidate pointer changed during upgrade',
  );
  await fs.writeFile(
    path.join(directory, 'qualification.json'),
    JSON.stringify({ before, after, status }, null, 2) + '\n',
  );
  assert.equal(status, 0, 'Real old-to-package upgrade failed');
  return { directory, before, after, historical };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await runUpgrade()));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
