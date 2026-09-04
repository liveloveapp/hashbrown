import { Chat } from '../models';
import type { LogicalRunOutcome } from './logical-run-coordinator';
import {
  type AssistantTurnCoordinator,
  type AssistantTurnModelRunContext,
  type AssistantTurnToolSnapshot,
  createAssistantTurnCoordinator,
} from './assistant-turn-coordinator';
import * as toolTurnCoordinatorModule from './tool-turn-coordinator';

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

function emptyToolSnapshot(): AssistantTurnToolSnapshot {
  return { toolCalls: [], toolsByName: {} };
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('returns finished and reports no tools exactly once', async () => {
  const executeModelRun = jest.fn(async () => ({
    kind: 'finished' as const,
  }));
  const readToolSnapshot = jest.fn(emptyToolSnapshot);
  const settleToolTurn = jest.fn();
  const reportNoTools = jest.fn();

  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot,
    settleToolTurn,
    reportNoTools,
  });
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'finished' });
  expect(executeModelRun).toHaveBeenCalledTimes(1);
  expect(readToolSnapshot).toHaveBeenCalledTimes(1);
  expect(settleToolTurn).not.toHaveBeenCalled();
  expect(reportNoTools).toHaveBeenCalledTimes(1);
});

test.each([
  {
    interruption: 'cancel' as const,
    interrupt: (coordinator: AssistantTurnCoordinator) => coordinator.cancel(),
    outcomeKind: 'cancelled' as const,
  },
  {
    interruption: 'retire after cancellation' as const,
    interrupt: (coordinator: AssistantTurnCoordinator) => {
      coordinator.cancel();
      coordinator.retire();
    },
    outcomeKind: 'retired' as const,
  },
])(
  '$interruption from reportNoTools returns the local interruption',
  async ({ interrupt, outcomeKind }) => {
    const executeModelRun = jest.fn(async () => ({
      kind: 'finished' as const,
    }));
    const readToolSnapshot = jest.fn(emptyToolSnapshot);
    const settleToolTurn = jest.fn();
    const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
    const reportNoTools = jest.fn(() => {
      if (coordinatorRef.current) {
        interrupt(coordinatorRef.current);
      }
    });
    const coordinator = createAssistantTurnCoordinator({
      executeModelRun,
      readToolSnapshot,
      settleToolTurn,
      reportNoTools,
    });
    coordinatorRef.current = coordinator;

    const outcome = await coordinator.completion;

    expect(outcome).toEqual({ kind: outcomeKind });
    expect(reportNoTools).toHaveBeenCalledTimes(1);
    expect(readToolSnapshot).toHaveBeenCalledTimes(1);
    expect(settleToolTurn).not.toHaveBeenCalled();
    expect(executeModelRun).toHaveBeenCalledTimes(1);
  },
);

test.each<LogicalRunOutcome>([
  { kind: 'server-error', error: new Error('server failed') },
  {
    kind: 'failed',
    error: new Error('transport failed'),
    exhaustedRetries: true,
  },
])(
  'passes through $kind without reading or executing tools',
  async (expected) => {
    const handler = jest.fn(async () => 'result');
    const executeModelRun = jest.fn(async () => expected);
    const readToolSnapshot = jest.fn(() => ({
      toolCalls: [createToolCall()],
      toolsByName: { lookup: createTool('lookup', handler) },
    }));
    const settleToolTurn = jest.fn();
    const reportNoTools = jest.fn();

    const coordinator = createAssistantTurnCoordinator({
      executeModelRun,
      readToolSnapshot,
      settleToolTurn,
      reportNoTools,
    });
    const outcome = await coordinator.completion;

    expect(outcome).toBe(expected);
    expect(executeModelRun).toHaveBeenCalledTimes(1);
    expect(readToolSnapshot).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(settleToolTurn).not.toHaveBeenCalled();
    expect(reportNoTools).not.toHaveBeenCalled();
  },
);

