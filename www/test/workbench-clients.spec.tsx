// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  canAcceptSummary,
  messageOrigins,
  mountWorkbench,
  playbackDelay,
  readWorkbenchMessages,
  stopWorkbench,
  workbenchEventLabel,
} from '../examples/quickstart/runtime/workbench-view';

test('binds assistant cards to the preceding user turn without changing earlier origins', () => {
  const origins = {
    u1: { turn: 1, revision: 0 },
    u2: { turn: 2, revision: 1 },
  };

  const result = messageOrigins(
    [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'assistant' },
    ],
    origins,
  );

  expect(result.a1).toEqual({ turn: 1, revision: 0 });
  expect(result.a2).toEqual({ turn: 2, revision: 1 });
  expect(origins).not.toHaveProperty('a1');
});

test('requires a current completed valid proposal and blocks playback, stale origins and reused cards', () => {
  const ready = {
    cursor: null,
    turn: 1,
    status: 'complete',
    application: { revision: 0, plan: null },
  } as const;
  const proposal = {
    title: 'Ship a small demo',
    steps: ['Expose a card', 'Render the card'],
  };
  const origin = { turn: 1, revision: 0 };

  expect(canAcceptSummary(ready, origin, proposal, false)).toBe(true);
  expect(
    canAcceptSummary({ ...ready, cursor: 0 }, origin, proposal, false),
  ).toBe(false);
  expect(
    canAcceptSummary({ ...ready, status: 'loading' }, origin, proposal, false),
  ).toBe(false);
  expect(canAcceptSummary(ready, { ...origin, turn: 0 }, proposal, false)).toBe(
    false,
  );
  expect(
    canAcceptSummary(ready, { ...origin, revision: 1 }, proposal, false),
  ).toBe(false);
  expect(canAcceptSummary(ready, origin, proposal, true)).toBe(false);
  expect(canAcceptSummary(ready, origin, { title: '', steps: [] }, false)).toBe(
    false,
  );
});

test('caps recorded playback pauses while retaining timestamp order and speed', () => {
  expect(playbackDelay(100, 5100, 1)).toBe(1200);
  expect(playbackDelay(100, 500, 2)).toBe(200);
  expect(playbackDelay(500, 100, 1)).toBe(40);
});

test('replay renders captured text without live controls and cleanup stops playback', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const send = vi.fn();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send,
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Plan my demo');
  store.parsed({
    ui: [
      {
        SummaryCard: {
          props: {
            title: 'A captured plan',
            steps: ['First step', 'Second step'],
          },
        },
      },
    ],
  });
  store.settle('complete', 'stop');

  store.seek(store.getSnapshot().events.length - 1);
  const sendButton = host.querySelector<HTMLButtonElement>('[data-send]');
  shell.dispose();
  vi.runAllTimers();

  expect(sendButton?.disabled).toBe(true);
  expect(host.textContent).toBe('');
  expect(send).not.toHaveBeenCalled();
  vi.useRealTimers();
});

test('keeps both captured assistant cards in conversation order at the replay cursor', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  for (const title of ['First plan', 'Shorter plan']) {
    store.send(`Request ${title}`);
    const content = {
      ui: [{ SummaryCard: { props: { title, steps: ['Outline', 'Record'] } } }],
    };
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: title,
      delta: JSON.stringify(content),
    });
    store.parsed(content);
    store.settle('complete', 'stop');
  }

  store.seek(store.getSnapshot().events.length - 1);
  const replay = host.querySelector<HTMLElement>('[data-replay]');
  const text = replay?.textContent ?? '';

  expect([...(replay?.children ?? [])].map((node) => node.tagName)).toEqual([
    'P',
    'ARTICLE',
    'P',
    'ARTICLE',
  ]);
  expect(replay?.querySelectorAll('article')).toHaveLength(2);
  expect(text.indexOf('First plan')).toBeLessThan(
    text.indexOf('Request Shorter plan'),
  );
  expect(replay?.querySelector('button')).toBeNull();
  shell.dispose();
});

