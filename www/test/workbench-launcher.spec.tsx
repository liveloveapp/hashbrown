// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { listDocs, SDKS } from '../src/lib/content';
import { WorkbenchLauncher } from '../src/components/workbench/WorkbenchLauncher';
import { WORKBENCH_FREE_PAGES } from '../src/components/workbench/workbench-page-lessons';

// next/dynamic resolves asynchronously outside Next; render the client panel
// directly. The build check covers the split itself.
vi.mock('../src/components/workbench/WorkbenchPanelLoader', async () => ({
  WorkbenchPanelLoader: (
    await import('../src/components/workbench/WorkbenchPanelClient')
  ).WorkbenchPanelClient,
}));

const docsRoot = join(__dirname, '../content/docs');

const lessonsOn = (body: string, tag: string) =>
  [...body.matchAll(new RegExp(`<${tag} lesson="([^"]*)"`, 'g'))].map(
    (match) => match[1],
  );

// The "## Explore it in the workbench" section, up to the next h2.
const exploreSection = (body: string) =>
  /^## Explore it in the workbench\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
    body,
  )?.[1];

const pages = SDKS.flatMap((sdk) =>
  listDocs(sdk).map((slug) => ({
    sdk,
    slug: slug.join('/'),
    body: readFileSync(join(docsRoot, sdk, `${slug.join('/')}.md`), 'utf8'),
  })),
);

test('every docs page shows one lesson, or is listed as having none', () => {
  const problems = pages.flatMap(({ sdk, slug, body }) => {
    const shown = [
      ...lessonsOn(body, 'hb-workbench'),
      ...lessonsOn(body, 'hb-workbench-launcher'),
    ];
    const excluded = slug in WORKBENCH_FREE_PAGES;
    if (excluded && shown.length > 0) return [`${sdk}/${slug}: listed as free`];
    if (!excluded && shown.length !== 1)
      return [`${sdk}/${slug}: shows ${shown.length} lessons`];
    return [];
  });

  expect(problems).toEqual([]);
});

test('every page listed as free exists for both sdks', () => {
  const slugs = Object.keys(WORKBENCH_FREE_PAGES);

  const missing = slugs.flatMap((slug) =>
    SDKS.filter((sdk) => !existsSync(join(docsRoot, sdk, `${slug}.md`))).map(
      (sdk) => `${sdk}/${slug}`,
    ),
  );

  expect(slugs.length).toBeGreaterThan(0);
  expect(missing).toEqual([]);
});

test('launchers sit in the explore section and name a known lesson', () => {
  const known: readonly string[] = workbenchLessons.map((lesson) => lesson.id);

  const problems = pages.flatMap(({ sdk, slug, body }) =>
    lessonsOn(body, 'hb-workbench-launcher').flatMap((lesson) => [
      ...(known.includes(lesson) ? [] : [`${sdk}/${slug}: unknown ${lesson}`]),
      ...(lessonsOn(exploreSection(body) ?? '', 'hb-workbench-launcher')
        .length === 1
        ? []
        : [`${sdk}/${slug}: launcher outside the explore section`]),
    ]),
  );

  expect(problems).toEqual([]);
});

test('react and angular pages show the same lesson', () => {
  const lessonOf = (sdk: string, slug: string) => {
    const body = pages.find(
      (page) => page.sdk === sdk && page.slug === slug,
    )?.body;
    return body
      ? [
          ...lessonsOn(body, 'hb-workbench'),
          ...lessonsOn(body, 'hb-workbench-launcher'),
        ].join()
      : undefined;
  };

  const drift = pages
    .filter((page) => page.sdk === 'react')
    .filter(
      (page) => lessonOf('react', page.slug) !== lessonOf('angular', page.slug),
    )
    .map((page) => page.slug);

  expect(drift).toEqual([]);
});

test('the launcher loads nothing until expanded, then expands and collapses', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    }),
  );
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { getByRole, queryByRole, container } = render(
    <WorkbenchLauncher lesson="tools" sdk="react" />,
  );
  const button = getByRole('button', { name: 'Open the workbench' });
  const before = {
    text: container.textContent,
    panel: queryByRole('tablist'),
    frames: document.querySelectorAll('iframe').length,
    videos: document.querySelectorAll('video').length,
    fetches: fetchMock.mock.calls.length,
  };

  fireEvent.click(button);
  const expanded = {
    ariaExpanded: button.getAttribute('aria-expanded'),
    region: getByRole('region', { name: 'Tools workbench lesson' }),
    focused: document.activeElement,
    tablist: queryByRole('tablist'),
  };
  fireEvent.click(button);

  expect(before.text).toContain('Try this in the workbench: Tools');
  expect(before.panel).toBeNull();
  expect(before.frames).toBe(0);
  expect(before.videos).toBe(0);
  expect(before.fetches).toBe(0);
  expect(expanded.ariaExpanded).toBe('true');
  expect(expanded.focused).toBe(expanded.region);
  expect(expanded.tablist).toBeTruthy();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(queryByRole('tablist')).toBeNull();
});
