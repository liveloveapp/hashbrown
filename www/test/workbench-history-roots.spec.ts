import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';

function reactDispatch(format: string) {
  const source = readFileSync(
    'www/examples/quickstart/react/src/Workbench.tsx',
    'utf8',
  );
  const component = source.slice(source.indexOf('export function Workbench()'));
  const code = ts.transpileModule(component, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const names = [
    'HistoryWorkbenchConversation',
    'WorkflowWorkbenchConversation',
    'MagicTextWorkbenchConversation',
    'PredictionsWorkbenchConversation',
    'SelectionWorkbenchConversation',
    'DecisionWorkbenchConversation',
    'StructuredWorkbenchConversation',
    'WorkbenchConversation',
  ];
  const exports: Record<
    string,
    () => { children: { children: { type: string }[] }[][] }
  > = {};
  new Function(
    'exports',
    'React',
    'useState',
    'getWorkbenchLesson',
    'window',
    ...names,
    code,
  )(
    exports,
    {
      createElement: (
        type: unknown,
        _props: unknown,
        ...children: unknown[]
      ) => ({ type, children }),
    },
    (initial: unknown) => [initial, () => undefined],
    () => ({ format }),
    { location: { search: '' } },
    ...names,
  );
  return exports['Workbench']().children[0][0].children[0].type;
}

test('React root dispatch preserves all seventeen prior lessons and binds both text-history lessons', () => {
  const expected: Record<string, string> = {
    workflow: 'WorkflowWorkbenchConversation',
    text: 'MagicTextWorkbenchConversation',
    predictions: 'PredictionsWorkbenchConversation',
    selection: 'SelectionWorkbenchConversation',
    decision: 'DecisionWorkbenchConversation',
    structured: 'StructuredWorkbenchConversation',
    ui: 'WorkbenchConversation',
    history: 'HistoryWorkbenchConversation',
  };

  const selected = workbenchLessons.map((lesson) =>
    reactDispatch(lesson.format),
  );

  expect(selected).toEqual(
    workbenchLessons.map((lesson) => expected[lesson.format]),
  );
  expect(selected).toHaveLength(19);
});

test('Angular root registers history independently and retains the previous dispatch branches', () => {
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/workbench.ts',
    'utf8',
  );
  const root = source.slice(source.indexOf("selector: 'app-workbench'"));

  expect(root).toContain('HistoryWorkbenchConversation,');
  expect(root).toContain("@if (format === 'history')");
  expect(root).toContain('<app-history-workbench-conversation');
  for (const format of [
    'workflow',
    'text',
    'predictions',
    'selection',
    'decision',
    'structured',
  ])
    expect(root).toContain(`format === '${format}'`);
  expect(root).toContain('<app-workbench-conversation');
});
