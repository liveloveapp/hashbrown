import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { parseMarkdown } from '../src/lib/markdown';
import {
  buildWorkbenchSource,
  WORKBENCH_LESSON_FILES,
  workbenchPageData,
} from '../src/lib/workbench-source-files';

const quickstart = resolve(import.meta.dirname, '../examples/quickstart');
const docsRoot = resolve(import.meta.dirname, '../content/docs');

const linesOf = (path: string, start: number, end: number) =>
  readFileSync(join(quickstart, path), 'utf8')
    .split('\n')
    .slice(start - 1, end)
    .join('\n');

test('tools source lists its files and highlights the page snippets', () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123');
  const snippet = linesOf('react/src/Workbench.tsx', 299, 301);

  const source = buildWorkbenchSource('tools', 'react', [
    { header: 'react/src/Workbench.tsx', code: snippet },
  ]);

  vi.unstubAllEnvs();
  expect(WORKBENCH_LESSON_FILES.tools.react).toEqual([
    'react/src/Workbench.tsx',
    'server/workbench-app.ts',
    'runtime/workbench.ts',
  ]);
  expect(source).toEqual({
    commit: 'abc123',
    files: [
      {
        path: 'react/src/Workbench.tsx',
        highlights: [{ start: 299, end: 301 }],
      },
      { path: 'server/workbench-app.ts', highlights: [] },
      { path: 'runtime/workbench.ts', highlights: [] },
    ],
  });
});

test('an unresolvable snippet fails with its header', () => {
  const snippets = [
    { header: 'react/src/Workbench.tsx', code: 'not in the workbench' },
  ];

  const build = () => buildWorkbenchSource('tools', 'react', snippets);

  expect(build).toThrow(
    'react/src/Workbench.tsx: snippet not found in www/examples/quickstart/react/src/Workbench.tsx',
  );
});

test('a snippet outside the lesson files fails with its header and lesson', () => {
  const snippets = [
    {
      header: 'runtime/workbench-recipes.ts',
      code: linesOf('runtime/workbench-recipes.ts', 1, 2),
    },
  ];

  const build = () => buildWorkbenchSource('tools', 'react', snippets);

  expect(build).toThrow(
    "runtime/workbench-recipes.ts: not in the tools lesson's react source files",
  );
});

test('every lesson has source files that exist', () => {
  const lessons = workbenchLessons.map((lesson) => lesson.id);

  const problems = lessons.flatMap((lesson) =>
    (['react', 'angular'] as const).flatMap((sdk) => {
      const files = WORKBENCH_LESSON_FILES[lesson]?.[sdk] ?? [];
      const wrapperRoot = sdk === 'react' ? 'react/' : 'angular/';
      return [
        ...(files.length === 0 ? [`${lesson}/${sdk}: no files`] : []),
        ...(files[0]?.startsWith(wrapperRoot)
          ? []
          : [`${lesson}/${sdk}: wrapper is not first`]),
        ...(new Set(files).size === files.length
          ? []
          : [`${lesson}/${sdk}: duplicate files`]),
        ...files
          .filter((file) => !existsSync(join(quickstart, file)))
          .map((file) => `${lesson}/${sdk}: missing ${file}`),
        ...files
          .filter((file) =>
            file.startsWith(sdk === 'react' ? 'angular/' : 'react/'),
          )
          .map((file) => `${lesson}/${sdk}: other framework ${file}`),
      ];
    }),
  );

  expect(Object.keys(WORKBENCH_LESSON_FILES).sort()).toEqual(
    lessons.toSorted(),
  );
  expect(problems).toEqual([]);
});

test('a page without a workbench builds no source data', async () => {
  const parsed = await parseMarkdown(
    '<hb-code-example header="react/src/Workbench.tsx">\n\n```tsx\nnot checked\n```\n\n</hb-code-example>',
  );

  const data = workbenchPageData(parsed.tree, 'react');

  expect(data).toBeUndefined();
});

