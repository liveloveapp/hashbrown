import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24)
  throw new Error('Marketing requires Node 24 or newer');

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const pinned: string | undefined = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
).dependencies?.['@b4run/cli'];
if (!pinned)
  throw new Error('@b4run/cli is not pinned in the root package.json');

const metadataPath = resolve(repoRoot, 'node_modules/@b4run/cli/package.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as {
  version: string;
  bin: string | Record<string, string>;
};
if (metadata.version !== pinned)
  throw new Error(
    `Expected @b4run/cli ${pinned}, resolved ${metadata.version}`,
  );

const bin =
  typeof metadata.bin === 'string' ? metadata.bin : metadata.bin['b4'];
const cli = resolve(dirname(metadataPath), bin);
const result = spawnSync(
  process.execPath,
  [cli, ...process.argv.slice(2), '--cwd', appRoot],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
