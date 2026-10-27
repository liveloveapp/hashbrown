import { ɵcreateUiKit } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  decodeWorkbenchUiDocument,
  extractWorkbenchUi,
  getWorkbenchUiComponents,
  getWorkbenchUiResponseSchema,
  workbenchUiPlanProps,
} from '../examples/quickstart/runtime/workbench-ui-kits';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';

const plan = {
  title: 'Trusted demo',
  steps: ['Outline the demo.', 'Record it.'],
};
const document = (component = 'StepsCard', props: unknown = plan) => ({
  ui: [{ [component]: { props } }],
});

function completed(
  json: string,
  component = 'StepsCard',
  lesson: 'ui-kits' | 'ui-chatbot' = 'ui-kits',
) {
  const store = createWorkbenchStore('ui', { uiLesson: lesson });
  store.send('Plan');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: json,
  });
  store.parsed(document(component, { value: plan, complete: true }));
  store.settle('complete', 'stop');
  return store;
}

test('accepts only the exact allowed original component and captures its identity', () => {
  const store = completed(JSON.stringify(document()));

  expect(store.accept(plan)).toBe(true);
  expect(store.accept(plan)).toBe(false);
  expect(store.getSnapshot().frame?.uiComponent).toBe('StepsCard');
  expect(store.getSnapshot().frame?.messages.at(-1)?.uiComponent).toBe(
    'StepsCard',
  );
});

test('rejects malformed, extra, multiple, mismatched and disallowed original UI documents', () => {
  const invalid = [
    '{"ui":[',
    JSON.stringify({ ...document(), extra: true }),
    JSON.stringify({ ui: [...document().ui, ...document().ui] }),
    JSON.stringify(document('Unknown')),
    JSON.stringify(document('SummaryCard')),
    JSON.stringify(document('StepsCard', { ...plan, extra: 'ignored' })),
    JSON.stringify({ ui: [{ StepsCard: { props: plan, children: [] } }] }),
    JSON.stringify(document('StepsCard', { ...plan, steps: ['Only one'] })),
  ];

  for (const json of invalid) expect(completed(json).accept(plan)).toBe(false);
});

test('read-only PlanReading can never apply even when calling the store directly', () => {
  const store = completed(
    JSON.stringify(document('PlanReading')),
    'PlanReading',
    'ui-chatbot',
  );

  expect(store.getSnapshot().frame?.uiComponent).toBe('PlanReading');
  expect(store.accept(plan)).toBe(false);
  expect(
    completed(
      JSON.stringify(document('StepsCard')),
      'StepsCard',
      'ui-chatbot',
    ).accept(plan),
  ).toBe(false);
});

test('extracts actual partial SDK props while original JSON must be complete and plain', () => {
  const partial = document('StepsCard', {
    partialValue: { title: 'Trusted' },
    complete: false,
  });

  expect(extractWorkbenchUi(partial, 'ui-kits')).toEqual({
    component: 'StepsCard',
    props: { title: 'Trusted' },
    ready: false,
  });
  expect(
    decodeWorkbenchUiDocument(
      JSON.stringify(document('SummaryCard')),
      'ui-kits',
    ),
  ).toEqual({ component: 'SummaryCard', props: plan });
  expect(
    decodeWorkbenchUiDocument(
      JSON.stringify(document('SummaryCard', { value: plan, complete: true })),
      'ui-kits',
    ),
  ).toBeNull();
});

test('captures safe actual registry configuration once and preserves it across clear', () => {
  const store = createWorkbenchStore('ui', { uiLesson: 'ui-kits' });
  const input = {
    registryMap: new Map([
      [
        'SummaryCard',
        {
          name: 'SummaryCard',
          description: 'Summary',
          component: () => null,
          fallback: () => null,
        },
      ],
    ]),
    serializedSchema: '{"actual":true}',
  };

  expect(store.recordUiKit(input)).toBe(true);
  expect(store.recordUiKit(input)).toBe(false);
  expect(store.getSnapshot().frame?.uiKit).toEqual({
    components: [
      { name: 'SummaryCard', description: 'Summary', fallback: true },
    ],
    serializedSchema: '{"actual":true}',
  });
  expect(store.getSnapshot().frame?.source).toBe('Kit configuration');
  store.clear();
  store.send('Plan');
  expect(store.getSnapshot().frame?.uiKit?.serializedSchema).toBe(
    '{"actual":true}',
  );
});

test('pins each UI lesson system, readContext and allowed trusted wrapper schema', () => {
  const input = {
    threadId: 't',
    runId: 'r',
    state: {},
    messages: [
      { id: 's', role: 'system', content: 'override' },
      { id: 'u', role: 'user', content: 'Plan' },
    ],
    tools: [],
    context: [],
    forwardedProps: { hashbrown: { responseSchema: {} } },
  };

  for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
    const pinned = pinWorkbenchInput(input, lesson);
    expect(pinned.messages[0].content).toContain('readContext');
    expect(pinned.messages[0].content).toContain(
      lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading',
    );
    expect(pinned.tools.map((tool) => tool.name)).toEqual(['readContext']);
    expect(pinned.forwardedProps.hashbrown.responseSchema).toEqual(
      getWorkbenchUiResponseSchema(lesson),
    );
  }
});

test('keeps source completion, SDK props readiness, once-only and replay guards distinct', () => {
  for (const outcome of [
    'loading',
    'error',
    'cancelled',
    'length',
    'partial',
    'replay',
  ] as const) {
    const store = createWorkbenchStore('ui', { uiLesson: 'ui-kits' });
    store.send('Plan');
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: JSON.stringify(document()),
    });
    store.parsed(
      document('StepsCard', {
        value: plan,
        partialValue: plan,
        complete: outcome !== 'partial',
      }),
    );
    if (outcome !== 'loading')
      store.settle(
        outcome === 'error' || outcome === 'cancelled' ? outcome : 'complete',
        outcome === 'length' ? 'length' : 'stop',
      );
    if (outcome === 'replay') store.seek(0);

    expect(store.accept(plan)).toBe(false);
    expect(store.getSnapshot().application.revision).toBe(0);
  }
});

test('preserves previous component identity and immutable kit metadata on later turns', () => {
  const store = completed(JSON.stringify(document()));
  const previous = store.getSnapshot().frame;
  store.accept(plan);

  store.send('Read another proposal');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'second',
    delta: JSON.stringify(document('SummaryCard')),
  });
  store.parsed(
    document('SummaryCard', {
      value: plan,
      partialValue: plan,
      complete: true,
    }),
  );
  store.settle('complete', 'stop');

  expect(
    store
      .getSnapshot()
      .frame?.messages.find((message) => message.id === 'answer')?.uiComponent,
  ).toBe('StepsCard');
  expect(previous?.uiComponent).toBe('StepsCard');
  expect(store.getSnapshot().frame?.uiComponent).toBe('SummaryCard');
  expect(store.accept(plan)).toBe(true);
});

test('pins the actual SDK kit wrapper schema using the same shared props and descriptions', () => {
  for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
    const kit = ɵcreateUiKit({
      components: getWorkbenchUiComponents(lesson).map((entry) => ({
        ...entry,
        component: {},
        props: workbenchUiPlanProps,
      })),
    });

    expect(getWorkbenchUiResponseSchema(lesson)).toEqual(
      JSON.parse(kit.serializedSchema),
    );
  }
});