test('a page with a workbench highlights its snippets in its lesson source', async () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123');
  const snippet = linesOf('angular/src/app/workbench.ts', 450, 452);
  const parsed = await parseMarkdown(
    [
      '<hb-workbench lesson="tools"></hb-workbench>',
      '',
      '<hb-code-example header="angular/src/app/workbench.ts">',
      '',
      '```ts',
      snippet,
      '```',
      '',
      '</hb-code-example>',
      '',
      '<hb-code-example header="docs/not-a-workbench-file.ts">',
      '',
      '```ts',
      'ignored',
      '```',
      '',
      '</hb-code-example>',
    ].join('\n'),
  );

  const data = workbenchPageData(parsed.tree, 'angular');

  vi.unstubAllEnvs();
  expect(data).toEqual({
    lesson: 'tools',
    moments: [],
    source: {
      commit: 'abc123',
      files: [
        {
          path: 'angular/src/app/workbench.ts',
          highlights: [{ start: 450, end: 452 }],
        },
        { path: 'server/workbench-app.ts', highlights: [] },
        { path: 'runtime/workbench.ts', highlights: [] },
      ],
    },
  });
});

test('a page with two different workbench lessons fails', async () => {
  const parsed = await parseMarkdown(
    '<hb-workbench lesson="tools"></hb-workbench>\n\n<hb-workbench lesson="schemas"></hb-workbench>',
  );

  const build = () => workbenchPageData(parsed.tree, 'react');

  expect(build).toThrow('one workbench lesson per page');
});

test('every docs page with a workbench builds its source data', async () => {
  const pages = readdirSync(docsRoot, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, body: readFileSync(join(docsRoot, name), 'utf8') }))
    .filter((page) => page.body.includes('<hb-workbench'));
  const failures: string[] = [];

  for (const page of pages) {
    const sdk = page.name.startsWith('angular') ? 'angular' : 'react';
    try {
      workbenchPageData((await parseMarkdown(page.body)).tree, sdk);
    } catch (error) {
      failures.push(`${page.name}: ${(error as Error).message}`);
    }
  }

  expect(pages.length).toBeGreaterThan(0);
  expect(failures).toEqual([]);
  // Parses every docs page, which outlasts the 5 s default on CI runners.
}, 30_000);

const pageWithMoment = (
  path: string,
  lines: [number, number],
  moment: string,
) =>
  [
    '<hb-workbench lesson="tools"></hb-workbench>',
    '',
    `<hb-code-example header="${path}" moment="${moment}">`,
    '',
    '```ts',
    linesOf(path, lines[0], lines[1]),
    '```',
    '',
    '</hb-code-example>',
  ].join('\n');

test('a snippet moment is collected when its lesson capture has the milestone', async () => {
  const parsed = await parseMarkdown(
    pageWithMoment('react/src/Workbench.tsx', [299, 301], 'tool-result-1'),
  );

  const data = workbenchPageData(parsed.tree, 'react');

  expect(data?.moments).toEqual(['tool-result-1']);
});

test('a snippet moment missing from the lesson capture fails with its header and moment', async () => {
  const parsed = await parseMarkdown(
    pageWithMoment('react/src/Workbench.tsx', [299, 301], 'tool-result-99'),
  );

  const build = () => workbenchPageData(parsed.tree, 'react');

  expect(build).toThrow(
    'react/src/Workbench.tsx: moment "tool-result-99" is not a milestone in the tools lesson\'s react capture',
  );
});

test('every snippet moment names a milestone in its lesson capture', async () => {
  const pages = readdirSync(docsRoot, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, body: readFileSync(join(docsRoot, name), 'utf8') }))
    .filter((page) => page.body.includes(' moment="'));

  const failures: string[] = [];
  for (const page of pages) {
    const sdk = page.name.startsWith('angular') ? 'angular' : 'react';
    try {
      workbenchPageData((await parseMarkdown(page.body)).tree, sdk);
    } catch (error) {
      failures.push(`${page.name}: ${(error as Error).message}`);
    }
  }

  expect(pages.length).toBeGreaterThan(0);
  expect(failures).toEqual([]);
}, 30_000);

test('the Tools pages link readContext to the tool result', async () => {
  const pages = ['react', 'angular'].map((sdk) => ({
    sdk: sdk as 'react' | 'angular',
    body: readFileSync(join(docsRoot, sdk, 'concept/functions.md'), 'utf8'),
  }));

  const data = await Promise.all(
    pages.map(async ({ sdk, body }) => ({
      body,
      data: workbenchPageData((await parseMarkdown(body)).tree, sdk),
    })),
  );

  for (const { body, data: page } of data) {
    expect(page?.moments).toContain('tool-result-1');
    expect(body).toMatch(/moment="tool-result-1"/);
  }
});