test('executes tools concurrently, settles in input order, and continues', async () => {
  const firstStarted = createDeferred<void>();
  const secondStarted = createDeferred<void>();
  const firstResult = createDeferred<string>();
  const secondResult = createDeferred<string>();
  const modelOutcomes: LogicalRunOutcome[] = [
    { kind: 'finished' },
    { kind: 'finished' },
  ];
  const toolCalls = [
    createToolCall({ id: 'first-call', name: 'first' }),
    createToolCall({ id: 'second-call', name: 'second' }),
  ];
  const readToolSnapshot = jest
    .fn<AssistantTurnToolSnapshot, []>()
    .mockReturnValueOnce({
      toolCalls,
      toolsByName: {
        first: createTool('first', async () => {
          firstStarted.resolve();
          return firstResult.promise;
        }),
        second: createTool('second', async () => {
          secondStarted.resolve();
          return secondResult.promise;
        }),
      },
    })
    .mockReturnValueOnce(emptyToolSnapshot());
  const settleToolTurn = jest.fn();
  const executeModelRun = jest.fn(async () => {
    const outcome = modelOutcomes.shift();
    if (!outcome) {
      throw new Error('No scripted model outcome');
    }

    return outcome;
  });

  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot,
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  await Promise.all([firstStarted.promise, secondStarted.promise]);
  secondResult.resolve('second result');
  firstResult.resolve('first result');
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'finished' });
  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(settleToolTurn).toHaveBeenCalledWith(toolCalls, {
    continuation: 'continue',
    results: [
      { status: 'fulfilled', value: 'first result' },
      { status: 'fulfilled', value: 'second result' },
    ],
  });
  expect(readToolSnapshot).toHaveBeenCalledTimes(2);
});

test('runs multiple tool rounds before returning the final model outcome', async () => {
  const executeModelRun = jest.fn(async () => ({
    kind: 'finished' as const,
  }));
  const firstCall = createToolCall({ id: 'first-call' });
  const secondCall = createToolCall({ id: 'second-call' });
  const readToolSnapshot = jest
    .fn<AssistantTurnToolSnapshot, []>()
    .mockReturnValueOnce({
      toolCalls: [firstCall],
      toolsByName: {
        lookup: createTool('lookup', async () => 'first result'),
      },
    })
    .mockReturnValueOnce({
      toolCalls: [secondCall],
      toolsByName: {
        lookup: createTool('lookup', async () => 'second result'),
      },
    })
    .mockReturnValueOnce(emptyToolSnapshot());
  const settleToolTurn = jest.fn();
  const reportNoTools = jest.fn();

  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot,
    settleToolTurn,
    reportNoTools,
  });
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'finished' });
  expect(executeModelRun).toHaveBeenCalledTimes(3);
  expect(settleToolTurn.mock.calls).toEqual([
    [
      [firstCall],
      {
        continuation: 'continue',
        results: [{ status: 'fulfilled', value: 'first result' }],
      },
    ],
    [
      [secondCall],
      {
        continuation: 'continue',
        results: [{ status: 'fulfilled', value: 'second result' }],
      },
    ],
  ]);
  expect(reportNoTools).toHaveBeenCalledTimes(1);
});

test('cancel owns the model signal and returns a cancelled outcome', async () => {
  const modelStarted = createDeferred<void>();
  const executeModelRun = jest.fn(
    ({ cancelSignal }: AssistantTurnModelRunContext) => {
      modelStarted.resolve();
      return new Promise<LogicalRunOutcome>((resolve) => {
        cancelSignal.addEventListener(
          'abort',
          () => resolve({ kind: 'cancelled' }),
          { once: true },
        );
      });
    },
  );
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: emptyToolSnapshot,
    settleToolTurn: jest.fn(),
    reportNoTools: jest.fn(),
  });
  await modelStarted.promise;

  coordinator.cancel();
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(executeModelRun.mock.calls[0]?.[0].cancelSignal.aborted).toBe(true);
  expect(executeModelRun.mock.calls[0]?.[0].retiredSignal.aborted).toBe(false);
});

