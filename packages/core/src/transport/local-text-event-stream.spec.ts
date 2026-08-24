import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { createLocalTextEventStream } from './local-text-event-stream';

const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

async function collectEvents(
  events: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const values: AGUIEvent[] = [];
  for await (const event of events) {
    values.push(event);
  }
  return values;
}

function createTextStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createReaderStream(options: {
  read: () => Promise<ReadableStreamReadResult<string>>;
  cancel?: (reason?: unknown) => Promise<void>;
}) {
  const reader = {
    read: jest.fn(options.read),
    cancel: jest.fn(options.cancel ?? (async () => undefined)),
    releaseLock: jest.fn(),
  };
  const stream = {
    getReader: jest.fn(() => reader),
  } as unknown as ReadableStream<string>;

  return { stream, reader };
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function settleWithinTask<T>(promise: Promise<T>) {
  return Promise.race([
    promise.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    ),
    new Promise<{ status: 'pending' }>((resolve) => {
      setImmediate(() => resolve({ status: 'pending' }));
    }),
  ]);
}

test('emits the complete AG-UI text lifecycle for streamed chunks', async () => {
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => createTextStream(['Hello', ' world']),
    destroy: jest.fn(),
  });

  const events = await collectEvents(response.events);

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `${input.runId}:message`,
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `${input.runId}:message`,
      delta: 'Hello',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `${input.runId}:message`,
      delta: ' world',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `${input.runId}:message`,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ] satisfies AGUIEvent[]);
});

test('emits text start and end events when the stream is empty', async () => {
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => createTextStream([]),
    destroy: jest.fn(),
  });

  const events = await collectEvents(response.events);

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `${input.runId}:message`,
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `${input.runId}:message`,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ] satisfies AGUIEvent[]);
});

test('emits RUN_STARTED before invoking start', async () => {
  const start = jest.fn(async () => createTextStream([]));
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();

  const first = await iterator.next();

  expect(first).toEqual({
    done: false,
    value: {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
  });
  expect(start).not.toHaveBeenCalled();

  await iterator.next();

  expect(start).toHaveBeenCalledWith(expect.any(AbortSignal));
});

test('propagates a rejected start without emitting local terminal events', async () => {
  const startError = new Error('start failed');
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => Promise.reject(startError),
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: EventType.RUN_STARTED },
  });

  await expect(iterator.next()).rejects.toBe(startError);
});

test('propagates a rejected read without emitting local terminal events', async () => {
  const readError = new Error('read failed');
  const stream = new ReadableStream<string>({
    pull: async () => Promise.reject(readError),
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => stream,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: EventType.RUN_STARTED },
  });
  await expect(iterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: EventType.TEXT_MESSAGE_START },
  });

  await expect(iterator.next()).rejects.toBe(readError);
});

test('rejects before iteration when the signal is already aborted', async () => {
  const abortController = new AbortController();
  const start = jest.fn(async () => createTextStream([]));
  abortController.abort('stop');
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start,
    destroy: jest.fn(),
  });

  const nextPromise = response.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toMatchObject({
    name: 'TransportError',
    retryable: false,
    code: 'PROMPT_API_ABORTED',
  });
  expect(start).not.toHaveBeenCalled();
});

test('aborts a pending start and cancels its eventual stream', async () => {
  const abortController = new AbortController();
  const startResult = createDeferred<ReadableStream<string>>();
  const start = jest.fn(() => startResult.promise);
  const destroy = jest.fn();
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
  });
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();
  const observedEvents: AGUIEvent[] = [];
  const first = await iterator.next();
  if (!first.done) {
    observedEvents.push(first.value);
  }
  const pendingNext = iterator.next();
  await Promise.resolve();

  abortController.abort('stop');

  await expect(pendingNext).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  expect(destroy).toHaveBeenCalledTimes(1);

  startResult.resolve(stream);
  await flushTasks();

  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.cancel).toHaveBeenCalledWith('stop');
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  expect(observedEvents).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ]);
});

