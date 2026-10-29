import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Root, RootContent } from 'hast';
import type { ShikiTransformer } from 'shiki';
import {
  assertWorkbenchLesson,
  type WorkbenchLessonId,
  type WorkbenchLineRange,
  type WorkbenchSourceData,
  type WorkbenchSourceHtml,
} from '../components/workbench/workbench-lessons';
import type { Sdk } from './content';
import { repoRoot } from './repo-root';
import { highlightCode } from './rehype-shiki';
import {
  resolveSnippetLines,
  WORKBENCH_SNIPPET_ROOTS,
} from './workbench-source';

type LessonFiles = {
  readonly react: readonly string[];
  readonly angular: readonly string[];
};

// Builds a lesson's lists from its wrapper pair and the files both SDKs share.
const lesson = (
  react: readonly string[],
  angular: readonly string[],
  shared: readonly string[],
): LessonFiles => ({
  react: [...react, ...shared],
  angular: [...angular, ...shared],
});

const react = (name: string) => `react/src/${name}`;
const angular = (name: string) => `angular/src/app/${name}`;

const chat = lesson(
  [react('Workbench.tsx')],
  [angular('workbench.ts')],
  ['server/workbench-app.ts', 'runtime/workbench.ts'],
);
const structured = lesson(
  [react('StructuredWorkbench.tsx')],
  [angular('structured-workbench.ts')],
  ['server/workbench-app.ts', 'runtime/workbench.ts'],
);
const text = (runtime: string) =>
  lesson(
    [react('MagicTextWorkbench.tsx')],
    [angular('magic-text-workbench.ts')],
    ['server/workbench-app.ts', runtime],
  );
const uiKit = lesson(
  [react('UiKitWorkbench.tsx')],
  [angular('ui-kit-workbench.ts')],
  [
    'server/workbench-app.ts',
    'server/workbench-ui-policy.ts',
    'runtime/workbench-ui-kits.ts',
  ],
);
const server = lesson(
  [react('ServerWorkbench.tsx')],
  [angular('server-workbench.ts')],
  ['server/workbench-threads.ts', 'runtime/workbench-server-history.ts'],
);
const authoring = lesson(
  [react('AuthoringWorkbench.tsx')],
  [angular('authoring-workbench.ts')],
  ['server/workbench-app.ts', 'runtime/workbench-authoring.ts'],
);
const history = lesson(
  [react('HistoryWorkbench.tsx')],
  [angular('history-workbench.ts')],
  [
    'server/workbench-app.ts',
    'runtime/workbench-history.ts',
    'runtime/workbench-history-client.ts',
  ],
);
const workflow = (extra: readonly string[] = []) =>
  lesson(
    [react('WorkflowWorkbench.tsx')],
    [angular('workflow-workbench.ts')],
    [
      'server/workbench-workflows.ts',
      'runtime/workbench-workflows.ts',
      ...extra,
    ],
  );
const recipe = (reactName: string, angularName: string) =>
  lesson(
    [react(reactName)],
    [angular(angularName)],
    ['server/workbench-app.ts', 'runtime/workbench-recipes.ts'],
  );

/**
 * The source files each lesson's Source tab shows, as paths under
 * `www/examples/quickstart/`: the framework wrapper the workbench selects for
 * the lesson (React `Workbench()`, Angular `Workbench`), then the server route
 * or schema, then the shared runtime files whose lines matter to the lesson.
 * A docs snippet on a lesson's page must come from one of its files.
 */
export const WORKBENCH_LESSON_FILES: Readonly<
  Record<WorkbenchLessonId, LessonFiles>