test('seeks with explicit event controls and stops scheduled playback on dispose', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'Angular',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Create a plan');
  store.record('tool', {
    name: 'readContext',
    result: store.getSnapshot().application,
  });
  store.settle('cancelled');
  const byText = (text: string) =>
    [...host.querySelectorAll('button')].find(
      (button) => button.textContent === text,
    ) ??
    (() => {
      throw new Error(`Missing ${text} button`);
    })();

  byText('Previous event').click();
  expect(store.getSnapshot().cursor).toBe(1);
  byText('Next event').click();
  expect(store.getSnapshot().cursor).toBe(2);
  byText('Play').click();
  shell.dispose();
  const selected = store.getSnapshot().cursor;
  vi.runAllTimers();

  expect(store.getSnapshot().cursor).toBe(selected);
  expect(host.childElementCount).toBe(0);
  vi.useRealTimers();
});

test('offers scoped Details Raw and Console views with concise captured request data', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Create a plan');
  store.record('request', { requestId: 'r1', input: { messages: [] } });
  store.parsed({
    ui: [
      {
        SummaryCard: {
          props: { title: 'Trusted plan', steps: ['Outline', 'Record'] },
        },
      },
    ],
  });
  store.settle('complete', 'stop');
  const detail = host.querySelector('aside');
  const tabs = [...(detail?.querySelectorAll('button[role=tab]') ?? [])];

  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'Details',
    'Raw',
    'Console',
  ]);
  expect(detail?.textContent).toContain('Trusted plan');
  expect(detail?.textContent).toContain('Turn 1');
  (tabs[2] as HTMLButtonElement | undefined)?.click();
  expect(detail?.textContent).toContain('Request');
  shell.dispose();
});

test('reset and teardown never stop an idle, completed, errored or cancelled runtime', () => {
  for (const status of ['idle', 'complete', 'error', 'cancelled'] as const) {
    const store = createWorkbenchStore();
    if (status !== 'idle') {
      store.send('Plan');
      store.settle(status, 'stop');
    }
    const stop = vi.fn(() => {
      throw new Error('Cannot stop streaming messages when not streaming.');
    });

    expect(() =>
      stopWorkbench(store, {
        isLoading: false,
        isSending: false,
        isReceiving: false,
        isGenerating: false,
        stop,
      }),
    ).not.toThrow();

    expect(stop).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe(status);
  }
});

test('stop invalidates the loading capture before stopping each busy runtime phase', () => {
  for (const phase of [
    'isLoading',
    'isSending',
    'isReceiving',
    'isGenerating',
  ] as const) {
    const store = createWorkbenchStore();
    store.send('Plan');
    const stop = vi.fn(() => {
      expect(store.getSnapshot().status).toBe('cancelled');
    });

    stopWorkbench(store, {
      isLoading: false,
      isSending: false,
      isReceiving: false,
      isGenerating: false,
      [phase]: true,
      stop,
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(store.getSnapshot().status).toBe('cancelled');
  }
});

test('labels captured fixture provenance and pauses playback when selecting the live conversation', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Plan');
  store.record('source', { source: 'test-fixture' });
  store.settle('complete', 'stop');
  const play = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Play',
  );
  const conversation = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Two-step plan',
  );

  play?.click();
  conversation?.click();
  vi.runAllTimers();

  expect(host.querySelector('[data-source]')?.textContent).toBe('Test fixture');
  expect(store.getSnapshot().cursor).toBeNull();
  shell.dispose();
  vi.useRealTimers();
});

test('retained conversation navigation selects sessions without clearing their captured state', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  store.send('Keep this thread');
  store.settle('complete', 'stop');
  const select = vi.fn();
  const create = vi.fn();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  shell.navigation({
    currentId: 'one',
    conversations: [
      { id: 'one', label: 'Two-step plan' },
      { id: 'two', label: 'Conversation 2' },
    ],
    select,
    create,
  });
  [...host.querySelectorAll('button')]
    .find((button) => button.textContent === 'Conversation 2')
    ?.click();
  [...host.querySelectorAll('button')]
    .find((button) => button.textContent === 'New conversation')
    ?.click();

  expect(select).toHaveBeenCalledWith('two');
  expect(create).toHaveBeenCalledOnce();
  expect(store.getSnapshot().turn).toBe(1);
  shell.dispose();
});