test('external dispose cancels a pending start and its eventual stream', async () => {
  const startResult = createDeferred<ReadableStream<string>>();
  let startSignal: AbortSignal | undefined;
  const start = jest.fn((signal: AbortSignal) => {
    startSignal = signal;
    return startResult.promise;
  });
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();

  await response.dispose();
  const outcome = await settleWithinTask(pendingNext);

  startResult.resolve(stream);
  await flushTasks();

  expect(outcome).toMatchObject({
    status: 'rejected',
    reason: { code: 'PROMPT_API_ABORTED' },
  });
  expect(startSignal?.aborted).toBe(true);
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('cancels a stream acquired after cleanup begins', async () => {
  const destroy = jest.fn();
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: false, value: 'late chunk' }),
  });
  const lifecycle: { dispose?: () => Promise<void> } = {};
  let disposeResult: Promise<void> | undefined;
  const startResult = {
    then(onFulfilled: (value: ReadableStream<string>) => unknown) {
      const result = onFulfilled(stream);
      if (!lifecycle.dispose) {
        throw new Error('Expected dispose callback');
      }
      disposeResult = lifecycle.dispose();
      return Promise.resolve(result);
    },
  } as unknown as Promise<ReadableStream<string>>;
  const start = jest.fn(() => startResult);
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start,
    destroy,
  });
  lifecycle.dispose = () => response.dispose();
  const iterator = response.events[Symbol.asyncIterator]();
  const observedEvents: AGUIEvent[] = [];
  const first = await iterator.next();
  if (!first.done) {
    observedEvents.push(first.value);
  }

  const pendingNext = iterator.next();

  await expect(pendingNext).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  await disposeResult;
  expect(start).toHaveBeenCalledTimes(1);
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(reader.read).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(observedEvents.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
  ]);

  await Promise.all([
    response.dispose(),
    response.dispose(),
    iterator.return?.(),
  ]);

  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('iterator return preempts a pending start', async () => {
  const startResult = createDeferred<ReadableStream<string>>();
  const destroy = jest.fn();
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: () => startResult.promise,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();

  const returnPromise = iterator.return?.();
  if (!returnPromise) {
    throw new Error('Expected iterator return');
  }
  const [nextOutcome, returnOutcome] = await Promise.all([
    settleWithinTask(pendingNext),
    settleWithinTask(returnPromise),
  ]);

  startResult.resolve(stream);
  await flushTasks();

  expect(nextOutcome).toMatchObject({
    status: 'rejected',
    reason: { code: 'PROMPT_API_ABORTED' },
  });
  expect(returnOutcome).toEqual({
    status: 'fulfilled',
    value: { done: true, value: undefined },
  });
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('aborts a blocked read and cancels the active reader once', async () => {
  const abortController = new AbortController();
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const { stream, reader } = createReaderStream({
    read: () => readResult.promise,
  });
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start: async () => stream,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();

  abortController.abort('read-stop');

  await expect(pendingNext).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.cancel).toHaveBeenCalledWith('read-stop');
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
});

test('external abort owns cleanup while the generator is suspended at a yield', async () => {
  const abortController = new AbortController();
  const cancelError = new Error('cancel failed');
  const destroy = jest.fn();
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
    cancel: async () => Promise.reject(cancelError),
  });
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start: async () => stream,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const unhandledRejections: unknown[] = [];
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handleUnhandledRejection);

  try {
    abortController.abort('yield-stop');
    await flushTasks();

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.cancel).toHaveBeenCalledWith('yield-stop');
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toEqual([]);

    const returnPromise = iterator.return?.();
    if (!returnPromise) {
      throw new Error('Expected iterator return');
    }
    const outcomes = await Promise.allSettled([
      returnPromise,
      response.dispose(),
      response.dispose(),
    ]);
    await flushTasks();

    expect(outcomes).toEqual([
      { status: 'rejected', reason: cancelError },
      { status: 'rejected', reason: cancelError },
      { status: 'rejected', reason: cancelError },
    ]);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toEqual([]);
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  } finally {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  }
});

