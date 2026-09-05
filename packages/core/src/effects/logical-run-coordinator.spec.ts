import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Transport, TransportRequest } from '../transport';
import { TransportError } from '../transport';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';
import {
  executeLogicalRun,
  type LogicalRunAttemptContext,
  type LogicalRunRequestContext,
} from './logical-run-coordinator';

function createEvents(events: AGUIEvent[]): AsyncIterable<AGUIEvent> {
  return (async function* () {
    yield* events;
  })();
}

function createRequest({
  attempt,
  maxAttempts,
  signal,
}: LogicalRunRequestContext): TransportRequest {
  const runId = `run-${attempt}`;

  return {
    input: createHashbrownRunAgentInput({
      threadId: 'thread-id',
      runId,
      messages: [],
      tools: [],
    }),
    signal,
    attempt,
    maxAttempts,
    requestId: runId,
  };
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

function execute({
  transport,
  retries = 0,
  cancelSignal = new AbortController().signal,
  retiredSignal = new AbortController().signal,
  onStarted = jest.fn(),
  onEvent = jest.fn(),
  onAttemptStarted,
  onAttemptRolledBack,
}: {
  transport: Transport;
  retries?: number;
  cancelSignal?: AbortSignal;
  retiredSignal?: AbortSignal;
  onStarted?: (context: LogicalRunAttemptContext) => void | Promise<void>;
  onEvent?: (
    event: AGUIEvent,
    context: LogicalRunAttemptContext,
  ) => void | Promise<void>;
  onAttemptStarted?: (context: LogicalRunAttemptContext) => void;
  onAttemptRolledBack?: (
    context: LogicalRunAttemptContext,
    error: Error | undefined,
  ) => void;
}) {
  return executeLogicalRun({
    transport,
    retries,
    cancelSignal,
    retiredSignal,
    createRequest,
    onStarted,
    onEvent,
    onAttemptStarted,
    onAttemptRolledBack,
  });
}

test('starts an attempt before transport send and shares its context with event callbacks', async () => {
  const order: string[] = [];
  const contexts: LogicalRunAttemptContext[] = [];
  const transport = createTransport(async (request) => {
    order.push('send');

    return {
      events: createEvents([createStarted(request), createFinished(request)]),
    };
  });
  const onAttemptStarted = jest.fn((context: LogicalRunAttemptContext) => {
    order.push('attempt:start');
    contexts.push(context);
  });
  const onStarted = jest.fn((context: LogicalRunAttemptContext) => {
    order.push('run:start');
    contexts.push(context);
  });
  const onEvent = jest.fn(
    (_event: AGUIEvent, context: LogicalRunAttemptContext) => {
      order.push('event');
      contexts.push(context);
    },
  );

  const outcome = await execute({
    transport,
    onAttemptStarted,
    onStarted,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'finished' });
  expect(order).toEqual([
    'attempt:start',
    'send',
    'run:start',
    'event',
    'event',
  ]);
  expect(contexts).toHaveLength(4);
  expect(contexts.every((context) => context === contexts[0])).toBe(true);
  expect(contexts[0]).toMatchObject({ attempt: 1, maxAttempts: 1 });
});

test('rolls back after cleanup and before retrying with a fresh context', async () => {
  const firstError = new Error('temporary failure');
  const order: string[] = [];
  const contexts: LogicalRunAttemptContext[] = [];
  let sendCount = 0;
  const transport = createTransport(async (request) => {
    sendCount++;
    order.push(`send:${sendCount}`);
    if (sendCount === 1) {
      const iteratorReturn = jest.fn(async () => {
        order.push('iterator:return');

        return { done: true as const, value: undefined };
      });
      const dispose = jest.fn(async () => {
        order.push('response:dispose');
      });

      return {
        events: {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                throw firstError;
              },
              return: iteratorReturn,
            };
          },
        },
        dispose,
      };
    }

    return {
      events: createEvents([createStarted(request), createFinished(request)]),
    };
  });
  const onAttemptStarted = jest.fn((context: LogicalRunAttemptContext) => {
    order.push(`attempt:start:${context.attempt}`);
    contexts.push(context);
  });
  const onAttemptRolledBack = jest.fn(
    (context: LogicalRunAttemptContext, error: Error | undefined) => {
      order.push(`attempt:rollback:${context.attempt}`);
      expect(error).toBe(firstError);
    },
  );

  const outcome = await execute({
    transport,
    retries: 1,
    onAttemptStarted,
    onAttemptRolledBack,
  });

  expect(outcome).toEqual({ kind: 'finished' });
  expect(order).toEqual([
    'attempt:start:1',
    'send:1',
    'iterator:return',
    'response:dispose',
    'attempt:rollback:1',
    'attempt:start:2',
    'send:2',
  ]);
  expect(contexts).toHaveLength(2);
  expect(contexts[0]).not.toBe(contexts[1]);
  expect(contexts.map(({ attempt }) => attempt)).toEqual([1, 2]);
  expect(onAttemptRolledBack).toHaveBeenCalledTimes(1);
});

