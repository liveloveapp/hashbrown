import { type AGUIEvent, EventType } from '@ag-ui/core';
import { Chat } from './models';
import { type ChatRuntime, createChatRuntime } from './chat-runtime';
import { s } from './schema';
import type { Transport, TransportRequest } from './transport';

function successfulEvents(
  request: TransportRequest,
  middle: readonly AGUIEvent[] = [],
): AsyncIterable<AGUIEvent> {
  const identity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };

  return (async function* () {
    yield { type: EventType.RUN_STARTED, ...identity };
    yield* middle;
    yield { type: EventType.RUN_FINISHED, ...identity };
  })();
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForRuntimeIdle(runtime: {
  readonly isLoading: () => boolean;
}): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!runtime.isLoading()) return;

    await flushTaskBoundary();
  }

  throw new Error('Timed out waiting for the chat runtime to become idle');
}

test('infers shared state and preserves the default runtime generic', () => {
  const runtime = createChatRuntime({
    system: 'test',
    state: { accountId: 'account-1' },
  });
  const legacy: ChatRuntime<string, Chat.AnyTool> = createChatRuntime({
    system: 'test',
  });

  const inferred: { accountId: string } | undefined = runtime.state();
  const defaulted: unknown | undefined = legacy.state();
  const invalidStateWrite = () => {
    // @ts-expect-error accountId is required and must be a string.
    runtime.setState({ accountId: 2 });
  };
  runtime.setState({ accountId: 'account-2' });

  expect(inferred).toEqual({ accountId: 'account-1' });
  expect(defaulted).toBeUndefined();
  expect(invalidStateWrite).toEqual(expect.any(Function));
});

test('appends state after the existing structured runtime generics', () => {
  const schema = s.object('result', { answer: s.string('answer') });
  const runtime = createChatRuntime<
    typeof schema,
    Chat.AnyTool,
    s.InferSchemaOutput<typeof schema>,
    { accountId: string }
  >({
    responseSchema: schema,
    state: { accountId: 'account-1' },
    system: 'test',
  });

  const state: { accountId: string } | undefined = runtime.state();

  expect(state).toEqual({ accountId: 'account-1' });
});

test('owns initial state synchronously', () => {
  const initial = { nested: { count: 1 } };
  const runtime = createChatRuntime({ system: 'test', state: initial });

  initial.nested.count = 8;

  expect(runtime.state()).toEqual({ nested: { count: 1 } });
  expect(runtime.state()).not.toBe(initial);
  expect(Object.isFrozen(runtime.state())).toBe(true);
  expect(Object.isFrozen(runtime.state()?.nested)).toBe(true);
});

test('owns manually replaced state synchronously', () => {
  const replacement = { nested: { count: 2 } };
  const runtime = createChatRuntime({
    system: 'test',
    state: { nested: { count: 1 } },
  });

  runtime.setState(replacement);
  replacement.nested.count = 9;

  expect(runtime.state()).toEqual({ nested: { count: 2 } });
  expect(runtime.state()).not.toBe(replacement);
  expect(Object.isFrozen(runtime.state())).toBe(true);
  expect(Object.isFrozen(runtime.state()?.nested)).toBe(true);
});

test('rejects invalid initial state synchronously', () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;

  const createInvalidRuntime = () =>
    createChatRuntime({ system: 'test', state: cyclic });

  expect(createInvalidRuntime).toThrow('cyclic values are not JSON-compatible');
});

test('rejects invalid manual state synchronously without changing state', () => {
  const runtime = createChatRuntime({
    system: 'test',
    state: { accountId: 'account-1' },
  });

  const replaceWithInvalidState = () =>
    runtime.setState({
      accountId: Number.POSITIVE_INFINITY,
    } as unknown as { accountId: string });

  expect(replaceWithInvalidState).toThrow('numbers must be finite');
  expect(runtime.state()).toEqual({ accountId: 'account-1' });
});

