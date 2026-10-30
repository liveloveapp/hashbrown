import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { docsComponents } from '../src/components/docs-components';
import { customElementsIn } from '../src/lib/element-inventory';

test('counts custom elements outside code, ignoring ones inside fences and inline code', () => {
  const md =
    '<hb-code-example header="x">\n\n```html\n<hb-render-message />\n```\n\n</hb-code-example>\n\n`<hb-message>` and <hb-alert>hi</hb-alert>';

  const counts = customElementsIn(md);

  expect(counts).toEqual({ 'hb-code-example': 1, 'hb-alert': 1 });
});

test('docs pages render hb-workbench through the docs element map', () => {
  const root = resolve(import.meta.dirname, '../content/docs');
  const pages = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => readFileSync(join(root, file), 'utf8'));

  const count = pages.reduce(
    (total, page) => total + (customElementsIn(page)['hb-workbench'] ?? 0),
    0,
  );

  expect(count).toBeGreaterThan(40);
  expect(Object.hasOwn(docsComponents('react'), 'hb-workbench')).toBe(true);
});