test.each([
  { label: 'cancellation', interruption: 'cancelled' },
  { label: 'retirement', interruption: 'retired' },
] as const)(
  'rolls back the active attempt exactly once on $label',
  async ({ interruption }) => {
    const cancelController = new AbortController();
    const retiredController = new AbortController();
    const transport = createTransport(async (request) => ({
      events: createEvents([createStarted(request), createFinished(request)]),
    }));
    const onAttemptStarted = jest.fn();
    const onAttemptRolledBack = jest.fn();
    const onEvent = jest.fn((event: AGUIEvent) => {
      if (event.type !== EventType.RUN_STARTED) {
        return;
      }
      if (interruption === 'retired') {
        retiredController.abort();
      } else {
        cancelController.abort();
      }
    });

    const outcome = await execute({
      transport,
      cancelSignal: cancelController.signal,
      retiredSignal: retiredController.signal,
      onAttemptStarted,
      onAttemptRolledBack,
      onEvent,
    });

    expect(outcome).toEqual({ kind: interruption });
    expect(onAttemptStarted).toHaveBeenCalledTimes(1);
    expect(onAttemptRolledBack).toHaveBeenCalledTimes(1);
    expect(onAttemptRolledBack).toHaveBeenCalledWith(
      onAttemptStarted.mock.calls[0][0],
      undefined,
    );
  },
);

test('rolls back the active attempt exactly once on a server error', async () => {
  const runError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server rejected the run',
  };
  const transport = createTransport(async (request) => ({
    events: createEvents([createStarted(request), runError]),
  }));
  const onAttemptStarted = jest.fn();
  const onAttemptRolledBack = jest.fn();

  const outcome = await execute({
    transport,
    onAttemptStarted,
    onAttemptRolledBack,
  });

  expect(outcome).toMatchObject({
    kind: 'server-error',
    error: { message: runError.message },
  });
  expect(onAttemptStarted).toHaveBeenCalledTimes(1);
  expect(onAttemptRolledBack).toHaveBeenCalledTimes(1);
  expect(onAttemptRolledBack).toHaveBeenCalledWith(
    onAttemptStarted.mock.calls[0][0],
    expect.objectContaining({ message: runError.message }),
  );
});

test('rolls back every exhausted attempt exactly once with its failure', async () => {
  const error = new Error('still unavailable');
  const transport = createTransport(async () => {
    throw error;
  });
  const onAttemptStarted = jest.fn();
  const onAttemptRolledBack = jest.fn();

  const outcome = await execute({
    transport,
    retries: 1,
    onAttemptStarted,
    onAttemptRolledBack,
  });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: true,
  });
  expect(onAttemptStarted).toHaveBeenCalledTimes(2);
  expect(onAttemptRolledBack).toHaveBeenCalledTimes(2);
  expect(onAttemptRolledBack.mock.calls).toEqual([
    [onAttemptStarted.mock.calls[0][0], error],
    [onAttemptStarted.mock.calls[1][0], error],
  ]);
});

test('retries a failed attempt with fresh metadata and reports eventual success', async () => {
  const firstError = new Error('temporary failure');
  const requests: TransportRequest[] = [];
  const transport = createTransport(async (request) => {
    requests.push(request);
    if (requests.length === 1) {
      throw firstError;
    }

    return {
      events: createEvents([createStarted(request), createFinished(request)]),
    };
  });
  const onEvent = jest.fn();
  const outcome = await execute({
    transport,
    retries: 1,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'finished' });
  expect(
    requests.map(({ attempt, maxAttempts, requestId }) => ({
      attempt,
      maxAttempts,
      requestId,
    })),
  ).toEqual([
    { attempt: 1, maxAttempts: 2, requestId: 'run-1' },
    { attempt: 2, maxAttempts: 2, requestId: 'run-2' },
  ]);
  expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
});

test('stops a non-retryable failure without reporting retry exhaustion', async () => {
  const error = new TransportError('invalid request', { retryable: false });
  const transport = createTransport(async () => {
    throw error;
  });
  const outcome = await execute({
    transport,
    retries: 3,
  });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: false,
  });
  expect(transport.send).toHaveBeenCalledTimes(1);
});

