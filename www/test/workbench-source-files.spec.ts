import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { parseMarkdown } from '../src/lib/markdown';
import {
  createWorkbenchCapture,
  withWorkbenchCaptureMilestones,
} from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  assertCaptureMoments,
  buildWorkbenchSource,
  highlightWorkbenchSource,
  WORKBENCH_LESSON_FILES,
  workbenchPageData,
} from '../src/lib/workbench-source-files';
import { highlightCode } from '../src/lib/rehype-shiki';

// Counts highlight passes; the real highlighter still runs.
vi.mock('../src/lib/rehype-shiki', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/lib/rehype-shiki')>();
  return { ...actual, highlightCode: vi.fn(actual.highlightCode) };
});

const quickstart = resolve(import.meta.dirname, '../examples/quickstart');
const docsRoot = resolve(import.meta.dirname, '../content/docs');

/**
 * `count` lines of a quickstart file from the first line that starts with
 * `first`, and their 1-based range, so edits elsewhere in the file cannot
 * move the snippet under the test.
 */
const snippetAt = (path: string, first: string, count: number) => {
  const lines = readFileSync(join(quickstart, path), 'utf8').split('\n');
  const index = lines.findIndex((line) => line.startsWith(first));
  if (index < 0) throw new Error(`${path}: no line starts with ${first}`);
  return {
    code: lines.slice(index, index + count).join('\n'),
    range: { start: index + 1, end: index + count },
  };
};

const workbenchExport = snippetAt(
  'react/src/Workbench.tsx',
  'export function Workbench() {',
  3,
);

test('tools source lists its files and highlights the page snippets', () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123');

  const source = buildWorkbenchSource('tools', 'react', [
    { header: 'react/src/Workbench.tsx', code: workbenchExport.code },
  ]);

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
        highlights: [workbenchExport.range],
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
      code: snippetAt('runtime/workbench-recipes.ts', 'import ', 2).code,
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

  const data = workbenchPageData(parsed.tree, 'react', 'test');

  expect(data).toBeUndefined();
});

