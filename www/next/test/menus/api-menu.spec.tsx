import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ApiMenu } from '../../src/components/menus/ApiMenu';
import { apiMenuSections } from '../../src/components/menus/api-menu.data';
import { toggleSection } from '../../src/components/menus/menu.models';
import { NavigationList } from '../../src/components/menus/NavigationList';
import { repoRoot } from '../../src/lib/repo-root';

interface MinApiReport {
  packageNames: string[];
  packages: Record<string, { symbols: Record<string, unknown> }>;
}

const report = JSON.parse(
  readFileSync(
    join(repoRoot(), 'www/analog/src/app/reference/api-report.min.json'),
    'utf-8',
  ),
) as MinApiReport;

test('groups the API menu by package, without the @hashbrownai scope', () => {
  const sections = apiMenuSections();

  const titles = sections.map((section) => section.title);

  expect(titles).toEqual(['angular', 'core', 'react']);
});

test('lists every symbol in the API report with an /api/<pkg>/<symbol> href', () => {
  const expected = Object.entries(report.packages).map(([pkg, api]) => {
    const name = pkg.replace(/^@hashbrownai\//, '');
    return Object.keys(api.symbols).map((symbol) => ({
      kind: 'link',
      text: symbol,
      url: `/api/${name}/${symbol}`,
    }));
  });

  const sections = apiMenuSections();

  expect(sections.map((section) => section.children)).toEqual(expected);
  expect(expected.flat().length).toBeGreaterThan(150);
});

test('renders one button per package and no symbol links until one is opened', () => {
  const html = renderToStaticMarkup(<ApiMenu />);

  expect(html).toContain('>angular');
  expect(html).toContain('>core');
  expect(html).toContain('>react');
  expect(html).not.toContain('href="/api/');
});

test('renders the links of an opened package', () => {
  const sections = toggleSection(apiMenuSections(), 'react');

  const html = renderToStaticMarkup(
    <NavigationList sections={sections} onChange={() => undefined} />,
  );

  for (const symbol of Object.keys(
    report.packages['@hashbrownai/react'].symbols,
  )) {
    expect(html).toContain(`href="/api/react/${symbol}"`);
  }
  expect(html).not.toContain('href="/api/core/');
});

test('toggling a section opens it without mutating the input', () => {
  const sections = apiMenuSections();

  const opened = toggleSection(sections, 'core');
  const closed = toggleSection(opened, 'core');

  expect(opened.map((s) => s.active)).toEqual([false, true, false]);
  expect(closed.map((s) => s.active)).toEqual([false, false, false]);
  expect(sections.map((s) => s.active)).toEqual([false, false, false]);
});
