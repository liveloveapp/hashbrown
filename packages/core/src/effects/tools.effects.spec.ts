import { apiActions, devActions } from '../actions';
import { Chat } from '../models';
import {
  reducers as rootReducers,
  selectPendingToolCalls,
  selectToolEntities,
  selectUnifiedError,
} from '../reducers';
import { createStore } from '../utils/micro-ngrx';
import { runTools } from './tools.effects';

type SelectorKey = (state: never) => unknown;
type ActionLike = { type: string; payload?: unknown };
type TestHandler = {
  types: string[];
  handler: (action: ActionLike) => unknown | Promise<unknown>;
};

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
    arguments: '{"query":"weather"}',
    status: 'pending',
    ...overrides,
  };
}

function createTestStore(input: {
  toolCalls: Chat.Internal.ToolCall[];
  tools: Record<string, Chat.Internal.Tool>;
  unifiedError?: Error;
}) {
  const actions: ActionLike[] = [];
  const handlers: TestHandler[] = [];
  const selectorValues = new Map<SelectorKey, unknown>([
    [selectUnifiedError, input.unifiedError],
    [selectPendingToolCalls, input.toolCalls],
    [selectToolEntities, input.tools],
  ]);

  const store = {
    actions,
    when: (
      ...params: [...Array<{ type: string }>, (action: ActionLike) => unknown]
    ) => {
      const handler = params.pop() as (action: ActionLike) => unknown;
      handlers.push({
        types: (params as { type: string }[]).map((action) => action.type),
        handler,
      });
      return () => undefined;
    },
    dispatch: (action: ActionLike) => {
      actions.push(action);
    },
    read: <T = unknown>(selector: SelectorKey): T => {
      if (!selectorValues.has(selector)) {
        throw new Error('No value for selector');
      }

      return selectorValues.get(selector) as T;
    },
    setToolCalls: (toolCalls: Chat.Internal.ToolCall[]) => {
      selectorValues.set(selectPendingToolCalls, toolCalls);
    },
    finalize: (toolCalls = input.toolCalls) =>
      apiActions.assistantTurnFinalized({
        toolCalls,
        continuation: 'continue',
      }),
    async trigger(action: ActionLike) {
      const matches = handlers.filter((handler) =>
        handler.types.includes(action.type),
      );
      for (const match of matches) {
        await match.handler(action);
      }
    },
  };

  return store as unknown as Parameters<typeof runTools>[0] & typeof store;
}

test('does not execute an in-flight tool call more than once', async () => {
  const result = createDeferred<string>();
  const handlerStarted = createDeferred<void>();
  const handler = jest.fn(() => {
    handlerStarted.resolve();
    return result.promise;
  });
  const toolCall = createToolCall();
  const store = createTestStore({
    toolCalls: [toolCall],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  const firstFinalization = store.trigger(store.finalize());
  await handlerStarted.promise;
  const duplicateFinalization = store.trigger(store.finalize());

  expect(handler).toHaveBeenCalledTimes(1);

  result.resolve('sunny');
  await Promise.all([firstFinalization, duplicateFinalization]);

  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: { continuation: 'continue' },
  });
});

test('settles a stopped finalization without invoking its tool handler', async () => {
  const handler = jest.fn(async () => 'result');
  const toolCall = createToolCall();
  const store = createTestStore({
    toolCalls: [toolCall],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  await store.trigger(
    apiActions.assistantTurnFinalized({
      toolCalls: [toolCall],
      continuation: 'stop',
    }),
  );

  expect(handler).not.toHaveBeenCalled();
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: {
      toolCalls: [toolCall],
      continuation: 'stop',
      toolMessages: [{ content: { status: 'rejected' } }],
    },
  });
});

