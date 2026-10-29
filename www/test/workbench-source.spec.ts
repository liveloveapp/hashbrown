import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  resolveSnippetLines,
  WORKBENCH_SNIPPET_ROOTS,
} from '../src/lib/workbench-source';

const quickstart = resolve(import.meta.dirname, '../examples/quickstart');
const docsRoot = resolve(import.meta.dirname, '../content/docs');

test('finds an indented snippet by trimmed lines', () => {
  const file = ['function a() {', '  if (x) {', '    run();', '  }', '}'].join(
    '\n',
  );
  const snippet = '\nif (x) {\nrun();\n}\n';

  const result = resolveSnippetLines(file, snippet);

  expect(result).toEqual({ start: 2, end: 4 });
});

test('returns null when the snippet is not in the file', () => {
  const file = 'one\ntwo\nthree';

  const result = resolveSnippetLines(file, 'two\nfour');

  expect(result).toBeNull();
});

test('every workbench snippet in the docs resolves', () => {
  const roots = WORKBENCH_SNIPPET_ROOTS.map((root) => root.replace('/', ''));
  const pattern = new RegExp(
    `<hb-code-example header="((?:${roots.join('|')})/[^"]+)">\\s*\`\`\`[^\\n]+\\n([\\s\\S]*?)\\n\`\`\``,
    'g',
  );
  const unresolved: string[] = [];
  let checked = 0;

  for (const file of readdirSync(docsRoot, {
    recursive: true,
    encoding: 'utf8',
  }).filter((name) => name.endsWith('.md'))) {
    const body = readFileSync(join(docsRoot, file), 'utf8');
    for (const match of body.matchAll(pattern)) {
      const source = readFileSync(join(quickstart, match[1]), 'utf8');
      checked++;
      if (resolveSnippetLines(source, match[2]) === null) {
        unresolved.push(`${file}: ${match[1]}`);
      }
    }
  }

  console.log(`workbench snippets surveyed: ${checked}`);
  expect(checked).toBeGreaterThan(0);
  expect(unresolved).toEqual([]);
});
