import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchAuthoringInspection } from '../examples/quickstart/runtime/workbench-authoring-view';

const plan = { title: 'Lighthouse', steps: ['Outline', 'Record'] };

test('parser inspection separates parser completion from source completion', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'parser' });
  const user = store.send('Plan');
  const json = JSON.stringify(plan);
  store.recordHistory({
    messages: [user, { id: 'answer', role: 'assistant', content: json }],
    isLoading: true,
  });
  store.recordAuthoring({
    assistantId: 'answer',
    json,
    value: plan,
    complete: true,
  });

  const projection = workbenchAuthoringInspection(
    'Parser',
    store.getSnapshot(),
    'json-parser',
  );

  expect(projection?.value).toMatchObject({
    source: 'generating',
    parser: { value: plan, complete: true },
  });
  expect(projection?.detail).toMatchObject({ document: null });
  expect(
    workbenchAuthoringInspection(
      'Requests',
      store.getSnapshot(),
      'json-parser',
    ),
  ).toBeUndefined();
});

test('form and UI inspection distinguish reviewed values and accepted application data', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });

  const projection = workbenchAuthoringInspection(
    'Form',
    store.getSnapshot(),
    'natural-forms',
  );
  const ui = workbenchAuthoringInspection(
    'UI',
    store.getSnapshot(),
    'natural-forms',
  );

  expect(projection?.detail).toMatchObject({
    reviewed: null,
    appliedPlan: store.getSnapshot().application.plan,
    revision: 0,
  });
  expect(ui?.value).toMatchObject({
    renderer: 'Application form',
    generatedComponents: false,
  });
  expect(
    workbenchAuthoringInspection('Agent', store.getSnapshot(), 'natural-forms'),
  ).toBeUndefined();
});

test('agent inspection never treats application handler text as generated UI', () => {
  const store = createWorkbenchStore('history');

  const projection = workbenchAuthoringInspection(
    'Agent',
    store.getSnapshot(),
    'agent-decisions',
  );

  expect(projection?.value).toBeNull();
  expect(projection?.detail).toMatchObject({
    modelOutput: 'Whole route decision',
    replySource: 'Application-owned read-only handler',
    revision: 0,
  });
});

test('selected SDK failure overrides a retained parser observation without claiming a valid document', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'parser' });
  const user = store.send('Plan');
  const json = JSON.stringify(plan);
  store.recordHistory({
    messages: [user, { id: 'answer', role: 'assistant', content: json }],
    isLoading: true,
  });
  store.recordAuthoring({
    assistantId: 'answer',
    json,
    value: plan,
    complete: true,
  });
  store.settle('error');
  store.recordHistory({
    messages: [user],
    isLoading: false,
    error: new Error('Source failed'),
  });

  const parsed = workbenchAuthoringInspection(
    'Parser',
    store.getSnapshot(),
    'json-parser',
  );
  const ui = workbenchAuthoringInspection(
    'UI',
    store.getSnapshot(),
    'json-parser',
  );

  expect(parsed?.value).toMatchObject({
    source: 'error',
    parser: { value: plan },
  });
  expect(parsed?.detail).toMatchObject({ document: null });
  expect(ui?.value).toMatchObject({ preview: null });
});

test('form inspection masks a formerly valid document when the selected SDK reports failure', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  const user = store.send('Plan');
  const json = JSON.stringify(plan);
  store.recordHistory({
    messages: [user, { id: 'answer', role: 'assistant', content: json }],
    isLoading: true,
  });
  store.recordHistory({
    messages: [user, { id: 'answer', role: 'assistant', content: json }],
    isLoading: false,
    finishReason: 'stop',
  });
  store.settle('complete', 'stop');
  store.recordAuthoring({
    assistantId: 'answer',
    json,
    value: plan,
    complete: true,
  });
  expect(store.getSnapshot().frame?.history?.authoring?.document).toEqual(plan);
  store.recordHistory({
    messages: [user],
    isLoading: false,
    error: new Error('Source failed'),
  });

  const projection = workbenchAuthoringInspection(
    'Form',
    store.getSnapshot(),
    'natural-forms',
  );

  expect(projection?.value).toMatchObject({ source: 'error', document: null });
});