test('retire owns the model signal and takes precedence over cancellation', async () => {
  const modelStarted = createDeferred<void>();
  const executeModelRun = jest.fn(
    ({ retiredSignal }: AssistantTurnModelRunContext) => {
      modelStarted.resolve();
      return new Promise<LogicalRunOutcome>((resolve) => {
        retiredSignal.addEventListener(
          'abort',
          () => resolve({ kind: 'retired' }),
          { once: true },
        );
      });
    },
  );
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: emptyToolSnapshot,
    settleToolTurn: jest.fn(),
    reportNoTools: jest.fn(),
  });
  await modelStarted.promise;

  coordinator.cancel();
  coordinator.retire();
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'retired' });
  expect(executeModelRun.mock.calls[0]?.[0].cancelSignal.aborted).toBe(true);
  expect(executeModelRun.mock.calls[0]?.[0].retiredSignal.aborted).toBe(true);
});

test('cancel after model completion prevents tool handlers from starting', async () => {
  const handler = jest.fn(async () => 'result');
  const settleToolTurn = jest.fn();
  let settlementCountAfterCancel = 0;
  const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
  const readToolSnapshot = jest.fn(() => {
    queueMicrotask(() => {
      coordinatorRef.current?.cancel();
      settlementCountAfterCancel = settleToolTurn.mock.calls.length;
    });
    return {
      toolCalls: [createToolCall()],
      toolsByName: { lookup: createTool('lookup', handler) },
    };
  });
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun: async () => ({ kind: 'finished' }),
    readToolSnapshot,
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  coordinatorRef.current = coordinator;

  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(handler).not.toHaveBeenCalled();
  expect(settlementCountAfterCancel).toBe(1);
  expect(settleToolTurn.mock.calls[0]?.[1]).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }],
  });
});

test('retire after model completion prevents tool handlers from starting', async () => {
  const handler = jest.fn(async () => 'result');
  const settleToolTurn = jest.fn();
  let settlementCountAfterRetire = 0;
  const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
  const readToolSnapshot = jest.fn(() => {
    queueMicrotask(() => {
      coordinatorRef.current?.retire();
      settlementCountAfterRetire = settleToolTurn.mock.calls.length;
    });
    return {
      toolCalls: [createToolCall()],
      toolsByName: { lookup: createTool('lookup', handler) },
    };
  });
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun: async () => ({ kind: 'finished' }),
    readToolSnapshot,
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  coordinatorRef.current = coordinator;

  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'retired' });
  expect(handler).not.toHaveBeenCalled();
  expect(settlementCountAfterRetire).toBe(1);
  expect(settleToolTurn.mock.calls[0]?.[1]).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }],
  });
});

test('cancel during handlers synchronously aborts and settles every call once', async () => {
  const handlersStarted = createDeferred<void>();
  const signals: AbortSignal[] = [];
  const settleToolTurn = jest.fn();
  const handler = (_args: unknown, signal: AbortSignal) => {
    signals.push(signal);
    if (signals.length === 2) {
      handlersStarted.resolve();
    }
    return new Promise(() => undefined);
  };
  const toolCalls = [
    createToolCall({ id: 'first-call', name: 'first' }),
    createToolCall({ id: 'second-call', name: 'second' }),
  ];
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun: async () => ({ kind: 'finished' }),
    readToolSnapshot: () => ({
      toolCalls,
      toolsByName: {
        first: createTool('first', handler),
        second: createTool('second', handler),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  await handlersStarted.promise;

  coordinator.cancel();
  const settlementAtReturn = settleToolTurn.mock.calls[0];
  const outcome = await coordinator.completion;

  expect(settlementAtReturn?.[0]).toEqual(toolCalls);
  expect(settlementAtReturn?.[1]).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }, { status: 'rejected' }],
  });
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({ kind: 'cancelled' });
});