> = {
  'generative-ui': chat,
  tools: chat,
  debugging: lesson(
    [react('Workbench.tsx')],
    [angular('workbench.ts')],
    ['server/workbench-app.ts', 'runtime/workbench-requests.ts'],
  ),
  'request-transformation': lesson(
    [react('Workbench.tsx')],
    [angular('workbench.ts')],
    ['server/workbench-transform.ts', 'server/workbench-openai.ts'],
  ),
  'first-plan': lesson(
    [react('Workbench.tsx'), react('FirstPlanApp.tsx')],
    [angular('workbench.ts'), angular('first-plan-app.ts')],
    ['server/workbench-app.ts', 'runtime/workbench-onboarding.ts'],
  ),
  'structured-output': structured,
  streaming: structured,
  schemas: structured,
  decisions: lesson(
    [react('DecisionWorkbench.tsx')],
    [angular('decision-workbench.ts')],
    [
      'server/workbench-app.ts',
      'runtime/workbench.ts',
      'runtime/workbench-decision-transport.ts',
    ],
  ),
  conversation: text('runtime/workbench-onboarding.ts'),
  'system-instructions': text('runtime/workbench-onboarding.ts'),
  'magic-text': text('runtime/workbench-recipes.ts'),
  predictions: recipe('PredictionsWorkbench.tsx', 'predictions-workbench.ts'),
  'ui-selection': recipe('SelectionWorkbench.tsx', 'selection-workbench.ts'),
  'javascript-runtime': lesson(
    [react('RuntimeWorkbench.tsx')],
    [angular('runtime-workbench.ts')],
    [
      'runtime/workbench-javascript.ts',
      'runtime/workbench-javascript-session.ts',
    ],
  ),
  // The wrapper first, then the page's standalone example files, which its
  // snippets quote but the wrapper does not import.
  'local-models': lesson(
    [react('LocalModelsWorkbench.tsx'), react('LocalModels.tsx')],
    [angular('local-models-workbench.ts'), angular('local-models.ts')],
    ['runtime/workbench-local-models.ts', 'runtime/local-models.ts'],
  ),
  'ui-kits': uiKit,
  'ui-chatbot': uiKit,
  'server-threads': server,
  'public-endpoint': server,
  'agent-decisions': lesson(
    [react('AuthoringWorkbench.tsx')],
    [angular('authoring-workbench.ts')],
    ['server/workbench-agent.ts', 'runtime/workbench-agent.ts'],
  ),
  'json-parser': authoring,
  'natural-forms': authoring,
  'message-history': history,
  'save-text-conversations': history,
  'shared-state': workflow(),
  activities: workflow(),
  interrupts: workflow(['runtime/workbench-workflow-form.ts']),
  'production-recovery': lesson(
    [react('ProductionWorkbench.tsx')],
    [angular('production-workbench.ts')],
    ['server/production/route.ts', 'runtime/workbench-production.ts'],
  ),
};

/** A docs code example's header (its file path) and code. */
export interface WorkbenchSnippet {
  readonly header: string;
  readonly code: string;
}

/** What a docs page with a workbench panel passes to it. */
export interface WorkbenchPageData {
  readonly lesson: WorkbenchLessonId;
  readonly source: WorkbenchSourceData;
  /** Milestones the page's prose refers to; empty until moments land. */
  readonly moments: readonly string[];
}

const quickstartPath = (path: string) =>
  join(repoRoot(), 'www/examples/quickstart', path);

let gitCommit: string | undefined;

/**
 * The commit the Source tab's GitHub links point at: the deployed commit on
 * Vercel, the local `HEAD` otherwise.
 */
export function workbenchSourceCommit(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    (gitCommit ??= execSync('git rev-parse HEAD', { cwd: repoRoot() })
      .toString()
      .trim())
  );
}

const mergeRanges = (
  ranges: readonly WorkbenchLineRange[],
): WorkbenchLineRange[] =>
  ranges
    .toSorted((a, b) => a.start - b.start || a.end - b.end)
    .reduce<WorkbenchLineRange[]>((merged, range) => {
      const last = merged.at(-1);
      return last && range.start <= last.end + 1
        ? [
            ...merged.slice(0, -1),
            { start: last.start, end: Math.max(last.end, range.end) },
          ]
        : [...merged, range];
    }, []);

/**
 * Build a page's lesson source data: the lesson's files for the SDK and, for
 * each, the lines the page's snippets cover. This is the docs' drift guard:
 * every snippet must still be in its file, and its file must be one of the
 * lesson's, or the build fails.
 *
 * @param lesson - The page's workbench lesson.
 * @param sdk - The page's SDK.
 * @param snippets - The page's workbench code examples (headers under
 *   {@link WORKBENCH_SNIPPET_ROOTS}).
 * @throws When a snippet is not in its file, or its file is not in the
 *   lesson's source files.
 */
