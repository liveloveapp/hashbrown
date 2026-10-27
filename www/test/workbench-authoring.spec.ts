import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { observeHistory } from '../examples/quickstart/runtime/workbench-history-client';
import {
  createAuthoringActions,
  decodeWorkbenchAuthoringDocument,
} from '../examples/quickstart/runtime/workbench-authoring';

const plan = { title: 'Demo', steps: ['Outline.', 'Record.'] };
const input = (assistantId = 'answer', json = JSON.stringify(plan)) => ({
  assistantId,
  json,
  value: plan,
  complete: true,
});
function complete(store: ReturnType<typeof createWorkbenchStore>) {
  const user = store.send('Create plan');
  observeHistory(store, { messages: [user], isLoading: true });
  observeHistory(store, {
    messages: [
      user,
      { id: 'answer', role: 'assistant', content: JSON.stringify(plan) },
    ],
    isLoading: false,
    finishReason: 'stop',
  });
  store.recordAuthoring(input());
}

test('validates original JSON including members withheld by the parser and bounded trimmed fields', () => {
  expect(decodeWorkbenchAuthoringDocument(JSON.stringify(plan))).toEqual(plan);
  for (const value of [
    { ...plan, hidden: true },
    { title: '', steps: plan.steps },
    { ...plan, steps: ['one'] },
    { ...plan, steps: ['one', 2] },
  ]) {
    expect(decodeWorkbenchAuthoringDocument(JSON.stringify(value))).toBeNull();
  }
  expect(decodeWorkbenchAuthoringDocument('{')).toBeNull();
});

test('reviews edits and applies once only after actual successful SDK completion', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  complete(store);

  expect(store.reviewAuthoring()).toBe(true);
  expect(store.editAuthoring('title', ' Edited ')).toBe(true);
  expect(store.applyAuthoring()).toBe(true);
  expect(store.getSnapshot().application).toMatchObject({
    revision: 1,
    plan: { ...plan, title: 'Edited' },
  });
  expect(store.applyAuthoring()).toBe(false);
});

test('rejects partial stopped invalid stale replay and inactive application actions', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  complete(store);
  expect(createAuthoringActions(store, () => false).review()).toBe(false);
  expect(store.recordAuthoring({ ...input(), complete: false })).toBe(true);
  expect(store.reviewAuthoring()).toBe(false);
  store.recordAuthoring(input());
  expect(store.reviewAuthoring()).toBe(true);
  store.seek(0);
  expect(store.applyAuthoring()).toBe(false);
  store.live();
  const user = store.send('Revise');
  expect(store.recordAuthoring(input())).toBe(false);
  expect(store.applyAuthoring()).toBe(false);
  observeHistory(store, {
    messages: [
      user,
      { id: 'new', role: 'assistant', content: JSON.stringify(plan) },
    ],
    isLoading: false,
    finishReason: 'length',
  });
  store.recordAuthoring(input('new'));
  expect(store.reviewAuthoring()).toBe(false);
});

test('invalid reviewed fields leave application untouched and original invalid JSON cannot be reviewed', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  complete(store);
  store.reviewAuthoring();
  store.editAuthoring('step-1', ' ');

  expect(store.applyAuthoring()).toBe(false);
  expect(store.getSnapshot().application.revision).toBe(0);
  expect(store.getSnapshot().frame?.history?.authoring?.error).toContain(
    '1–200',
  );
  expect(
    store.recordAuthoring({ ...input(), error: new Error('parser failed') }),
  ).toBe(true);
  expect(
    store.getSnapshot().frame?.history?.authoring?.parser.value,
  ).toBeNull();
  expect(store.reviewAuthoring()).toBe(false);
});

test('captures turn zero parser observations without enabling review and keeps historical edits inert', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  store.recordHistory({ messages: [], isLoading: false });

  expect(
    store.recordAuthoring({
      assistantId: null,
      json: '',
      value: undefined,
      complete: false,
    }),
  ).toBe(true);
  expect(store.getSnapshot().frame?.history?.authoring?.source).toBe('idle');
  expect(store.reviewAuthoring()).toBe(false);
  complete(store);
  store.reviewAuthoring();
  const history = store.getSnapshot().frame;
  store.seek(0);
  expect(store.editAuthoring('title', 'historical')).toBe(false);
  expect(store.recordAuthoring(input())).toBe(false);
  store.live();
  expect(store.getSnapshot().frame).toEqual(history);
});

test('captures actual custom agent trace with only safe allowlisted fields', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  const user = store.send('Outline');
  store.recordHistory({ messages: [user], isLoading: true });
  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.agent-decision',
    value: {
      value: { route: 'outline', secret: 'hidden' },
      meta: { route: { confidence: 0.9 }, secret: 'hidden' },
      handler: 'outline',
      fallback: null,
      apiKey: 'hidden',
    },
  });

  expect(store.getSnapshot().frame?.history?.agent).toEqual({
    value: { route: 'outline' },
    meta: { route: { confidence: 0.9 } },
    handler: 'outline',
    fallback: null,
  });
});

