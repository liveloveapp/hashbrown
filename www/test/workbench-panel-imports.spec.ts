import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';

// The panel's client half ships to the browser, so its runtime import graph
// (static and dynamic) must not pull in the video catalog or lesson tables.
const valueImport =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function moduleFile(from: string, specifier: string) {
  const base = specifier.startsWith('@/')
    ? resolve(__dirname, '../src', specifier.slice(2))
    : resolve(dirname(from), specifier);
  return [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), base].find(
    (file) => existsSync(file) && file.match(/\.tsx?$/),
  );
}

function runtimeModules(entry: string) {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, specifier] of [
      ...text.matchAll(valueImport),
      ...text.matchAll(dynamicImport),
    ]) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const next = moduleFile(file, specifier);
      if (next) pending.push(next);
    }
  }
  return [...seen].map((file) => relative(resolve(__dirname, '..'), file));
}

const workbench = (name: string) =>
  resolve(__dirname, '../src/components/workbench', name);

test('the client workbench panel imports no video catalog or lesson tables at runtime', () => {
  const entry = workbench('WorkbenchPanelLoader.tsx');

  const modules = runtimeModules(entry);

  expect(modules).toContain(
    'src/components/workbench/WorkbenchPanelClient.tsx',
  );
  expect(
    modules.filter((file) =>
      /docs-demo-media|DocsDemoVideo|workbench-lessons/.test(file),
    ),
  ).toEqual([]);
});

test('the server panel reaches the client panel only through the lazy loader', () => {
  const read = (name: string) => readFileSync(workbench(name), 'utf8');

  const server = read('WorkbenchPanel.tsx');
  const loader = read('WorkbenchPanelLoader.tsx');
  const client = read('WorkbenchPanelClient.tsx');

  expect(server.startsWith("'use client'")).toBe(false);
  expect(server).toContain("from './WorkbenchPanelLoader'");
  expect(server).not.toContain("from './WorkbenchPanelClient'");
  expect(loader.startsWith("'use client'")).toBe(true);
  expect(loader).toContain("import('./WorkbenchPanelClient')");
  expect(client.startsWith("'use client'")).toBe(true);
});