test('retains safe Angular message history without reading a throwing failed resource', () => {
  const previous = [
    { id: 'user-1', role: 'user', content: 'Keep my failed conversation' },
  ];
  const read = vi.fn(() => {
    throw new Error('Intentional provider failure');
  });

  const result = readWorkbenchMessages(
    new Error('Intentional provider failure'),
    read,
    previous,
  );

  expect(result).toBe(previous);
  expect(read).not.toHaveBeenCalled();
});

test('uses the current Angular resource messages while it is healthy', () => {
  const messages = [
    { id: 'user-2', role: 'user', content: 'A new conversation' },
  ];
  const read = vi.fn(() => messages);

  const result = readWorkbenchMessages(undefined, read, []);

  expect(result).toBe(messages);
  expect(read).toHaveBeenCalledOnce();
});

test('keeps every inspector panel visible and exposes raw timeline frames on demand', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Plan');
  for (let index = 0; index < 20; index++)
    store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: 'x' });
  store.settle('cancelled');
  const timeline = host.querySelector('.wb-events');
  const toggle = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Raw events',
  );

  expect(host.querySelector<HTMLElement>('.wb-inspector')?.hidden).toBe(false);
  expect(host.querySelector<HTMLElement>('.wb-detail')?.hidden).toBe(false);
  expect(timeline?.querySelectorAll('button')).toHaveLength(3);
  toggle?.click();

  expect(toggle).toBeDefined();
  expect(timeline?.querySelectorAll('button')).toHaveLength(22);
  expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  (timeline?.querySelectorAll('button')[5] as HTMLButtonElement).click();
  expect(store.getSnapshot().cursor).toBe(5);
  shell.dispose();
});

test('keeps the latest browser tool result legible in the live Requests context', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'tools',
      title: 'Tools',
      format: 'ui',
      inspector: 'Requests',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Plan');
  store.record('tool', {
    name: 'readContext',
    result: { revision: 1, plan: null },
  });
  store.record('request', {
    requestId: 'continuation-id',
    input: { messages: [] },
  });
  store.settle('complete', 'stop');

  const context = host.querySelector('.wb-detail');

  expect(context?.textContent).toContain('"revision": 1');
  expect(context?.textContent).not.toContain('continuation-id');
  shell.dispose();
});

test('does not label an earlier turn tool result as the current request context', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'tools',
      title: 'Tools',
      format: 'ui',
      inspector: 'Requests',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Plan');
  store.record('request', { requestId: 'first-request' });
  store.record('tool', {
    name: 'readContext',
    result: { previousTurnOnly: true },
  });
  store.settle('complete', 'stop');
  store.send('Shorter');
  expect(host.querySelector('.wb-detail')?.textContent).not.toContain(
    'first-request',
  );
  store.record('request', { requestId: 'second-turn' });
  store.record('event', { type: 'RUN_STARTED' });

  const context = host.querySelector('.wb-detail');

  expect(context?.textContent).toContain('second-turn');
  expect(context?.textContent).not.toContain('previousTurnOnly');
  shell.dispose();
});

test('shows the shared plan contract separately from the parsed preview in the Schema view', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('structured');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'schemas',
      title: 'Schemas',
      format: 'structured',
      inspector: 'Schema',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  const inspection = host.querySelector('.wb-inspector');

  expect(
    inspection?.querySelector('[role=tab][aria-selected=true]')?.textContent,
  ).toBe('Schema');
  expect(inspection?.textContent).toContain('"type": "object"');
  expect(inspection?.textContent).toContain('"steps"');
  expect(host.querySelector('.wb-detail')?.textContent).toContain(
    'Preview validation',
  );
  shell.dispose();
});

test('labels a whole decision response without implying streamed generation', () => {
  const store = createWorkbenchStore('decision');
  store.send('The outline is complete');
  store.record('event', {
    kind: 'hashbrown.decision',
    version: 1,
    value: { nextAction: 'record' },
    meta: { nextAction: { confidence: 0.9 } },
  });

  const event = store.getSnapshot().events.at(-1);

  expect(event && workbenchEventLabel(event)).toBe('Decision response');
});