test('parser and ordinary history stores cannot review or apply even under forced actions', () => {
  for (const mode of [undefined, 'parser'] as const) {
    const store = createWorkbenchStore('history', { authoringMode: mode });
    complete(store);

    expect(store.reviewAuthoring()).toBe(false);
    expect(store.editAuthoring('title', 'forced')).toBe(false);
    expect(store.applyAuthoring()).toBe(false);
    expect(store.getSnapshot().application.revision).toBe(0);
  }
});

test('SDK failure hides parser previews and stopped partials never become successful', () => {
  for (const cancelled of [false, true]) {
    const store = createWorkbenchStore('history', { authoringMode: 'form' });
    const user = store.send('Generate');
    const messages = [
      user,
      { id: 'answer', role: 'assistant', content: JSON.stringify(plan) },
    ];
    observeHistory(store, { messages, isLoading: true });
    store.recordAuthoring({ ...input(), complete: false });
    if (cancelled) store.settle('cancelled');
    observeHistory(store, {
      messages,
      isLoading: false,
      error: cancelled ? undefined : new Error('provider failed'),
    });
    store.recordAuthoring(input());

    expect(store.getSnapshot().frame?.history?.authoring?.source).toBe(
      cancelled ? 'stopped' : 'error',
    );
    if (!cancelled)
      expect(
        store.getSnapshot().frame?.history?.authoring?.parser.value,
      ).toBeNull();
    expect(store.reviewAuthoring()).toBe(false);
    expect(store.applyAuthoring()).toBe(false);
  }
});

test('completed authoring turns allow intentional SDK clear restore and load replacements', () => {
  for (const action of ['clear', 'restore', 'load'] as const) {
    const store = createWorkbenchStore('history', { authoringMode: 'form' });
    complete(store);
    const history = store.getSnapshot().frame?.history;
    if (!history) throw new Error('Expected captured history');
    const replaced =
      action === 'clear'
        ? []
        : [
            { id: 'restored-user', role: 'user', content: 'Restored' },
            {
              id: 'restored-assistant',
              role: 'assistant',
              content: JSON.stringify(plan),
            },
          ];

    expect(store.recordHistoryApp(history.app, action)).toBe(true);
    expect(store.recordHistory({ messages: replaced, isLoading: false })).toBe(
      true,
    );
    expect(store.getSnapshot().frame?.history?.replacement).toBeNull();
    expect(store.getSnapshot().frame?.history?.sdk.messages).toEqual(replaced);
    expect(store.recordAuthoring(input())).toBe(false);
    expect(store.applyAuthoring()).toBe(false);
    expect(store.send('Fresh generation').role).toBe('user');
  }
});

test('review edit and Apply recheck actual SDK assistant identity before the next parser observation', () => {
  for (const replacement of [
    { id: 'replacement', content: JSON.stringify(plan) },
    { id: 'answer', content: JSON.stringify({ ...plan, title: 'New draft' }) },
  ]) {
    const store = createWorkbenchStore('history', { authoringMode: 'form' });
    complete(store);
    expect(store.reviewAuthoring()).toBe(true);
    const user = store
      .getSnapshot()
      .frame?.history?.sdk.messages.find(
        (message) => message['role'] === 'user',
      );

    expect(
      store.recordHistory({
        messages: [user, { ...replacement, role: 'assistant' }],
        isLoading: false,
        finishReason: 'stop',
      }),
    ).toBe(true);
    expect(store.reviewAuthoring()).toBe(false);
    expect(store.editAuthoring('title', 'Stale edit')).toBe(false);
    expect(store.applyAuthoring()).toBe(false);
    expect(store.getSnapshot().application.revision).toBe(0);
  }
});

test('authoring actions require current actual SDK stop even if an idle setter retains older success', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  complete(store);
  store.reviewAuthoring();
  const messages = store.getSnapshot().frame?.history?.sdk.messages ?? [];

  store.recordHistory({ messages, isLoading: false });

  expect(store.reviewAuthoring()).toBe(false);
  expect(store.editAuthoring('title', 'Stale edit')).toBe(false);
  expect(store.applyAuthoring()).toBe(false);
});

test('old idle SDK and parser observations cannot adopt a newer completed turn identity', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  complete(store);
  const oldMessages = store.getSnapshot().frame?.history?.sdk.messages ?? [];
  const user = store.send('Create a new plan');
  const newPlan = { ...plan, title: 'New plan' };
  const newMessages = [
    user,
    { id: 'new-answer', role: 'assistant', content: JSON.stringify(newPlan) },
  ];
  observeHistory(store, { messages: [user], isLoading: true });
  observeHistory(store, {
    messages: newMessages,
    isLoading: false,
    finishReason: 'stop',
  });
  store.recordAuthoring({
    assistantId: 'new-answer',
    json: JSON.stringify(newPlan),
    value: newPlan,
    complete: true,
  });
  expect(store.reviewAuthoring()).toBe(true);

  expect(
    store.recordHistory({
      messages: oldMessages,
      isLoading: false,
      finishReason: 'stop',
    }),
  ).toBe(true);

  expect(store.recordAuthoring(input())).toBe(false);
  expect(store.reviewAuthoring()).toBe(false);
  expect(store.applyAuthoring()).toBe(false);
  expect(store.getSnapshot().application.revision).toBe(0);
  expect(newMessages).not.toEqual(oldMessages);
});
