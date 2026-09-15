import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = ['sdk', 'langchain', 'cli'];
const marker = '.invoicing-local-b4.json';

/** Copy built local B4 entry packages while preserving their installed dependency graph. */
export async function linkLocalB4(sourceRoot, workspaceRoot) {
  const source = await realpath(sourceRoot);
  const destination = join(workspaceRoot, 'node_modules', '@b4run');
  const plans = [];
  // Validate every source and destination before replacing any package.
  for (const name of packages) {
    const from = join(source, 'packages', name);
    const to = join(destination, name);
    const manifest = JSON.parse(
      await readFile(join(from, 'package.json'), 'utf8'),
    );
    if (manifest.name !== `@b4run/${name}`)
      throw new Error(`Unexpected package: ${from}`);
    await readdir(join(from, 'dist'));
    await readdir(join(from, 'node_modules'));
    let current;
    try {
      current = await lstat(to);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current?.isSymbolicLink()) {
      if ((await realpath(to)) !== (await realpath(from)))
        throw new Error(`Refusing to replace unrelated symlink: ${to}`);
    } else if (current) {
      let previous;
      try {
        previous = JSON.parse(await readFile(join(to, marker), 'utf8'));
      } catch {
        /* An unmarked installed package belongs to the package manager. */
      }
      if (
        !current.isDirectory() ||
        previous?.owner !== 'invoicing-local-b4' ||
        previous?.package !== name
      )
        throw new Error(`Refusing to replace installed package: ${to}`);
    }
    const dependencies = [];
    for (const entry of await readdir(join(from, 'node_modules'))) {
      if (entry.startsWith('.')) continue;
      const names = entry.startsWith('@')
        ? (await readdir(join(from, 'node_modules', entry))).map(
            (child) => `${entry}/${child}`,
          )
        : [entry];
      for (const dependency of names) {
        const internal = packages.find(
          (item) => dependency === `@b4run/${item}`,
        );
        dependencies.push({
          name: dependency,
          target: internal
            ? join(destination, internal)
            : await realpath(join(from, 'node_modules', dependency)),
        });
      }
    }
    plans.push({ name, from, to, dependencies });
  }
  for (const { name, from, to, dependencies } of plans) {
    await rm(to, { recursive: true, force: true });
    await mkdir(to, { recursive: true });
    await cp(join(from, 'dist'), join(to, 'dist'), { recursive: true });
    await cp(join(from, 'package.json'), join(to, 'package.json'));
    for (const dependency of dependencies) {
      const link = join(to, 'node_modules', dependency.name);
      await mkdir(dirname(link), { recursive: true });
      await symlink(dependency.target, link, 'dir');
    }
    await writeFile(
      join(to, marker),
      JSON.stringify(
        { owner: 'invoicing-local-b4', package: name, source },
        null,
        2,
      ),
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv[2])
    throw new Error(
      'Usage: node samples/invoicing/server/link-local-b4.mjs /path/to/b4/worktree',
    );
  const workspace = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  await linkLocalB4(process.argv[2], workspace);
  console.log(
    'Prepared local @b4run/sdk, @b4run/langchain, and @b4run/cli without changing manifests or lockfiles.',
  );
}
