import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  createHistoryActions,
  observeHistory,
} from '../examples/quickstart/runtime/workbench-history-client';
import {
  createWorkbenchHistoryApp,
  workbenchHistoryKey,
} from '../examples/quickstart/runtime/workbench-history';

const text = [
  { id: 'u', role: 'user', content: 'Lighthouse' },
  {
    id: 'a',
    role: 'assistant',
    content: 'Outline, then record.',
    toolCalls: [],
  },
];
function setup() {
  const store = createWorkbenchStore('history');
  let messages: unknown[] = [];
  let state = {
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    finishReason: undefined as string | undefined,
    error: undefined as unknown,
    pendingInterrupts: undefined as unknown,
    recoveryRequired: false,
  };
  const storage = {
    getItem: vi.fn(() => null as string | null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const setter = vi.fn((next: unknown[]) => {
    messages = next;
  });
  const observation = () => ({ ...state, messages });
  const actions = createHistoryActions(
    store,
    observation,
    setter,
    () => storage,
    () => true,
  );
  const observe = () => observeHistory(store, observation());
  observe();
  const complete = (reason = 'stop') => {
    const user = store.send('Lighthouse');
    messages = [user];
    state = { ...state, isLoading: true };
    observe();
    messages = [user, text[1]];
    state = { ...state, isLoading: false, finishReason: reason };
    observe();
  };
  return {
    store,
    actions,
    storage,
    setter,
    observe,
    complete,
    observation,
    setState: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
    },
  };
}

test('explicit keep clear restore uses actual setter with fresh IDs and no request', () => {
  const s = setup();
  s.complete();

  s.actions.keep();
  s.actions.replace('clear');
  s.observe();
  s.actions.replace('restore');
  s.observe();

  expect(s.setter.mock.calls[0][0]).toEqual([]);
  expect(s.setter.mock.calls[1][0]).toEqual([
    expect.objectContaining({ role: 'user', content: 'Lighthouse' }),
    expect.objectContaining({
      role: 'assistant',
      content: text[1].content,
      toolCalls: [],
    }),
  ]);
  expect(s.setter.mock.calls[1][0][0]).not.toHaveProperty('id');
  expect(s.store.getSnapshot().turn).toBe(1);
  expect(s.store.getSnapshot().frame?.history?.successfulGeneration).toBe(
    false,
  );
});

test('slot reads are explicit and saves are successful-generation gated', () => {
  const s = setup();
  expect(s.storage.getItem).not.toHaveBeenCalled();
  s.actions.select('Harbor');
  s.actions.save();
  expect(s.storage.getItem).toHaveBeenCalledWith(workbenchHistoryKey('Harbor'));
  expect(s.storage.setItem).not.toHaveBeenCalled();

  s.complete();
  s.actions.save();

  expect(s.storage.setItem).toHaveBeenCalledWith(
    workbenchHistoryKey('Harbor'),
    JSON.stringify({
      version: 1,
      messages: [
        { role: 'user', content: 'Lighthouse' },
        { role: 'assistant', content: text[1].content },
      ],
    }),
  );
});

for (const guard of [
  { finishReason: 'length' },
  { error: new Error('failed') },
  { pendingInterrupts: { id: 'pending' } },
  { recoveryRequired: true },
  { isSending: true },
  { isReceiving: true },
  { isGenerating: true },
  { isResuming: true },
]) {
  test(`SDK guard ${Object.keys(guard)[0]} prevents programmatic mutations`, () => {
    const s = setup();
    s.complete();
    s.setState(guard);

    s.actions.save();
    if (!('finishReason' in guard)) {
      s.actions.select('Harbor');
      s.actions.clearSlot();
      s.actions.replace('clear');
    }

    expect(s.storage.setItem).not.toHaveBeenCalled();
    expect(s.setter).not.toHaveBeenCalled();
    expect(s.storage.removeItem).not.toHaveBeenCalled();
  });
}

test('setter failure releases replacement intent and records meaningful error', () => {
  const s = setup();
  s.complete();
  s.setter.mockImplementationOnce(() => {
    throw new Error('setter rejected');
  });

  s.actions.replace('clear');

  expect(s.store.getSnapshot().frame?.history?.replacement).toBeNull();
  expect(s.store.getSnapshot().frame?.history?.app.error).toContain(
    'setter rejected',
  );
});

test('replay is inert and acquisition failures preserve usable live SDK state', () => {
  const s = setup();
  s.complete();
  s.store.seek(0);
  s.actions.select('Harbor');
  s.actions.clearSlot();
  s.actions.replace('clear');
  expect(s.storage.getItem).not.toHaveBeenCalled();
  expect(s.setter).not.toHaveBeenCalled();
  s.store.live();
  const actions = createHistoryActions(
    s.store,
    s.observation,
    s.setter,
    () => {
      throw new Error('storage blocked');
    },
    () => true,
  );

  actions.select('Lighthouse');

  expect(s.store.getSnapshot().frame?.history?.app.saved.status).toBe(
    'unavailable',
  );
  expect(s.store.getSnapshot().frame?.history?.app.error).toContain(
    'storage blocked',
  );
  expect(createWorkbenchHistoryApp().retained).toBeNull();
});

test('load rechecks storage and never restores a stale cached document', () => {
  const s = setup();
  s.storage.getItem.mockReturnValue(
    JSON.stringify({
      version: 1,
      messages: text.map(({ role, content }) => ({ role, content })),
    }),
  );
  s.actions.select('Harbor');
  s.storage.getItem.mockReturnValue('{changed invalid bytes');

  s.actions.replace('load');

  expect(s.setter).not.toHaveBeenCalled();
  expect(s.store.getSnapshot().frame?.history?.app.saved.status).toBe(
    'invalid',
  );
  expect(s.storage.setItem).not.toHaveBeenCalled();
  expect(s.storage.removeItem).not.toHaveBeenCalled();
});

test('loading a valid empty document into empty SDK history cannot lock replacement intent', () => {
  const s = setup();
  s.storage.getItem.mockReturnValue(
    JSON.stringify({ version: 1, messages: [] }),
  );
  s.actions.select('Harbor');

  s.actions.replace('load');
  s.observe();

  expect(s.store.getSnapshot().frame?.history?.replacement).toBeNull();
  expect(s.actions.mutable()).toBe(true);
});

test('a genuinely ended generation without a finish reason settles incomplete and cannot save', () => {
  const s = setup();

  s.complete('');

  expect(s.store.getSnapshot().status).toBe('error');
  expect(s.actions.savable()).toBe(false);
});

test('ordinary SDK errors block history writes but permit a fresh explicit send', () => {
  const s = setup();
  s.complete();
  s.setState({ error: new Error('request failed') });
  s.observe();

  expect(s.actions.mutable()).toBe(false);
  expect(s.actions.sendable()).toBe(true);
  s.store.seek(0);
  expect(s.actions.sendable()).toBe(false);
});

test('a thrown send is captured as an application failure without a fabricated SDK error', () => {
  const s = setup();
  s.store.send('Explicit prompt');

  s.actions.failSend(new Error('send rejected'));

  expect(s.store.getSnapshot().status).toBe('error');
  expect(s.store.getSnapshot().frame?.history?.sdk.error).toBeNull();
  expect(s.store.getSnapshot().frame?.history?.app.error).toBe('send rejected');
});
