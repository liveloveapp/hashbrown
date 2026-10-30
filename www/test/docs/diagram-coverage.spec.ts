import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_DIAGRAMS } from '../../src/components/diagrams/diagram-catalog';
import { SHARED_DIAGRAMS } from '../../src/components/diagrams/catalog/shared';
import { LEARNING_DIAGRAMS } from '../../src/components/diagrams/catalog/learning';
import { CONCEPT_DIAGRAM_DEFINITIONS } from '../../src/components/diagrams/catalog/concepts';
import { RECIPE_DIAGRAM_DEFINITIONS } from '../../src/components/diagrams/catalog/recipes';
import { INTEGRATION_DIAGRAM_DEFINITIONS } from '../../src/components/diagrams/catalog/integrations';

const root = resolve(import.meta.dirname, '../../content/docs');
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(path, entry.name))
      : entry.name.endsWith('.md')
        ? [join(path, entry.name)]
        : [],
  );
}
const pages = files(root).map((path) => ({
  path: relative(root, path).replace(/\.md$/, ''),
  source: readFileSync(path, 'utf8'),
}));
const auditRoot = resolve(import.meta.dirname, '../../../docs/diagrams');

test('every authored Angular and React guide has an explicit audit decision', () => {
  const audits = readdirSync(auditRoot)
    .filter((file) => file.endsWith('-audit.md'))
    .map((file) => readFileSync(join(auditRoot, file), 'utf8'))
    .join('\n');
  const rows = [
    ...audits.matchAll(
      /^\|\s*`?(?:www\/content\/docs\/)?((?:angular|react)\/[^|\s`]+)`?\s*\|/gm,
    ),
  ].map((match) => match[1].replace(/\.md$/, ''));
  expect([...rows].sort()).toEqual(pages.map((page) => page.path).sort());
});

test('catalog modules have unique identifiers', () => {
  const ids = [
    SHARED_DIAGRAMS,
    LEARNING_DIAGRAMS,
    CONCEPT_DIAGRAM_DEFINITIONS,
    RECIPE_DIAGRAM_DEFINITIONS,
    INTEGRATION_DIAGRAM_DEFINITIONS,
  ].flatMap(Object.keys);
  expect(new Set(ids).size).toBe(ids.length);
});

test('all diagram references resolve and every authored definition is used', () => {
  const used = new Set<string>();
  for (const { path, source } of pages) {
    for (const match of source.matchAll(/<hb-diagram\s+diagram="([^"]+)"/g)) {
      expect(
        Object.hasOwn(DOCS_DIAGRAMS, match[1]),
        `${path}: ${match[1]}`,
      ).toBe(true);
      used.add(match[1]);
      expect(
        source.indexOf(match[0]),
        `${path}: diagram precedes video`,
      ).toBeGreaterThan(source.indexOf('</hb-docs-demo>'));
    }
  }
  expect([...used].sort()).toEqual(Object.keys(DOCS_DIAGRAMS).sort());
});
