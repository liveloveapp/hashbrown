import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Transport, TransportRequest } from '../transport';
import { TransportError } from '../transport';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';
import {
  executeLogicalRun,
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
  onAttemptError = jest.fn(),
}: {
  transport: Transport;
  retries?: number;
  cancelSignal?: AbortSignal;
  retiredSignal?: AbortSignal;
  onStarted?: () => void;
  onEvent?: (event: AGUIEvent) => void;
  onAttemptError?: (error: Error) => void;
}) {
  return executeLogicalRun({
    transport,
    retries,
    cancelSignal,
    retiredSignal,
    createRequest,
    onStarted,
    onEvent,
    onAttemptError,
  });
}

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
  const onAttemptError = jest.fn();

  const outcome = await execute({
    transport,
    retries: 1,
    onEvent,
    onAttemptError,
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
  expect(onAttemptError).toHaveBeenCalledWith(firstError);
  expect(onAttemptError).toHaveBeenCalledTimes(1);
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
  const onAttemptError = jest.fn();

  const outcome = await execute({
    transport,
    retries: 3,
    onAttemptError,
  });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: false,
  });
  expect(transport.send).toHaveBeenCalledTimes(1);
  expect(onAttemptError).toHaveBeenCalledWith(error);
});

test('reports exhaustion after all retryable attempts fail', async () => {
  const error = new Error('still unavailable');
  const transport = createTransport(async () => {
    throw error;
  });
  const onAttemptError = jest.fn();

  const outcome = await execute({
    transport,
    retries: 1,
    onAttemptError,
  });

  expect(outcome).toEqual({
    kind: 'failed',
    error,
    exhaustedRetries: true,
  });
  expect(transport.send).toHaveBeenCalledTimes(2);
  expect(onAttemptError).toHaveBeenCalledTimes(2);
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
  const onAttemptError = jest.fn();

  const outcome = await execute({ transport, onEvent, onAttemptError });

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
  expect(onAttemptError).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'TransportError',
      code: 'PROTOCOL_ERROR',
    }),
  );
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
  const onAttemptError = jest.fn();

  const outcome = await execute({
    transport,
    retries: 2,
    onEvent,
    onAttemptError,
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
  expect(onAttemptError).not.toHaveBeenCalled();
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
  const onAttemptError = jest.fn();

  const outcome = await execute({
    transport,
    retiredSignal: retiredController.signal,
    onEvent,
    onAttemptError,
  });

  expect(outcome).toEqual({ kind: 'retired' });
  expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
    EventType.RUN_STARTED,
  ]);
  expect(onAttemptError).not.toHaveBeenCalled();
});
