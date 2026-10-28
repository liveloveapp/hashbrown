import { expect, test } from 'vitest';
import { EventType } from '@ag-ui/core';
import type { Transport, TransportRequest } from '@hashbrownai/core';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import {
  createWorkbenchLocalTransport,
  normalizeWorkbenchLocalModelObservation,
} from '../examples/quickstart/runtime/workbench-local-models';

test('local preparation observations contain bounded immutable data only', () => {
  const input = { operationId: 'prepare-1', state: 'preparing', progress: 30 };

  const captured = normalizeWorkbenchLocalModelObservation(input);
  input.progress = 90;

  expect(captured).toEqual({
    operationId: 'prepare-1',
    state: 'preparing',
    progress: 30,
  });
  expect(Object.isFrozen(captured)).toBe(true);
  for (const invalid of [
    null,
    [],
    { ...input, session: {} },
    { ...input, progress: NaN },
    { ...input, progress: 101 },
    { ...input, state: 'invented' },
    { ...input, operationId: '' },
    { ...input, issue: 'x'.repeat(2001) },
  ])
    expect(normalizeWorkbenchLocalModelObservation(invalid)).toBeNull();
});

test('preparation captures at turn zero without applying state and rejects stale or replay writes', () => {
  const store = createWorkbenchStore('structured');

  expect(store.beginLocalPreparation('first')).toBe(true);
  expect(store.getSnapshot().frame?.localModel?.state).toBe('preparing');
  expect(store.getSnapshot().turn).toBe(0);
  expect(store.getSnapshot().application).toEqual({ revision: 0, plan: null });
  expect(store.beginLocalPreparation('second')).toBe(true);
  expect(
    store.recordLocalPreparation({ operationId: 'first', state: 'ready' }),
  ).toBe(false);
  expect(
    store.recordLocalPreparation({ operationId: 'second', state: 'ready' }),
  ).toBe(true);
  const captured = store.getSnapshot().frame;
  store.seek(0);
  expect(store.beginLocalPreparation('replay')).toBe(false);
  expect(
    store.recordLocalPreparation({ operationId: 'second', state: 'error' }),
  ).toBe(false);
  store.live();
  store.send('Make a plan');
  expect(
    store.recordLocalPreparation({ operationId: 'second', state: 'error' }),
  ).toBe(false);
  expect(store.getSnapshot().frame?.localModel?.state).toBe('ready');
  store.clear();
  expect(
    store.recordLocalPreparation({ operationId: 'second', state: 'ready' }),
  ).toBe(false);
  expect(captured?.localModel?.state).toBe('ready');
});

test('local transport captures the effective immutable context and delegates actual lazy events and disposal', async () => {
  const store = createWorkbenchStore('structured');
  store.beginLocalPreparation('prepare');
  store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });
  store.send('Make a plan');
  const dispose = () => undefined;
  let observed: TransportRequest | undefined;
  let reads = 0;
  const delegate: Transport = {
    name: 'explicit-test-seam',
    async send(request) {
      observed = request;
      return {
        dispose,
        events: (async function* () {
          reads++;
          yield {
            type: EventType.RUN_STARTED,
            threadId: 't',
            runId: 'r',
          } as const;
        })(),
      };
    },
  };
  const request: TransportRequest = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [{ id: 'policy', role: 'system', content: 'Fixed policy' }],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
  };

  const response = await createWorkbenchLocalTransport(store, {
    delegate,
  }).send(request);

  expect(reads).toBe(0);
  expect(response.dispose).toBe(dispose);
  expect(request.input.messages[0]).toEqual({
    id: 'policy',
    role: 'system',
    content: 'Fixed policy',
  });
  expect(observed?.input.messages[0]).toMatchObject({
    role: 'system',
    content: expect.stringContaining('"revision":0,"plan":null'),
  });
  expect(
    store.getSnapshot().events.find((event) => event.kind === 'request')
      ?.payload,
  ).toMatchObject({ url: 'native:chrome', input: observed?.input });
  expect(
    store.getSnapshot().events.some((event) => event.kind === 'response'),
  ).toBe(false);
  expect(
    store.getSnapshot().events.find((event) => event.kind === 'source')
      ?.payload,
  ).toEqual({ source: 'local-model' });
  for await (const event of response.events)
    expect(event.type).toBe('RUN_STARTED');
  expect(reads).toBe(1);
});

test('local lesson uses the shared structured contract without an HTTP endpoint', () => {
  expect(
    workbenchLessons.find((lesson) => lesson.id === 'local-models'),
  ).toMatchObject({
    format: 'structured',
    protocol: 'local',
    inspector: 'Model',
    endpoint: '',
  });
});

