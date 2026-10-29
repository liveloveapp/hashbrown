import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { CONCEPT_DIAGRAMS } from '../../src/components/elements/ConceptDiagram';

const root = resolve(import.meta.dirname, '../../content/docs');
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith('.md')
        ? [join(directory, entry.name)]
        : [],
  );
const pages = files(root).map((path) => ({
  path: relative(root, path),
  source: readFileSync(path, 'utf8'),
}));

test.each(pages)(
  '$path opens with the recorded teaser before its teaching material',
  ({ source }) => {
    const afterTitle = source.split(/^# .+$/m)[1]?.trimStart() ?? '';

    expect(afterTitle).toMatch(/^<(?:hb-docs-demo|www-atc-demo-video)\b/);
  },
);

test.each(pages.filter(({ path }) => /\/(concept|recipes)\//.test(path)))(
  '$path teaches an application example before the separate workbench implementation',
  ({ source }) => {
    const sections = source.split('\n## Explore it in the workbench\n');

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatch(/^## /m);
    expect(sections[0]).toMatch(/^```(?:ts|tsx|sh|json)\n/m);
    expect(sections[0]).not.toMatch(
      /from ['"][^'"]*(?:workbench|www\/examples)[^'"]*['"]/,
    );
    expect(sections[1]).toContain('/start/workbench');
  },
);

test('every authored diagram selects a supported architecture flow', () => {
  const used = new Set<string>();

  for (const { path, source } of pages) {
    for (const match of source.matchAll(
      /<hb-concept-diagram\s+concept="([^"]+)"/g,
    )) {
      expect(
        Object.hasOwn(CONCEPT_DIAGRAMS, match[1]),
        `${path}: ${match[1]}`,
      ).toBe(true);
      used.add(match[1]);
    }
  }

  expect(used.size).toBeGreaterThanOrEqual(8);
});
