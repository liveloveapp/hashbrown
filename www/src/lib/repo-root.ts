import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Find the monorepo root by walking up from `start` to the directory holding
 * `nx.json`. Next builds run from `www` and tests from the repo root, so
 * a fixed relative path would be wrong in one of them.
 *
 * @param start - Directory to start from; defaults to the working directory.
 */
export function repoRoot(start: string = process.cwd()): string {
  let dir = start;
  while (!existsSync(join(dir, 'nx.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No nx.json above ${start}`);
    }
    dir = parent;
  }
  return dir;
}
