import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/** Source root; external client builds never import this path. */
export const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
/** Repository root used only by explicit archive qualification/preparation tools. */
export const repository = path.resolve(sourceRoot, '../..');
/** Computes a byte identity with an explicit algorithm. */
export const digest = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
/** Runs a bounded explicit executable, recording output only in the owned logs directory. */
export async function run(
  command,
  args,
  root,
  environment,
  log,
  logRoot = root,
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  await fs.writeFile(path.join(logRoot, 'logs', log), output);
  assert.ok(
    !result.error && result.status === 0,
    `${path.basename(command)} failed; inspect owned logs/${log}.`,
  );
  return result.stdout;
}
/** Lists physical source files without build outputs, caches or local configuration. */
export async function inventory(directory, base = directory) {
  const result = {};
  for (const entry of (
    await fs.readdir(directory, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    if (
      ['bin', 'obj', 'node_modules', 'dist', '.env', '.git'].includes(
        entry.name,
      )
    )
      continue;
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Source symlinks are forbidden.');
    if (entry.isDirectory()) Object.assign(result, await inventory(file, base));
    else result[path.relative(base, file)] = digest(await fs.readFile(file));
  }
  return result;
}
/** Parses explicit key=value options and rejects duplicate or unknown options. */
export function options(args, allowed) {
  const result = {};
  for (const arg of args) {
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    assert.ok(
      match && allowed.includes(match[1]) && !Object.hasOwn(result, match[1]),
      `Unexpected or duplicate option: ${arg}`,
    );
    result[match[1]] = match[2];
  }
  return result;
}
/** Writes a fresh immutable metadata anchor; existing selections cannot be overwritten. */
export async function writePointer(pointer, metadata) {
  assert.ok(
    path.isAbsolute(pointer) && path.resolve(pointer) === pointer,
    'Absolute fresh metadata pointer required.',
  );
  await fs.mkdir(path.dirname(pointer), { recursive: true });
  assert.equal(
    await fs.realpath(path.dirname(pointer)),
    path.dirname(pointer),
    'Pointer parent aliases forbidden.',
  );
  const data = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
  await fs.writeFile(pointer, data, { flag: 'wx' });
  await fs.writeFile(pointer + '.sha256', digest(data) + '\n', { flag: 'wx' });
}
