import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchUiInspection } from '../examples/quickstart/runtime/workbench-ui-inspection';

const plan = { title: 'Demo', steps: ['Outline.', 'Record.'] };

test('inspects actual captured kit metadata without serializing component implementations', () => {
  const store = createWorkbenchStore('ui', { uiLesson: 'ui-kits' });
  store.recordUiKit({
    registryMap: new Map([
      [
        'SummaryCard',
        { name: 'SummaryCard', description: 'Summary', fallback: () => null },
      ],
      ['StepsCard', { name: 'StepsCard', description: 'Steps' }],
    ]),
    serializedSchema: '{"type":"object","description":"Actual SDK schema"}',
  });

  const kit = workbenchUiInspection('Kit', store.getSnapshot(), 'ui-kits');
  const schema = workbenchUiInspection(
    'Schema',
    store.getSnapshot(),
    'ui-kits',
  );

  expect(kit?.value).toMatchObject({
    components: [
      { name: 'SummaryCard', description: 'Summary', fallback: true },
      { name: 'StepsCard', description: 'Steps', fallback: false },
    ],
  });
  expect(JSON.stringify(kit)).not.toContain('=>');
  expect(schema?.value).toEqual({
    type: 'object',
    description: 'Actual SDK schema',
  });
});

test('UI inspection follows the selected historical component and application revision', () => {
  const store = createWorkbenchStore('ui', { uiLesson: 'ui-kits' });
  store.send('Summary');
  store.parsed({
    ui: [{ SummaryCard: { props: { value: plan, complete: true } } }],
  });
  store.settle('complete', 'stop');
  const earlier = store.getSnapshot().events.length - 1;
  store.send('Steps');
  store.parsed({
    ui: [{ StepsCard: { props: { value: plan, complete: true } } }],
  });
  store.settle('complete', 'stop');

  expect(
    workbenchUiInspection('UI', store.getSnapshot(), 'ui-kits')?.value,
  ).toMatchObject({ component: 'StepsCard' });
  store.seek(earlier);

  expect(
    workbenchUiInspection('UI', store.getSnapshot(), 'ui-kits')?.value,
  ).toMatchObject({ component: 'SummaryCard' });
  expect(store.getSnapshot().frame?.messages.at(-1)?.uiComponent).toBe(
    'SummaryCard',
  );
});

test('read-only UI is identified and other lessons retain their own inspection', () => {
  const store = createWorkbenchStore('ui', { uiLesson: 'ui-chatbot' });
  store.send('Read');
  store.parsed({
    ui: [{ PlanReading: { props: { value: plan, complete: true } } }],
  });

  expect(
    workbenchUiInspection('UI', store.getSnapshot(), 'ui-chatbot')?.value,
  ).toMatchObject({ component: 'PlanReading', acceptanceAction: false });
  expect(
    workbenchUiInspection('UI', store.getSnapshot(), 'tools'),
  ).toBeUndefined();
  expect(
    workbenchUiInspection('Requests', store.getSnapshot(), 'ui-chatbot'),
  ).toBeUndefined();
});
