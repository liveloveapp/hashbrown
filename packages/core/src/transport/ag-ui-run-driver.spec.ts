import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from './transport';
import { TransportError } from './transport-error';
import { createHashbrownRunAgentInput } from './hashbrown-run-agent-input';
import { runAgUiAttempt } from './ag-ui-run-driver';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createRequest(): TransportRequest {
  const threadId = 'thread-id';
  const runId = 'run-id';

  return {
    input: createHashbrownRunAgentInput({
      threadId,
      runId,
      messages: [],
      tools: [],
    }),
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: runId,
  };
}

function createEvents(events: AGUIEvent[]): AsyncIterable<AGUIEvent> {
  return (async function* () {
    yield* events;
  })();
}

function createStarted(request: TransportRequest): AGUIEvent {
  return {
    type: EventType.RUN_STARTED,
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
}

function createFinished(request: TransportRequest): AGUIEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
}

function createTransport(
  send: Transport['send'],
): Transport & { send: jest.MockedFunction<Transport['send']> } {
  return {
    name: 'test-transport',
    send: jest.fn(send),
  };
}

function runAttempt({
  transport,
  request = createRequest(),
  cancelSignal = new AbortController().signal,
  retiredSignal = new AbortController().signal,
  onStarted = jest.fn(),
  onEvent = jest.fn(),
}: {
  transport: Transport;
  request?: TransportRequest;
  cancelSignal?: AbortSignal;
  retiredSignal?: AbortSignal;
  onStarted?: () => void;
  onEvent?: (event: AGUIEvent) => void;
}) {
  return runAgUiAttempt({
    transport,
    request,
    cancelSignal,
    retiredSignal,
    onStarted,
    onEvent,
  });
}

test('sends one request and reports a validated finished run', async () => {
  const request = createRequest();
  const started = createStarted(request);
  const middle: AGUIEvent = {
    type: EventType.CUSTOM,
    name: 'middle',
    value: { ok: true },
  };
  const finished = createFinished(request);
  const dispose = jest.fn();
  const transport = createTransport(async () => ({
    events: createEvents([started, middle, finished]),
    dispose,
  }));
  const onStarted = jest.fn();
  const onEvent = jest.fn();

  const outcome = await runAttempt({
    transport,
    request,
    onStarted,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'finished' });
  expect(transport.send).toHaveBeenCalledWith(request);
  expect(transport.send).toHaveBeenCalledTimes(1);
  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
    started,
    middle,
    finished,
  ]);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('returns a named server error without converting RUN_ERROR to a protocol failure', async () => {
  const request = createRequest();
  const runError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server rejected the run',
  };
  const transport = createTransport(async () => ({
    events: createEvents([createStarted(request), runError]),
  }));
  const onEvent = jest.fn();

  const outcome = await runAttempt({ transport, request, onEvent });

  expect(outcome).toMatchObject({
    kind: 'server-error',
    error: { message: 'server rejected the run' },
  });
  expect(onEvent).toHaveBeenLastCalledWith(runError);
});

test.each([
  {
    label: 'an event before RUN_STARTED',
    events: (request: TransportRequest) => [createFinished(request)],
    message: `Received ${EventType.RUN_FINISHED} before RUN_STARTED`,
  },
  {
    label: 'a duplicate RUN_STARTED',
    events: (request: TransportRequest) => [
      createStarted(request),
      createStarted(request),
    ],
    message: 'Received duplicate RUN_STARTED',
  },
  {
    label: 'a mismatched RUN_STARTED',
    events: (request: TransportRequest) => [
      {
        ...createStarted(request),
        runId: `${request.input.runId}:other`,
      } as AGUIEvent,
    ],
    message: 'RUN_STARTED identity does not match the attempted run',
  },
  {
    label: 'a mismatched RUN_FINISHED',
    events: (request: TransportRequest) => [
      createStarted(request),
      {
        ...createFinished(request),
        threadId: `${request.input.threadId}:other`,
      } as AGUIEvent,
    ],
    message: 'RUN_FINISHED identity does not match the active run',
  },
])(
  'rejects $label as a retryable protocol error',
  async ({ events, message }) => {
    const request = createRequest();
    const transport = createTransport(async () => ({
      events: createEvents(events(request)),
    }));

    const attempt = runAttempt({ transport, request });

    await expect(attempt).rejects.toMatchObject({
      name: 'TransportError',
      message,
      retryable: true,
      code: 'PROTOCOL_ERROR',
    });
  },
);

