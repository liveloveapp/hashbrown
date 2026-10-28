import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';

// The recorder runs under plain tsx with no tsconfig paths, so its runtime
// import graph must not reach workspace packages such as @hashbrownai/core.
const valueImport =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

function moduleFile(from: string, specifier: string) {
  const base = resolve(dirname(from), specifier);
  return [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), base].find(
    (file) => existsSync(file) && file.match(/\.tsx?$/),
  );
}

function runtimePackages(entry: string) {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(
      valueImport,
    )) {
      if (specifier.startsWith('.')) {
        const next = moduleFile(file, specifier);
        if (next) pending.push(next);
      } else packages.add(specifier);
    }
  }
  return [...packages];
}

test('the recorder imports no workspace packages at runtime', () => {
  const entry = resolve(__dirname, '../src/tools/record-workbench.ts');

  const packages = runtimePackages(entry);

  expect(packages.filter((name) => name.startsWith('@hashbrownai/'))).toEqual(
    [],
  );
});
