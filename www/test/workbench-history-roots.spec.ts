import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';

function reactDispatch(format: string, id?: string) {
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
    'ProductionWorkbenchConversation',
    'LocalModelsWorkbenchConversation',
    'RuntimeWorkbenchConversation',
    'UiKitWorkbenchConversation',
    'ServerWorkbenchConversation',
    'AuthoringWorkbenchConversation',
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
    () => ({ format, id }),
    { location: { search: '' } },
    ...names,
  );
  return exports['Workbench']().children[0][0].children[0].type;
}

test('React root dispatch preserves all prior lessons and binds the three authoring lessons', () => {
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
    reactDispatch(lesson.format, lesson.id),
  );

  expect(selected).toEqual(
    workbenchLessons.map((lesson) =>
      lesson.id === 'production-recovery'
        ? 'ProductionWorkbenchConversation'
        : lesson.id === 'local-models'
          ? 'LocalModelsWorkbenchConversation'
          : lesson.id === 'javascript-runtime'
            ? 'RuntimeWorkbenchConversation'
            : ['ui-kits', 'ui-chatbot'].includes(lesson.id)
              ? 'UiKitWorkbenchConversation'
              : ['server-threads', 'public-endpoint'].includes(lesson.id)
                ? 'ServerWorkbenchConversation'
                : ['agent-decisions', 'json-parser', 'natural-forms'].includes(
                      lesson.id,
                    )
                  ? 'AuthoringWorkbenchConversation'
                  : expected[lesson.format],
    ),
  );
  expect(selected).toHaveLength(workbenchLessons.length);
  expect(reactDispatch('history', 'server-threads')).toBe(
    'ServerWorkbenchConversation',
  );
  expect(reactDispatch('history', 'public-endpoint')).toBe(
    'ServerWorkbenchConversation',
  );
});

test('Angular root registers history independently and retains the previous dispatch branches', () => {
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/workbench.ts',
    'utf8',
  );
  const root = source.slice(source.indexOf("selector: 'app-workbench'"));

  expect(root).toContain('HistoryWorkbenchConversation,');
  expect(root).toContain("format === 'history'");
  expect(root).toContain('ServerWorkbenchConversation,');
  expect(root).toContain('<app-server-workbench-conversation');
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

test('authoring lesson IDs dispatch directly before broad format branches in both roots', () => {
  const angular = readFileSync(
    'www/examples/quickstart/angular/src/app/workbench.ts',
    'utf8',
  );

  for (const id of ['agent-decisions', 'json-parser', 'natural-forms']) {
    expect(reactDispatch('history', id)).toBe('AuthoringWorkbenchConversation');
    expect(angular).toContain(`'${id}'`);
  }
  expect(angular).toContain('<app-authoring-workbench-conversation');
});