test('reports exhaustion after all retryable attempts fail', async () => {
  const error = new Error('still unavailable');
  const transport = createTransport(async () => {
    throw error;
  });
  const outcome = await execute({
    transport,
    retries: 1,
  });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: true,
  });
  expect(transport.send).toHaveBeenCalledTimes(2);
});

test('does not synthesize RUN_ERROR when an attempt fails before RUN_STARTED', async () => {
  const error = new Error('send failed');
  const transport = createTransport(async () => {
    throw error;
  });
  const onEvent = jest.fn();

  await execute({ transport, onEvent });

  expect(onEvent).not.toHaveBeenCalled();
});

test('reports an accepted transport failure without synthesizing a terminal event', async () => {
  const error = new Error('stream failed');
  const transport = createTransport(async (request) => ({
    events: (async function* () {
      yield createStarted(request);
      throw error;
    })(),
  }));
  const onEvent = jest.fn();

  const outcome = await execute({ transport, onEvent });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: false,
  });
  expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
  ]);
});

test('reports an accepted protocol failure without synthesizing a terminal event', async () => {
  const transport = createTransport(async (request) => ({
    events: createEvents([createStarted(request)]),
  }));
  const onEvent = jest.fn();
  const outcome = await execute({ transport, onEvent });

  expect(outcome).toMatchObject({
    kind: 'failed',
    error: {
      name: 'TransportError',
      code: 'PROTOCOL_ERROR',
      message: 'Generation stream ended before RUN_FINISHED or RUN_ERROR',
    },
    exhaustedRetries: false,
  });
  expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
  ]);
});

test('returns a server RUN_ERROR without retrying or synthesizing another terminal', async () => {
  const runError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server rejected the run',
  };
  const transport = createTransport(async (request) => ({
    events: createEvents([createStarted(request), runError]),
  }));
  const onEvent = jest.fn();
  const outcome = await execute({
    transport,
    retries: 2,
    onEvent,
  });

  expect(outcome).toMatchObject({
    kind: 'server-error',
    error: { message: runError.message },
  });
  expect(transport.send).toHaveBeenCalledTimes(1);
  expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
    runError,
  ]);
});

test('cancellation after RUN_STARTED does not synthesize a terminal event', async () => {
  const cancelController = new AbortController();
  const transport = createTransport(async (request) => ({
    events: createEvents([createStarted(request), createFinished(request)]),
  }));
  const onEvent = jest.fn((event: AGUIEvent) => {
    if (event.type === EventType.RUN_STARTED) {
      cancelController.abort();
    }
  });

  const outcome = await execute({
    transport,
    cancelSignal: cancelController.signal,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
  ]);
});

test('retirement takes precedence without synthesizing a terminal or reporting an error', async () => {
  const retiredController = new AbortController();
  const transport = createTransport(async (request) => ({
    events: createEvents([createStarted(request), createFinished(request)]),
  }));
  const onEvent = jest.fn((event: AGUIEvent) => {
    if (event.type === EventType.RUN_STARTED) {
      retiredController.abort();
    }
  });
  const outcome = await execute({
    transport,
    retiredSignal: retiredController.signal,
    onEvent,
  });

  expect(outcome).toEqual({ kind: 'retired' });
  expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
    EventType.RUN_STARTED,
  ]);
});

test.each(['throws', 'rejects'] as const)(
  'stops without retrying when an event callback %s',
  async (failure) => {
    const callbackError = new Error('event callback failed');
    const cleanupOrder: string[] = [];
    const transport = createTransport(async (request) => {
      const events = [createStarted(request), createFinished(request)];
      const values = events[Symbol.iterator]();

      return {
        events: {
          [Symbol.asyncIterator]() {
            return {
              next: async () => values.next(),
              return: async () => {
                cleanupOrder.push('iterator:return');
                return { done: true as const, value: undefined };
              },
            };
          },
        },
        dispose: () => {
          cleanupOrder.push('response:dispose');
        },
      };
    });
    const onEvent = jest.fn(() => {
      if (failure === 'rejects') {
        return Promise.reject(callbackError);
      }

      throw callbackError;
    });
    const onAttemptRolledBack = jest.fn(() => {
      cleanupOrder.push('attempt:rollback');
    });

    const outcome = await execute({
      transport,
      retries: 2,
      onEvent,
      onAttemptRolledBack,
    });

    expect(outcome).toMatchObject({
      kind: 'failed',
      error: {
        name: 'TransportError',
        message: callbackError.message,
        retryable: false,
        code: 'PROTOCOL_ERROR',
      },
      exhaustedRetries: false,
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(cleanupOrder).toEqual([
      'iterator:return',
      'response:dispose',
      'attempt:rollback',
    ]);
  },
);
