import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, verifyConsumer } from './verify.mjs';
import { run } from './prepare.mjs';

/** Checks the independent pointer anchor and all immutable provenance before and after a real public smoke. */
export async function qualifyConsumer(pointerPath, launch = run) {
  assert.ok(
    path.isAbsolute(pointerPath),
    '--metadata must be an absolute pointer path',
  );
  assert.ok(
    !(await fs.lstat(pointerPath)).isSymbolicLink(),
    'Pointer symlink escape',
  );
  const pointerHash = await hashFile(pointerPath);
  assert.equal(
    pointerHash,
    (await fs.readFile(pointerPath + '.sha256', 'utf8')).trim(),
    'Pointer anchor differs',
  );
  const pointer = JSON.parse(await fs.readFile(pointerPath, 'utf8'));
  const metadata = await verifyConsumer(pointer);
  const output = await launch(
    'dotnet',
    [path.join(metadata.root, 'app/bin/Release/net10.0/Consumer.dll')],
    metadata.root,
    metadata.environment,
    path.join(metadata.root, 'logs/qualification-smoke.log'),
  );
  const loaded = JSON.parse(output.trim().split('\n').at(-1));
  assert.deepEqual(
    loaded,
    metadata.loaded,
    'Runtime loaded identity or public smoke proof changed',
  );
  await verifyConsumer(pointer);
  assert.equal(
    await hashFile(pointerPath),
    pointerHash,
    'Pointer changed during qualification',
  );
  assert.equal(
    (await fs.readFile(pointerPath + '.sha256', 'utf8')).trim(),
    pointerHash,
    'Pointer anchor changed during qualification',
  );
  return {
    qualified: true,
    root: metadata.root,
    candidate: metadata.archive,
    sha256: metadata.sha256,
    sha512: metadata.sha512,
    revision: metadata.revision,
    loaded,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf('--metadata');
  const pointerPath =
    index >= 0
      ? process.argv[index + 1]
      : process.argv
          .find((arg) => arg.startsWith('--metadata='))
          ?.slice('--metadata='.length);
  try {
    console.log(JSON.stringify(await qualifyConsumer(pointerPath)));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