test('validates against request identity captured before transport mutation', async () => {
  const request = createRequest();
  const mutatedIdentity = {
    threadId: `${request.input.threadId}:mutated`,
    runId: `${request.input.runId}:mutated`,
  };
  const transport = createTransport(async () => {
    Object.assign(request.input, mutatedIdentity);

    return {
      events: createEvents([
        { type: EventType.RUN_STARTED, ...mutatedIdentity },
        { type: EventType.RUN_FINISHED, ...mutatedIdentity },
      ] as AGUIEvent[]),
    };
  });

  const attempt = runAttempt({ transport, request });

  await expect(attempt).rejects.toMatchObject({
    name: 'TransportError',
    message: 'RUN_STARTED identity does not match the attempted run',
    code: 'PROTOCOL_ERROR',
  });
});

test.each([
  {
    label: 'before RUN_STARTED',
    events: () => [],
    message: 'Generation stream ended before RUN_STARTED',
  },
  {
    label: 'before a terminal event',
    events: (request: TransportRequest) => [createStarted(request)],
    message: 'Generation stream ended before RUN_FINISHED or RUN_ERROR',
  },
])('rejects premature stream close $label', async ({ events, message }) => {
  const request = createRequest();
  const transport = createTransport(async () => ({
    events: createEvents(events(request)),
  }));

  const attempt = runAttempt({ transport, request });

  await expect(attempt).rejects.toMatchObject({
    name: 'TransportError',
    message,
    retryable: true,
    code: 'PROTOCOL_ERROR',
  });
});

