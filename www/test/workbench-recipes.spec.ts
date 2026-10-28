import { expect, test } from 'vitest';
import {
  createWorkbenchStore,
  workbenchDecisionPlan,
} from '../examples/quickstart/runtime/workbench';
import { isWorkbenchPredictions } from '../examples/quickstart/runtime/workbench-recipes';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import {
  pinWorkbenchDecisionInput,
  pinWorkbenchInput,
} from '../examples/quickstart/server/workbench-app';

test('new lessons have explicit protocols and fixed initial application state', () => {
  const expected = [
    ['magic-text', 'text', 'chat'],
    ['predictions', 'predictions', 'chat'],
    ['ui-selection', 'selection', 'decision'],
  ];

  for (const [id, format, protocol] of expected) {
    expect(workbenchLessons.find((lesson) => lesson.id === id)).toMatchObject({
      format,
      protocol,
    });
    expect(
      createWorkbenchStore(format as 'text').getSnapshot().application.plan,
    ).toEqual(workbenchDecisionPlan);
  }
  expect(workbenchLessons).toHaveLength(29);
});

test('predictions validate unique known bounded actions and permit an empty result', () => {
  const valid = {
    contextId: 'request',
    suggestions: [{ actionId: 'record', reason: 'Ready.' }],
  };

  expect(isWorkbenchPredictions(valid)).toBe(true);
  expect(isWorkbenchPredictions({ ...valid, suggestions: [] })).toBe(true);
  for (const suggestions of [
    [...valid.suggestions, ...valid.suggestions],
    [{ actionId: 'delete', reason: 'No' }],
    [{ actionId: 'record', reason: ' ' }],
    [{ actionId: 'record', reason: 'x'.repeat(141) }],
  ]) {
    expect(isWorkbenchPredictions({ ...valid, suggestions })).toBe(false);
  }
});

test('predictions require current complete context and accepting invalidates siblings', () => {
  const store = createWorkbenchStore('predictions');
  const request = store.send('Suggest next actions');
  const reply = {
    kind: 'predictions' as const,
    contextId: request.id,
    suggestions: [
      { actionId: 'record' as const, reason: 'Ready.' },
      { actionId: 'review' as const, reason: 'Check it.' },
    ],
  };
  store.recordRecipe(reply, 'old');
  expect(store.getSnapshot().frame?.recipe).toBeUndefined();
  store.recordRecipe(reply, request.id);
  reply.suggestions[0].reason = 'Mutated';
  expect(store.acceptPrediction('record')).toBe(false);
  store.settle('complete', 'stop');

  expect(store.dismissPrediction('review')).toBe(true);
  expect(store.getSnapshot().application.revision).toBe(0);
  expect(store.acceptPrediction('record')).toBe(true);
  expect(store.acceptPrediction('review')).toBe(false);
  expect(store.acceptPrediction('record')).toBe(false);
  expect(store.getSnapshot().application.acceptedActions).toEqual(['record']);
  expect(store.getSnapshot().frame?.recipe).toMatchObject({
    suggestions: [{ reason: 'Ready.' }, { reason: 'Check it.' }],
  });
  store.seek(0);
  expect(store.acceptPrediction('record')).toBe(false);
});

test('stale context, failed completion and accepted IDs cannot be applied', () => {
  for (const status of ['error', 'cancelled', 'complete'] as const) {
    const store = createWorkbenchStore('predictions');
    const request = store.send('Suggest');
    store.recordRecipe(
      {
        kind: 'predictions',
        contextId: request.id,
        suggestions: [{ actionId: 'record', reason: 'Ready' }],
      },
      request.id,
    );
    store.settle(status, 'length');

    expect(store.acceptPrediction('record')).toBe(false);
  }
  const store = createWorkbenchStore('predictions');
  const request = store.send('Suggest');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: 'stale',
      suggestions: [{ actionId: 'record', reason: 'Ready' }],
    },
    request.id,
  );
  store.settle('complete', 'stop');

  expect(store.acceptPrediction('record')).toBe(false);
});

test('manual selection works before a request and invalidates pending model responses', () => {
  const store = createWorkbenchStore('selection');

  expect(store.manualSelection('summary')).toBe(true);
  expect(store.getSnapshot().application).toMatchObject({
    revision: 1,
    selectedView: 'summary',
  });
  expect(store.getSnapshot().events.at(-1)?.kind).toBe('choose');
  const request = store.send('Show steps');
  expect(store.manualSelection('steps')).toBe(true);
  store.recordRecipe(
    { kind: 'selection', selected: ['summary'], confidence: 1 },
    request.id,
  );
  store.settle('complete', 'stop');
  expect(store.applySelection()).toBe(false);
  expect(store.getSnapshot().application).toMatchObject({
    revision: 2,
    selectedView: 'steps',
  });
});