test('setState publishes synchronously without scheduling generation', async () => {
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const transport: Transport = { name: 'test', send };
  const runtime = createChatRuntime({ system: 'test', transport });
  const values: unknown[] = [];
  const unsubscribe = runtime.state.subscribe((value) => values.push(value));
  const teardown = runtime.start();

  try {
    runtime.setState({ count: 1 });
    await flushTaskBoundary();

    expect(runtime.state()).toEqual({ count: 1 });
    expect(values).toEqual([undefined, { count: 1 }]);
    expect(send).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    teardown();
  }
});

test('rejects writes from synchronous scheduling until logical settlement', async () => {
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'test',
    state: { count: 0 },
    transport: { name: 'test', send },
  });
  const teardown = runtime.start();

  try {
    await flushTaskBoundary();
    runtime.sendMessage({ role: 'user', content: 'Update state.' });

    expect(() => runtime.setState({ count: 1 })).toThrow(
      'Cannot set shared state while generation is in progress.',
    );
    await waitForRuntimeIdle(runtime);
    expect(() => runtime.setState({ count: 2 })).not.toThrow();
    expect(runtime.state()).toEqual({ count: 2 });
  } finally {
    teardown();
  }
});

test.each([
  {
    name: 'sendMessage',
    schedule: (runtime: ChatRuntime<string, Chat.AnyTool, { count: number }>) =>
      runtime.sendMessage({ role: 'user', content: 'Synchronize.' }),
  },
  {
    name: 'setMessages',
    schedule: (runtime: ChatRuntime<string, Chat.AnyTool, { count: number }>) =>
      runtime.setMessages([{ role: 'user', content: 'Synchronize.' }]),
  },
  {
    name: 'resendMessages',
    schedule: (runtime: ChatRuntime<string, Chat.AnyTool, { count: number }>) =>
      runtime.resendMessages(),
  },
])('rejects a state write after reentrant $name scheduling', ({ schedule }) => {
  const runtime = createChatRuntime({
    system: 'test',
    state: { count: 0 },
  });
  let writeResult: unknown = 'returned';
  const unsubscribe = runtime.state.subscribe((value) => {
    if (value?.count !== 1) return;

    schedule(runtime);
    try {
      runtime.setState({ count: 2 });
    } catch (error) {
      writeResult = error;
    }
  });

  runtime.setState({ count: 1 });

  expect(writeResult).toEqual(
    new Error('Cannot set shared state while generation is in progress.'),
  );
  expect(runtime.state()).toEqual({ count: 1 });
  unsubscribe();
});

test('retains reentrant write reservations across multiple queued scheduling calls', () => {
  const runtime = createChatRuntime({
    system: 'test',
    state: { count: 0 },
  });
  let writeResult: unknown = 'returned';
  const unsubscribe = runtime.state.subscribe((value) => {
    if (value?.count !== 1) return;

    runtime.sendMessage({ role: 'user', content: 'First.' });
    runtime.setMessages([{ role: 'user', content: 'Second.' }]);
    runtime.resendMessages();
    try {
      runtime.setState({ count: 2 });
    } catch (error) {
      writeResult = error;
    }
  });

  runtime.setState({ count: 1 });

  expect(writeResult).toEqual(
    new Error('Cannot set shared state while generation is in progress.'),
  );
  expect(runtime.state()).toEqual({ count: 1 });
  unsubscribe();
});

test('allows an immediate write when a loading subscriber synchronously stops generation', async () => {
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'test',
    state: { count: 0 },
    transport: { name: 'test', send },
  });
  let stopped = false;
  const unsubscribe = runtime.isLoading.subscribe((isLoading) => {
    if (!isLoading || stopped) return;

    stopped = true;
    runtime.stop();
  });
  const teardown = runtime.start();

  try {
    await flushTaskBoundary();

    runtime.sendMessage({ role: 'user', content: 'Stop immediately.' });
    runtime.setState({ count: 2 });

    expect(stopped).toBe(true);
    expect(runtime.state()).toEqual({ count: 2 });
  } finally {
    unsubscribe();
    teardown();
  }
});