test('does not execute replacement calls from a stale finalization', async () => {
  const original = createToolCall({ arguments: '{"turn":"original"}' });
  const replacement = createToolCall({ arguments: '{"turn":"replacement"}' });
  const handler = jest.fn(async () => 'result');
  const store = createTestStore({
    toolCalls: [original],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  await store.trigger(store.finalize([original]));
  store.setToolCalls([replacement]);

  await store.trigger(store.finalize([original]));

  expect(handler).toHaveBeenCalledTimes(1);

  await store.trigger(store.finalize([replacement]));
  expect(handler).toHaveBeenCalledTimes(2);
});

test('settles a concurrent tool batch once in call order', async () => {
  const firstResult = createDeferred<string>();
  const secondResult = createDeferred<string>();
  const toolCalls = [
    createToolCall({ id: 'first-call', name: 'first' }),
    createToolCall({ id: 'second-call', name: 'second' }),
  ];
  const store = createTestStore({
    toolCalls,
    tools: {
      first: {
        name: 'first',
        description: 'First tool',
        schema: {},
        handler: () => firstResult.promise,
      },
      second: {
        name: 'second',
        description: 'Second tool',
        schema: {},
        handler: () => secondResult.promise,
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  secondResult.resolve('second result');
  firstResult.resolve('first result');
  await finalization;

  expect(store.actions).toEqual([
    {
      type: '[internal] toolTurnSettled',
      payload: {
        continuation: 'continue',
        toolCalls,
        toolMessages: [
          {
            role: 'tool',
            content: { status: 'fulfilled', value: 'first result' },
            toolCallId: 'first-call',
            toolName: 'first',
          },
          {
            role: 'tool',
            content: { status: 'fulfilled', value: 'second result' },
            toolCallId: 'second-call',
            toolName: 'second',
          },
        ],
      },
    },
  ]);
});

test('stop aborts and settles a tool handler that ignores its signal', async () => {
  const handlerStarted = createDeferred<void>();
  let toolSignal: AbortSignal | undefined;
  const handler = jest.fn((_input: unknown, signal: AbortSignal) => {
    toolSignal = signal;
    handlerStarted.resolve();
    return new Promise<string>(() => undefined);
  });
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  await handlerStarted.promise;
  await store.trigger(devActions.stopMessageGeneration(true));
  const completion = await Promise.race([
    finalization.then(() => 'finished'),
    new Promise<'timed out'>((resolve) =>
      setTimeout(() => resolve('timed out'), 25),
    ),
  ]);

  expect(completion).toBe('finished');
  expect(toolSignal?.aborted).toBe(true);
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: {
      continuation: 'stop',
      toolMessages: [
        {
          role: 'tool',
          content: { status: 'rejected' },
          toolCallId: 'tool-call-1',
          toolName: 'lookup',
        },
      ],
    },
  });
  const settlement = store.actions[0].payload as {
    toolMessages: Chat.Api.ToolMessage[];
  };
  const content = settlement.toolMessages[0].content;
  expect(content.status).toBe('rejected');
  if (content.status === 'rejected') {
    expect(content.reason).toMatchObject({
      name: 'AbortError',
      message: 'Tool execution cancelled',
    });
  }
});

test('discards a tool result that arrives after cancellation', async () => {
  const result = createDeferred<string>();
  const handlerStarted = createDeferred<void>();
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler: async () => {
          handlerStarted.resolve();
          return result.promise;
        },
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  await handlerStarted.promise;
  await store.trigger(devActions.stopMessageGeneration(true));
  result.resolve('late result');
  await finalization;

  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: { continuation: 'stop' },
  });
});

test('a superseding user turn cancels active tool execution', async () => {
  const handlerStarted = createDeferred<void>();
  let toolSignal: AbortSignal | undefined;
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return new Promise(() => undefined);
        },
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  await handlerStarted.promise;
  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'New turn' } }),
  );
  const completion = await Promise.race([
    finalization.then(() => 'finished'),
    new Promise<'timed out'>((resolve) =>
      setTimeout(() => resolve('timed out'), 25),
    ),
  ]);

  expect(completion).toBe('finished');
  expect(toolSignal?.aborted).toBe(true);
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: { continuation: 'stop' },
  });
});

test('effect teardown cancels active tool execution without continuation', async () => {
  const handlerStarted = createDeferred<void>();
  let toolSignal: AbortSignal | undefined;
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return new Promise(() => undefined);
        },
      },
    },
  });
  const teardown = runTools(store);

  const finalization = store.trigger(store.finalize());
  await handlerStarted.promise;
  teardown?.();
  const completion = await Promise.race([
    finalization.then(() => 'finished'),
    new Promise<'timed out'>((resolve) =>
      setTimeout(() => resolve('timed out'), 25),
    ),
  ]);

  expect(completion).toBe('finished');
  expect(toolSignal?.aborted).toBe(true);
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: { continuation: 'stop' },
  });
});

test('does not invoke a tool handler when cancellation wins before execution', async () => {
  const handler = jest.fn(async () => 'result');
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  await store.trigger(devActions.stopMessageGeneration(true));
  await finalization;

  expect(handler).not.toHaveBeenCalled();
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: { continuation: 'stop' },
  });
});

