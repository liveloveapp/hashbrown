import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** One affected Nx browser suite and its optional named configuration. */
export interface BrowserSuite {
  readonly project: string;
  readonly configuration?: string;
}

/** Synchronous argument-vector executor; each call starts a separate Nx root. */
export type BrowserSuiteExecutor = (
  file: string,
  args: readonly string[],
) => { readonly status: number | null; readonly error?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isArgument = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9@_][a-zA-Z0-9@_./-]*$/.test(value);
const invalidGraph = () => new Error('Invalid Nx task graph');

/**
 * Validate a saved Nx task graph and select only its example-e2e targets.
 * Preserve graph order while deduplicating exact project/configuration pairs.
 * @param graph - Parsed output from the complete CI fixture-selection graph.
 * @returns Selected suites without modifying the graph or adding frameworks.
 * @throws When the graph or an executable project/configuration is malformed.
 */
export function selectBrowserSuites(graph: unknown): readonly BrowserSuite[] {
  if (
    !isRecord(graph) ||
    !isRecord(graph.tasks) ||
    !isRecord(graph.tasks.tasks)
  )
    throw invalidGraph();
  const selected = new Map<string, BrowserSuite>();
  for (const task of Object.values(graph.tasks.tasks)) {
    if (!isRecord(task) || !isRecord(task.target)) throw invalidGraph();
    const { project, target, configuration } = task.target;
    if (
      !isArgument(project) ||
      typeof target !== 'string' ||
      target.length === 0 ||
      (configuration !== undefined && !isArgument(configuration))
    )
      throw invalidGraph();
    if (target !== 'example-e2e') continue;
    const suite = {
      project,
      ...(configuration !== undefined ? { configuration } : {}),
    };
    selected.set(JSON.stringify([project, configuration]), suite);
  }
  return Array.from(selected.values());
}

const executeSuite: BrowserSuiteExecutor = (file, args) =>
  spawnSync(file, args, { stdio: 'inherit' });

/**
 * Run affected browser suites serially in independent top-level Nx processes.
 * Direct CI invocation preserves Nx recursion guards with fresh invocation roots.
 * All suites are attempted, and any failed or unstarted process fails the result.
 * @param graph - Parsed full task graph saved by CI fixture selection.
 * @param execute - Optional synchronous process adapter for focused tests.
 * @returns Zero when every selected suite succeeds, otherwise one.
 * @throws When graph validation fails, before starting any suite.
 */
export function runBrowserSuites(
  graph: unknown,
  execute: BrowserSuiteExecutor = executeSuite,
): number {
  const suites = selectBrowserSuites(graph);
  let exitCode = 0;
  for (const { project, configuration } of suites) {
    const args = [
      'nx',
      'example-e2e',
      project,
      ...(configuration !== undefined
        ? [`--configuration=${configuration}`]
        : []),
    ];
    try {
      const result = execute('npx', args);
      if (result.status !== 0 || result.error) exitCode = 1;
    } catch {
      exitCode = 1;
    }
  }
  return exitCode;
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Usage: run-browser-suites.ts <Nx task graph file>');
    process.exitCode = 2;
  } else {
    try {
      const graph: unknown = JSON.parse(readFileSync(process.argv[2], 'utf8'));
      process.exitCode = runBrowserSuites(graph);
    } catch {
      console.error('Invalid Nx task graph');
      process.exitCode = 2;
    }
  }
}