test('local acceptance requires the successful original complete JSON document and current revision', () => {
  const proposal = { title: 'Plan', steps: ['Outline.', 'Record the demo.'] };
  for (const document of [
    '',
    '{"title":"Plan","steps":["Outline.","Record the demo."]',
    JSON.stringify({ ...proposal, extra: true }),
    JSON.stringify({ ...proposal, title: 'Different' }),
  ]) {
    const store = createWorkbenchStore('structured', { localModel: true });
    store.beginLocalPreparation('prepare');
    store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });
    store.send('Plan');
    store.record('source', { source: 'local-model' });
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'answer',
      delta: document,
    });
    store.parsed(proposal);
    store.settle('complete', 'stop');

    expect(store.accept(proposal)).toBe(false);
  }
  const store = createWorkbenchStore('structured', { localModel: true });
  store.beginLocalPreparation('prepare');
  store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });
  store.send('Plan');
  store.record('source', { source: 'local-model' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(proposal),
  });
  store.parsed(proposal);
  store.settle('complete', 'stop');

  expect(store.accept(proposal)).toBe(true);
  expect(store.accept(proposal)).toBe(false);
  expect(store.getSnapshot().application).toEqual({
    revision: 1,
    plan: proposal,
  });
});

test('local transport refuses replay or generation before preparation without invoking the delegate', async () => {
  const store = createWorkbenchStore('structured');
  let calls = 0;
  const transport = createWorkbenchLocalTransport(store, {
    delegate: {
      name: 'test-seam',
      async send() {
        calls++;
        throw new Error('unexpected');
      },
    },
  });
  const request: TransportRequest = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
  };
  store.send('Plan');

  await expect(transport.send(request)).rejects.toThrow('Prepare');
  expect(calls).toBe(0);
});

test('a follow-up local request receives only the current accepted application snapshot', async () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  const plan = {
    title: 'Demo',
    steps: ['Outline.', 'Record a short demonstration.'],
  };
  const inputs: TransportRequest['input'][] = [];
  const transport = createWorkbenchLocalTransport(store, {
    delegate: {
      name: 'test-seam',
      async send(request) {
        inputs.push(request.input);
        return {
          events: (async function* () {
            yield {
              type: EventType.RUN_STARTED,
              threadId: 't',
              runId: 'r',
            } as const;
          })(),
        };
      },
    },
  });
  const request: TransportRequest = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
  };
  store.beginLocalPreparation('prepare');
  store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });
  store.send('Make a plan');
  await transport.send(request);
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(plan),
  });
  store.parsed(plan);
  store.settle('complete', 'stop');
  expect(store.accept(plan)).toBe(true);
  store.send('Shorten the second step');

  await transport.send(request);

  expect(inputs[0].messages[0]).toMatchObject({
    content: expect.stringContaining('"revision":0,"plan":null'),
  });
  expect(inputs[1].messages[0]).toMatchObject({
    content: expect.stringContaining(JSON.stringify({ revision: 1, plan })),
  });
  expect(request.input.messages).toEqual([]);
});

test('the actual native transport refuses an unprepared download without creating a session', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'LanguageModel');
  let creations = 0;
  Object.defineProperty(globalThis, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => 'downloadable',
      create: async () => {
        creations++;
        throw new Error('No automatic downloads');
      },
    },
  });
  const store = createWorkbenchStore('structured');
  store.beginLocalPreparation('prepare');
  store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });
  store.send('Generate');
  const request: TransportRequest = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [{ id: 'user', role: 'user', content: 'Generate a plan' }],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
  };

  try {
    await expect(
      createWorkbenchLocalTransport(store).send(request),
    ).rejects.toThrow('Prepare model');
    expect(creations).toBe(0);
    expect(store.getSnapshot().status).toBe('error');
    expect(
      store.getSnapshot().events.some((event) => event.kind === 'response'),
    ).toBe(false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'LanguageModel', previous);
    else Reflect.deleteProperty(globalThis, 'LanguageModel');
  }
});

test('a fresh preparation attempt withholds the previous local proposal until preparation is ready', () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  const proposal = { title: 'Plan', steps: ['Outline.', 'Record.'] };
  store.beginLocalPreparation('first');
  store.recordLocalPreparation({ operationId: 'first', state: 'ready' });
  store.send('Plan');
  store.record('source', { source: 'local-model' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(proposal),
  });
  store.parsed(proposal);
  store.settle('complete', 'stop');
  store.beginLocalPreparation('second');

  expect(store.accept(proposal)).toBe(false);
});
