// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { SDKS } from '../src/lib/content';
import { WorkbenchLauncher } from '../src/components/workbench/WorkbenchLauncher';
import { WORKBENCH_CLOSEST_LESSON } from '../src/components/workbench/workbench-page-lessons';

// next/dynamic resolves asynchronously outside Next; render the client panel
// directly. The build check covers the split itself.
vi.mock('../src/components/workbench/WorkbenchPanelLoader', async () => ({
  WorkbenchPanelLoader: (
    await import('../src/components/workbench/WorkbenchPanelClient')
  ).WorkbenchPanelClient,
}));

const docsRoot = join(__dirname, '../content/docs');

test('every mapped page exists for both sdks and has no inline panel', () => {
  const slugs = Object.keys(WORKBENCH_CLOSEST_LESSON);

  const problems = slugs.flatMap((slug) =>
    SDKS.flatMap((sdk) => {
      const file = join(docsRoot, sdk, `${slug}.md`);
      if (!existsSync(file)) return [`${sdk}/${slug}: missing`];
      return readFileSync(file, 'utf8').includes('<hb-workbench')
        ? [`${sdk}/${slug}: has an inline panel`]
        : [];
    }),
  );

  expect(slugs.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('every mapped lesson is a known lesson', () => {
  const known = workbenchLessons.map((lesson) => lesson.id);

  const unknown = Object.values(WORKBENCH_CLOSEST_LESSON).filter(
    (lesson) => !known.includes(lesson),
  );

  expect(unknown).toEqual([]);
});

test('the launcher expands into the panel for its lesson', () => {
  cleanup();
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
  };

  fireEvent.click(button);

  expect(before.text).toContain('Try this in the workbench: Tools');
  expect(before.panel).toBeNull();
  expect(before.frames).toBe(0);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(getByRole('region', { name: 'Tools workbench' })).toBe(
    document.activeElement,
  );
  expect(getByRole('tablist')).toBeTruthy();
  vi.unstubAllGlobals();
});