test('replays a captured choice and the app-owned plan without live application controls', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('decision');
  const message = store.send('The outline is complete');
  store.recordDecision({ nextAction: 'record', confidence: 0.95 }, message.id);
  store.settle('complete', 'stop');
  const chosenIndex = store.getSnapshot().events.length - 1;
  store.applyDecision();
  store.seek(chosenIndex);
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'decisions',
      title: 'Decisions',
      format: 'decision',
      inspector: 'JSON',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  const replay = host.querySelector('[data-replay]');

  expect(
    replay?.querySelector('[aria-label="Application plan"]'),
  ).not.toBeNull();
  expect(replay?.textContent).toContain('record');
  expect(replay?.textContent).toContain('95%');
  expect(replay?.querySelector('button')).toBeNull();
  expect(store.getSnapshot().frame?.application.nextAction).toBeNull();
  store.live();
  expect(store.getSnapshot().application.nextAction).toBe('record');
  shell.dispose();
});

test('keeps the debugging denial control separate from application writes and disables it in replay', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const setDebugDenied = vi.fn();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'debugging',
      title: 'Debugging',
      format: 'ui',
      inspector: 'Requests',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    setDebugDenied,
  });
  const checkbox = host.querySelector<HTMLInputElement>('input[type=checkbox]');

  expect(checkbox?.checked).toBe(true);
  if (checkbox) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
  }
  expect(setDebugDenied).toHaveBeenCalledWith(false);
  expect(store.getSnapshot().application.revision).toBe(0);
  store.send('Plan');
  store.settle('error');
  store.seek(0);
  expect(checkbox?.disabled).toBe(true);
  shell.dispose();
});

test('historical provenance and HTTP evidence follow the selected failed turn', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'Angular',
    lesson: {
      id: 'debugging',
      title: 'Debugging',
      format: 'ui',
      inspector: 'Requests',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.send('Denied');
  store.record('source', { source: 'demo-failure' });
  store.record('response', {
    status: 403,
    url: '/api/workbench/debugging?demoDenied=1',
    problem: 'demo-context-denied',
  });
  store.settle('error');
  const failure = store.getSnapshot().events.length - 1;
  store.send('Retry');
  expect(host.querySelector('[data-source]')?.textContent).toBe(
    'Awaiting source',
  );
  const retry = store.getSnapshot().events.length - 1;
  store.record('source', { source: 'provider' });
  store.settle('complete', 'stop');

  expect(host.querySelector('[data-source]')?.textContent).toBe('Live model');
  store.seek(retry);
  expect(host.querySelector('[data-source]')?.textContent).toBe(
    'Awaiting source',
  );
  store.seek(failure);
  expect(host.querySelector('[data-source]')?.textContent).toBe(
    'Local demo failure',
  );
  expect(host.querySelector('.wb-request-list')?.textContent).toContain(
    'HTTP 403',
  );
  expect(host.querySelector('.wb-detail')?.textContent).toContain(
    'demo-context-denied',
  );
  shell.dispose();
});

test('transformation inspector isolates added instructions and keeps the actual trace available in Raw', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'request-transformation',
      title: 'Request transformation',
      format: 'ui',
      inspector: 'Transform',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  const before = {
    model: 'demo-model',
    instructions: 'Original instructions',
    toolNames: ['readContext'],
    responseFormat: { type: 'json_schema' },
  };
  const trace = {
    before,
    after: {
      ...before,
      instructions: 'Original instructions\n\nPublic workspace policy',
    },
    preserved: { model: true },
  };

  store.send('Plan');
  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.request-transformation',
    value: trace,
  });
  store.settle('complete', 'stop');

  const inspection = host.querySelector('.wb-inspector') ?? host;
  expect(inspection.textContent).toContain('Public workspace policy');
  expect(inspection.textContent).not.toContain('Original instructions');
  const raw = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Raw',
  );
  raw?.click();
  expect(host.querySelector('.wb-detail')?.textContent).toContain(
    'Original instructions',
  );
  shell.dispose();
});