test('external dispose cancels a blocked read without terminal success', async () => {
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const { stream, reader } = createReaderStream({
    read: () => readResult.promise,
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => stream,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();

  await response.dispose();
  const outcome = await settleWithinTask(pendingNext);

  readResult.resolve({ done: true, value: undefined });
  await flushTasks();

  expect(outcome).toMatchObject({
    status: 'rejected',
    reason: { code: 'PROMPT_API_ABORTED' },
  });
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('iterator return preempts a blocked read', async () => {
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const destroy = jest.fn();
  const { stream, reader } = createReaderStream({
    read: () => readResult.promise,
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => stream,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();

  const returnPromise = iterator.return?.();
  if (!returnPromise) {
    throw new Error('Expected iterator return');
  }
  const [nextOutcome, returnOutcome] = await Promise.all([
    settleWithinTask(pendingNext),
    settleWithinTask(returnPromise),
  ]);

  readResult.resolve({ done: false, value: 'late chunk' });
  await flushTasks();

  expect(nextOutcome).toMatchObject({
    status: 'rejected',
    reason: { code: 'PROMPT_API_ABORTED' },
  });
  expect(returnOutcome).toEqual({
    status: 'fulfilled',
    value: { done: true, value: undefined },
  });
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('discards a chunk that resolves after abort without successful terminal events', async () => {
  const abortController = new AbortController();
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const { stream } = createReaderStream({ read: () => readResult.promise });
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start: async () => stream,
    destroy: jest.fn(),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  const observedEvents: AGUIEvent[] = [];
  for (let index = 0; index < 2; index++) {
    const result = await iterator.next();
    if (!result.done) {
      observedEvents.push(result.value);
    }
  }
  const pendingNext = iterator.next();
  await Promise.resolve();

  abortController.abort('stop');
  readResult.resolve({ done: false, value: 'late chunk' });

  await expect(pendingNext).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  expect(observedEvents.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
  ]);
});

test('iterator return before first next performs shared cleanup once', async () => {
  const start = jest.fn(async () => createTextStream([]));
  const destroy = jest.fn();
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();

  await iterator.return?.();

  expect(start).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledTimes(1);

  await Promise.all([
    iterator.return?.(),
    response.dispose(),
    response.dispose(),
  ]);

  expect(destroy).toHaveBeenCalledTimes(1);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('shares one disposer across repeated dispose and iterator return', async () => {
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
  });
  const destroy = jest.fn();
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => stream,
    destroy,
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();

  await Promise.all([
    response.dispose(),
    response.dispose(),
    iterator.return?.(),
  ]);

  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('preserves a read failure when cleanup also rejects', async () => {
  const readError = new Error('read failed');
  const cancelError = new Error('cancel failed');
  const destroyError = new Error('destroy failed');
  const { stream, reader } = createReaderStream({
    read: async () => Promise.reject(readError),
    cancel: async () => Promise.reject(cancelError),
  });
  const response = createLocalTextEventStream({
    input,
    signal: new AbortController().signal,
    start: async () => stream,
    destroy: async () => Promise.reject(destroyError),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();

  const nextPromise = iterator.next();

  await expect(nextPromise).rejects.toBe(readError);
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
});

test('owns rejected cancellation cleanup for a late stream', async () => {
  const abortController = new AbortController();
  const startResult = createDeferred<ReadableStream<string>>();
  const cancelError = new Error('cancel failed');
  const destroyError = new Error('destroy failed');
  const { stream, reader } = createReaderStream({
    read: async () => ({ done: true, value: undefined }),
    cancel: async () => Promise.reject(cancelError),
  });
  const response = createLocalTextEventStream({
    input,
    signal: abortController.signal,
    start: () => startResult.promise,
    destroy: async () => Promise.reject(destroyError),
  });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  const pendingNext = iterator.next();
  await Promise.resolve();
  const unhandledRejections: unknown[] = [];
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handleUnhandledRejection);

  try {
    abortController.abort('stop');

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    startResult.resolve(stream);
    await flushTasks();

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toEqual([]);
  } finally {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  }
});