test.each([
  { label: 'missing', events: undefined },
  { label: 'not async iterable', events: {} },
])(
  'rejects a $label event stream and disposes the response',
  async ({ events }) => {
    const dispose = jest.fn();
    const response = { events, dispose } as unknown as TransportResponse;
    const transport = createTransport(async () => response);

    const attempt = runAttempt({ transport });

    await expect(attempt).rejects.toEqual(
      new TransportError('Transport response did not provide an event stream', {
        retryable: true,
        code: 'PROTOCOL_ERROR',
      }),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { label: 'cancellation', cancel: true, retire: false, kind: 'cancelled' },
  { label: 'retirement', cancel: false, retire: true, kind: 'retired' },
  {
    label: 'simultaneous cancellation and retirement',
    cancel: true,
    retire: true,
    kind: 'retired',
  },
] as const)(
  'returns $kind without sending when $label happens before send',
  async ({ cancel, retire, kind }) => {
    const cancelController = new AbortController();
    const retiredController = new AbortController();
    if (cancel) {
      cancelController.abort();
    }
    if (retire) {
      retiredController.abort();
    }
    const transport = createTransport(async () => {
      throw new Error('send must not run');
    });

    const outcome = await runAttempt({
      transport,
      cancelSignal: cancelController.signal,
      retiredSignal: retiredController.signal,
    });

    expect(outcome).toEqual({ kind });
    expect(transport.send).not.toHaveBeenCalled();
  },
);

test.each([
  { label: 'cancellation', retire: false, kind: 'cancelled' },
  { label: 'retirement', retire: true, kind: 'retired' },
] as const)(
  'interrupts a pending send on $label and disposes a late response',
  async ({ retire, kind }) => {
    const delayedSend = createDeferred<TransportResponse>();
    const disposed = createDeferred<void>();
    const dispose = jest.fn(() => disposed.resolve());
    const transport = createTransport(() => delayedSend.promise);
    const cancelController = new AbortController();
    const retiredController = new AbortController();

    const attempt = runAttempt({
      transport,
      cancelSignal: cancelController.signal,
      retiredSignal: retiredController.signal,
    });
    if (retire) {
      retiredController.abort();
    } else {
      cancelController.abort();
    }
    const outcome = await attempt;
    delayedSend.resolve({ events: createEvents([]), dispose });
    await disposed.promise;

    expect(outcome).toEqual({ kind });
    expect(dispose).toHaveBeenCalledTimes(1);
  },
);

test('suppresses a late send rejection after cancellation', async () => {
  const delayedSend = createDeferred<TransportResponse>();
  const transport = createTransport(() => delayedSend.promise);
  const cancelController = new AbortController();

  const attempt = runAttempt({
    transport,
    cancelSignal: cancelController.signal,
  });
  cancelController.abort();
  const outcome = await attempt;
  delayedSend.reject(new Error('late send rejection'));
  await Promise.resolve();

  expect(outcome).toEqual({ kind: 'cancelled' });
});

test('observes cancellation triggered synchronously by send', async () => {
  const delayedSend = createDeferred<TransportResponse>();
  const cancelController = new AbortController();
  const transport = createTransport(() => {
    cancelController.abort();
    return delayedSend.promise;
  });

  const attempt = runAttempt({
    transport,
    cancelSignal: cancelController.signal,
  });
  const outcome = await Promise.race([
    attempt,
    new Promise<{ kind: 'still-pending' }>((resolve) => {
      setTimeout(() => resolve({ kind: 'still-pending' }), 0);
    }),
  ]);
  delayedSend.reject(new Error('late rejection'));

  expect(outcome).toEqual({ kind: 'cancelled' });
});

test('suppresses late iterator progress and callbacks after cancellation', async () => {
  const request = createRequest();
  const delayedNext = createDeferred<IteratorResult<AGUIEvent>>();
  const nextStarted = createDeferred<void>();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const dispose = jest.fn();
  const transport = createTransport(async () => ({
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            nextStarted.resolve();
            return delayedNext.promise;
          },
          return: iteratorReturn,
        };
      },
    },
    dispose,
  }));
  const cancelController = new AbortController();
  const onStarted = jest.fn();
  const onEvent = jest.fn();

  const attempt = runAttempt({
    transport,
    request,
    cancelSignal: cancelController.signal,
    onStarted,
    onEvent,
  });
  await nextStarted.promise;
  cancelController.abort();
  const outcome = await attempt;
  delayedNext.resolve({ done: false, value: createStarted(request) });
  await Promise.resolve();

  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(onStarted).not.toHaveBeenCalled();
  expect(onEvent).not.toHaveBeenCalled();
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('does not dispatch RUN_STARTED when cancellation occurs in onStarted', async () => {
  const request = createRequest();
  const cancelController = new AbortController();
  const onStarted = jest.fn(() => cancelController.abort());
  const onEvent = jest.fn();
  const transport = createTransport(async () => ({
    events: createEvents([createStarted(request), createFinished(request)]),
  }));

  const outcome = await runAttempt({
    transport,
    request,
    cancelSignal: cancelController.signal,
    onStarted,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(onEvent).not.toHaveBeenCalled();
});

test('retirement wins when both signals abort during onStarted', async () => {
  const request = createRequest();
  const cancelController = new AbortController();
  const retiredController = new AbortController();
  const onStarted = jest.fn(() => {
    cancelController.abort();
    retiredController.abort();
  });
  const transport = createTransport(async () => ({
    events: createEvents([createStarted(request), createFinished(request)]),
  }));

  const outcome = await runAttempt({
    transport,
    request,
    cancelSignal: cancelController.signal,
    retiredSignal: retiredController.signal,
    onStarted,
  });

  expect(outcome).toEqual({ kind: 'retired' });
});

test('invokes iterator return before dispose and awaits both before rejecting', async () => {
  const request = createRequest();
  const returnRelease = createDeferred<IteratorResult<AGUIEvent>>();
  const returnStarted = createDeferred<void>();
  const disposeRelease = createDeferred<void>();
  const order: string[] = [];
  const events = [createFinished(request)];
  const iterator = events[Symbol.iterator]();
  const iteratorReturn = jest.fn(async () => {
    order.push('return:start');
    returnStarted.resolve();
    const result = await returnRelease.promise;
    order.push('return:end');
    return result;
  });
  const dispose = jest.fn(async () => {
    order.push('dispose:start');
    await disposeRelease.promise;
    order.push('dispose:end');
  });
  const transport = createTransport(async () => ({
    events: {
      [Symbol.asyncIterator]() {
        return { next: async () => iterator.next(), return: iteratorReturn };
      },
    },
    dispose,
  }));

  const attempt = runAttempt({ transport, request });
  await returnStarted.promise;
  await Promise.resolve();
  expect(order).toEqual(['return:start', 'dispose:start']);
  returnRelease.resolve({ done: true, value: undefined });
  await Promise.resolve();
  disposeRelease.resolve();
  await expect(attempt).rejects.toMatchObject({
    message: `Received ${EventType.RUN_FINISHED} before RUN_STARTED`,
  });

  expect(order).toEqual([
    'return:start',
    'dispose:start',
    'return:end',
    'dispose:end',
  ]);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('disposal unblocks pending iterator cleanup without ending cleanup early', async () => {
  const request = createRequest();
  const nextStarted = createDeferred<void>();
  const nextRelease = createDeferred<IteratorResult<AGUIEvent>>();
  const returnInvoked = createDeferred<void>();
  const returnRelease = createDeferred<void>();
  const disposeInvoked = createDeferred<void>();
  const disposeRelease = createDeferred<void>();
  const order: string[] = [];
  let nextCount = 0;
  const iteratorReturn = jest.fn(async () => {
    order.push('return:invoked');
    returnInvoked.resolve();
    await disposeInvoked.promise;
    await returnRelease.promise;
    order.push('return:settled');
    return { done: true as const, value: undefined };
  });
  const dispose = jest.fn(async () => {
    order.push('dispose:invoked');
    disposeInvoked.resolve();
    nextRelease.resolve({ done: true, value: undefined });
    await disposeRelease.promise;
    order.push('dispose:settled');
  });
  const transport = createTransport(async () => ({
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            nextCount++;
            if (nextCount === 1) {
              return { done: false, value: createStarted(request) };
            }

            nextStarted.resolve();
            return nextRelease.promise;
          },
          return: iteratorReturn,
        };
      },
    },
    dispose,
  }));
  const cancelController = new AbortController();

  const attempt = runAttempt({
    transport,
    request,
    cancelSignal: cancelController.signal,
  });
  await nextStarted.promise;
  cancelController.abort();
  await returnInvoked.promise;

  expect(order).toEqual(['return:invoked', 'dispose:invoked']);
  let completed = false;
  void attempt.then(() => {
    completed = true;
  });
  returnRelease.resolve();
  await Promise.resolve();
  expect(completed).toBe(false);
  disposeRelease.resolve();
  await expect(attempt).resolves.toEqual({ kind: 'cancelled' });

  expect(order).toEqual([
    'return:invoked',
    'dispose:invoked',
    'return:settled',
    'dispose:settled',
  ]);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test.each(['iterator return', 'response disposal'] as const)(
  'preserves a primary protocol error when $failurePoint cleanup fails',
  async (failurePoint) => {
    const request = createRequest();
    const cleanupError = new Error(`${failurePoint} failed`);
    const events = [createStarted(request), createStarted(request)];
    const iterator = events[Symbol.iterator]();
    const iteratorReturn = jest.fn(async () => {
      if (failurePoint === 'iterator return') {
        throw cleanupError;
      }
      return { done: true as const, value: undefined };
    });
    const dispose = jest.fn(async () => {
      if (failurePoint === 'response disposal') {
        throw cleanupError;
      }
    });
    const transport = createTransport(async () => ({
      events: {
        [Symbol.asyncIterator]() {
          return { next: async () => iterator.next(), return: iteratorReturn };
        },
      },
      dispose,
    }));

    const attempt = runAttempt({ transport, request });

    await expect(attempt).rejects.toMatchObject({
      name: 'TransportError',
      message: 'Received duplicate RUN_STARTED',
      code: 'PROTOCOL_ERROR',
    });
    expect(iteratorReturn).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  },
);

test('cleanup accessor failures do not replace a primary protocol error', async () => {
  const request = createRequest();
  const cleanupError = new Error('cleanup accessor failed');
  const accesses: string[] = [];
  const events = [createStarted(request), createStarted(request)];
  const values = events[Symbol.iterator]();
  const transport = createTransport(async () => ({
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: async () => values.next(),
          get return(): AsyncIterator<AGUIEvent>['return'] {
            accesses.push('return');
            throw cleanupError;
          },
        };
      },
    },
    get dispose(): TransportResponse['dispose'] {
      accesses.push('dispose');
      throw cleanupError;
    },
  }));

  const attempt = runAttempt({ transport, request });

  await expect(attempt).rejects.toMatchObject({
    name: 'TransportError',
    message: 'Received duplicate RUN_STARTED',
    code: 'PROTOCOL_ERROR',
  });
  expect(accesses).toEqual(['return', 'dispose']);
});

test('cleans up a terminal response exactly once', async () => {
  const request = createRequest();
  const events = [createStarted(request), createFinished(request)];
  const iterator = events[Symbol.iterator]();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const dispose = jest.fn();
  const transport = createTransport(async () => ({
    events: {
      [Symbol.asyncIterator]() {
        return { next: async () => iterator.next(), return: iteratorReturn };
      },
    },
    dispose,
  }));

  const outcome = await runAttempt({ transport, request });

  expect(outcome).toEqual({ kind: 'finished' });
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});