test('an output-free resend preserves the lossless local message projection', async () => {
  // Arrange
  const structuredContent = { prompt: 'Preserve this value.' };
  const initialMessages: Chat.Message<string, Chat.AnyTool>[] = [
    { role: 'user', content: structuredContent },
    { role: 'error', content: 'local error' },
  ];
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'test',
    messages: initialMessages,
    transport: { name: 'test', send },
  });
  const initialProjection = runtime.messages();
  const teardown = runtime.start();

  try {
    // Act
    runtime.resendMessages();
    await waitForRuntimeIdle(runtime);

    const resentProjection = runtime.messages();

    // Assert
    expect(send).toHaveBeenCalledTimes(1);
    expect(resentProjection).toBe(initialProjection);
    expect(resentProjection).toEqual(initialMessages);
    expect(resentProjection[0]?.content).toBe(structuredContent);
  } finally {
    teardown();
  }
});

test('publishes live snapshots and deltas before committing successful state', async () => {
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request, [
      { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
      {
        type: EventType.STATE_DELTA,
        delta: [
          { op: 'replace', path: '/count', value: 2 },
          { op: 'add', path: '/status', value: 'ready' },
        ],
      },
    ]),
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'test',
    state: { count: 0 },
    transport: { name: 'test', send },
  });
  const values: unknown[] = [];
  const unsubscribe = runtime.state.subscribe((value) => values.push(value));
  const teardown = runtime.start();

  try {
    await flushTaskBoundary();
    runtime.sendMessage({ role: 'user', content: 'Synchronize.' });
    await waitForRuntimeIdle(runtime);

    expect(values).toEqual([
      { count: 0 },
      { count: 1 },
      { count: 2, status: 'ready' },
    ]);
    expect(runtime.state()).toEqual({ count: 2, status: 'ready' });
  } finally {
    unsubscribe();
    teardown();
  }
});

test('publishes rollback after a failed state synchronization attempt', async () => {
  const transportError = new Error('stream failed');
  const send = jest.fn(async (request: TransportRequest) => {
    const identity = {
      threadId: request.input.threadId,
      runId: request.input.runId,
    };

    return {
      events: (async function* (): AsyncGenerator<AGUIEvent> {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } };
        throw transportError;
      })(),
    };
  });
  const runtime = createChatRuntime({
    debounce: 0,
    retries: 0,
    system: 'test',
    state: { count: 0 },
    transport: { name: 'test', send },
  });
  const values: unknown[] = [];
  const unsubscribe = runtime.state.subscribe((value) => values.push(value));
  const teardown = runtime.start();

  try {
    await flushTaskBoundary();
    runtime.sendMessage({ role: 'user', content: 'Synchronize.' });
    await waitForRuntimeIdle(runtime);

    expect(values).toEqual([{ count: 0 }, { count: 9 }, { count: 0 }]);
    expect(runtime.state()).toEqual({ count: 0 });
    expect(runtime.error()).toBe(transportError);
  } finally {
    unsubscribe();
    teardown();
  }
});

test('projects visible shared state and attempt status to devtools', async () => {
  const sendDevtools = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({
          error: jest.fn(),
          init: jest.fn(),
          send: sendDevtools,
          unsubscribe: jest.fn(),
        }),
      },
    },
  });
  const send = jest.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request, [
      { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
    ]),
  }));

  try {
    const runtime = createChatRuntime({
      debugName: 'shared-state-test',
      debounce: 0,
      system: 'test',
      state: { count: 0 },
      transport: { name: 'test', send },
    });
    const teardown = runtime.start();
    await flushTaskBoundary();
    runtime.sendMessage({ role: 'user', content: 'Synchronize.' });
    await waitForRuntimeIdle(runtime);

    const projections = sendDevtools.mock.calls.map(([, value]) => value);
    expect(projections).toContainEqual(
      expect.objectContaining({
        state: { count: 1 },
        stateAttemptActive: true,
      }),
    );
    expect(projections.at(-1)).toEqual(
      expect.objectContaining({
        state: { count: 1 },
        stateAttemptActive: false,
      }),
    );
    teardown();
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
