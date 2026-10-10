import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

/**
 * LiveLoveApp's design rules, the subset a source scan can check. Comments are
 * stripped first so prose explaining a rule never trips it.
 */
const ATC = join(import.meta.dirname, '..', '..');
const ROOTS = [
  { dir: join(ATC, 'shared', 'src', 'styles'), pattern: /\.css$/ },
  { dir: join(ATC, 'angular', 'src'), pattern: /\.ts$/ },
  { dir: join(ATC, 'react', 'src'), pattern: /\.tsx$/ },
];

function walk(dir: string, pattern: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, pattern, out);
    else if (
      pattern.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    )
      out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

const files = ROOTS.flatMap(({ dir, pattern }) => walk(dir, pattern)).map(
  (path) => ({
    file: relative(ATC, path),
    source: stripComments(readFileSync(path, 'utf8')),
  }),
);

const offenders = (pattern: RegExp): string[] =>
  files.filter(({ source }) => pattern.test(source)).map(({ file }) => file);

test('scans the stylesheet and both apps', () => {
  const names = files.map(({ file }) => file);

  expect(names).toContain('shared/src/styles/atc.css');
  expect(names.some((name) => name.startsWith('angular/'))).toBe(true);
  expect(names.some((name) => name.startsWith('react/'))).toBe(true);
});

test('uses no uppercase text', () => {
  expect(offenders(/\buppercase\b|text-transform:\s*uppercase/)).toEqual([]);
});

test('uses no positive letter-spacing', () => {
  expect(
    offenders(
      /letter-spacing:\s*(?!-)\.?\d*[1-9]|tracking-(wide|wider|widest)\b/,
    ),
  ).toEqual([]);
});

test('uses no gradients, shadows or glass', () => {
  expect(
    offenders(/gradient\(|box-shadow|text-shadow|drop-shadow|backdrop-filter/),
  ).toEqual([]);
});

test('has no dark scheme', () => {
  expect(
    offenders(/prefers-color-scheme:\s*dark|color-scheme:\s*dark/),
  ).toEqual([]);
});

test('names only Hanken Grotesk, JetBrains Mono and generic font families', () => {
  const allowed = new Set([
    'hanken grotesk',
    'jetbrains mono',
    'sans-serif',
    'serif',
    'monospace',
    'system-ui',
    'inherit',
  ]);
  const used = files.flatMap(({ file, source }) =>
    [...source.matchAll(/font-family:\s*([^;}]+)/g)].flatMap((match) =>
      (match[1] ?? '')
        .split(',')
        .map((name) =>
          name
            .trim()
            .replace(/^['"]|['"]$/g, '')
            .toLowerCase(),
        )
        .filter(
          (name) => name && !name.startsWith('var(') && !allowed.has(name),
        )
        .map((name) => `${file}: ${name}`),
    ),
  );

  expect(used).toEqual([]);
});