test('settles every call in a cancelled batch exactly once', async () => {
  const handlersStarted = createDeferred<void>();
  const signals: AbortSignal[] = [];
  const handler = (_input: unknown, signal: AbortSignal) => {
    signals.push(signal);
    if (signals.length === 2) {
      handlersStarted.resolve();
    }
    return new Promise(() => undefined);
  };
  const store = createTestStore({
    toolCalls: [
      createToolCall({ id: 'first-call', name: 'first' }),
      createToolCall({ id: 'second-call', name: 'second' }),
    ],
    tools: {
      first: {
        name: 'first',
        description: 'First tool',
        schema: {},
        handler,
      },
      second: {
        name: 'second',
        description: 'Second tool',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  const finalization = store.trigger(store.finalize());
  await handlersStarted.promise;
  await store.trigger(devActions.stopMessageGeneration(true));
  await finalization;

  expect(signals).toHaveLength(2);
  expect(signals[0]).not.toBe(signals[1]);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: {
      continuation: 'stop',
      toolMessages: [
        { toolCallId: 'first-call', content: { status: 'rejected' } },
        { toolCallId: 'second-call', content: { status: 'rejected' } },
      ],
    },
  });
});

test('records a tool handler failure and continues the turn', async () => {
  const failure = new Error('lookup failed');
  const toolCall = createToolCall();
  const store = createTestStore({
    toolCalls: [toolCall],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler: async () => {
          throw failure;
        },
      },
    },
  });
  runTools(store);

  await store.trigger(store.finalize());

  expect(store.actions).toEqual([
    {
      type: '[internal] toolTurnSettled',
      payload: {
        continuation: 'continue',
        toolCalls: [toolCall],
        toolMessages: [
          {
            role: 'tool',
            content: { status: 'rejected', reason: failure },
            toolCallId: 'tool-call-1',
            toolName: 'lookup',
          },
        ],
      },
    },
  ]);
});

test('records malformed arguments without invoking the tool handler', async () => {
  const handler = jest.fn(async () => 'result');
  const store = createTestStore({
    toolCalls: [createToolCall({ arguments: '{invalid' })],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
  });
  runTools(store);

  await store.trigger(store.finalize());

  expect(handler).not.toHaveBeenCalled();
  expect(store.actions).toHaveLength(1);
  expect(store.actions[0]).toMatchObject({
    type: '[internal] toolTurnSettled',
    payload: {
      continuation: 'continue',
      toolMessages: [{ content: { status: 'rejected' } }],
    },
  });
});

test('skips tool execution when no pending calls exist', async () => {
  const store = createTestStore({ toolCalls: [], tools: {} });
  runTools(store);

  await store.trigger(store.finalize());

  expect(store.actions).toEqual([{ type: '[internal] skippedToolCalls' }]);
});

test('does not execute tools after a generation error', async () => {
  const handler = jest.fn(async () => 'result');
  const store = createTestStore({
    toolCalls: [createToolCall()],
    tools: {
      lookup: {
        name: 'lookup',
        description: 'Looks up a value',
        schema: {},
        handler,
      },
    },
    unifiedError: new Error('generation failed'),
  });
  runTools(store);

  await store.trigger(store.finalize());

  expect(handler).not.toHaveBeenCalled();
  expect(store.actions).toEqual([]);
});

test('setMessages cannot settle a same-id replacement call', async () => {
  const handlerStarted = createDeferred<void>();
  let toolSignal: AbortSignal | undefined;
  let handlerCalls = 0;
  const tool: Chat.Internal.Tool = {
    name: 'lookup',
    description: 'Looks up a value',
    schema: {},
    handler: (_input, signal) => {
      handlerCalls++;
      toolSignal = signal;
      handlerStarted.resolve();
      return new Promise(() => undefined);
    },
  };
  const original = createToolCall({ arguments: '{"turn":"original"}' });
  const store = createStore({
    reducers: rootReducers,
    effects: [runTools],
  });
  store.dispatch(
    devActions.init({
      model: 'test-model',
      system: 'Test system',
      tools: [tool],
    }),
  );
  const teardown = store.runEffects();
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [original.id],
      },
      toolCalls: [original],
    }),
  );
  store.dispatch(
    apiActions.assistantTurnFinalized({
      toolCalls: [original],
      continuation: 'continue',
    }),
  );
  await handlerStarted.promise;

  store.dispatch(
    devActions.setMessages({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              role: 'tool',
              status: 'pending',
              name: 'lookup',
              args: { turn: 'replacement' },
              toolCallId: original.id,
            },
          ],
        },
      ],
    }),
  );

  const pending = store.read(selectPendingToolCalls);
  expect(toolSignal?.aborted).toBe(true);
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    id: original.id,
    status: 'pending',
    argumentsResolved: { turn: 'replacement' },
  });

  store.dispatch(
    apiActions.assistantTurnFinalized({
      toolCalls: [original],
      continuation: 'continue',
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(handlerCalls).toBe(1);

  teardown();
});