test('a page with a workbench highlights its snippets in its lesson source', async () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123');
  const snippet = snippetAt(
    'angular/src/app/workbench.ts',
    'export class Workbench {',
    3,
  );
  const parsed = await parseMarkdown(
    [
      '<hb-workbench lesson="tools"></hb-workbench>',
      '',
      '<hb-code-example header="angular/src/app/workbench.ts">',
      '',
      '```ts',
      snippet.code,
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

  const data = workbenchPageData(parsed.tree, 'angular', 'test');

  expect(data).toEqual({
    lesson: 'tools',
    moments: [],
    source: {
      commit: 'abc123',
      files: [
        {
          path: 'angular/src/app/workbench.ts',
          highlights: [snippet.range],
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

  const build = () => workbenchPageData(parsed.tree, 'react', 'test');

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
      workbenchPageData((await parseMarkdown(page.body)).tree, sdk, page.name);
    } catch (error) {
      failures.push((error as Error).message);
    }
  }

  expect(pages.length).toBeGreaterThan(0);
  expect(failures).toEqual([]);
  // Parses every docs page, which outlasts the 5 s default on CI runners.
}, 30_000);

const pageWithMoment = (
  path: string,
  snippet: { readonly code: string },
  moment: string,
) =>
  [
    '<hb-workbench lesson="tools"></hb-workbench>',
    '',
    `<hb-code-example header="${path}" moment="${moment}">`,
    '',
    '```ts',
    snippet.code,
    '```',
    '',
    '</hb-code-example>',
  ].join('\n');

test('a snippet moment is collected when its lesson capture has the milestone', async () => {
  const parsed = await parseMarkdown(
    pageWithMoment(
      'react/src/Workbench.tsx',
      workbenchExport,
      'tool-readcontext-1',
    ),
  );

  const data = workbenchPageData(parsed.tree, 'react', 'test');

  expect(data?.moments).toEqual(['tool-readcontext-1']);
});

test('a snippet moment missing from the lesson capture fails with its header and moment', async () => {
  const parsed = await parseMarkdown(
    pageWithMoment(
      'react/src/Workbench.tsx',
      workbenchExport,
      'tool-readcontext-99',
    ),
  );

  const build = () => workbenchPageData(parsed.tree, 'react', 'test');

  expect(build).toThrow(
    'react/src/Workbench.tsx: moment "tool-readcontext-99" is not a milestone in the tools lesson\'s react capture',
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
      workbenchPageData((await parseMarkdown(page.body)).tree, sdk, page.name);
    } catch (error) {
      failures.push((error as Error).message);
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
      data: workbenchPageData(
        (await parseMarkdown(body)).tree,
        sdk,
        `${sdk}/concept/functions`,
      ),
    })),
  );

  for (const { body, data: page } of data) {
    expect(page?.moments).toContain('tool-readcontext-1');
    expect(body).toMatch(/moment="tool-readcontext-1"/);
  }
});

test('a moment on a page without a workbench fails with its header and moment', async () => {
  const parsed = await parseMarkdown(
    '<hb-code-example header="react/src/Workbench.tsx" moment="tool-readcontext-1">\n\n```ts\ncode\n```\n\n</hb-code-example>',
  );

  const build = () => workbenchPageData(parsed.tree, 'react', 'test');

  expect(build).toThrow(
    'react/src/Workbench.tsx: moment "tool-readcontext-1" needs an hb-workbench lesson on the page',
  );
});

test('a moment on a snippet outside the workbench files fails with its header and moment', async () => {
  const parsed = await parseMarkdown(
    [
      '<hb-workbench lesson="tools"></hb-workbench>',
      '',
      '<hb-code-example header="src/app.ts" moment="tool-readcontext-1">',
      '',
      '```ts',
      'code',
      '```',
      '',
      '</hb-code-example>',
    ].join('\n'),
  );

  const build = () => workbenchPageData(parsed.tree, 'react', 'test');

  expect(build).toThrow(
    'src/app.ts: moment "tool-readcontext-1" is only allowed on workbench snippets',
  );
});

function toolsCapture() {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.settle('complete', 'stop');
  return createWorkbenchCapture(store.getSnapshot(), {
    lesson: 'tools',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
}

const momentAt = (moment: string) => [
  { header: 'react/src/Workbench.tsx', moment },
];

test('moments resolve against the recorded milestones, not computed ones', () => {
  const capture = {
    ...withWorkbenchCaptureMilestones(toolsCapture()),
    milestones: [{ id: 'asked-1', index: 0, label: 'Asked' }],
  };

  const recorded = () =>
    assertCaptureMoments(capture, 'the tools lesson', momentAt('asked-1'));
  const computed = () =>
    assertCaptureMoments(capture, 'the tools lesson', momentAt('prompt-1'));

  expect(recorded).not.toThrow();
  expect(computed).toThrow(
    'react/src/Workbench.tsx: moment "prompt-1" is not a milestone in the tools lesson (asked-1)',
  );
});

test('a capture without recorded milestones fails the moments check', () => {
  const capture = toolsCapture();

  const check = () =>
    assertCaptureMoments(capture, 'the tools lesson', momentAt('prompt-1'));

  expect(check).toThrow(
    'the tools lesson has no recorded milestones; restamp its capture',
  );
});

test('a tool moment must point at a recorded tool event', () => {
  const capture = {
    ...withWorkbenchCaptureMilestones(toolsCapture()),
    milestones: [
      { id: 'tool-readcontext-1', index: 1, label: 'Tool readContext' },
      { id: 'tool-shifted-1', index: 2, label: 'Tool shifted' },
    ],
  };

  const tool = () =>
    assertCaptureMoments(
      capture,
      'the tools lesson',
      momentAt('tool-readcontext-1'),
    );
  const shifted = () =>
    assertCaptureMoments(
      capture,
      'the tools lesson',
      momentAt('tool-shifted-1'),
    );

  expect(tool).not.toThrow();
  expect(shifted).toThrow(
    'react/src/Workbench.tsx: moment "tool-shifted-1" points at a complete event in the tools lesson, not a tool',
  );
});

test('every published capture records its milestones', () => {
  const captures = readdirSync(
    resolve(import.meta.dirname, '../public/video/docs'),
  ).filter((name) => name.endsWith('-capture.json'));

  const missing = captures.filter(
    (name) =>
      !Array.isArray(
        JSON.parse(
          readFileSync(
            resolve(import.meta.dirname, '../public/video/docs', name),
            'utf8',
          ),
        ).milestones,
      ),
  );

  expect(captures.length).toBeGreaterThan(0);
  expect(missing).toEqual([]);
});

test('a file two lessons share is highlighted once', async () => {
  const shared = 'runtime/workbench.ts';
  const code = readFileSync(join(quickstart, shared), 'utf8').replace(
    /\n$/,
    '',
  );
  const passes = () =>
    vi.mocked(highlightCode).mock.calls.filter(([text]) => text === code)
      .length;

  const tools = await highlightWorkbenchSource('tools', 'react');
  const decisions = await highlightWorkbenchSource('decisions', 'react');

  const htmlOf = (files: typeof tools.files) =>
    files.find((file) => file.path === shared)?.html;
  expect(WORKBENCH_LESSON_FILES.decisions.react).toContain(shared);
  expect(passes()).toBe(1);
  expect(htmlOf(decisions.files)).toBe(htmlOf(tools.files));
  expect(htmlOf(tools.files)).toContain('data-line="1"');
}, 30_000);

test('a bad moment names its page', async () => {
  const parsed = await parseMarkdown(
    pageWithMoment(
      'react/src/Workbench.tsx',
      workbenchExport,
      'tool-readcontext-99',
    ),
  );

  const build = () =>
    workbenchPageData(parsed.tree, 'react', 'react/concept/functions');

  expect(build).toThrow(
    'react/concept/functions: react/src/Workbench.tsx: moment "tool-readcontext-99" is not a milestone',
  );
});

test('a drifted snippet names its page', async () => {
  const parsed = await parseMarkdown(
    [
      '<hb-workbench lesson="tools"></hb-workbench>',
      '',
      '<hb-code-example header="react/src/Workbench.tsx">',
      '',
      '```tsx',
      'not in the workbench',
      '```',
      '',
      '</hb-code-example>',
    ].join('\n'),
  );

  const build = () =>
    workbenchPageData(parsed.tree, 'react', 'react/concept/functions');

  expect(build).toThrow(
    'react/concept/functions: react/src/Workbench.tsx: snippet not found',
  );
});
