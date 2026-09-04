import { Chat } from '../models';
import {
  createToolTurnCoordinator,
  type ToolTurnCoordinator,
  type ToolTurnOutcome,
} from './tool-turn-coordinator';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createToolCall(
  overrides: Partial<Chat.Internal.ToolCall> = {},
): Chat.Internal.ToolCall {
  return {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
    ...overrides,
  };
}

function createTool(
  name: string,
  handler: Chat.Internal.Tool['handler'],
): Chat.Internal.Tool {
  return {
    name,
    description: `${name} tool`,
    schema: {},
    handler,
  };
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('executes a tool turn concurrently and completes in call order', async () => {
  const firstStarted = createDeferred<void>();
  const secondStarted = createDeferred<void>();
  const firstResult = createDeferred<string>();
  const secondResult = createDeferred<string>();
  const signals: AbortSignal[] = [];
  const toolCalls = [
    createToolCall({ id: 'first-call', name: 'first' }),
    createToolCall({ id: 'second-call', name: 'second' }),
  ];
  const coordinator = createToolTurnCoordinator({
    toolCalls,
    toolsByName: {
      first: createTool('first', async (_args, signal) => {
        signals.push(signal);
        firstStarted.resolve();
        return firstResult.promise;
      }),
      second: createTool('second', async (_args, signal) => {
        signals.push(signal);
        secondStarted.resolve();
        return secondResult.promise;
      }),
    },
  });

  await Promise.all([firstStarted.promise, secondStarted.promise]);
  secondResult.resolve('second result');
  firstResult.resolve('first result');
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({
    continuation: 'continue',
    results: [
      { status: 'fulfilled', value: 'first result' },
      { status: 'fulfilled', value: 'second result' },
    ],
  });
  expect(signals).toHaveLength(2);
  expect(signals[0]).not.toBe(signals[1]);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);
  expect(coordinator.cancel()).toBeUndefined();
});

test('cancels every call and settles once when cancellation wins', async () => {
  const handlersStarted = createDeferred<void>();
  const signals: AbortSignal[] = [];
  const handler = (_args: unknown, signal: AbortSignal) => {
    signals.push(signal);
    if (signals.length === 2) {
      handlersStarted.resolve();
    }
    return new Promise(() => undefined);
  };
  const coordinator = createToolTurnCoordinator({
    toolCalls: [
      createToolCall({ id: 'first-call', name: 'first' }),
      createToolCall({ id: 'second-call', name: 'second' }),
    ],
    toolsByName: {
      first: createTool('first', handler),
      second: createTool('second', handler),
    },
  });

  await handlersStarted.promise;
  const cancelledOutcome = coordinator.cancel();
  const completedOutcome = await coordinator.completion;

  expect(cancelledOutcome).toBeDefined();
  expect(completedOutcome).toBe(cancelledOutcome);
  expect(completedOutcome.continuation).toBe('stop');
  expect(completedOutcome.results).toHaveLength(2);
  expect(
    completedOutcome.results.every((result) => result.status === 'rejected'),
  ).toBe(true);
  completedOutcome.results.forEach((result) => {
    if (result.status === 'rejected') {
      expect(result.reason).toMatchObject({
        name: 'AbortError',
        message: 'Tool execution cancelled',
      });
    }
  });
  expect(signals).toHaveLength(2);
  expect(signals[0]).not.toBe(signals[1]);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(coordinator.cancel()).toBeUndefined();
});

test('cancellation before execution does not invoke a handler', async () => {
  const handler = jest.fn(async () => 'result');
  const coordinator = createToolTurnCoordinator({
    toolCalls: [createToolCall()],
    toolsByName: { lookup: createTool('lookup', handler) },
  });

  const cancelledOutcome = coordinator.cancel();
  const completedOutcome = await coordinator.completion;

  expect(handler).not.toHaveBeenCalled();
  expect(completedOutcome).toBe(cancelledOutcome);
  expect(completedOutcome).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }],
  });
});

test('publishes the stopped outcome before abort callbacks can cancel again', async () => {
  const handlerStarted = createDeferred<void>();
  const coordinatorRef: { current?: ToolTurnCoordinator } = {};
  let nestedOutcome: ToolTurnOutcome | undefined;
  const handler = (_args: unknown, signal: AbortSignal) => {
    signal.addEventListener(
      'abort',
      () => {
        nestedOutcome = coordinatorRef.current?.cancel();
      },
      { once: true },
    );
    handlerStarted.resolve();
    return new Promise(() => undefined);
  };
  const coordinator = createToolTurnCoordinator({
    toolCalls: [createToolCall()],
    toolsByName: { lookup: createTool('lookup', handler) },
  });
  coordinatorRef.current = coordinator;

  await handlerStarted.promise;
  const cancelledOutcome = coordinator.cancel();
  const completedOutcome = await coordinator.completion;

  expect(nestedOutcome).toBeUndefined();
  expect(completedOutcome).toBe(cancelledOutcome);
});

test('cancellation replaces partial successes with a consistent stopped result', async () => {
  const firstFinished = createDeferred<void>();
  const secondStarted = createDeferred<void>();
  const coordinator = createToolTurnCoordinator({
    toolCalls: [
      createToolCall({ id: 'first-call', name: 'first' }),
      createToolCall({ id: 'second-call', name: 'second' }),
    ],
    toolsByName: {
      first: createTool('first', async () => {
        firstFinished.resolve();
        return 'first result';
      }),
      second: createTool('second', async () => {
        secondStarted.resolve();
        return new Promise(() => undefined);
      }),
    },
  });

  await Promise.all([firstFinished.promise, secondStarted.promise]);
  await flushTaskBoundary();
  coordinator.cancel();
  const outcome = await coordinator.completion;

  expect(outcome.continuation).toBe('stop');
  expect(outcome.results).toHaveLength(2);
  expect(outcome.results.every((result) => result.status === 'rejected')).toBe(
    true,
  );
});

test('copies the tool-call collection without mutating its inputs', async () => {
  const toolCall = Object.freeze(createToolCall());
  const toolCalls = Object.freeze([toolCall]);
  const toolsByName = Object.freeze({
    lookup: createTool('lookup', async () => 'result'),
  });
  const coordinator = createToolTurnCoordinator({
    toolCalls,
    toolsByName,
  });

  const outcome = await coordinator.completion;

  expect(outcome).toEqual({
    continuation: 'continue',
    results: [{ status: 'fulfilled', value: 'result' }],
  });
  expect(toolCalls).toEqual([toolCall]);
  expect(toolsByName.lookup.name).toBe('lookup');
});