test('retire during handlers synchronously settles and never continues', async () => {
  const handlerStarted = createDeferred<void>();
  const settleToolTurn = jest.fn();
  const executeModelRun = jest.fn(async () => ({
    kind: 'finished' as const,
  }));
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: () => ({
      toolCalls: [createToolCall()],
      toolsByName: {
        lookup: createTool('lookup', (_args, signal) => {
          handlerStarted.resolve();
          return new Promise((resolve) => {
            signal.addEventListener('abort', () => resolve('late'), {
              once: true,
            });
          });
        }),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  await handlerStarted.promise;

  coordinator.retire();
  const settlementAtReturn = settleToolTurn.mock.calls[0];
  const outcome = await coordinator.completion;

  expect(settlementAtReturn?.[1]).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }],
  });
  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(executeModelRun).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({ kind: 'retired' });
});

test('retirement takes precedence when cancellation triggers retirement', async () => {
  const handlerStarted = createDeferred<void>();
  const settleToolTurn = jest.fn();
  const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
  const executeModelRun = jest.fn(
    ({ cancelSignal }: { cancelSignal: AbortSignal }) => {
      cancelSignal.addEventListener(
        'abort',
        () => coordinatorRef.current?.retire(),
        { once: true },
      );
      return Promise.resolve<LogicalRunOutcome>({ kind: 'finished' });
    },
  );
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: () => ({
      toolCalls: [createToolCall()],
      toolsByName: {
        lookup: createTool('lookup', async () => {
          handlerStarted.resolve();
          return new Promise(() => undefined);
        }),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  coordinatorRef.current = coordinator;
  await handlerStarted.promise;

  coordinator.cancel();
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'retired' });
  expect(settleToolTurn).toHaveBeenCalledTimes(1);
});

test('cancellation wins when a completed handler has not settled yet', async () => {
  const handlerResult = createDeferred<string>();
  const handlerStarted = createDeferred<void>();
  const settleToolTurn = jest.fn();
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun: async () => ({ kind: 'finished' }),
    readToolSnapshot: () => ({
      toolCalls: [createToolCall()],
      toolsByName: {
        lookup: createTool('lookup', async () => {
          handlerStarted.resolve();
          return handlerResult.promise;
        }),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  await handlerStarted.promise;

  handlerResult.resolve('normal result');
  coordinator.cancel();
  const outcome = await coordinator.completion;

  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(settleToolTurn.mock.calls[0]?.[1]).toMatchObject({
    continuation: 'stop',
    results: [{ status: 'rejected' }],
  });
  expect(outcome).toEqual({ kind: 'cancelled' });
});

test.each([
  { interruption: 'cancel' as const, outcomeKind: 'cancelled' as const },
  { interruption: 'retire' as const, outcomeKind: 'retired' as const },
])(
  '$interruption synchronously stops a tool turn after inner completion',
  async ({ interruption, outcomeKind }) => {
    const createInnerCoordinator =
      toolTurnCoordinatorModule.createToolTurnCoordinator;
    const settleToolTurn = jest.fn();
    const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
    let settlementCountAtReturn = -1;
    const createCoordinatorSpy = jest
      .spyOn(toolTurnCoordinatorModule, 'createToolTurnCoordinator')
      .mockImplementation((options) => {
        const innerCoordinator = createInnerCoordinator(options);
        innerCoordinator.completion.then(() => {
          coordinatorRef.current?.[interruption]();
          settlementCountAtReturn = settleToolTurn.mock.calls.length;
        });

        return innerCoordinator;
      });

    try {
      const coordinator = createAssistantTurnCoordinator({
        executeModelRun: async () => ({ kind: 'finished' }),
        readToolSnapshot: () => ({
          toolCalls: [
            createToolCall({ id: 'first-call', name: 'first' }),
            createToolCall({ id: 'second-call', name: 'second' }),
          ],
          toolsByName: {
            first: createTool('first', async () => 'first result'),
            second: createTool('second', async () => 'second result'),
          },
        }),
        settleToolTurn,
        reportNoTools: jest.fn(),
      });
      coordinatorRef.current = coordinator;

      const outcome = await coordinator.completion;

      expect(settlementCountAtReturn).toBe(1);
      expect(settleToolTurn).toHaveBeenCalledTimes(1);
      expect(settleToolTurn.mock.calls[0]?.[1]).toMatchObject({
        continuation: 'stop',
        results: [{ status: 'rejected' }, { status: 'rejected' }],
      });
      expect(outcome).toEqual({ kind: outcomeKind });
    } finally {
      createCoordinatorSpy.mockRestore();
    }
  },
);

test('cancellation from settlement prevents another model run', async () => {
  const settleToolTurn = jest.fn();
  const executeModelRun = jest.fn(async () => ({
    kind: 'finished' as const,
  }));
  const coordinatorRef: { current?: AssistantTurnCoordinator } = {};
  settleToolTurn.mockImplementation(() => coordinatorRef.current?.cancel());
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: () => ({
      toolCalls: [createToolCall()],
      toolsByName: {
        lookup: createTool('lookup', async () => 'result'),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  coordinatorRef.current = coordinator;

  const outcome = await coordinator.completion;

  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(settleToolTurn.mock.calls[0]?.[1]).toEqual({
    continuation: 'continue',
    results: [{ status: 'fulfilled', value: 'result' }],
  });
  expect(executeModelRun).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({ kind: 'cancelled' });
});

test('late handler completion cannot settle again or continue', async () => {
  const handlerResult = createDeferred<string>();
  const handlerStarted = createDeferred<void>();
  const settleToolTurn = jest.fn();
  const executeModelRun = jest.fn(async () => ({
    kind: 'finished' as const,
  }));
  const coordinator = createAssistantTurnCoordinator({
    executeModelRun,
    readToolSnapshot: () => ({
      toolCalls: [createToolCall()],
      toolsByName: {
        lookup: createTool('lookup', async () => {
          handlerStarted.resolve();
          return handlerResult.promise;
        }),
      },
    }),
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  await handlerStarted.promise;
  coordinator.cancel();
  await coordinator.completion;

  handlerResult.resolve('late result');
  await flushTaskBoundary();

  expect(settleToolTurn).toHaveBeenCalledTimes(1);
  expect(executeModelRun).toHaveBeenCalledTimes(1);
});

test('copies frozen tool-call inputs without mutating snapshots', async () => {
  const toolCall = Object.freeze(createToolCall());
  const toolCalls = Object.freeze([toolCall]);
  const toolsByName = Object.freeze({
    lookup: Object.freeze(createTool('lookup', async () => 'result')),
  });
  const snapshot = Object.freeze({ toolCalls, toolsByName });
  const settleToolTurn = jest.fn();
  const readToolSnapshot = jest
    .fn<AssistantTurnToolSnapshot, []>()
    .mockReturnValueOnce(snapshot)
    .mockReturnValueOnce(emptyToolSnapshot());

  const coordinator = createAssistantTurnCoordinator({
    executeModelRun: async () => ({ kind: 'finished' }),
    readToolSnapshot,
    settleToolTurn,
    reportNoTools: jest.fn(),
  });
  const outcome = await coordinator.completion;

  expect(outcome).toEqual({ kind: 'finished' });
  expect(settleToolTurn.mock.calls[0]?.[0]).toEqual([toolCall]);
  expect(settleToolTurn.mock.calls[0]?.[0]).not.toBe(toolCalls);
  expect(snapshot).toEqual({ toolCalls: [toolCall], toolsByName });
});
