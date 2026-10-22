#!/usr/bin/env node
// Delete one provider's recorded fixtures before re-recording them.
//
// Usage: clear-recordings.mjs <file-name> [--slug-prefix <p>]
//          [--exclude-slug-prefix <p>] [--root <dir>] [--dry-run]
//
// Removes `<root>/<slug>/<file-name>` for every slug directory that matches,
// then drops slug directories left empty. Prints the removed (or, with
// --dry-run, would-be removed) paths relative to the root, one per line.
import { existsSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const valueFlags = ['--slug-prefix', '--exclude-slug-prefix', '--root'];
const fileName = args.find(
  (arg, index) =>
    !arg.startsWith('--') && !valueFlags.includes(args[index - 1] ?? ''),
);
if (!fileName) {
  console.error(
    'Usage: clear-recordings.mjs <file-name> [--slug-prefix <p>] ' +
      '[--exclude-slug-prefix <p>] [--root <dir>] [--dry-run]',
  );
  process.exit(2);
}

const root = resolve(option('--root') ?? join(here, 'fixtures', 'recorded'));
const slugPrefix = option('--slug-prefix');
const excludePrefix = option('--exclude-slug-prefix');
const dryRun = args.includes('--dry-run');

const slugs = existsSync(root)
  ? readdirSync(root).filter((entry) =>
      statSync(join(root, entry)).isDirectory(),
    )
  : [];

for (const slug of slugs) {
  if (slugPrefix && !slug.startsWith(slugPrefix)) continue;
  if (excludePrefix && slug.startsWith(excludePrefix)) continue;
  const file = join(root, slug, fileName);
  if (!existsSync(file)) continue;
  console.log(`${slug}/${fileName}`);
  if (dryRun) continue;
  rmSync(file);
  if (readdirSync(join(root, slug)).length === 0) rmdirSync(join(root, slug));
}