export function buildWorkbenchSource(
  lesson: WorkbenchLessonId,
  sdk: Sdk,
  snippets: readonly WorkbenchSnippet[],
): WorkbenchSourceData {
  const files = WORKBENCH_LESSON_FILES[lesson][sdk];
  const located = snippets.map(({ header, code }) => {
    const notFound = `${header}: snippet not found in www/examples/quickstart/${header}`;
    let text: string;
    try {
      text = readFileSync(quickstartPath(header), 'utf8');
    } catch {
      throw new Error(notFound);
    }
    const range = resolveSnippetLines(text, code);
    if (!range) throw new Error(notFound);
    if (!files.includes(header)) {
      throw new Error(
        `${header}: not in the ${lesson} lesson's ${sdk} source files (WORKBENCH_LESSON_FILES)`,
      );
    }
    return { header, range };
  });
  return {
    commit: workbenchSourceCommit(),
    files: files.map((path) => ({
      path,
      highlights: mergeRanges(
        located
          .filter((item) => item.header === path)
          .map((item) => item.range),
      ),
    })),
  };
}

const textOf = (node: Root | RootContent): string =>
  node.type === 'text'
    ? node.value
    : 'children' in node
      ? node.children.map(textOf).join('')
      : '';

const elements = (node: Root | RootContent): Element[] =>
  node.type === 'root' || node.type === 'element'
    ? [
        ...(node.type === 'element' ? [node] : []),
        ...node.children.flatMap(elements),
      ]
    : [];

const isWorkbenchHeader = (header: unknown): header is string =>
  typeof header === 'string' &&
  WORKBENCH_SNIPPET_ROOTS.some((root) => header.startsWith(root));

/**
 * A docs page's workbench data, from its parsed markdown: its `hb-workbench`
 * lesson and the source data for its workbench code examples. Runs at build
 * time.
 *
 * @param tree - The page's parsed markdown (see `parseMarkdown`).
 * @param sdk - The SDK whose docs are rendering (blog posts use `react`).
 * @returns The page data, or `undefined` for a page without a workbench.
 * @throws When the page has more than one lesson, or a snippet fails
 *   {@link buildWorkbenchSource}.
 */
export function workbenchPageData(
  tree: Root,
  sdk: string,
): WorkbenchPageData | undefined {
  const all = elements(tree);
  const lessons = [
    ...new Set(
      all
        .filter((node) => node.tagName === 'hb-workbench')
        .map((node) => String(node.properties['lesson'] ?? '')),
    ),
  ];
  if (lessons.length === 0) return undefined;
  if (lessons.length > 1) {
    throw new Error(
      `A docs page shows one workbench lesson per page; found ${lessons.join(', ')}`,
    );
  }
  const lesson = assertWorkbenchLesson(lessons[0]);
  const snippets = all
    .filter(
      (node) =>
        node.tagName === 'hb-code-example' &&
        isWorkbenchHeader(node.properties['header']),
    )
    .map((node) => ({
      header: node.properties['header'] as string,
      code: textOf(node),
    }));
  return {
    lesson,
    source: buildWorkbenchSource(
      lesson,
      sdk === 'angular' ? 'angular' : 'react',
      snippets,
    ),
    moments: [],
  };
}

const languageOf = (path: string) => {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  throw new Error(`No workbench source language for ${path}`);
};

// One addressable `<span class="line" data-line="N">` per source line, so the
// client can mark a page's highlights after it fetches the file.
const lineNumbers: ShikiTransformer = {
  name: 'workbench-line-numbers',
  line(node, line) {
    node.properties['data-line'] = line;
  },
};

/**
 * Highlight a lesson's source files for the Source tab, with numbered lines.
 * Served as static JSON by `/workbench-source/<sdk>/<lesson>`.
 *
 * @param lesson - A workbench lesson.
 * @param sdk - The SDK whose files to highlight.
 */
export async function highlightWorkbenchSource(
  lesson: WorkbenchLessonId,
  sdk: Sdk,
): Promise<WorkbenchSourceHtml> {
  return {
    commit: workbenchSourceCommit(),
    files: await Promise.all(
      WORKBENCH_LESSON_FILES[lesson][sdk].map(async (path) => ({
        path,
        html: await highlightCode(
          readFileSync(quickstartPath(path), 'utf8').replace(/\n$/, ''),
          languageOf(path),
          { transformers: [lineNumbers] },
        ),
      })),
    ),
  };
}
