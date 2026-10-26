import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareConsumer } from './prepare.mjs';
import { verifyConsumer } from './verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const digest = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');

/** Revalidates installed origins and every executable/source hash before reusing an existing build. */
export async function qualifyConsumer(metadataPath) {
  if (!metadataPath) return prepareConsumer();
  const previous = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  if (path.resolve(previous.metadataPath) !== path.resolve(metadataPath))
    throw Error('LIVE_CONSUMER_INVALID');
  const current = await verifyConsumer(previous.directory, repository, {
    persist: false,
  });
  for (const key of [
    'sources',
    'templates',
    'bundles',
    'packages',
    'moduleOrigins',
    'installation',
  ])
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key]))
      throw Error('LIVE_CONSUMER_CHANGED');
  for (const file of ['package.json', 'package-lock.json', 'verify.mjs'])
    if (
      (await digest(path.join(here, file))) !==
      (await digest(path.join(previous.directory, file)))
    )
      throw Error('LIVE_CONSUMER_STALE');
  for (const [file, hash] of Object.entries(current.templates))
    if ((await digest(path.join(here, 'templates', file))) !== hash)
      throw Error('LIVE_CONSUMER_STALE');
  const generated = {
    'react/src/app.tsx': 'react-app.tsx',
    'react/src/main.tsx': 'react-main.tsx',
    'angular/src/app/app.ts': 'angular-app.ts',
    'angular/src/main.ts': 'angular-main.ts',
  };
  for (const [file, hash] of Object.entries(current.sources)) {
    const source = generated[file]
      ? path.join(here, 'templates', generated[file])
      : path.join(repository, 'tools/conformance/hosts', file);
    if ((await digest(source)) !== hash) throw Error('LIVE_CONSUMER_STALE');
  }
  return current;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const metadata = await qualifyConsumer(process.argv[2]);
    console.log(
      JSON.stringify({
        metadataPath: metadata.metadataPath,
        artifacts: metadata.artifacts,
      }),
    );
  } catch {
    console.error('LIVE_CONSUMER_FAILED');
    process.exitCode = 1;
  }
}