test('selection requires a whole confident completed result and replay cannot apply it', () => {
  const store = createWorkbenchStore('selection');
  const request = store.send('Show summary');
  store.recordRecipe(
    { kind: 'selection', selected: ['summary'], confidence: 0.9 },
    request.id,
  );
  expect(store.applySelection()).toBe(false);
  store.settle('complete', 'stop');

  expect(store.applySelection()).toBe(true);
  expect(store.applySelection()).toBe(false);
  store.seek(0);
  expect(store.manualSelection('steps')).toBe(false);
});

test('raw Markdown is captured immutably and citation inspection never applies a plan', () => {
  const store = createWorkbenchStore('text');
  const request = store.send('Explain');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: '# Plan',
  });
  const reply = {
    kind: 'text' as const,
    markdown: '# Plan',
  };
  store.recordRecipe(reply, request.id);
  store.settle('complete', 'stop');
  reply.markdown = 'Mutated externally';

  expect(store.getSnapshot().frame?.recipe).toMatchObject({
    markdown: '# Plan',
  });
  expect(
    store.inspectCitation(
      { id: 'docs', number: 1, url: 'https://hashbrown.dev' },
      'answer',
    ),
  ).toBe(true);
  expect(store.getSnapshot().application.revision).toBe(0);
  store.seek(0);
  expect(
    store.inspectCitation(
      { id: 'docs', number: 1, url: 'https://hashbrown.dev' },
      'answer',
    ),
  ).toBe(false);
});

test('server pins text, prediction and selection contracts by trusted lesson', () => {
  const input = {
    threadId: 'thread',
    runId: 'run',
    state: {},
    messages: [{ id: 'user', role: 'user', content: 'Explain' }],
    tools: [],
    context: [],
    forwardedProps: {},
  };

  const text = pinWorkbenchInput(input, 'magic-text');
  const predictions = pinWorkbenchInput(input, 'predictions');
  expect(text.tools.map((tool) => tool.name)).toEqual(['readContext']);
  expect(text.forwardedProps).toEqual({ hashbrown: { ui: false } });
  expect(predictions.tools).toEqual([]);
  expect(JSON.stringify(predictions.forwardedProps)).toContain('contextId');
  expect(() => pinWorkbenchInput(input, 'ui-selection')).toThrow();
  const selection = pinWorkbenchDecisionInput(
    {
      state: {
        input: {
          requestId: 'id',
          prompt: 'Show steps',
          application: { revision: 0, selectedView: null },
        },
      },
    },
    'ui-selection',
  );
  expect(selection.questions).toMatchObject({
    pick: {
      options: { summary: expect.any(String), steps: expect.any(String) },
    },
  });
});

test('a low confidence empty selection remains observable but cannot apply', () => {
  const store = createWorkbenchStore('selection');
  const request = store.send('Choose a view');

  expect(
    store.recordRecipe(
      { kind: 'selection', selected: [], confidence: 0.2 },
      request.id,
    ),
  ).toBe(true);
  store.settle('complete', 'stop');
  expect(store.getSnapshot().frame?.recipe).toEqual({
    kind: 'selection',
    selected: [],
    confidence: 0.2,
  });
  expect(store.applySelection()).toBe(false);
  expect(store.manualSelection('summary')).toBe(true);
});

test('accepted actions stay excluded even if a later completion proposes the same ID', () => {
  const store = createWorkbenchStore('predictions');
  const first = store.send('Suggest');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: first.id,
      suggestions: [{ actionId: 'record', reason: 'Ready' }],
    },
    first.id,
  );
  store.settle('complete', 'stop');
  store.acceptPrediction('record');
  const second = store.send('Suggest again');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: second.id,
      suggestions: [{ actionId: 'record', reason: 'Again' }],
    },
    second.id,
  );
  store.settle('complete', 'stop');

  expect(store.acceptPrediction('record')).toBe(false);
  expect(store.getSnapshot().application.revision).toBe(1);
  expect(store.getSnapshot().application.acceptedActions).toEqual(['record']);
});

test('a new recipe request preserves SDK transport request IDs while capturing source and raw text', () => {
  const store = createWorkbenchStore('text');
  store.send('Explain');

  store.record('request', { runId: 'sdk-run' }, 'sdk-request');
  store.record(
    'event',
    {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'native-answer',
      delta: '# Plan',
    },
    'sdk-request',
  );

  expect(store.getSnapshot().frame?.json).toBe('# Plan');
  expect(
    store.getSnapshot().events.filter((event) => event.kind === 'request'),
  ).toHaveLength(1);
});
