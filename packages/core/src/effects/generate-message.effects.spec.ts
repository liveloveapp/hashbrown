import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { createChatRuntime } from '../chat-runtime';
import { Chat } from '../models';
import { lowerViewMessagesToAgUi } from '../reducers/ag-ui-message-history';
import {
  reducers,
  selectDebounce,
  selectGeneratingError,
  selectIsLoading,
  selectMessages,
  selectPendingToolCalls,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectSendingError,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectThreadId,
  selectToolCalls,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
  selectUnifiedError,
  ɵprepareRootAction,
  ɵselectAgentStateProtocolError,
  ɵselectAgUiMessagesProtocolError,
  ɵselectAttemptOwnedPendingToolCalls,
  ɵselectCommittedAgentState,
  ɵselectCommittedAgUiMessages,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectGenerationAttemptId,
  ɵselectGenerationId,
  ɵselectStateWriteLocked,
  ɵselectToolTurnOwnership,
  ɵselectVisibleAgentState,
  ɵselectVisibleAgUiMessages,
} from '../reducers';
import { s } from '../schema';
import { TransportError, type TransportRequest } from '../transport';
import { createStore } from '../utils/micro-ngrx';
import {
  _updateMessagesWithDelta,
  generateMessage,
} from './generate-message.effects';

type SelectorKey = (state: never) => unknown;
type ActionLike = { type: string; payload?: unknown };
type TestHandler = {
  types: string[];
  handler: (action: ActionLike) => unknown | Promise<unknown>;
};
type SelectorMap = Map<SelectorKey, unknown>;

function canonicalUser(content: string) {
  return lowerViewMessagesToAgUi([{ role: 'user', content }], {
    createId: () => `user-${content}`,
  });
}
type MockTransportResponse = {
  events?: AsyncIterable<AGUIEvent>;
  dispose?: jest.Mock;
};
let configuredTransport: { name: string; send: jest.Mock } = {
  name: 'unconfigured-test-transport',
  send: jest.fn(),
};

const generationSilentlyRetiredType =
  internalActions.generationSilentlyRetired.type;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createTestStore(selectorOverrides: SelectorMap = new Map()) {
  const actions: ActionLike[] = [];
  const handlers: TestHandler[] = [];
  const defaults: SelectorMap = new Map<SelectorKey, unknown>([
    [selectResponseSchema, undefined],
    [
      ɵselectEffectiveCommittedAgUiMessages,
      [
        {
          id: 'system-default',
          role: 'system',
          content: 'You are a test bot',
        },
        { id: 'user-default', role: 'user', content: 'Hi!' },
      ],
    ],
    [ɵselectCommittedAgentState, undefined],
    [selectShouldGenerateMessage, true],
    [selectDebounce, 0],
    [selectRetries, 0],
    [selectToolEntities, {}],
    [selectTools, []],
    [selectThreadId, undefined],
    [selectTransport, configuredTransport],
    [selectUiRequested, false],
    [selectRawStreamingMessage, null],
    [selectRawStreamingToolCalls, []],
    [selectPendingToolCalls, []],
    [selectStreamingMessageError, undefined],
    [selectUnifiedError, undefined],
    [ɵselectGenerationId, undefined],
    [ɵselectGenerationAttemptId, undefined],
    [ɵselectAgentStateProtocolError, undefined],
    [ɵselectAgUiMessagesProtocolError, undefined],
  ]);
  const values = new Map<SelectorKey, unknown>([
    ...defaults,
    ...selectorOverrides,
  ]);

  const store = {
    actions,
    when: (
      ...params: [...Array<{ type: string }>, (action: ActionLike) => unknown]
    ) => {
      const handler = params.pop() as (action: ActionLike) => unknown;
      const types = (params as { type: string }[]).map((item) => item.type);
      handlers.push({ types, handler });
      return () => undefined;
    },
    dispatch: (action: ActionLike) => {
      actions.push(action);
      if (action.type === internalActions.logicalGenerationStarted.type) {
        const payload = action.payload as { generationId: string };
        values.set(ɵselectGenerationId, payload.generationId);
        values.set(ɵselectGenerationAttemptId, undefined);
      } else if (
        action.type === internalActions.generationAttemptClaimed.type
      ) {
        const payload = action.payload as {
          generationId: string;
          attemptId: string;
        };
        if (values.get(ɵselectGenerationId) === payload.generationId) {
          values.set(ɵselectGenerationAttemptId, payload.attemptId);
        }
      } else if (
        action.type === internalActions.generationAttemptReleased.type
      ) {
        const payload = action.payload as {
          generationId: string;
          attemptId: string;
        };
        if (
          values.get(ɵselectGenerationId) === payload.generationId &&
          values.get(ɵselectGenerationAttemptId) === payload.attemptId
        ) {
          values.set(ɵselectGenerationAttemptId, undefined);
        }
      } else if (
        action.type === internalActions.logicalGenerationSettled.type
      ) {
        const payload = action.payload as { generationId: string };
        if (values.get(ɵselectGenerationId) === payload.generationId) {
          values.set(ɵselectGenerationId, undefined);
          values.set(ɵselectGenerationAttemptId, undefined);
        }
      }
    },
    dispatchAndWait: async (
      action: ActionLike,
      onComplete?: (followUps: {
        dispatch: (action: ActionLike) => void;
        onCommit: (callback: () => void) => void;
      }) => void,
    ) => {
      store.dispatch(action);
      const actions: ActionLike[] = [];
      const onCommitCallbacks: Array<() => void> = [];
      onComplete?.({
        dispatch: (followUpAction) => actions.push(followUpAction),
        onCommit: (callback) => onCommitCallbacks.push(callback),
      });
      actions.forEach(store.dispatch);
      onCommitCallbacks.forEach((callback) => callback());
    },
    read: <T = unknown>(selector: SelectorKey): T => {
      if (
        selector === ɵselectAttemptOwnedPendingToolCalls &&
        !values.has(selector)
      ) {
        return values.get(selectRawStreamingToolCalls) as T;
      }
      if (!values.has(selector)) {
        throw new Error('No value for selector');
      }
      return values.get(selector) as T;
    },
    setSelector: (selector: SelectorKey, value: unknown) => {
      values.set(selector, value);
    },
    async trigger(action: ActionLike) {
      const matches = handlers.filter((handler) =>
        handler.types.includes(action.type),
      );
      for (const match of matches) {
        await match.handler(action);
      }
    },
  };

  return store as unknown as Parameters<typeof generateMessage>[0] &
    typeof store;
}

function getInputIdentity(request: TransportRequest) {
  if (!request.input) {
    throw new Error('Expected AG-UI input');
  }

  return {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
}

function successfulEvents(
  request: TransportRequest,
  middle: AGUIEvent[] = [],
): AsyncIterable<AGUIEvent> {
  const identity = getInputIdentity(request);

  return (async function* () {
    yield { type: EventType.RUN_STARTED, ...identity };
    yield* middle;
    yield { type: EventType.RUN_FINISHED, ...identity };
  })();
}

function makeSelection(
  transportResponseFactory: (
    request: TransportRequest,
  ) => Promise<MockTransportResponse>,
) {
  const send = jest.fn().mockImplementation(transportResponseFactory);
  configuredTransport = { name: 'test-transport', send };

  return { send };
}

function getDispatchedEvents(actions: ActionLike[]) {
  return actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload as AGUIEvent);
}

function getDispatchedTerminalEvents(actions: ActionLike[]) {
  return getDispatchedEvents(actions).filter(
    (event) =>
      event.type === EventType.RUN_FINISHED ||
      event.type === EventType.RUN_ERROR,
  );
}

function getActionsOfType(actions: ActionLike[], type: string) {
  return actions.filter((action) => action.type === type);
}

function waitForAbort(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForStoreGenerationToSettle(
  store: ReturnType<typeof createRealEffectStore>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (store.read(ɵselectGenerationId) === undefined) {
      return;
    }

    await flushTaskBoundary();
  }

  throw new Error('Timed out waiting for generation ownership to settle');
}

function createRealEffectStore(
  inspectPreparation?: (
    state: Parameters<typeof ɵprepareRootAction>[0],
    action: { readonly type: string; readonly payload?: unknown },
  ) => void,
) {
  return createStore({
    reducers,
    effects: [generateMessage],
    prepareAction: (state, action) => {
      inspectPreparation?.(state, action);
      return ɵprepareRootAction(state, action);
    },
  });
}

async function waitForMockCalls(mock: jest.Mock, count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (mock.mock.calls.length >= count) {
      return;
    }

    await flushTaskBoundary();
  }

  throw new Error(
    `Timed out waiting for ${count} calls; received ${mock.mock.calls.length}`,
  );
}

async function waitForDispatchedEvent(
  actions: ActionLike[],
  eventType: EventType,
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (
      getDispatchedEvents(actions).some((event) => event.type === eventType)
    ) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error(`Timed out waiting for ${eventType}`);
}

async function waitForRuntimeIdle(runtime: { isLoading: () => boolean }) {
  for (let attempt = 0; attempt < 1_000; attempt++) {
    if (!runtime.isLoading()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error('Timed out waiting for the chat runtime to become idle');
}

async function waitForRuntimeIdleAcrossTasks(runtime: {
  isLoading: () => boolean;
  isGenerating?: () => boolean;
  isReceiving?: () => boolean;
  isRunningToolCalls?: () => boolean;
  isSending?: () => boolean;
  error?: () => Error | undefined;
}) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!runtime.isLoading()) {
      return;
    }

    await flushTaskBoundary();
  }

  throw new Error(
    `Timed out waiting for the chat runtime to become idle: ${JSON.stringify({
      isGenerating: runtime.isGenerating?.(),
      error: runtime.error?.()?.message,
      isLoading: runtime.isLoading(),
      isReceiving: runtime.isReceiving?.(),
      isRunningToolCalls: runtime.isRunningToolCalls?.(),
      isSending: runtime.isSending?.(),
    })}`,
  );
}

function observeSkippedToolCalls() {
  const waiters = new Map<number, ReturnType<typeof createDeferred<void>>>();
  let invocationCount = 0;
  const original = internalActions.skippedToolCalls;
  const spy = jest
    .spyOn(internalActions, 'skippedToolCalls')
    .mockImplementation(() => {
      invocationCount++;
      waiters.get(invocationCount)?.resolve();

      return original();
    });

  return {
    count: () => invocationCount,
    restore: () => spy.mockRestore(),
    waitFor: (expectedInvocationCount: number) => {
      if (invocationCount >= expectedInvocationCount) {
        return Promise.resolve();
      }

      const waiter = createDeferred<void>();
      waiters.set(expectedInvocationCount, waiter);
      return waiter.promise;
    },
  };
}

type ScriptedToolRound = {
  readonly callId: string;
  readonly value: number;
};

type ToolTranscriptEntry =
  | {
      readonly role: 'assistant';
      readonly toolCalls: readonly {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;
      }[];
    }
  | {
      readonly role: 'tool';
      readonly toolCallId: string;
      readonly content: string;
    };

function createToolRoundEvents(
  request: TransportRequest,
  round: ScriptedToolRound,
): AsyncIterable<AGUIEvent> {
  const messageId = `assistant-${round.callId}`;

  return successfulEvents(request, [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: round.callId,
      toolCallName: 'recordValue',
      parentMessageId: messageId,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: round.callId,
      delta: JSON.stringify({ value: round.value }),
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: round.callId,
    },
  ]);
}

function createToolBatchEvents(
  request: TransportRequest,
  calls: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
  }[],
): AsyncIterable<AGUIEvent> {
  const messageId = `assistant-${calls.map((call) => call.id).join('-')}`;

  return successfulEvents(request, [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
    },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    ...calls.flatMap<AGUIEvent>((call) => [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: call.id,
        toolCallName: call.name,
        parentMessageId: messageId,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: call.id,
        delta: call.arguments,
      },
      { type: EventType.TOOL_CALL_END, toolCallId: call.id },
    ]),
  ]);
}

function summarizeToolTranscript(request: TransportRequest) {
  return request.input.messages.reduce<ToolTranscriptEntry[]>(
    (entries, message) => {
      if (message.role === 'assistant' && message.toolCalls?.length) {
        return [
          ...entries,
          {
            role: message.role,
            toolCalls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            })),
          },
        ];
      }

      if (message.role === 'tool') {
        return [
          ...entries,
          {
            role: message.role,
            toolCallId: message.toolCallId,
            content: message.content,
          },
        ];
      }

      return entries;
    },
    [],
  );
}

function expectedToolTranscript(rounds: readonly ScriptedToolRound[]) {
  return rounds.flatMap<ToolTranscriptEntry>((round) => [
    {
      role: 'assistant',
      toolCalls: [
        {
          id: round.callId,
          name: 'recordValue',
          arguments: JSON.stringify({ value: round.value }),
        },
      ],
    },
    {
      role: 'tool',
      toolCallId: round.callId,
      content: JSON.stringify({ recorded: round.value }),
    },
  ]);
}

test('updateMessagesWithDelta works without an initial message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Hello, world!' },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta merges content into an existing message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: ' world!' },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    { role: 'assistant', content: 'Hello,' },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta merges tool-call arguments by index', () => {
  const existingToolCall = {
    id: 'tc-1',
    index: 0,
    type: 'function',
    function: {
      name: 'get_current_time',
      arguments: '{"tz":"UTC"}',
    },
  };
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          toolCalls: [
            {
              index: 0,
              function: { arguments: ',"format":"iso8601"' },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    { role: 'assistant', content: '', toolCalls: [existingToolCall] },
    delta,
  );

  expect(message?.toolCalls).toEqual([
    {
      ...existingToolCall,
      function: {
        ...existingToolCall.function,
        arguments: '{"tz":"UTC"},"format":"iso8601"',
      },
    },
  ]);
});

test('updateMessagesWithDelta preserves an existing message for an empty delta', () => {
  const initialMessage: Chat.Api.AssistantMessage = {
    role: 'assistant',
    content: 'Hello',
    toolCalls: [],
  };
  const delta: Chat.Api.CompletionChunk = { choices: [] };

  const message = _updateMessagesWithDelta(initialMessage, delta);

  expect(message).toEqual(initialMessage);
});

test('updateMessagesWithDelta adds the first tool call', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          toolCalls: [
            {
              id: 'tc-1',
              index: 0,
              type: 'function',
              function: { name: 'get_current_time', arguments: '{}' },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toEqual({
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'tc-1',
        index: 0,
        type: 'function',
        function: { name: 'get_current_time', arguments: '{}' },
      },
    ],
  });
});

test('updateMessagesWithDelta appends a tool call with a different index', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          toolCalls: [
            {
              id: 'tc-2',
              index: 1,
              type: 'function',
              function: { name: 'get_weather', arguments: '{}' },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'tc-1',
          index: 0,
          type: 'function',
          function: { name: 'get_current_time', arguments: '{}' },
        },
      ],
    },
    delta,
  );

  expect(message?.toolCalls).toHaveLength(2);
  expect(message?.toolCalls?.[1]).toMatchObject({
    id: 'tc-2',
    index: 1,
    function: { name: 'get_weather' },
  });
});

test('updateMessagesWithDelta treats missing content as empty', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: { role: 'assistant', content: 'Hi!' },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    { role: 'assistant', toolCalls: [] },
    delta,
  );

  expect(message?.content).toBe('Hi!');
});

test('updateMessagesWithDelta returns null when there is nothing to update', () => {
  const delta: Chat.Api.CompletionChunk = { choices: [] };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toBeNull();
});

test('configured thread with no messages sends no request', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [ɵselectEffectiveCommittedAgUiMessages, []],
      [selectShouldGenerateMessage, false],
      [selectThreadId, 'configured-thread'],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(internalActions.start());

  expect(send).not.toHaveBeenCalled();

  teardown?.();
});

test('transport factory failure dispatches the initialization error', async () => {
  jest.clearAllMocks();
  const initializationError = new Error('transport initialization failed');
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectTransport,
        () => {
          throw initializationError;
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(initializationError)]);
  teardown?.();
});

test('missing transport reports configuration error without issuing HTTP', async () => {
  jest.clearAllMocks();
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('HTTP must not be used by the runtime'));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectTransport, undefined]]),
  );
  const teardown = generateMessage(store);

  try {
    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );

    const errors = getActionsOfType(
      store.actions,
      apiActions.generateMessageError.type,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.payload).toMatchObject({
      message: 'No transport configured',
      code: 'CONFIGURATION_ERROR',
      retryable: false,
    });
  } finally {
    teardown?.();
    fetchSpy.mockRestore();
  }
});

test('first user message uses the configured thread ID', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectThreadId, 'configured-thread'],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send.mock.calls[0]?.[0].input?.threadId).toBe('configured-thread');

  teardown?.();
});

test.each([
  {
    label: 'configured identity',
    configuredThreadId: 'thread-a',
    updateThreadId: 'thread-a',
  },
  {
    label: 'unconfigured identity',
    configuredThreadId: undefined,
    updateThreadId: undefined,
  },
] as const)(
  'immediate same $label update preserves the pre-snapshot generation',
  async ({ configuredThreadId, updateThreadId }) => {
    jest.clearAllMocks();
    const { send } = makeSelection(async (request) => ({
      events: successfulEvents(request),
    }));
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectThreadId, configuredThreadId],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Done', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );
    store.setSelector(selectThreadId, updateThreadId);
    await store.trigger(devActions.updateOptions({ threadId: updateThreadId }));
    await generation;

    expect(send).toHaveBeenCalledTimes(1);
    expect(
      getActionsOfType(store.actions, generationSilentlyRetiredType),
    ).toHaveLength(0);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageSuccess.type),
    ).toHaveLength(1);
    teardown?.();
  },
);

test.each([
  {
    name: 'state-only',
    middle: [{ type: EventType.STATE_SNAPSHOT, snapshot: { count: 7 } }],
    expectedState: { count: 7 },
    expectedMessages: canonicalUser('No output.'),
  },
  {
    name: 'messages-snapshot-only',
    middle: [
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [{ id: 'user-replaced', role: 'user', content: 'Replaced.' }],
      },
    ],
    expectedState: { count: 0 },
    expectedMessages: [
      { id: 'user-replaced', role: 'user', content: 'Replaced.' },
    ],
  },
  {
    name: 'empty',
    middle: [],
    expectedState: { count: 0 },
    expectedMessages: canonicalUser('No output.'),
  },
] as const)(
  'real store commits a $name successful run without an assistant message',
  async ({ middle, expectedState, expectedMessages }) => {
    jest.clearAllMocks();
    const { send } = makeSelection(async (request) => ({
      events: successfulEvents(request, [...middle] as AGUIEvent[]),
    }));
    const store = createRealEffectStore();
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        canonicalMessages: canonicalUser('No output.'),
        state: { count: 0 },
        retries: 0,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const successes: ReturnType<typeof apiActions.generateMessageSuccess>[] =
      [];
    const unsubscribe = store.when(
      apiActions.generateMessageSuccess,
      (action) => successes.push(action),
    );
    const teardown = store.runEffects();

    store.dispatch(internalActions.start());
    await waitForMockCalls(send, 1);
    await waitForStoreGenerationToSettle(store);

    expect(successes).toEqual([
      apiActions.generateMessageSuccess({ toolCalls: [] }),
    ]);
    expect(store.read(ɵselectCommittedAgentState)).toEqual(expectedState);
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(expectedMessages);
    expect(store.read(selectUnifiedError)).toBeUndefined();
    expect(store.read(selectIsLoading)).toBe(false);

    unsubscribe();
    teardown();
  },
);

test('does not execute a fresh call already settled by the agent', async () => {
  jest.clearAllMocks();
  const handler = jest.fn(async () => 'local result');
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request, [
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          { id: 'user-agent-result', role: 'user', content: 'Lookup.' },
          {
            id: 'assistant-agent-result',
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-agent-result',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
        ],
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'result-agent',
        toolCallId: 'call-agent-result',
        content: 'remote result',
      },
    ]),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      canonicalMessages: canonicalUser('Lookup.'),
      tools: [
        {
          name: 'lookup',
          description: 'Look up a value.',
          schema: s.object('Lookup input', {}),
          handler,
        },
      ],
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 1);
  await waitForStoreGenerationToSettle(store);

  expect(handler).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
  expect(store.read(selectIsLoading)).toBe(false);

  teardown();
});

test('does not execute pending calls from the attempt-start checkpoint', async () => {
  jest.clearAllMocks();
  const handler = jest.fn(async () => 'local result');
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      canonicalMessages: [
        {
          id: 'assistant-baseline',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-baseline',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
        { id: 'user-after-baseline', role: 'user', content: 'Continue.' },
      ],
      tools: [
        {
          name: 'lookup',
          description: 'Look up a value.',
          schema: s.object('Lookup input', {}),
          handler,
        },
      ],
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 1);
  await waitForStoreGenerationToSettle(store);

  expect(handler).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
  expect(store.read(selectIsLoading)).toBe(false);

  teardown();
});

test('reentrant stop settles an unclaimed reserved snapshot exactly once', async () => {
  jest.clearAllMocks();
  const handler = jest.fn(() => new Promise(() => undefined));
  const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
  const { send } = makeSelection(async (request) => ({
    events: createToolRoundEvents(request, {
      callId: 'call-stop-before-claim',
      value: 1,
    }),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      canonicalMessages: canonicalUser('Stop before tools.'),
      tools: [
        {
          name: 'recordValue',
          description: 'Record a value.',
          schema: s.object('Value', { value: s.number('Value') }),
          handler,
        },
      ],
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const identityEvidence: boolean[] = [];
  const unsubscribe = store.when(apiActions.generateMessageSuccess, () => {
    const reservation = store.read(ɵselectToolTurnOwnership);
    const entity = store.read(
      (state) => state.toolCalls.entities['call-stop-before-claim'],
    );
    identityEvidence.push(reservation?.toolCalls[0] === entity);
    store.dispatch(devActions.stopMessageGeneration(true));
  });
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 1);
  await waitForStoreGenerationToSettle(store);

  expect(handler).not.toHaveBeenCalled();
  expect(settlements).toHaveBeenCalledTimes(1);
  expect(identityEvidence).toEqual([true]);
  expect(store.read(ɵselectToolTurnOwnership)).toBeUndefined();
  expect(store.read(selectIsLoading)).toBe(false);
  expect(
    store.read((state) => state.toolCalls.entities['call-stop-before-claim']),
  ).toMatchObject({
    status: 'done',
    result: { status: 'rejected' },
  });

  unsubscribe();
  settlements.mockRestore();
  teardown();
});

test('executes a pending call newly introduced by a messages snapshot once', async () => {
  jest.clearAllMocks();
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    requestCount++;
    return {
      events:
        requestCount === 1
          ? successfulEvents(request, [
              {
                type: EventType.MESSAGES_SNAPSHOT,
                messages: [
                  {
                    id: 'assistant-snapshot-call',
                    role: 'assistant',
                    content: '',
                    toolCalls: [
                      {
                        id: 'call-from-snapshot',
                        type: 'function',
                        function: {
                          name: 'recordValue',
                          arguments: '{"value":4}',
                        },
                      },
                    ],
                  },
                ],
              },
            ])
          : successfulEvents(request),
    };
  });
  const handler = jest.fn(async ({ value }: { value: number }) => value);
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a value.',
        schema: s.object('Value', { value: s.number('Value') }),
        handler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Use the snapshot.' });
    await waitForRuntimeIdleAcrossTasks(runtime);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 4 }, expect.any(AbortSignal));
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    teardown();
  }
});

test('supersession invalidates an unclaimed reservation before cancellation settles', async () => {
  jest.clearAllMocks();
  let requestCount = 0;
  const handler = jest.fn(async () => 'result');
  const settlementType = internalActions.toolTurnSettled.type;
  const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
  const starts = jest.spyOn(internalActions, 'toolTurnStarted');
  const { send } = makeSelection(async (request) => {
    requestCount++;
    return {
      events:
        requestCount === 1
          ? createToolRoundEvents(request, {
              callId: 'call-stale-reservation',
              value: 1,
            })
          : successfulEvents(request),
    };
  });
  const preparationEvidence: Array<{
    readonly actionGenerationId: string | undefined;
    readonly storeGenerationId: string | undefined;
    readonly actionToolTurnId: string | undefined;
    readonly storeToolTurnId: string | undefined;
  }> = [];
  const store = createRealEffectStore((state, action) => {
    if (action.type !== settlementType) return;
    const payload = action.payload as ReturnType<
      typeof internalActions.toolTurnSettled
    >['payload'];
    preparationEvidence.push({
      actionGenerationId: payload.generationId,
      storeGenerationId: state.generationOwnership.generationId,
      actionToolTurnId: payload.toolTurnId,
      storeToolTurnId: state.generationOwnership.toolTurn?.toolTurnId,
    });
  });
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      canonicalMessages: canonicalUser('First.'),
      tools: [
        {
          name: 'recordValue',
          description: 'Record a value.',
          schema: s.object('Value', { value: s.number('Value') }),
          handler,
        },
      ],
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  let replaced = false;
  const unsubscribe = store.when(apiActions.generateMessageSuccess, () => {
    if (replaced) return;
    replaced = true;
    store.dispatch(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Replacement.'),
        message: { role: 'user', content: 'Replacement.' },
      }),
    );
  });
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 2);
  await waitForStoreGenerationToSettle(store);
  await flushTaskBoundary();

  expect(handler).not.toHaveBeenCalled();
  expect(starts).toHaveBeenCalledTimes(0);
  expect(settlements).toHaveBeenCalledTimes(1);
  expect(preparationEvidence).toEqual([
    {
      actionGenerationId: expect.any(String),
      storeGenerationId: expect.any(String),
      actionToolTurnId: expect.any(String),
      storeToolTurnId: undefined,
    },
  ]);
  expect(preparationEvidence[0]?.storeGenerationId).not.toBe(
    preparationEvidence[0]?.actionGenerationId,
  );
  expect(
    store.read((state) => state.toolCalls.entities['call-stale-reservation']),
  ).toMatchObject({ status: 'pending' });
  expect(store.read(ɵselectToolTurnOwnership)).toBeUndefined();
  expect(store.read(selectIsLoading)).toBe(false);

  unsubscribe();
  settlements.mockRestore();
  starts.mockRestore();
  teardown();
});

test.each([
  'RUN_STARTED',
  'event',
  'success reducer',
  'release reducer',
] as const)(
  'observes a real-store %s failure and rolls back the attempt',
  async (failureTarget) => {
    jest.clearAllMocks();
    const dispatchError = new Error(`${failureTarget} failed`);
    const cleanupOrder: string[] = [];
    const initialCanonical = canonicalUser('Store dispatch failure.');
    let requestSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;
      const identity = getInputIdentity(request);
      const events: AGUIEvent[] = [
        { type: EventType.RUN_STARTED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-store-draft',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-store-draft',
          delta: 'Draft',
        },
        {
          type: EventType.CUSTOM,
          name: 'fail-action-preparation',
          value: null,
        },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
        { type: EventType.RUN_FINISHED, ...identity },
      ];
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
        dispose: jest.fn(() => {
          cleanupOrder.push('response:dispose');
        }),
      };
    });
    let releaseReducerFailed = false;
    const configuredReducers = {
      ...reducers,
      generationOwnership: (
        state: Parameters<typeof reducers.generationOwnership>[0],
        action: Parameters<typeof reducers.generationOwnership>[1],
      ) => {
        if (
          failureTarget === 'release reducer' &&
          action.type === internalActions.generationAttemptReleased.type &&
          !releaseReducerFailed
        ) {
          releaseReducerFailed = true;
          throw dispatchError;
        }

        return reducers.generationOwnership(state, action);
      },
      status: (
        state: Parameters<typeof reducers.status>[0],
        action: Parameters<typeof reducers.status>[1],
      ) => {
        if (
          failureTarget === 'success reducer' &&
          action.type === apiActions.generateMessageSuccess.type
        ) {
          throw dispatchError;
        }

        return reducers.status(state, action);
      },
    };
    const store = createStore({
      reducers: configuredReducers,
      effects: [generateMessage],
      prepareAction: (_state, action) => {
        const failsStartedAction =
          failureTarget === 'RUN_STARTED' &&
          action.type === apiActions.generateMessageStart.type;
        const failsEventAction =
          failureTarget === 'event' &&
          action.type === apiActions.generateMessageEvent.type &&
          'payload' in action &&
          (action.payload as AGUIEvent).type === EventType.CUSTOM;
        if (failsStartedAction || failsEventAction) {
          throw dispatchError;
        }

        return action;
      },
    });
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Store dispatch failure.' }],
        canonicalMessages: initialCanonical,
        state: { count: 0 },
        retries: 2,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const teardown = store.runEffects();
    const errors: Error[] = [];
    let successCount = 0;
    let releaseCount = 0;
    let ownedAtRollback = false;
    let exhaustedRetries = 0;
    const unsubscribeRollback = store.when(
      internalActions.generationAttemptRolledBack,
      () => {
        cleanupOrder.push('attempt:rollback');
        if (failureTarget === 'release reducer') {
          ownedAtRollback =
            store.read(ɵselectGenerationAttemptId) !== undefined;
        }
      },
    );
    const unsubscribeRelease = store.when(
      internalActions.generationAttemptReleased,
      () => {
        if (failureTarget === 'release reducer') {
          releaseCount++;
          cleanupOrder.push('attempt:release');
        }
      },
    );
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      (action) => {
        cleanupOrder.push('terminal:error');
        errors.push(action.payload);
      },
    );
    const unsubscribeSuccess = store.when(
      apiActions.generateMessageSuccess,
      () => successCount++,
    );
    const unsubscribeExhausted = store.when(
      apiActions.generateMessageExhaustedRetries,
      () => exhaustedRetries++,
    );

    store.dispatch(internalActions.start());
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(successCount).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      name: 'TransportError',
      message: dispatchError.message,
      retryable: false,
      code: 'PROTOCOL_ERROR',
    });
    expect(exhaustedRetries).toBe(0);
    expect(cleanupOrder).toEqual(
      failureTarget === 'release reducer'
        ? [
            'iterator:return',
            'response:dispose',
            'attempt:rollback',
            'attempt:release',
            'terminal:error',
          ]
        : [
            'iterator:return',
            'response:dispose',
            'attempt:rollback',
            'terminal:error',
          ],
    );
    if (failureTarget === 'release reducer') {
      expect(ownedAtRollback).toBe(true);
      expect(releaseCount).toBe(1);
    }
    expect(requestSignal?.aborted).toBe(false);
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(ɵselectVisibleAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(selectRawStreamingMessage)).toBeNull();
    expect(store.read(selectRawStreamingToolCalls)).toEqual([]);
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

    unsubscribeRollback();
    unsubscribeRelease();
    unsubscribeError();
    unsubscribeSuccess();
    unsubscribeExhausted();
    teardown();
  },
);

test.each(['listener', 'selector'] as const)(
  'rolls back when a post-effect terminal %s fails before completion',
  async (failurePoint) => {
    jest.clearAllMocks();
    const dispatchError = new Error(`terminal ${failurePoint} failed`);
    const cleanupOrder: string[] = [];
    const initialCanonical = canonicalUser('Terminal dispatch failure.');
    let requestSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;
      const identity = getInputIdentity(request);
      const events: AGUIEvent[] = [
        { type: EventType.RUN_STARTED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-terminal-dispatch',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-terminal-dispatch',
          delta: 'Draft',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-terminal-dispatch',
        },
        { type: EventType.RUN_FINISHED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
      ];
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
        dispose: jest.fn(() => {
          cleanupOrder.push('response:dispose');
        }),
      };
    });
    const store = createRealEffectStore();
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Terminal dispatch failure.' }],
        canonicalMessages: initialCanonical,
        state: { count: 0 },
        retries: 2,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const teardown = store.runEffects();
    let atTerminalBoundary = false;
    let selectorFailed = false;
    const unsubscribeBoundary = store.when(
      apiActions.generateMessageEvent,
      (action) => {
        if (action.payload.type !== EventType.RUN_FINISHED) {
          return;
        }

        atTerminalBoundary = true;
        if (failurePoint === 'listener') {
          throw dispatchError;
        }
      },
    );
    const unsubscribeSelector = store.select(
      (state) => {
        if (
          atTerminalBoundary &&
          failurePoint === 'selector' &&
          !selectorFailed
        ) {
          selectorFailed = true;
          throw dispatchError;
        }

        return state.status.isGenerating;
      },
      () => undefined,
    );
    const errors: Error[] = [];
    let successCount = 0;
    let exhaustedRetries = 0;
    const unsubscribeRollback = store.when(
      internalActions.generationAttemptRolledBack,
      () => cleanupOrder.push('attempt:rollback'),
    );
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      (action) => {
        cleanupOrder.push('terminal:error');
        errors.push(action.payload);
      },
    );
    const unsubscribeSuccess = store.when(
      apiActions.generateMessageSuccess,
      () => successCount++,
    );
    const unsubscribeExhausted = store.when(
      apiActions.generateMessageExhaustedRetries,
      () => exhaustedRetries++,
    );

    store.dispatch(internalActions.start());
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(successCount).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      name: 'TransportError',
      message: dispatchError.message,
      retryable: false,
      code: 'PROTOCOL_ERROR',
    });
    expect(exhaustedRetries).toBe(0);
    expect(cleanupOrder).toEqual([
      'iterator:return',
      'response:dispose',
      'attempt:rollback',
      'terminal:error',
    ]);
    expect(requestSignal?.aborted).toBe(false);
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(ɵselectVisibleAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(selectRawStreamingMessage)).toBeNull();
    expect(store.read(selectRawStreamingToolCalls)).toEqual([]);
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

    unsubscribeBoundary();
    unsubscribeSelector();
    unsubscribeRollback();
    unsubscribeError();
    unsubscribeSuccess();
    unsubscribeExhausted();
    teardown();
  },
);

test.each(['listener', 'selector'] as const)(
  'commits terminal state when a success follow-up %s fails',
  async (failurePoint) => {
    jest.clearAllMocks();
    const observerError = new Error(`success ${failurePoint} failed`);
    const surfacedErrors: unknown[] = [];
    const initialCanonical = canonicalUser('Success observer failure.');
    let requestSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;

      return {
        events: successfulEvents(request, [
          { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'assistant-success-observer',
            role: 'assistant',
          },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'assistant-success-observer',
            delta: 'Done',
          },
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'assistant-success-observer',
          },
        ]),
      };
    });
    const store = createStore({
      reducers,
      effects: [generateMessage],
      surfaceError: (error) => surfacedErrors.push(error),
    });
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Success observer failure.' }],
        canonicalMessages: initialCanonical,
        state: { count: 0 },
        retries: 2,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const teardown = store.runEffects();
    const errors: Error[] = [];
    let successCount = 0;
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      (action) => errors.push(action.payload),
    );
    const unsubscribeSuccess = store.when(
      apiActions.generateMessageSuccess,
      () => successCount++,
    );
    let atSuccessBoundary = false;
    const unsubscribeBoundary = store.when(
      apiActions.generateMessageSuccess,
      () => {
        atSuccessBoundary = true;
        if (failurePoint === 'listener') {
          throw observerError;
        }
      },
    );
    let selectorFailed = false;
    const unsubscribeSelector = store.select(
      (state) => {
        if (
          atSuccessBoundary &&
          failurePoint === 'selector' &&
          !selectorFailed
        ) {
          selectorFailed = true;
          throw observerError;
        }

        return state.status.isGenerating;
      },
      () => undefined,
    );

    store.dispatch(internalActions.start());
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(successCount).toBe(1);
    expect(surfacedErrors).toEqual([observerError]);
    expect(errors).toEqual([]);
    expect(store.read(selectUnifiedError)).toBeUndefined();
    expect(store.read(selectGeneratingError)).toBeUndefined();
    expect(store.read(selectSendingError)).toBeUndefined();
    expect(requestSignal?.aborted).toBe(false);
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 1 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 1 });
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant-success-observer',
          role: 'assistant',
          content: 'Done',
        }),
      ]),
    );
    expect(store.read(ɵselectVisibleAgUiMessages)).toEqual(
      store.read(ɵselectCommittedAgUiMessages),
    );
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

    unsubscribeError();
    unsubscribeSuccess();
    unsubscribeBoundary();
    unsubscribeSelector();
    teardown();
  },
);

test.each([
  { label: 'reported', failureMode: 'reported', stopOnTerminal: false },
  { label: 'thrown', failureMode: 'thrown', stopOnTerminal: false },
  {
    label: 'reported while stop dispatches synchronously',
    failureMode: 'reported',
    stopOnTerminal: true,
  },
] as const)(
  'rejects a terminal event when a synchronization protocol error is $label',
  async ({ failureMode, stopOnTerminal }) => {
    jest.clearAllMocks();
    const selectorError = new Error(`terminal selector ${failureMode}`);
    const cleanupOrder: string[] = [];
    const initialCanonical = canonicalUser('Terminal protocol failure.');
    let requestSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;
      const identity = getInputIdentity(request);
      const events: AGUIEvent[] = [
        { type: EventType.RUN_STARTED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-terminal-draft',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-terminal-draft',
          delta: 'Draft',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-terminal-draft',
        },
        { type: EventType.RUN_FINISHED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
      ];
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
        dispose: jest.fn(() => {
          cleanupOrder.push('response:dispose');
        }),
      };
    });
    let atTerminalBoundary = false;
    const store = createStore({
      reducers,
      effects: [generateMessage],
      prepareAction: (_state, action) => {
        if (
          action.type === apiActions.generateMessageEvent.type &&
          'payload' in action &&
          (action.payload as AGUIEvent).type === EventType.RUN_FINISHED
        ) {
          atTerminalBoundary = true;
        }

        return action;
      },
    });
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Terminal protocol failure.' }],
        canonicalMessages: initialCanonical,
        state: { count: 0 },
        retries: 2,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const teardown = store.runEffects();
    const read = store.read;
    const protocolSelectorReads: SelectorKey[] = [];
    store.read = ((selector: SelectorKey) => {
      if (
        atTerminalBoundary &&
        (selector === ɵselectAgentStateProtocolError ||
          selector === ɵselectAgUiMessagesProtocolError)
      ) {
        protocolSelectorReads.push(selector);
      }
      if (
        atTerminalBoundary &&
        failureMode === 'reported' &&
        selector === ɵselectAgentStateProtocolError
      ) {
        return selectorError;
      }
      if (
        atTerminalBoundary &&
        failureMode === 'thrown' &&
        selector === ɵselectAgUiMessagesProtocolError
      ) {
        throw selectorError;
      }

      return read(selector as never);
    }) as typeof store.read;
    const errors: Error[] = [];
    let successCount = 0;
    let exhaustedRetries = 0;
    const unsubscribeRollback = store.when(
      internalActions.generationAttemptRolledBack,
      () => cleanupOrder.push('attempt:rollback'),
    );
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      (action) => {
        cleanupOrder.push('terminal:error');
        errors.push(action.payload);
      },
    );
    const unsubscribeSuccess = store.when(
      apiActions.generateMessageSuccess,
      () => successCount++,
    );
    const unsubscribeExhausted = store.when(
      apiActions.generateMessageExhaustedRetries,
      () => exhaustedRetries++,
    );
    const unsubscribeStop = store.when(
      apiActions.generateMessageEvent,
      (action) => {
        if (stopOnTerminal && action.payload.type === EventType.RUN_FINISHED) {
          store.dispatch(devActions.stopMessageGeneration(true));
        }
      },
    );

    store.dispatch(internalActions.start());
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(protocolSelectorReads).toEqual([
      ɵselectAgentStateProtocolError,
      ɵselectAgUiMessagesProtocolError,
    ]);
    expect(successCount).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      name: 'TransportError',
      message: selectorError.message,
      retryable: false,
      code: 'PROTOCOL_ERROR',
    });
    if (stopOnTerminal) {
      expect(store.read(selectUnifiedError)).toBe(errors[0]);
      expect(store.read(selectGeneratingError)).toBe(errors[0]);
      expect(store.read(selectSendingError)).toBeUndefined();
    }
    expect(exhaustedRetries).toBe(0);
    expect(cleanupOrder).toEqual([
      'iterator:return',
      'response:dispose',
      'attempt:rollback',
      'terminal:error',
    ]);
    expect(requestSignal?.aborted).toBe(false);
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(ɵselectVisibleAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(selectRawStreamingMessage)).toBeNull();
    expect(store.read(selectRawStreamingToolCalls)).toEqual([]);
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

    unsubscribeRollback();
    unsubscribeError();
    unsubscribeSuccess();
    unsubscribeExhausted();
    unsubscribeStop();
    teardown();
  },
);

test.each([
  {
    name: 'event preparation',
    error: new Error('event preparation failed'),
    configure: (_store: ReturnType<typeof createTestStore>, error: Error) => {
      const event = { type: EventType.MESSAGES_SNAPSHOT } as Record<
        string,
        unknown
      >;
      Object.defineProperty(event, 'messages', {
        enumerable: true,
        get: () => {
          throw error;
        },
      });

      return event as AGUIEvent;
    },
  },
  {
    name: 'event dispatch',
    error: new Error('event dispatch failed'),
    configure: (store: ReturnType<typeof createTestStore>, error: Error) => {
      const dispatch = store.dispatch;
      store.dispatch = (action) => {
        if (
          action.type === apiActions.generateMessageEvent.type &&
          'payload' in action &&
          (action.payload as AGUIEvent).type === EventType.CUSTOM
        ) {
          throw error;
        }
        dispatch(action);
      };

      return {
        type: EventType.CUSTOM,
        name: 'dispatch-failure',
        value: null,
      } as AGUIEvent;
    },
  },
  {
    name: 'protocol selector read',
    error: new Error('protocol selector read failed'),
    configure: (store: ReturnType<typeof createTestStore>, error: Error) => {
      const read = store.read;
      store.read = <T = unknown>(selector: SelectorKey): T => {
        if (selector === ɵselectAgentStateProtocolError) {
          throw error;
        }

        return read<T>(selector);
      };

      return {
        type: EventType.CUSTOM,
        name: 'selector-failure',
        value: null,
      } as AGUIEvent;
    },
  },
])(
  'classifies an $name exception as a terminal protocol error',
  async ({ error, configure }) => {
    jest.clearAllMocks();
    let requestSignal: AbortSignal | undefined;
    const dispose = jest.fn();
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;

      return {
        events: successfulEvents(request, [event]),
        dispose,
      };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectRetries, 2],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Ignored', toolCallIds: [] },
        ],
      ]),
    );
    const event = configure(store, error);
    const teardown = generateMessage(store);

    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Protocol callback'),
        message: { role: 'user', content: 'Protocol callback' },
      }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageError.type),
    ).toEqual([
      apiActions.generateMessageError(
        expect.objectContaining({
          name: 'TransportError',
          message: error.message,
          retryable: false,
          code: 'PROTOCOL_ERROR',
        }) as Error,
      ),
    ]);
    expect(
      getActionsOfType(
        store.actions,
        apiActions.generateMessageExhaustedRetries.type,
      ),
    ).toHaveLength(0);
    expect(
      getActionsOfType(
        store.actions,
        internalActions.generationAttemptRolledBack.type,
      ),
    ).toHaveLength(1);
    expect(
      getActionsOfType(
        store.actions,
        internalActions.generationAttemptReleased.type,
      ),
    ).toHaveLength(1);
    expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);

    teardown?.();
  },
);

test('reads both synchronization protocol selectors before terminating an event', async () => {
  jest.clearAllMocks();
  const protocolError = new Error('invalid synchronized state');
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 2],
      [ɵselectAgentStateProtocolError, protocolError],
    ]),
  );
  const read = store.read;
  const protocolSelectorReads: SelectorKey[] = [];
  store.read = <T = unknown>(selector: SelectorKey): T => {
    if (
      selector === ɵselectAgentStateProtocolError ||
      selector === ɵselectAgUiMessagesProtocolError
    ) {
      protocolSelectorReads.push(selector);
    }

    return read<T>(selector);
  };
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Selector error'),
      message: { role: 'user', content: 'Selector error' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(protocolSelectorReads).toEqual([
    ɵselectAgentStateProtocolError,
    ɵselectAgUiMessagesProtocolError,
  ]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([
    apiActions.generateMessageError(
      expect.objectContaining({
        name: 'TransportError',
        message: protocolError.message,
        retryable: false,
        code: 'PROTOCOL_ERROR',
      }) as Error,
    ),
  ]);

  teardown?.();
});

test.each([
  {
    label: 'configured identity',
    configuredThreadId: 'thread-a',
    updateThreadId: 'thread-b',
  },
  {
    label: 'unconfigured identity',
    configuredThreadId: undefined,
    updateThreadId: 'thread-b',
  },
] as const)(
  'immediate changed $label update retires the pre-snapshot generation',
  async ({ configuredThreadId, updateThreadId }) => {
    jest.clearAllMocks();
    const { send } = makeSelection(async (request) => ({
      events: successfulEvents(request),
    }));
    const store = createTestStore(
      new Map<SelectorKey, unknown>([[selectThreadId, configuredThreadId]]),
    );
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );
    store.setSelector(selectThreadId, updateThreadId);
    await store.trigger(devActions.updateOptions({ threadId: updateThreadId }));
    await generation;

    expect(send).not.toHaveBeenCalled();
    expect(
      getActionsOfType(store.actions, generationSilentlyRetiredType),
    ).toHaveLength(1);
    expect(getDispatchedEvents(store.actions)).toHaveLength(0);

    teardown?.();
  },
);

test.each([
  { label: 'replacement', nextThreadId: 'thread-b' },
  { label: 'explicit clearing', nextThreadId: undefined },
  { label: 'empty replacement', nextThreadId: '' },
] as const)(
  'thread identity $label retires a run awaiting RUN_STARTED',
  async ({ nextThreadId }) => {
    jest.clearAllMocks();
    const firstIterationStarted = createDeferred<void>();
    const releaseLateStart = createDeferred<void>();
    const firstIteratorReturn = jest.fn(async () => ({
      done: true as const,
      value: undefined,
    }));
    const firstDispose = jest.fn();
    let firstRequest: TransportRequest | undefined;
    let sendCount = 0;
    const { send } = makeSelection(async (request) => {
      sendCount++;
      if (sendCount === 1) {
        firstRequest = request;
        let index = 0;
        return {
          events: {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  index++;
                  if (index === 1) {
                    firstIterationStarted.resolve();
                    await releaseLateStart.promise;
                    return {
                      done: false as const,
                      value: {
                        type: EventType.RUN_STARTED,
                        ...getInputIdentity(request),
                      } as AGUIEvent,
                    };
                  }

                  return {
                    done: false as const,
                    value: {
                      type: EventType.RUN_FINISHED,
                      ...getInputIdentity(request),
                    } as AGUIEvent,
                  };
                },
                return: firstIteratorReturn,
              };
            },
          },
          dispose: firstDispose,
        };
      }

      return { events: successfulEvents(request) };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectRetries, 2],
        [selectThreadId, 'thread-a'],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Done', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    const firstGeneration = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('First'),
        message: { role: 'user', content: 'First' },
      }),
    );
    await firstIterationStarted.promise;
    store.setSelector(selectThreadId, nextThreadId);
    await store.trigger(devActions.updateOptions({ threadId: nextThreadId }));
    await store.trigger(devActions.updateOptions({ threadId: nextThreadId }));
    const abortedAfterUpdate = firstRequest?.signal.aborted;
    releaseLateStart.resolve();
    await firstGeneration;
    const actionsAfterRetirement = [...store.actions];
    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Second'),
        message: { role: 'user', content: 'Second' },
      }),
    );

    const secondRequest = send.mock.calls[1]?.[0] as
      TransportRequest | undefined;
    expect(abortedAfterUpdate).toBe(true);
    expect(firstIteratorReturn).toHaveBeenCalledTimes(1);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(
      getActionsOfType(actionsAfterRetirement, generationSilentlyRetiredType),
    ).toHaveLength(1);
    expect(getDispatchedEvents(actionsAfterRetirement)).toHaveLength(0);
    expect(
      getActionsOfType(
        actionsAfterRetirement,
        apiActions.generateMessageSuccess.type,
      ),
    ).toHaveLength(0);
    expect(
      getActionsOfType(
        actionsAfterRetirement,
        apiActions.generateMessageError.type,
      ),
    ).toHaveLength(0);
    expect(
      getActionsOfType(
        actionsAfterRetirement,
        apiActions.generateMessageExhaustedRetries.type,
      ),
    ).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      getDispatchedEvents(store.actions).filter(
        (event) => event.type === EventType.RUN_FINISHED,
      ),
    ).toHaveLength(1);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageSuccess.type),
    ).toHaveLength(1);
    expect(secondRequest?.input?.threadId).toBeDefined();
    if (nextThreadId === undefined) {
      expect(secondRequest?.input?.threadId).not.toBe(
        firstRequest?.input?.threadId,
      );
    } else {
      expect(secondRequest?.input?.threadId).toBe(nextThreadId);
    }

    teardown?.();
  },
);

test.each([
  { label: 'configured', configuredThreadId: 'thread-a' },
  { label: 'generated', configuredThreadId: undefined },
] as const)(
  'same $label thread identity update preserves a blocked generation',
  async ({ configuredThreadId }) => {
    jest.clearAllMocks();
    const iterationBlocked = createDeferred<void>();
    const releaseFinish = createDeferred<void>();
    let request: TransportRequest | undefined;
    makeSelection(async (sentRequest) => {
      request = sentRequest;
      const identity = getInputIdentity(sentRequest);
      return {
        events: (async function* () {
          yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
          iterationBlocked.resolve();
          await releaseFinish.promise;
          yield { type: EventType.RUN_FINISHED, ...identity } as AGUIEvent;
        })(),
      };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectThreadId, configuredThreadId],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Done', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );
    await iterationBlocked.promise;
    const effectiveThreadId = request?.input?.threadId;
    store.setSelector(selectThreadId, effectiveThreadId);
    await store.trigger(
      devActions.updateOptions({
        threadId: effectiveThreadId,
        system: 'Updated system prompt',
      }),
    );
    const abortedAfterUpdate = request?.signal.aborted;
    releaseFinish.resolve();
    await generation;

    expect(abortedAfterUpdate).toBe(false);
    expect(
      getActionsOfType(store.actions, generationSilentlyRetiredType),
    ).toHaveLength(0);
    expect(
      getDispatchedEvents(store.actions).filter(
        (event) => event.type === EventType.RUN_FINISHED,
      ),
    ).toHaveLength(1);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageSuccess.type),
    ).toHaveLength(1);
    teardown?.();
  },
);

test('thread identity synchronization before a run does not retire the next run', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectThreadId, undefined],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(devActions.updateOptions({ threadId: undefined }));
  await store.trigger(devActions.updateOptions({ threadId: undefined }));
  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, generationSilentlyRetiredType),
  ).toHaveLength(0);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_FINISHED,
    ),
  ).toHaveLength(1);
  teardown?.();
});

test('unconfigured run reuses one generated thread ID across retries', async () => {
  jest.clearAllMocks();
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    if (attempt === 1) {
      return {
        events: {
          [Symbol.asyncIterator]() {
            return {
              next: async () => ({
                done: true as const,
                value: undefined,
              }),
            };
          },
        },
        dispose: firstDispose,
      };
    }

    return {
      events: successfulEvents(request),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  const requests = send.mock.calls.map(([request]) => request);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.input?.threadId).toBe(requests[1]?.input?.threadId);
  expect(requests[0]?.input?.runId).not.toBe(requests[1]?.input?.runId);
  expect(requests[0]?.input.messages).toBe(requests[1]?.input.messages);
  expect(requests[0]?.input.state).toBe(requests[1]?.input.state);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('continues client tools with isolated reasoning details in transcript order', async () => {
  jest.clearAllMocks();
  const secondInputCaptured = createDeferred<TransportRequest>();
  const toolHandler = jest.fn(async ({ city }: { city: string }) => ({
    city,
    condition: 'sunny',
  }));
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: successfulEvents(request, [
          {
            type: EventType.REASONING_MESSAGE_START,
            messageId: 'reasoning-weather',
            role: 'reasoning',
            metadata: { provider: { trace: ['original'] } },
          },
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: 'reasoning-weather',
            delta: 'I need the weather tool.',
          },
          {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: 'reasoning-weather',
            encryptedValue: 'opaque-reasoning',
          },
          {
            type: EventType.REASONING_MESSAGE_END,
            messageId: 'reasoning-weather',
          },
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'assistant-weather',
            role: 'assistant',
          },
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'assistant-weather',
            metadata: {
              provider: { assistantSteps: [{ index: 0 }] },
            },
          },
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call-weather',
            toolCallName: 'getWeather',
            parentMessageId: 'assistant-weather',
          },
          {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: 'assistant-weather',
            encryptedValue: 'opaque-assistant',
          },
          {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'tool-call',
            entityId: 'call-weather',
            encryptedValue: 'opaque-tool-call',
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call-weather',
            delta: '{"city":"Paris"}',
          },
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'call-weather',
            metadata: {
              provider: { toolSteps: [{ index: 1 }] },
            },
          },
        ]),
      };
    }

    secondInputCaptured.resolve(request);
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-final',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-final',
          delta: 'It is sunny in Paris.',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-final',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'getWeather',
        description: 'Get weather for a city.',
        schema: s.object('Weather lookup', {
          city: s.string('City name'),
        }),
        handler: toolHandler,
      },
    ],
  });
  const teardown = runtime.start();

  runtime.sendMessage({
    role: 'user',
    content: 'What is the weather in Paris?',
  });
  const secondRequest = await secondInputCaptured.promise;

  expect(toolHandler).toHaveBeenCalledWith(
    { city: 'Paris' },
    expect.any(AbortSignal),
  );
  expect(secondRequest.input?.messages.map(({ role }) => role)).toEqual([
    'system',
    'user',
    'reasoning',
    'assistant',
    'tool',
  ]);
  const priorUserMessage = secondRequest.input?.messages[1];
  expect(priorUserMessage?.role).toBe('user');
  expect(typeof priorUserMessage?.id === 'string').toBe(true);
  expect(
    priorUserMessage?.role === 'user' &&
      priorUserMessage.content === 'What is the weather in Paris?',
  ).toBe(true);
  const safeContinuation = secondRequest.input?.messages
    .slice(2)
    .map((message) => {
      if (message.role === 'assistant') {
        const { encryptedValue, toolCalls, ...safeMessage } = message;
        return {
          ...safeMessage,
          hasEncryptedValue:
            typeof encryptedValue === 'string' && encryptedValue.length > 0,
          ...(toolCalls
            ? {
                toolCalls: toolCalls.map((toolCall) => {
                  const {
                    encryptedValue: toolEncryptedValue,
                    ...safeToolCall
                  } = toolCall;
                  return {
                    ...safeToolCall,
                    hasEncryptedValue:
                      typeof toolEncryptedValue === 'string' &&
                      toolEncryptedValue.length > 0,
                  };
                }),
              }
            : {}),
        };
      }

      if (message.role === 'reasoning') {
        const { encryptedValue, ...safeMessage } = message;
        return {
          ...safeMessage,
          hasEncryptedValue:
            typeof encryptedValue === 'string' && encryptedValue.length > 0,
        };
      }

      return message;
    });
  expect(safeContinuation).toEqual([
    {
      id: 'reasoning-weather',
      role: 'reasoning',
      content: 'I need the weather tool.',
      hasEncryptedValue: true,
      metadata: { provider: { trace: ['original'] } },
    },
    {
      id: expect.any(String),
      role: 'assistant',
      content: '',
      hasEncryptedValue: true,
      metadata: {
        provider: { assistantSteps: [{ index: 0 }] },
      },
      toolCalls: [
        {
          id: 'call-weather',
          type: 'function',
          hasEncryptedValue: true,
          metadata: {
            provider: { toolSteps: [{ index: 1 }] },
          },
          function: {
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
          },
        },
      ],
    },
    {
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'call-weather',
      content: '{"city":"Paris","condition":"sunny"}',
    },
  ]);
  const committedAssistant = runtime
    .messages()
    .find(
      (message) =>
        message.role === 'assistant' && message.reasoningDetails !== undefined,
    );
  if (committedAssistant?.role !== 'assistant') {
    throw new Error('Expected a committed assistant reasoning message.');
  }
  const capturedAssistant = secondRequest.input?.messages.find(
    (message) => message.role === 'assistant',
  );
  if (!capturedAssistant || capturedAssistant.role !== 'assistant') {
    throw new Error('Expected captured continuation assistant.');
  }
  const capturedToolCall = capturedAssistant.toolCalls?.[0];
  const committedToolCall = committedAssistant.toolCalls[0];
  if (!capturedToolCall || !committedToolCall) {
    throw new Error('Expected captured and committed continuation tool calls.');
  }
  const capturedReasoning = secondRequest.input?.messages.find(
    (message) => message.role === 'reasoning',
  );
  if (!capturedReasoning || capturedReasoning.role !== 'reasoning') {
    throw new Error('Expected captured continuation reasoning.');
  }
  const capturedMetadata = capturedReasoning.metadata as {
    provider: { trace: string[] };
  };
  const committedReasoning = committedAssistant.reasoningDetails?.[0];
  const committedMetadata = committedReasoning?.metadata as {
    provider: { trace: string[] };
  };
  const originalEncryptedValue = capturedReasoning.encryptedValue;
  const originalAssistantEncryptedValue = capturedAssistant.encryptedValue;
  const originalToolEncryptedValue = capturedToolCall.encryptedValue;
  const capturedAssistantMetadata = capturedAssistant.metadata as {
    provider: { assistantSteps: { index: number }[] };
  };
  const committedAssistantMetadata = committedAssistant.metadata as {
    provider: { assistantSteps: { index: number }[] };
  };
  const capturedToolMetadata = capturedToolCall.metadata as {
    provider: { toolSteps: { index: number }[] };
  };
  const committedToolMetadata = committedToolCall.metadata as {
    provider: { toolSteps: { index: number }[] };
  };
  const [capturedAssistantStep] =
    capturedAssistantMetadata.provider.assistantSteps;
  const [capturedToolStep] = capturedToolMetadata.provider.toolSteps;
  if (!capturedAssistantStep || !capturedToolStep) {
    throw new Error('Expected captured provider metadata steps.');
  }

  expect(capturedAssistant).not.toBe(committedAssistant);
  expect(capturedToolCall).not.toBe(committedToolCall);
  expect(capturedReasoning === committedReasoning).toBe(false);
  expect(capturedMetadata).not.toBe(committedMetadata);
  expect(capturedMetadata.provider).not.toBe(committedMetadata.provider);
  expect(capturedAssistantMetadata).not.toBe(committedAssistantMetadata);
  expect(capturedAssistantMetadata.provider).not.toBe(
    committedAssistantMetadata.provider,
  );
  expect(capturedToolMetadata).not.toBe(committedToolMetadata);
  expect(capturedToolMetadata.provider).not.toBe(
    committedToolMetadata.provider,
  );
  expect(
    typeof originalEncryptedValue === 'string' &&
      originalEncryptedValue.length > 0 &&
      committedReasoning?.encryptedValue === originalEncryptedValue,
  ).toBe(true);
  expect(originalAssistantEncryptedValue).toBe('opaque-assistant');
  expect(originalToolEncryptedValue).toBe('opaque-tool-call');
  expect(committedAssistant.encryptedValue).toBe(
    originalAssistantEncryptedValue,
  );
  expect(committedToolCall.encryptedValue).toBe(originalToolEncryptedValue);
  expect(Object.isFrozen(capturedAssistant)).toBe(true);
  expect(Object.isFrozen(capturedToolCall)).toBe(true);
  expect(Object.isFrozen(capturedReasoning)).toBe(true);
  expect(Object.isFrozen(capturedMetadata.provider.trace)).toBe(true);
  expect(Object.isFrozen(capturedAssistantStep)).toBe(true);
  expect(Object.isFrozen(capturedToolStep)).toBe(true);

  expect(committedAssistant.encryptedValue).toBe(
    originalAssistantEncryptedValue,
  );
  expect(committedToolCall.encryptedValue).toBe(originalToolEncryptedValue);
  expect(committedReasoning?.encryptedValue === originalEncryptedValue).toBe(
    true,
  );
  expect(committedMetadata).toEqual({ provider: { trace: ['original'] } });
  expect(committedAssistantMetadata).toEqual({
    provider: { assistantSteps: [{ index: 0 }] },
  });
  expect(committedToolMetadata).toEqual({
    provider: { toolSteps: [{ index: 1 }] },
  });

  teardown();
});

test('continues three sequential tool rounds before the terminal response', async () => {
  jest.clearAllMocks();
  const skippedToolCalls = observeSkippedToolCalls();
  const scriptedToolRounds: readonly ScriptedToolRound[] = [
    { callId: 'call-round-1', value: 1 },
    { callId: 'call-round-2', value: 2 },
    { callId: 'call-round-3', value: 3 },
  ];
  const expectedToolRounds: readonly ScriptedToolRound[] = [
    { callId: 'call-round-1', value: 1 },
    { callId: 'call-round-2', value: 2 },
    { callId: 'call-round-3', value: 3 },
  ];
  const capturedRequests: TransportRequest[] = [];
  const terminalRequestStarted = createDeferred<void>();
  const localResults = scriptedToolRounds.map(({ value }) => ({
    recorded: value,
  }));
  const toolHandler = jest.fn(
    async ({ value }: { value: number }) => localResults[value - 1],
  );
  const { send } = makeSelection(async (request) => {
    capturedRequests.push(request);
    const toolRound = scriptedToolRounds[capturedRequests.length - 1];
    if (toolRound) {
      return { events: createToolRoundEvents(request, toolRound) };
    }

    terminalRequestStarted.resolve();
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-terminal',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-terminal',
          delta: 'All values recorded.',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-terminal',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: toolHandler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Record three values.' });
    await terminalRequestStarted.promise;
    await skippedToolCalls.waitFor(1);
    await waitForRuntimeIdle(runtime);

    expect(skippedToolCalls.count()).toBe(1);
    expect(capturedRequests).toHaveLength(4);
    const identities = capturedRequests.map(getInputIdentity);
    expect(new Set(identities.map(({ threadId }) => threadId)).size).toBe(1);
    expect(new Set(identities.map(({ runId }) => runId)).size).toBe(4);
    expect(capturedRequests.map(summarizeToolTranscript)).toEqual([
      expectedToolTranscript([]),
      expectedToolTranscript(expectedToolRounds.slice(0, 1)),
      expectedToolTranscript(expectedToolRounds.slice(0, 2)),
      expectedToolTranscript(expectedToolRounds),
    ]);
    expect(toolHandler).toHaveBeenCalledTimes(3);
    expect(toolHandler.mock.calls.map(([input]) => input)).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
    const settledValues = runtime
      .messages()
      .flatMap((message) =>
        message.role === 'assistant' ? message.toolCalls : [],
      )
      .flatMap((toolCall) =>
        toolCall.status === 'done' && toolCall.result.status === 'fulfilled'
          ? [toolCall.result.value]
          : [],
      );
    expect(settledValues).toHaveLength(3);
    settledValues.forEach((value, index) => {
      expect(value).toBe(localResults[index]);
    });
    expect(send).toHaveBeenCalledTimes(4);
  } finally {
    skippedToolCalls.restore();
    teardown();
  }
});

test('resets retry attempts for each logical tool continuation run', async () => {
  jest.clearAllMocks();
  const skippedToolCalls = observeSkippedToolCalls();
  const requests: TransportRequest[] = [];
  const terminalRequestStarted = createDeferred<void>();
  const toolHandler = jest.fn(async ({ value }: { value: number }) => ({
    recorded: value,
  }));
  let transportAttemptWithinRun = 0;
  let successfulRuns = 0;
  makeSelection(async (request) => {
    requests.push(request);
    transportAttemptWithinRun++;
    if (transportAttemptWithinRun === 1) {
      throw new Error(`Retry logical run ${successfulRuns + 1}`);
    }

    transportAttemptWithinRun = 0;
    successfulRuns++;
    if (successfulRuns === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-retry-reset',
          value: 7,
        }),
      };
    }

    terminalRequestStarted.resolve();
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-retry-terminal',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-retry-terminal',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    retries: 1,
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: toolHandler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await terminalRequestStarted.promise;
    await skippedToolCalls.waitFor(1);
    await waitForRuntimeIdle(runtime);

    expect(requests.map(({ attempt }) => attempt)).toEqual([1, 2, 1, 2]);
    expect(requests.map(({ maxAttempts }) => maxAttempts)).toEqual([
      2, 2, 2, 2,
    ]);
    expect(toolHandler).toHaveBeenCalledTimes(1);
  } finally {
    skippedToolCalls.restore();
    teardown();
  }
});

test('stopping during a later tool handler prevents another run', async () => {
  jest.clearAllMocks();
  const skippedToolCalls = observeSkippedToolCalls();
  const laterHandlerStarted = createDeferred<void>();
  const releaseLaterHandler = createDeferred<void>();
  const handlerFinished = createDeferred<void>();
  const probeRequestStarted = createDeferred<void>();
  const probePrompt = 'Confirm cancellation completion.';
  const scriptedToolRounds: readonly ScriptedToolRound[] = [
    { callId: 'call-before-stop', value: 1 },
    { callId: 'call-at-stop', value: 2 },
  ];
  const requests: TransportRequest[] = [];
  let probeSkippedInvocation = 0;
  let laterHandlerSignal: AbortSignal | undefined;
  const toolHandler = jest.fn(
    async ({ value }: { value: number }, signal: AbortSignal) => {
      if (value === 1) {
        return { recorded: value };
      }

      laterHandlerSignal = signal;
      laterHandlerStarted.resolve();
      try {
        await releaseLaterHandler.promise;
        return { recorded: value };
      } finally {
        handlerFinished.resolve();
      }
    },
  );
  const { send } = makeSelection(async (request) => {
    requests.push(request);
    const toolRound = scriptedToolRounds[requests.length - 1];
    if (toolRound) {
      return { events: createToolRoundEvents(request, toolRound) };
    }

    if (
      request.input.messages.some(
        (message) => message.role === 'user' && message.content === probePrompt,
      )
    ) {
      probeSkippedInvocation = skippedToolCalls.count() + 1;
      probeRequestStarted.resolve();
    }

    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-cancellation-probe',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-cancellation-probe',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: toolHandler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({
      role: 'user',
      content: 'Record values until stopped.',
    });
    await laterHandlerStarted.promise;
    const laterHandlerPromise = toolHandler.mock.results[1]?.value;
    if (!laterHandlerPromise) {
      throw new Error('Expected the later tool handler promise.');
    }
    runtime.stop(true);
    const transportCountAtStop = send.mock.calls.length;

    expect(laterHandlerSignal?.aborted).toBe(true);

    releaseLaterHandler.resolve();
    await handlerFinished.promise;
    await laterHandlerPromise;
    runtime.sendMessage({ role: 'user', content: probePrompt });
    await probeRequestStarted.promise;
    await skippedToolCalls.waitFor(probeSkippedInvocation);
    await waitForRuntimeIdle(runtime);

    expect(toolHandler).toHaveBeenCalledTimes(2);
    expect(transportCountAtStop).toBe(2);
    expect(send).toHaveBeenCalledTimes(transportCountAtStop + 1);
    expect(requests).toHaveLength(3);
    expect(
      requests[2]?.input.messages.some(
        (message) => message.role === 'user' && message.content === probePrompt,
      ),
    ).toBe(true);
  } finally {
    releaseLaterHandler.resolve();
    skippedToolCalls.restore();
    teardown();
  }
});

test('handles 25 sequential tool rounds before a final response', async () => {
  jest.clearAllMocks();
  const skippedToolCalls = observeSkippedToolCalls();
  const scriptedToolRounds: readonly ScriptedToolRound[] = Array.from(
    { length: 25 },
    (_, index) => ({
      callId: `call-sentinel-${index + 1}`,
      value: index + 1,
    }),
  );
  const terminalRequestStarted = createDeferred<void>();
  const toolHandler = jest.fn(async ({ value }: { value: number }) => ({
    recorded: value,
  }));
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    const toolRound = scriptedToolRounds[requestCount];
    requestCount++;
    if (toolRound) {
      return { events: createToolRoundEvents(request, toolRound) };
    }

    terminalRequestStarted.resolve();
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-sentinel-terminal',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-sentinel-terminal',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: toolHandler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({
      role: 'user',
      content: 'Record the sentinel values.',
    });
    await terminalRequestStarted.promise;
    await skippedToolCalls.waitFor(1);
    await waitForRuntimeIdle(runtime);

    expect(skippedToolCalls.count()).toBe(1);
    expect(send).toHaveBeenCalledTimes(26);
    expect(toolHandler).toHaveBeenCalledTimes(25);
  } finally {
    skippedToolCalls.restore();
    teardown();
  }
});

test('teardown settles active tools and retires persistent generation state', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  const lateResult = createDeferred<{ recorded: number }>();
  const retiredActions = jest.spyOn(
    internalActions,
    'generationSilentlyRetired',
  );
  let toolSignal: AbortSignal | undefined;
  const { send } = makeSelection(async (request) => ({
    events: createToolRoundEvents(request, {
      callId: 'call-teardown',
      value: 7,
    }),
  }));
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return lateResult.promise;
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await handlerStarted.promise;
    teardown();
    const settledToolCall = runtime
      .messages()
      .find((message) => message.role === 'assistant')?.toolCalls[0];
    lateResult.resolve({ recorded: 7 });
    await Promise.resolve();

    expect(toolSignal?.aborted).toBe(true);
    expect(settledToolCall).toMatchObject({
      status: 'done',
      result: { status: 'rejected' },
      toolCallId: 'call-teardown',
    });
    expect(retiredActions).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    retiredActions.mockRestore();
  }
});

test('teardown blocks reentrant generation from settlement subscribers', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  let toolSignal: AbortSignal | undefined;
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-teardown-reentrancy',
          value: 8,
        }),
      };
    }

    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-after-teardown',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-after-teardown',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: async (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return new Promise(() => undefined);
        },
      },
    ],
  });
  const teardown = runtime.start();
  await Promise.resolve();
  let teardownStarted = false;
  let reentrantSendCount = 0;
  const unsubscribe = runtime.messages.subscribe((messages) => {
    const hasSettledTool = messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.toolCalls.some((toolCall) => toolCall.status === 'done'),
    );
    if (teardownStarted && hasSettledTool && reentrantSendCount === 0) {
      reentrantSendCount++;
      runtime.sendMessage({
        role: 'user',
        content: 'Do not run this after teardown.',
      });
    }
  });

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await handlerStarted.promise;
    teardownStarted = true;
    teardown();
    const messagesAfterTeardown = runtime.messages();
    await flushTaskBoundary();
    await flushTaskBoundary();
    await flushTaskBoundary();

    expect(reentrantSendCount).toBe(1);
    expect(toolSignal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(runtime.messages()).toEqual(messagesAfterTeardown);
    expect(runtime.isLoading()).toBe(false);
  } finally {
    unsubscribe();
    teardown();
  }
});

test('a synchronous messages subscriber can stop a newly published tool turn', async () => {
  jest.clearAllMocks();
  const handler = jest.fn(async () => 'unused');
  const { send } = makeSelection(async (request) => ({
    events: createToolRoundEvents(request, {
      callId: 'call-synchronous-stop',
      value: 1,
    }),
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler,
      },
    ],
  });
  const teardown = runtime.start();
  await Promise.resolve();
  const stopObserved = createDeferred<void>();
  let stopped = false;
  const unsubscribe = runtime.messages.subscribe((messages) => {
    const hasPendingTool = messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.toolCalls.some((toolCall) => toolCall.status === 'pending'),
    );
    if (hasPendingTool && !runtime.isGenerating() && !stopped) {
      stopped = true;
      runtime.stop();
      stopObserved.resolve();
    }
  });

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await stopObserved.promise;
    await flushTaskBoundary();
    const toolCall = runtime
      .messages()
      .find((message) => message.role === 'assistant')?.toolCalls[0];

    expect(stopped).toBe(true);
    expect(toolCall).toMatchObject({
      status: 'done',
      result: { status: 'rejected' },
    });
    expect(runtime.isLoading()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    teardown();
  }
});

test('a synchronous messages subscriber settles tools before superseding', async () => {
  jest.clearAllMocks();
  const replacementRequest = createDeferred<TransportRequest>();
  const handler = jest.fn(async () => 'stale result');
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-synchronous-supersession',
          value: 2,
        }),
      };
    }

    replacementRequest.resolve(request);
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `assistant-synchronous-${requestCount}`,
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `assistant-synchronous-${requestCount}`,
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler,
      },
    ],
  });
  const teardown = runtime.start();
  await Promise.resolve();
  const supersessionObserved = createDeferred<void>();
  let superseded = false;
  const unsubscribe = runtime.messages.subscribe((messages) => {
    const hasPendingTool = messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.toolCalls.some((toolCall) => toolCall.status === 'pending'),
    );
    if (hasPendingTool && !runtime.isGenerating() && !superseded) {
      superseded = true;
      runtime.sendMessage({ role: 'user', content: 'Replace that request.' });
      supersessionObserved.resolve();
    }
  });

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await supersessionObserved.promise;
    const request = await replacementRequest.promise;
    await waitForRuntimeIdleAcrossTasks(runtime);

    expect(request.input.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(handler).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
    teardown();
  }
});

test.each(['thread replacement', 'teardown'] as const)(
  'a synchronous messages subscriber settles tools during %s retirement',
  async (retirement) => {
    jest.clearAllMocks();
    const handler = jest.fn(async () => 'unused');
    const { send } = makeSelection(async (request) => ({
      events: createToolRoundEvents(request, {
        callId: `call-synchronous-${retirement}`,
        value: 3,
      }),
    }));
    const runtime = createChatRuntime({
      debounce: 0,
      system: 'You are a test bot',
      threadId: 'thread-a',
      transport: configuredTransport,
      tools: [
        {
          name: 'recordValue',
          description: 'Record a numeric value.',
          schema: s.object('Value to record', {
            value: s.number('Numeric value'),
          }),
          handler,
        },
      ],
    });
    const teardown = runtime.start();
    await Promise.resolve();
    const retirementObserved = createDeferred<void>();
    let retired = false;
    const unsubscribe = runtime.messages.subscribe((messages) => {
      const hasPendingTool = messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.toolCalls.some((toolCall) => toolCall.status === 'pending'),
      );
      if (hasPendingTool && !runtime.isGenerating() && !retired) {
        retired = true;
        if (retirement === 'thread replacement') {
          runtime.updateOptions({ threadId: 'thread-b' });
        } else {
          teardown();
        }
        retirementObserved.resolve();
      }
    });

    try {
      runtime.sendMessage({ role: 'user', content: 'Record a value.' });
      await retirementObserved.promise;
      await flushTaskBoundary();
      const toolCall = runtime
        .messages()
        .find((message) => message.role === 'assistant')?.toolCalls[0];

      expect(retired).toBe(true);
      expect(toolCall).toMatchObject({
        status: 'done',
        result: { status: 'rejected' },
      });
      expect(handler).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      teardown();
    }
  },
);

test('superseding input snapshots settled tools before the replacement user', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  const lateResult = createDeferred<{ recorded: number }>();
  const secondRequestCaptured = createDeferred<TransportRequest>();
  const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
  let toolSignal: AbortSignal | undefined;
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-superseded',
          value: 3,
        }),
      };
    }

    secondRequestCaptured.resolve(request);
    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-superseding',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-superseding',
        },
      ]),
    };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return lateResult.promise;
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Record the first value.' });
    await handlerStarted.promise;
    runtime.sendMessage({ role: 'user', content: 'Replace that request.' });
    const secondRequest = await secondRequestCaptured.promise;

    expect(secondRequest.input.messages.map((message) => message.role)).toEqual(
      ['system', 'user', 'assistant', 'tool', 'user'],
    );
    const settledToolMessage = secondRequest.input.messages[3];
    expect(settledToolMessage).toMatchObject({
      role: 'tool',
      toolCallId: 'call-superseded',
      content: 'Tool execution cancelled',
      error: 'Tool execution cancelled',
    });
    expect(toolSignal?.aborted).toBe(true);
    expect(settlements).toHaveBeenCalledTimes(1);

    lateResult.resolve({ recorded: 3 });
    await waitForRuntimeIdle(runtime);

    expect(requestCount).toBe(2);
    expect(settlements).toHaveBeenCalledTimes(1);
  } finally {
    settlements.mockRestore();
    teardown();
  }
});

test('restarting one runtime installs exactly one generation listener', async () => {
  jest.clearAllMocks();
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1 || requestCount === 3) {
      return {
        events: createToolRoundEvents(request, {
          callId: `call-restart-${requestCount}`,
          value: requestCount,
        }),
      };
    }

    return {
      events: successfulEvents(request, [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `assistant-restart-${requestCount}`,
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `assistant-restart-${requestCount}`,
        },
      ]),
    };
  });
  const handler = jest.fn(async ({ value }: { value: number }) => ({
    recorded: value,
  }));
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler,
      },
    ],
  });
  let teardown: (() => void) | undefined = runtime.start();

  try {
    await Promise.resolve();
    runtime.sendMessage({ role: 'user', content: 'First run.' });
    await waitForMockCalls(send, 2);
    await waitForRuntimeIdleAcrossTasks(runtime);
    teardown();
    teardown = runtime.start();
    await Promise.resolve();
    runtime.sendMessage({ role: 'user', content: 'Second run.' });
    await waitForRuntimeIdleAcrossTasks(runtime);

    expect(send).toHaveBeenCalledTimes(4);
    expect(handler).toHaveBeenCalledTimes(2);
  } finally {
    teardown?.();
  }
});

test('concurrent tool results settle once in call order', async () => {
  jest.clearAllMocks();
  const firstResult = createDeferred<string>();
  const secondResult = createDeferred<string>();
  const secondRequestCaptured = createDeferred<TransportRequest>();
  const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolBatchEvents(request, [
          { id: 'call-first', name: 'first', arguments: '{}' },
          { id: 'call-second', name: 'second', arguments: '{}' },
        ]),
      };
    }

    secondRequestCaptured.resolve(request);
    return { events: successfulEvents(request) };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'first',
        description: 'First tool.',
        schema: s.object('First input', {}),
        handler: () => firstResult.promise,
      },
      {
        name: 'second',
        description: 'Second tool.',
        schema: s.object('Second input', {}),
        handler: () => secondResult.promise,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Run both.' });
    await Promise.resolve();
    secondResult.resolve('second result');
    firstResult.resolve('first result');
    const secondRequest = await secondRequestCaptured.promise;
    await waitForRuntimeIdle(runtime);
    const toolMessages = secondRequest.input.messages.filter(
      (message) => message.role === 'tool',
    );

    expect(toolMessages).toEqual([
      expect.objectContaining({
        toolCallId: 'call-first',
        content: 'first result',
      }),
      expect.objectContaining({
        toolCallId: 'call-second',
        content: 'second result',
      }),
    ]);
    expect(settlements).toHaveBeenCalledTimes(1);
  } finally {
    settlements.mockRestore();
    teardown();
  }
});

test('local tool results remain lossless while continuation receives total canonical normalization and fresh state', async () => {
  jest.clearAllMocks();
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot read');
      },
    },
  );
  const rejection = new Error('tool rejected');
  const secondRequestCaptured = createDeferred<TransportRequest>();
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolBatchEvents(request, [
          { id: 'call-undefined', name: 'undefinedValue', arguments: '{}' },
          { id: 'call-bigint', name: 'bigintValue', arguments: '{}' },
          { id: 'call-cycle', name: 'cyclicValue', arguments: '{}' },
          { id: 'call-hostile', name: 'hostileValue', arguments: '{}' },
          { id: 'call-rejected', name: 'rejectedValue', arguments: '{}' },
        ]),
      };
    }

    secondRequestCaptured.resolve(request);
    return { events: successfulEvents(request) };
  });
  const store = createRealEffectStore();
  const tools: Chat.Internal.Tool[] = [
    {
      name: 'undefinedValue',
      description: 'Return undefined.',
      schema: s.object('Empty input', {}),
      handler: async () => {
        store.dispatch(devActions.setState({ state: { count: 7 } }));
        return undefined;
      },
    },
    {
      name: 'bigintValue',
      description: 'Return bigint.',
      schema: s.object('Empty input', {}),
      handler: async () => BigInt(42),
    },
    {
      name: 'cyclicValue',
      description: 'Return a cycle.',
      schema: s.object('Empty input', {}),
      handler: async () => cyclic,
    },
    {
      name: 'hostileValue',
      description: 'Return a hostile proxy.',
      schema: s.object('Empty input', {}),
      handler: async () => hostile,
    },
    {
      name: 'rejectedValue',
      description: 'Reject.',
      schema: s.object('Empty input', {}),
      handler: async () => {
        throw rejection;
      },
    },
  ];
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Run every tool.' }],
      canonicalMessages: canonicalUser('Run every tool.'),
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
      tools,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  const secondRequest = await secondRequestCaptured.promise;
  await waitForStoreGenerationToSettle(store);
  const canonicalResults = secondRequest.input.messages.filter(
    (message) => message.role === 'tool',
  );
  const localResults = new Map(
    store
      .read(selectToolCalls)
      .map((toolCall) => [toolCall.id, toolCall.result]),
  );

  expect(canonicalResults.map((message) => message.content)).toEqual([
    '',
    '42',
    '[object Object]',
    'cannot read',
    'tool rejected',
  ]);
  expect(canonicalResults.map((message) => message.id)).toEqual(
    canonicalResults.map(() => expect.any(String)),
  );
  expect(
    canonicalResults.every((message) => message.id !== message.toolCallId),
  ).toBe(true);
  expect(secondRequest.input.state).toEqual({ count: 7 });
  expect(
    (localResults.get('call-undefined') as PromiseFulfilledResult<unknown>)
      .value,
  ).toBeUndefined();
  expect(
    (localResults.get('call-bigint') as PromiseFulfilledResult<unknown>).value,
  ).toBe(BigInt(42));
  expect(
    (localResults.get('call-cycle') as PromiseFulfilledResult<unknown>).value,
  ).toBe(cyclic);
  expect(
    (localResults.get('call-hostile') as PromiseRejectedResult).reason,
  ).toEqual(expect.objectContaining({ message: 'cannot read' }));
  expect(
    (localResults.get('call-rejected') as PromiseRejectedResult).reason,
  ).toBe(rejection);

  teardown();
});

test('a compatible checkpoint tool-call replay is not executed again', async () => {
  jest.clearAllMocks();
  let requestCount = 0;
  const { send } = makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'reused-call-id',
          value: requestCount,
        }),
      };
    }

    return {
      events: successfulEvents(request, [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'reused-call-id',
          toolCallName: 'recordValue',
          parentMessageId: 'assistant-reused-call-id',
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'reused-call-id',
        },
      ]),
    };
  });
  const handledValues: number[] = [];
  const handler = jest.fn(async ({ value }: { value: number }) => {
    handledValues.push(value);
    return { recorded: value };
  });
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    await Promise.resolve();
    runtime.sendMessage({ role: 'user', content: 'Record two values.' });
    await waitForRuntimeIdleAcrossTasks(runtime);

    expect(handledValues).toEqual([1]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    teardown();
  }
});

test('stop cancels every partially completed batch call once', async () => {
  jest.clearAllMocks();
  const firstResult = createDeferred<string>();
  const bothStarted = createDeferred<void>();
  const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
  let startedCount = 0;
  const markStarted = () => {
    startedCount++;
    if (startedCount === 2) {
      bothStarted.resolve();
    }
  };
  const { send } = makeSelection(async (request) => ({
    events: createToolBatchEvents(request, [
      { id: 'call-complete', name: 'complete', arguments: '{}' },
      { id: 'call-pending', name: 'pending', arguments: '{}' },
    ]),
  }));
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'complete',
        description: 'Completes first.',
        schema: s.object('Complete input', {}),
        handler: () => {
          markStarted();
          return firstResult.promise;
        },
      },
      {
        name: 'pending',
        description: 'Remains pending.',
        schema: s.object('Pending input', {}),
        handler: async () => {
          markStarted();
          return new Promise(() => undefined);
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Run both.' });
    await bothStarted.promise;
    firstResult.resolve('complete result');
    await flushTaskBoundary();
    runtime.stop();
    const toolCalls = runtime
      .messages()
      .find((message) => message.role === 'assistant')?.toolCalls;

    expect(toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'call-complete',
        status: 'done',
        result: expect.objectContaining({ status: 'rejected' }),
      }),
      expect.objectContaining({
        toolCallId: 'call-pending',
        status: 'done',
        result: expect.objectContaining({ status: 'rejected' }),
      }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(settlements).toHaveBeenCalledTimes(1);
  } finally {
    settlements.mockRestore();
    teardown();
  }
});

test('tool handler failure is serialized before continuation', async () => {
  jest.clearAllMocks();
  const secondRequestCaptured = createDeferred<TransportRequest>();
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolBatchEvents(request, [
          { id: 'call-failure', name: 'fail', arguments: '{}' },
        ]),
      };
    }

    secondRequestCaptured.resolve(request);
    return { events: successfulEvents(request) };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'fail',
        description: 'Fails.',
        schema: s.object('Failure input', {}),
        handler: async () => {
          throw new Error('lookup failed');
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Run failure.' });
    const secondRequest = await secondRequestCaptured.promise;
    await waitForRuntimeIdle(runtime);

    expect(secondRequest.input.messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'call-failure',
        content: 'lookup failed',
        error: 'lookup failed',
      }),
    );
    expect(requestCount).toBe(2);
  } finally {
    teardown();
  }
});

test('malformed tool arguments skip the handler and continue', async () => {
  jest.clearAllMocks();
  const secondRequestCaptured = createDeferred<TransportRequest>();
  const handler = jest.fn(async () => 'unused');
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolBatchEvents(request, [
          { id: 'call-malformed', name: 'lookup', arguments: '"{invalid"' },
        ]),
      };
    }

    secondRequestCaptured.resolve(request);
    return { events: successfulEvents(request) };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'lookup',
        description: 'Looks up a value.',
        schema: s.object('Lookup input', {}),
        handler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Run malformed call.' });
    const secondRequest = await secondRequestCaptured.promise;
    await waitForRuntimeIdle(runtime);
    const toolMessage = secondRequest.input.messages.find(
      (message) => message.role === 'tool',
    );

    expect(handler).not.toHaveBeenCalled();
    expect(toolMessage).toMatchObject({
      role: 'tool',
      toolCallId: 'call-malformed',
    });
    expect(toolMessage?.role === 'tool' && toolMessage.error).toBeTruthy();
    expect(requestCount).toBe(2);
  } finally {
    teardown();
  }
});

test.each([
  { label: 'replacement', nextThreadId: 'thread-b' },
  { label: 'empty replacement', nextThreadId: '' },
  { label: 'explicit clearing', nextThreadId: undefined },
] as const)(
  'a $label thread ID settles one active tool turn without continuation',
  async ({ nextThreadId }) => {
    jest.clearAllMocks();
    const handlerStarted = createDeferred<void>();
    const settlements = jest.spyOn(internalActions, 'toolTurnSettled');
    let toolSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => ({
      events: createToolRoundEvents(request, {
        callId: 'call-thread-change',
        value: 9,
      }),
    }));
    const runtime = createChatRuntime({
      system: 'You are a test bot',
      threadId: 'thread-a',
      transport: configuredTransport,
      tools: [
        {
          name: 'recordValue',
          description: 'Record a numeric value.',
          schema: s.object('Value to record', {
            value: s.number('Numeric value'),
          }),
          handler: async (_input, signal) => {
            toolSignal = signal;
            handlerStarted.resolve();
            return new Promise(() => undefined);
          },
        },
      ],
    });
    const teardown = runtime.start();

    try {
      runtime.sendMessage({ role: 'user', content: 'Record a value.' });
      await handlerStarted.promise;
      runtime.updateOptions({ threadId: nextThreadId });
      const toolCall = runtime
        .messages()
        .find((message) => message.role === 'assistant')?.toolCalls[0];

      expect(toolSignal?.aborted).toBe(true);
      expect(toolCall).toMatchObject({
        status: 'done',
        result: { status: 'rejected' },
      });
      expect(settlements).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      settlements.mockRestore();
      teardown();
    }
  },
);

test('the same thread ID preserves active tool execution', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  const result = createDeferred<{ recorded: number }>();
  const secondRequestCaptured = createDeferred<TransportRequest>();
  let toolSignal: AbortSignal | undefined;
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-same-thread',
          value: 4,
        }),
      };
    }

    secondRequestCaptured.resolve(request);
    return { events: successfulEvents(request) };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    threadId: 'thread-a',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return result.promise;
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Record a value.' });
    await handlerStarted.promise;
    runtime.updateOptions({ threadId: 'thread-a' });
    expect(toolSignal?.aborted).toBe(false);
    result.resolve({ recorded: 4 });
    await secondRequestCaptured.promise;
    await waitForRuntimeIdle(runtime);

    expect(requestCount).toBe(2);
  } finally {
    teardown();
  }
});

test('setMessages cannot settle a same-ID replacement tool call', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  const lateResult = createDeferred<{ recorded: number }>();
  let toolSignal: AbortSignal | undefined;
  const { send } = makeSelection(async (request) => ({
    events: createToolRoundEvents(request, {
      callId: 'call-replaced',
      value: 1,
    }),
  }));
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return lateResult.promise;
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Start original call.' });
    await handlerStarted.promise;
    runtime.setMessages([
      {
        role: 'assistant',
        content: 'Replacement transcript',
        toolCalls: [
          {
            role: 'tool',
            status: 'pending',
            name: 'recordValue',
            args: { value: 2 },
            toolCallId: 'call-replaced',
          },
        ],
      },
    ]);
    const replacement = runtime.messages()[0];
    lateResult.resolve({ recorded: 1 });
    await flushTaskBoundary();

    expect(toolSignal?.aborted).toBe(true);
    expect(replacement).toMatchObject({
      role: 'assistant',
      content: 'Replacement transcript',
      toolCalls: [
        expect.objectContaining({
          toolCallId: 'call-replaced',
          status: 'pending',
        }),
      ],
    });
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    teardown();
  }
});

test('resend settles active tools before starting its replacement run', async () => {
  jest.clearAllMocks();
  const handlerStarted = createDeferred<void>();
  const replacementRequest = createDeferred<TransportRequest>();
  let toolSignal: AbortSignal | undefined;
  let requestCount = 0;
  makeSelection(async (request) => {
    requestCount++;
    if (requestCount === 1) {
      return {
        events: createToolRoundEvents(request, {
          callId: 'call-resend',
          value: 6,
        }),
      };
    }

    replacementRequest.resolve(request);
    return { events: successfulEvents(request) };
  });
  const runtime = createChatRuntime({
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'recordValue',
        description: 'Record a numeric value.',
        schema: s.object('Value to record', {
          value: s.number('Numeric value'),
        }),
        handler: async (_input, signal) => {
          toolSignal = signal;
          handlerStarted.resolve();
          return new Promise(() => undefined);
        },
      },
    ],
  });
  const teardown = runtime.start();

  try {
    runtime.sendMessage({ role: 'user', content: 'Start a call.' });
    await handlerStarted.promise;
    runtime.resendMessages();
    const request = await replacementRequest.promise;
    await waitForRuntimeIdle(runtime);

    expect(toolSignal?.aborted).toBe(true);
    expect(request.input.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
    expect(requestCount).toBe(2);
  } finally {
    teardown();
  }
});

test('generation failure does not execute streamed tool calls', async () => {
  jest.clearAllMocks();
  const handler = jest.fn(async () => 'unused');
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-before-error',
          role: 'assistant',
        } as AGUIEvent;
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-before-error',
          toolCallName: 'lookup',
          parentMessageId: 'assistant-before-error',
        } as AGUIEvent;
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-before-error',
          delta: '{}',
        } as AGUIEvent;
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'call-before-error',
        } as AGUIEvent;
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-before-error',
        } as AGUIEvent;
        yield {
          type: EventType.RUN_ERROR,
          ...identity,
          message: 'generation failed',
        } as AGUIEvent;
      })(),
    };
  });
  const runtime = createChatRuntime({
    debounce: 0,
    system: 'You are a test bot',
    transport: configuredTransport,
    tools: [
      {
        name: 'lookup',
        description: 'Looks up a value.',
        schema: s.object('Lookup input', {}),
        handler,
      },
    ],
  });
  const teardown = runtime.start();

  try {
    await Promise.resolve();
    runtime.sendMessage({ role: 'user', content: 'Fail this run.' });
    await waitForRuntimeIdleAcrossTasks(runtime);

    expect(handler).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(runtime.error()?.message).toBe('generation failed');
  } finally {
    teardown();
  }
});

test('sends one RunAgentInput with tools, structured output, and UI metadata', async () => {
  jest.clearAllMocks();
  const responseSchema = s.object('answer', {
    answer: s.string('answer text'),
  });
  const tool: Chat.Internal.Tool = {
    name: 'search',
    description: 'Search records',
    schema: s.object('search input', { query: s.string('query') }),
    handler: async () => undefined,
  };
  const dispose = jest.fn();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
    dispose,
  }));
  const messages: import('@ag-ui/core').Message[] = [
    { id: 'system-1', role: 'system', content: 'You are a test bot' },
    { id: 'user-1', role: 'user', content: 'First question' },
    { id: 'assistant-1', role: 'assistant', content: 'First answer' },
    { id: 'user-2', role: 'user', content: 'Follow-up question' },
  ];
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [ɵselectEffectiveCommittedAgUiMessages, messages],
      [selectTools, [tool]],
      [selectToolEntities, { search: tool }],
      [selectResponseSchema, responseSchema],
      [selectThreadId, 'configured-thread'],
      [selectUiRequested, true],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Follow-up question'),
      message: { role: 'user', content: 'Follow-up question' },
    }),
  );

  const request = send.mock.calls[0]?.[0];
  expect(Object.keys(request).sort()).toEqual(
    ['attempt', 'input', 'maxAttempts', 'requestId', 'signal'].sort(),
  );
  expect(request.input).toMatchObject({
    threadId: 'configured-thread',
    runId: request.requestId,
    hashbrown: {
      responseSchema: s.toJsonSchema(responseSchema),
      ui: true,
    },
  });
  expect(request.input.messages).toHaveLength(4);
  expect(request.input.tools).toEqual([
    expect.objectContaining({ name: 'search' }),
  ]);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('generic send rejection retries with exact attempt progression', async () => {
  jest.clearAllMocks();
  const requests: TransportRequest[] = [];
  const { send } = makeSelection(async (request) => {
    requests.push(request);
    if (requests.length < 3) {
      throw new Error(`temporary failure ${requests.length}`);
    }

    return { events: successfulEvents(request) };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 2],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(3);
  expect(requests.map((request) => request.attempt)).toEqual([1, 2, 3]);
  expect(requests.map((request) => request.maxAttempts)).toEqual([3, 3, 3]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(0);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toHaveLength(0);

  teardown?.();
});

test('real store rolls back retry drafts, preserves the logical lock, and commits the successful attempt', async () => {
  jest.clearAllMocks();
  const firstError = new Error('temporary stream failure');
  const store = createRealEffectStore();
  let sendCount = 0;
  let stateAtRetry:
    | {
        committed: unknown;
        visible: unknown;
        locked: boolean;
        generationId: string | undefined;
        attemptId: string | undefined;
      }
    | undefined;
  const { send } = makeSelection(async (request) => {
    sendCount++;
    if (sendCount === 1) {
      const identity = getInputIdentity(request);
      return {
        events: (async function* () {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } };
          throw firstError;
        })(),
      };
    }

    stateAtRetry = {
      committed: store.read(ɵselectCommittedAgentState),
      visible: store.read(ɵselectVisibleAgentState),
      locked: store.read(ɵselectStateWriteLocked),
      generationId: store.read(ɵselectGenerationId),
      attemptId: store.read(ɵselectGenerationAttemptId),
    };
    return {
      events: successfulEvents(request, [
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 2 } },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-recovered',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-recovered',
          delta: 'Recovered',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-recovered',
        },
      ]),
    };
  });
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Retry state.' }],
      canonicalMessages: canonicalUser('Retry state.'),
      state: { count: 0 },
      retries: 1,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 2);
  await waitForStoreGenerationToSettle(store);

  expect(stateAtRetry).toMatchObject({
    committed: { count: 0 },
    visible: { count: 0 },
    locked: true,
    generationId: expect.any(String),
    attemptId: expect.any(String),
  });
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 2 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 2 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);
  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

  teardown();
});

test('real store protects one empty-system message checkpoint across retries', async () => {
  jest.clearAllMocks();
  const requests: TransportRequest[] = [];
  const mutationErrors: unknown[] = [];
  const { send } = makeSelection(async (request) => {
    requests.push(request);
    const messages = request.input?.messages;
    if (!messages) throw new Error('Expected canonical input messages.');
    try {
      messages.splice(0, 1);
    } catch (error) {
      mutationErrors.push(error);
    }
    if (requests.length === 1) {
      throw new Error('retry after attempted mutation');
    }

    return { events: successfulEvents(request) };
  });
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: '',
      systemMessage: Object.freeze({
        id: 'system-empty',
        role: 'system',
        content: '',
      }),
      canonicalMessages: [],
      messages: [],
      retries: 1,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();
  store.dispatch(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Keep this checkpoint'),
      message: { role: 'user', content: 'Keep this checkpoint' },
    }),
  );
  const checkpoint = store.read(ɵselectCommittedAgUiMessages);
  const checkpointMessage = checkpoint[0];

  await waitForMockCalls(send, 2);
  await waitForStoreGenerationToSettle(store);

  expect(Object.isFrozen(checkpoint)).toBe(true);
  expect(requests[0]?.input?.messages).toBe(checkpoint);
  expect(requests[1]?.input?.messages).toBe(checkpoint);
  expect(requests[0]?.input?.messages).toEqual([
    expect.objectContaining({
      id: 'user-Keep this checkpoint',
      content: 'Keep this checkpoint',
    }),
  ]);
  expect(mutationErrors).toHaveLength(2);
  expect(mutationErrors.every((error) => error instanceof TypeError)).toBe(
    true,
  );
  expect(store.read(ɵselectCommittedAgUiMessages)).toBe(checkpoint);
  expect(store.read(ɵselectCommittedAgUiMessages)[0]).toBe(checkpointMessage);

  teardown();
});

test('real store owns debounce without opening an attempt and cancellation releases the lock', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Wait.' }],
      canonicalMessages: canonicalUser('Wait.'),
      state: { count: 0 },
      retries: 0,
      debounce: 60_000,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();
  let errorCount = 0;
  const unsubscribeError = store.when(
    apiActions.generateMessageError,
    () => errorCount++,
  );

  store.dispatch(internalActions.start());
  await Promise.resolve();

  expect(store.read(ɵselectGenerationId)).toEqual(expect.any(String));
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(true);
  expect(send).not.toHaveBeenCalled();

  store.dispatch(devActions.stopMessageGeneration(true));
  await waitForStoreGenerationToSettle(store);

  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(errorCount).toBe(0);

  unsubscribeError();
  teardown();
});

test('real store settles transport initialization failure once without claiming an attempt', async () => {
  jest.clearAllMocks();
  const initializationError = new Error('transport initialization failed');
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Initialize.' }],
      canonicalMessages: canonicalUser('Initialize.'),
      state: { count: 0 },
      retries: 2,
      debounce: 0,
      transport: () => {
        throw initializationError;
      },
    }),
  );
  const teardown = store.runEffects();
  const errors: Error[] = [];
  let claimedAttempts = 0;
  const unsubscribeError = store.when(
    apiActions.generateMessageError,
    (action) => errors.push(action.payload),
  );
  const unsubscribeClaim = store.when(
    internalActions.generationAttemptClaimed,
    () => claimedAttempts++,
  );

  store.dispatch(internalActions.start());
  await waitForStoreGenerationToSettle(store);

  expect(errors).toEqual([initializationError]);
  expect(claimedAttempts).toBe(0);
  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);

  unsubscribeError();
  unsubscribeClaim();
  teardown();
});

test('real store settles scheduling with no eligible work without opening a transaction', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [],
      canonicalMessages: [],
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();
  let claimedAttempts = 0;
  let successCount = 0;
  let errorCount = 0;
  const unsubscribeClaim = store.when(
    internalActions.generationAttemptClaimed,
    () => claimedAttempts++,
  );
  const unsubscribeSuccess = store.when(
    apiActions.generateMessageSuccess,
    () => successCount++,
  );
  const unsubscribeError = store.when(
    apiActions.generateMessageError,
    () => errorCount++,
  );

  store.dispatch(
    devActions.setMessages({
      messages: [
        { role: 'assistant', content: 'Already complete', toolCalls: [] },
      ],
      canonicalMessages: [
        {
          id: 'assistant-no-work',
          role: 'assistant',
          content: 'Already complete',
        },
      ],
    }),
  );
  await waitForStoreGenerationToSettle(store);

  expect(send).not.toHaveBeenCalled();
  expect(claimedAttempts).toBe(0);
  expect(successCount).toBe(0);
  expect(errorCount).toBe(0);
  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);

  unsubscribeClaim();
  unsubscribeSuccess();
  unsubscribeError();
  teardown();
});

test('real store publishes one terminal error after retry rollback and releases ownership', async () => {
  jest.clearAllMocks();
  const terminalError = new Error('transport failed');
  const { send } = makeSelection(async () => {
    throw terminalError;
  });
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Fail.' }],
      canonicalMessages: canonicalUser('Fail.'),
      state: { count: 0 },
      retries: 1,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();
  const errors: Error[] = [];
  const attemptIds: string[] = [];
  const unsubscribeError = store.when(
    apiActions.generateMessageError,
    (action) => errors.push(action.payload),
  );
  const unsubscribeClaim = store.when(
    internalActions.generationAttemptClaimed,
    (action) => attemptIds.push(action.payload.attemptId),
  );

  store.dispatch(internalActions.start());
  await waitForStoreGenerationToSettle(store);

  expect(send).toHaveBeenCalledTimes(2);
  expect(errors).toEqual([terminalError]);
  expect(attemptIds).toHaveLength(2);
  expect(new Set(attemptIds)).toHaveProperty('size', 2);
  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);

  unsubscribeError();
  unsubscribeClaim();
  teardown();
});

test.each([
  {
    name: 'cancellation',
    interrupt: (store: ReturnType<typeof createRealEffectStore>) =>
      store.dispatch(devActions.stopMessageGeneration(true)),
  },
  {
    name: 'thread retirement',
    interrupt: (store: ReturnType<typeof createRealEffectStore>) =>
      store.dispatch(devActions.updateOptions({ threadId: 'thread-b' })),
  },
])(
  'real store rolls back an active attempt on $name and clears matching ownership',
  async ({ interrupt }) => {
    jest.clearAllMocks();
    const attemptReady = createDeferred<void>();
    const { send } = makeSelection(async (request) => ({
      events: (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          ...getInputIdentity(request),
        } as AGUIEvent;
        yield {
          type: EventType.STATE_SNAPSHOT,
          snapshot: { count: 1 },
        } as AGUIEvent;
        attemptReady.resolve();
        await waitForAbort(request.signal);
      })(),
    }));
    const store = createRealEffectStore();
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Interrupt.' }],
        canonicalMessages: canonicalUser('Interrupt.'),
        state: { count: 0 },
        retries: 0,
        debounce: 0,
        transport: configuredTransport,
        threadId: 'thread-a',
      }),
    );
    const teardown = store.runEffects();
    let errorCount = 0;
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      () => errorCount++,
    );

    store.dispatch(internalActions.start());
    await attemptReady.promise;
    const generationId = store.read(ɵselectGenerationId);
    const attemptId = store.read(ɵselectGenerationAttemptId);

    expect(generationId).toEqual(expect.any(String));
    expect(attemptId).toEqual(expect.any(String));
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 1 });
    expect(store.read(ɵselectStateWriteLocked)).toBe(true);

    interrupt(store);
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(errorCount).toBe(0);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);

    unsubscribeError();
    teardown();
  },
);

test('real store preserves an active attempt through an options-only system update', async () => {
  jest.clearAllMocks();
  const attemptReady = createDeferred<void>();
  const finishAttempt = createDeferred<void>();
  makeSelection(async (request) => ({
    events: (async function* () {
      const identity = getInputIdentity(request);
      yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
      yield {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { count: 1 },
      } as AGUIEvent;
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-system-update',
        role: 'assistant',
      } as AGUIEvent;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'assistant-system-update',
        delta: 'Complete',
      } as AGUIEvent;
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'assistant-system-update',
      } as AGUIEvent;
      attemptReady.resolve();
      await finishAttempt.promise;
      yield { type: EventType.RUN_FINISHED, ...identity } as AGUIEvent;
    })(),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'Initial system',
      messages: [{ role: 'user', content: 'Update options.' }],
      canonicalMessages: canonicalUser('Update options.'),
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await attemptReady.promise;
  const generationId = store.read(ɵselectGenerationId);
  const attemptId = store.read(ɵselectGenerationAttemptId);

  store.dispatch(devActions.updateOptions({ system: 'Updated system' }));

  expect(store.read(ɵselectGenerationId)).toBe(generationId);
  expect(store.read(ɵselectGenerationAttemptId)).toBe(attemptId);
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 1 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(true);

  finishAttempt.resolve();
  await waitForStoreGenerationToSettle(store);

  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 1 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 1 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);

  teardown();
});

test('real store keeps a debounced replacement owned and stoppable after subscriber-queued retirement', async () => {
  jest.clearAllMocks();
  const replacementQueued = createDeferred<void>();
  const oldIteratorReturned = createDeferred<void>();
  let oldRequestSignal: AbortSignal | undefined;
  let sendCount = 0;
  const { send } = makeSelection(async (request) => {
    sendCount++;
    if (sendCount !== 1) {
      return { events: successfulEvents(request) };
    }
    oldRequestSignal = request.signal;
    const identity = getInputIdentity(request);
    let index = 0;
    return {
      events: {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<AGUIEvent>> {
              index++;
              if (index === 1) {
                return {
                  done: false,
                  value: { type: EventType.RUN_STARTED, ...identity },
                };
              }
              if (index === 2) {
                return {
                  done: false,
                  value: {
                    type: EventType.STATE_SNAPSHOT,
                    snapshot: { count: 1 },
                  },
                };
              }

              return new Promise(() => undefined);
            },
            async return() {
              oldIteratorReturned.resolve();
              return { done: true as const, value: undefined };
            },
          };
        },
      },
    };
  });
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'First.' }],
      canonicalMessages: canonicalUser('First.'),
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
      threadId: 'thread-a',
    }),
  );
  const teardown = store.runEffects();
  let oldGenerationId: string | undefined;
  let oldAttemptId: string | undefined;
  let replacementDispatched = false;
  const unsubscribeState = store.select(ɵselectVisibleAgentState, (state) => {
    if (
      replacementDispatched ||
      (state as { count?: number } | undefined)?.count !== 1
    ) {
      return;
    }
    replacementDispatched = true;
    oldGenerationId = store.read(ɵselectGenerationId);
    oldAttemptId = store.read(ɵselectGenerationAttemptId);
    store.dispatch(
      devActions.updateOptions({
        debounce: 60_000,
        threadId: 'thread-b',
      }),
    );
    store.dispatch(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Second.'),
        message: { role: 'user', content: 'Second.' },
      }),
    );
    replacementQueued.resolve();
  });
  let rollbackCount = 0;
  let silentRetirementCount = 0;
  const unsubscribeRollback = store.when(
    internalActions.generationAttemptRolledBack,
    () => rollbackCount++,
  );
  const unsubscribeRetirement = store.when(
    internalActions.generationSilentlyRetired,
    () => silentRetirementCount++,
  );

  store.dispatch(internalActions.start());
  await replacementQueued.promise;
  await oldIteratorReturned.promise;
  await flushTaskBoundary();
  const replacementGenerationId = store.read(ɵselectGenerationId);

  expect(oldGenerationId).toEqual(expect.any(String));
  expect(oldAttemptId).toEqual(expect.any(String));
  expect(oldRequestSignal?.aborted).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(replacementGenerationId).toEqual(expect.any(String));
  expect(replacementGenerationId).not.toBe(oldGenerationId);
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectStateWriteLocked)).toBe(true);
  expect(store.read(selectIsLoading)).toBe(true);
  expect(rollbackCount).toBe(0);
  expect(silentRetirementCount).toBe(0);

  store.dispatch(devActions.stopMessageGeneration(true));
  await waitForStoreGenerationToSettle(store);

  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);
  expect(store.read(selectIsLoading)).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);

  unsubscribeState();
  unsubscribeRollback();
  unsubscribeRetirement();
  teardown();
});

test('retry uses a fresh attempt after cleanup completes', async () => {
  jest.clearAllMocks();
  const returnStarted = createDeferred<void>();
  const returnRelease = createDeferred<IteratorResult<AGUIEvent>>();
  const disposeStarted = createDeferred<void>();
  const disposeRelease = createDeferred<void>();
  const requests: TransportRequest[] = [];
  const iterators: AsyncIterator<AGUIEvent>[] = [];
  const firstIteratorReturn = jest.fn(async () => {
    returnStarted.resolve();
    return returnRelease.promise;
  });
  const firstDispose = jest.fn(async () => {
    disposeStarted.resolve();
    await disposeRelease.promise;
  });
  const { send } = makeSelection(async (request) => {
    requests.push(request);
    if (requests.length === 1) {
      const events = [
        {
          type: EventType.CUSTOM,
          name: 'invalid-before-start',
          value: null,
        } as AGUIEvent,
      ];
      const values = events[Symbol.iterator]();
      const eventIterator = {
        next: async () => values.next(),
        return: firstIteratorReturn,
      };
      iterators.push(eventIterator);

      return {
        events: {
          [Symbol.asyncIterator]() {
            return eventIterator;
          },
        },
        dispose: firstDispose,
      };
    }

    const events = successfulEvents(request);
    const eventIterator = events[Symbol.asyncIterator]();
    iterators.push(eventIterator);

    return {
      events: {
        [Symbol.asyncIterator]() {
          return eventIterator;
        },
      },
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Retry'),
      message: { role: 'user', content: 'Retry' },
    }),
  );
  await returnStarted.promise;
  expect(send).toHaveBeenCalledTimes(1);
  returnRelease.resolve({ done: true, value: undefined });
  await disposeStarted.promise;
  expect(send).toHaveBeenCalledTimes(1);
  disposeRelease.resolve();
  await generation;

  expect(send).toHaveBeenCalledTimes(2);
  expect(requests[0]).not.toBe(requests[1]);
  expect(requests[0]?.requestId).not.toBe(requests[1]?.requestId);
  expect(requests[0]?.input.runId).not.toBe(requests[1]?.input.runId);
  expect(iterators[0]).not.toBe(iterators[1]);
  expect(firstIteratorReturn).toHaveBeenCalledTimes(1);
  expect(firstDispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('exhausted generic send retries dispatches the exhausted action', async () => {
  jest.clearAllMocks();
  const error = new Error('still broken');
  const { send } = makeSelection(async () => {
    throw error;
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 1]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(([request]) => request.attempt)).toEqual([1, 2]);
  expect(send.mock.calls.map(([request]) => request.maxAttempts)).toEqual([
    2, 2,
  ]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(error)]);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toEqual([apiActions.generateMessageExhaustedRetries()]);

  teardown?.();
});

test('non-retryable transport error stops without exhausting retries', async () => {
  jest.clearAllMocks();
  const error = new TransportError('invalid request', { retryable: false });
  const { send } = makeSelection(async () => {
    throw error;
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(error)]);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toHaveLength(0);
  teardown?.();
});

test('positive infinity retries normalize to one attempt without exhaustion', async () => {
  jest.clearAllMocks();
  const error = new Error('still broken');
  const requests: TransportRequest[] = [];
  const { send } = makeSelection(async (request) => {
    requests.push(request);
    throw error;
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, Number.POSITIVE_INFINITY]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    requests.map(({ attempt, maxAttempts }) => ({ attempt, maxAttempts })),
  ).toEqual([{ attempt: 1, maxAttempts: 1 }]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(error)]);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toHaveLength(0);
  teardown?.();
});

test.each([
  {
    label: 'RUN_ERROR',
    createEvent: () => ({
      type: EventType.RUN_ERROR,
      message: 'server rejected request',
    }),
  },
  {
    label: 'RUN_FINISHED',
    createEvent: (identity: { threadId: string; runId: string }) => ({
      type: EventType.RUN_FINISHED,
      ...identity,
    }),
  },
  {
    label: 'CUSTOM',
    createEvent: () => ({
      type: EventType.CUSTOM,
      name: 'early-event',
      value: null,
    }),
  },
])(
  'treats $label before RUN_STARTED as a retryable protocol error',
  async ({ createEvent }) => {
    jest.clearAllMocks();
    let attempt = 0;
    let earlyEvent: AGUIEvent | undefined;
    const { send } = makeSelection(async (request) => {
      attempt++;
      const identity = getInputIdentity(request);
      if (attempt === 1) {
        earlyEvent = createEvent(identity) as AGUIEvent;
        return {
          events: (async function* () {
            yield earlyEvent as AGUIEvent;
          })(),
        };
      }

      return { events: successfulEvents(request) };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectRetries, 1],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Recovered', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Retry'),
        message: { role: 'user', content: 'Retry' },
      }),
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(getDispatchedEvents(store.actions)).not.toContain(earlyEvent);
    expect(
      getDispatchedTerminalEvents(store.actions).map((event) => event.type),
    ).toEqual([EventType.RUN_FINISHED]);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageError.type),
    ).toHaveLength(0);

    teardown?.();
  },
);

test('rejects duplicate RUN_STARTED without synthesizing a terminal event', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_STARTED, ...identity };
      })(),
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    events.filter((event) => event.type === EventType.RUN_STARTED),
  ).toHaveLength(1);
  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);

  teardown?.();
});

test('rejects a mismatched RUN_STARTED without accepting the run', async () => {
  jest.clearAllMocks();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      return {
        events: (async function* () {
          yield {
            type: EventType.RUN_STARTED,
            threadId: identity.threadId,
            runId: `${identity.runId}:mismatch`,
          };
        })(),
      };
    }

    return { events: successfulEvents(request) };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Retry'),
      message: { role: 'user', content: 'Retry' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageStart.type),
  ).toHaveLength(1);
  expect(
    getDispatchedTerminalEvents(store.actions).map((event) => event.type),
  ).toEqual([EventType.RUN_FINISHED]);

  teardown?.();
});

test('rejects a mismatched RUN_FINISHED without synthesizing a terminal event', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield {
          type: EventType.RUN_FINISHED,
          threadId: `${identity.threadId}:mismatch`,
          runId: identity.runId,
        };
      })(),
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);

  teardown?.();
});

test.each([
  { label: 'before start', start: false },
  { label: 'before terminal', start: true },
])('treats EOF $label as retryable', async ({ start }) => {
  jest.clearAllMocks();
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      return {
        events: (async function* () {
          if (start) {
            yield { type: EventType.RUN_STARTED, ...identity };
          }
        })(),
        dispose: firstDispose,
      };
    }

    return {
      events: successfulEvents(request),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Retry'),
      message: { role: 'user', content: 'Retry' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(0);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    getDispatchedTerminalEvents(store.actions).map((event) => event.type),
  ).toEqual([EventType.RUN_FINISHED]);

  teardown?.();
});

test('iterable failure after an accepted start does not synthesize a terminal event', async () => {
  jest.clearAllMocks();
  const primaryError = new Error('event stream failed');
  const dispose = jest.fn();
  makeSelection(async (request) => {
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        throw primaryError;
      })(),
      dispose,
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(primaryError)]);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('server RUN_ERROR after start dispatches once without synthesis or retry', async () => {
  jest.clearAllMocks();
  const serverError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server failed',
  };
  const { send } = makeSelection(async (request) => ({
    events: (async function* () {
      yield { type: EventType.RUN_STARTED, ...getInputIdentity(request) };
      yield serverError;
      yield {
        type: EventType.CUSTOM,
        name: 'late-event',
        value: null,
      };
    })(),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedTerminalEvents(store.actions)).toEqual([serverError]);
  expect(events).not.toContainEqual(
    expect.objectContaining({ name: 'late-event' }),
  );

  teardown?.();
});

test.each(['resolution', 'rejection'] as const)(
  'explicit stop owns a late send %s',
  async (settlement) => {
    jest.clearAllMocks();
    const sendStarted = createDeferred<void>();
    const delayedSend = createDeferred<MockTransportResponse>();
    const dispose = jest.fn();
    const { send } = makeSelection(async () => {
      sendStarted.resolve();
      return delayedSend.promise;
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([[selectRetries, 2]]),
    );
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );
    await sendStarted.promise;
    const request = send.mock.calls[0]?.[0] as TransportRequest;
    await store.trigger(devActions.stopMessageGeneration(true));
    if (settlement === 'resolution') {
      delayedSend.resolve({ events: successfulEvents(request), dispose });
    } else {
      delayedSend.reject(new Error('late send failure'));
    }
    await expect(generation).resolves.toBeUndefined();

    expect(getDispatchedEvents(store.actions)).toHaveLength(0);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageError.type),
    ).toHaveLength(0);
    expect(dispose).toHaveBeenCalledTimes(settlement === 'resolution' ? 1 : 0);
    teardown?.();
  },
);

test.each(['resolution', 'rejection'] as const)(
  'supersession owns a late send %s',
  async (settlement) => {
    jest.clearAllMocks();
    const firstSendStarted = createDeferred<void>();
    const delayedFirstSend = createDeferred<MockTransportResponse>();
    const firstDispose = jest.fn();
    let sendCount = 0;
    const { send } = makeSelection(async (request) => {
      sendCount++;
      if (sendCount === 1) {
        firstSendStarted.resolve();
        return delayedFirstSend.promise;
      }

      return { events: successfulEvents(request) };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Second', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    const firstGeneration = store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('First'),
        message: { role: 'user', content: 'First' },
      }),
    );
    await firstSendStarted.promise;
    const firstRequest = send.mock.calls[0]?.[0] as TransportRequest;
    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Second'),
        message: { role: 'user', content: 'Second' },
      }),
    );
    const actionsBeforeSettlement = [...store.actions];
    if (settlement === 'resolution') {
      delayedFirstSend.resolve({
        events: successfulEvents(firstRequest),
        dispose: firstDispose,
      });
    } else {
      delayedFirstSend.reject(new Error('late send failure'));
    }
    await expect(firstGeneration).resolves.toBeUndefined();

    expect(store.actions).toEqual(actionsBeforeSettlement);
    expect(firstDispose).toHaveBeenCalledTimes(
      settlement === 'resolution' ? 1 : 0,
    );
    teardown?.();
  },
);

test('user stop before start has no terminal, no retry, and discards late events', async () => {
  jest.clearAllMocks();
  const waiting = createDeferred<void>();
  const dispose = jest.fn();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const { send } = makeSelection(async (request) => ({
    events: {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            waiting.resolve();
            await waitForAbort(request.signal);
            return {
              done: false as const,
              value: {
                type: EventType.RUN_STARTED,
                ...getInputIdentity(request),
              } as AGUIEvent,
            };
          },
          return: iteratorReturn,
        };
      },
    },
    dispose,
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );
  await waiting.promise;
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedEvents(store.actions)).toHaveLength(0);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('user stop while starting does not accept RUN_STARTED or add a terminal', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const dispatch = store.dispatch;
  store.dispatch = (action) => {
    dispatch(action);
    if (action.type === apiActions.generateMessageStart.type) {
      void store.trigger(devActions.stopMessageGeneration(true));
    }
  };
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedEvents(store.actions)).toHaveLength(0);
  teardown?.();
});

test('user stop after start adds no terminal and finalizes once with stop', async () => {
  jest.clearAllMocks();
  const started = createDeferred<void>();
  const dispose = jest.fn();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const { send } = makeSelection(async (request) => {
    let index = 0;
    return {
      events: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              index++;
              if (index === 1) {
                started.resolve();
                return {
                  done: false as const,
                  value: {
                    type: EventType.RUN_STARTED,
                    ...getInputIdentity(request),
                  } as AGUIEvent,
                };
              }

              if (index > 2) {
                return { done: true as const, value: undefined };
              }

              await waitForAbort(request.signal);
              return {
                done: false as const,
                value: {
                  type: EventType.CUSTOM,
                  name: 'late-event',
                  value: null,
                } as AGUIEvent,
              };
            },
            return: iteratorReturn,
          };
        },
      },
      dispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );
  await started.promise;
  await waitForDispatchedEvent(store.actions, EventType.RUN_STARTED);
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);
  expect(events).not.toContainEqual(
    expect.objectContaining({ name: 'late-event' }),
  );
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('superseding input retires the old run and only the new run finishes', async () => {
  jest.clearAllMocks();
  const firstStarted = createDeferred<void>();
  const releaseLateEvent = createDeferred<void>();
  const firstIteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  let firstSignal: AbortSignal | undefined;
  let sendCount = 0;
  const { send } = makeSelection(async (request) => {
    sendCount++;
    if (sendCount === 1) {
      firstSignal = request.signal;
      let index = 0;
      return {
        events: {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                index++;
                if (index === 1) {
                  firstStarted.resolve();
                  return {
                    done: false as const,
                    value: {
                      type: EventType.RUN_STARTED,
                      ...getInputIdentity(request),
                    } as AGUIEvent,
                  };
                }

                await releaseLateEvent.promise;
                return {
                  done: false as const,
                  value: {
                    type: EventType.RUN_FINISHED,
                    ...getInputIdentity(request),
                  } as AGUIEvent,
                };
              },
              return: firstIteratorReturn,
            };
          },
        },
        dispose: firstDispose,
      };
    }

    return {
      events: successfulEvents(request),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Second', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  const firstGeneration = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('First'),
      message: { role: 'user', content: 'First' },
    }),
  );
  await firstStarted.promise;
  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Second'),
      message: { role: 'user', content: 'Second' },
    }),
  );
  await Promise.resolve();

  const returnedBeforeRelease = firstIteratorReturn.mock.calls.length;
  const disposedBeforeRelease = firstDispose.mock.calls.length;
  releaseLateEvent.resolve();
  await firstGeneration;

  expect(firstSignal?.aborted).toBe(true);
  expect(returnedBeforeRelease).toBe(1);
  expect(disposedBeforeRelease).toBe(1);

  expect(send).toHaveBeenCalledTimes(2);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    getDispatchedTerminalEvents(store.actions).map((event) => event.type),
  ).toEqual([EventType.RUN_FINISHED]);

  teardown?.();
});

test('effect teardown retires the run without a terminal event', async () => {
  jest.clearAllMocks();
  const started = createDeferred<void>();
  const releaseLateEvent = createDeferred<void>();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const dispose = jest.fn();
  let requestSignal: AbortSignal | undefined;
  makeSelection(async (request) => {
    requestSignal = request.signal;
    let index = 0;
    return {
      events: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              index++;
              if (index === 1) {
                started.resolve();
                return {
                  done: false as const,
                  value: {
                    type: EventType.RUN_STARTED,
                    ...getInputIdentity(request),
                  } as AGUIEvent,
                };
              }

              await releaseLateEvent.promise;
              return {
                done: false as const,
                value: {
                  type: EventType.RUN_FINISHED,
                  ...getInputIdentity(request),
                } as AGUIEvent,
              };
            },
            return: iteratorReturn,
          };
        },
      },
      dispose,
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );
  await started.promise;
  teardown?.();
  releaseLateEvent.resolve();
  await generation;

  expect(requestSignal?.aborted).toBe(true);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) =>
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);
});

test.each(['iterator return', 'response disposal'] as const)(
  '%s rejection after RUN_FINISHED preserves success',
  async (failurePoint) => {
    jest.clearAllMocks();
    const cleanupError = new Error(`${failurePoint} failed`);
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
    const { send } = makeSelection(async (request) => {
      const events = [
        { type: EventType.RUN_STARTED, ...getInputIdentity(request) },
        { type: EventType.RUN_FINISHED, ...getInputIdentity(request) },
      ] as AGUIEvent[];
      return {
        events: {
          [Symbol.asyncIterator]() {
            const iterator = events[Symbol.iterator]();
            return {
              next: async () => iterator.next(),
              return: iteratorReturn,
            };
          },
        },
        dispose,
      };
    });
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectRetries, 1],
        [
          selectRawStreamingMessage,
          { role: 'assistant', content: 'Done', toolCallIds: [] },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    await store.trigger(
      devActions.sendMessage({
        canonicalMessages: canonicalUser('Hi'),
        message: { role: 'user', content: 'Hi' },
      }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(iteratorReturn).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageSuccess.type),
    ).toHaveLength(1);
    expect(
      getActionsOfType(store.actions, apiActions.generateMessageError.type),
    ).toHaveLength(0);
    expect(
      getDispatchedEvents(store.actions).filter(
        (event) => event.type === EventType.RUN_ERROR,
      ),
    ).toHaveLength(0);

    teardown?.();
  },
);

test('cleanup rejections do not replace a protocol failure', async () => {
  jest.clearAllMocks();
  const cleanupError = new Error('cleanup failed');
  const iteratorReturn = jest.fn(async () => {
    throw cleanupError;
  });
  const dispose = jest.fn(async () => {
    throw cleanupError;
  });
  makeSelection(async (request) => {
    const events = [
      { type: EventType.RUN_STARTED, ...getInputIdentity(request) },
      { type: EventType.RUN_STARTED, ...getInputIdentity(request) },
    ] as AGUIEvent[];
    return {
      events: {
        [Symbol.asyncIterator]() {
          const iterator = events[Symbol.iterator]();
          return {
            next: async () => iterator.next(),
            return: iteratorReturn,
          };
        },
      },
      dispose,
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type)[0]
      ?.payload,
  ).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    message: 'Received duplicate RUN_STARTED',
  });
  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('cleanup rejections do not replace user cancellation', async () => {
  jest.clearAllMocks();
  const started = createDeferred<void>();
  const cleanupError = new Error('cleanup failed');
  const iteratorReturn = jest.fn(async () => {
    throw cleanupError;
  });
  const dispose = jest.fn(async () => {
    throw cleanupError;
  });
  makeSelection(async (request) => {
    let index = 0;
    return {
      events: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              index++;
              if (index === 1) {
                started.resolve();
                return {
                  done: false as const,
                  value: {
                    type: EventType.RUN_STARTED,
                    ...getInputIdentity(request),
                  } as AGUIEvent,
                };
              }
              await waitForAbort(request.signal);
              return { done: true as const, value: undefined };
            },
            return: iteratorReturn,
          };
        },
      },
      dispose,
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );
  await started.promise;
  await waitForDispatchedEvent(store.actions, EventType.RUN_STARTED);
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(getDispatchedTerminalEvents(store.actions)).toHaveLength(0);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(0);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('missing events is retryable and disposes each response exactly once', async () => {
  jest.clearAllMocks();
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  const removedFramesIterator = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    if (attempt === 1) {
      return {
        frames: { [Symbol.asyncIterator]: removedFramesIterator },
        dispose: firstDispose,
      } as unknown as MockTransportResponse;
    }
    return {
      events: successfulEvents(request),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(removedFramesIterator).not.toHaveBeenCalled();
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(0);
  expect(
    getDispatchedTerminalEvents(store.actions).map((event) => event.type),
  ).toEqual([EventType.RUN_FINISHED]);

  teardown?.();
});

test('non-async-iterable events are a retryable protocol error', async () => {
  jest.clearAllMocks();
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    if (attempt === 1) {
      return {
        events: {
          [Symbol.asyncIterator]: 'not-callable',
        } as unknown as AsyncIterable<AGUIEvent>,
        dispose: firstDispose,
      };
    }
    return {
      events: successfulEvents(request),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Recovered', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(0);
  expect(
    getDispatchedTerminalEvents(store.actions).map((event) => event.type),
  ).toEqual([EventType.RUN_FINISHED]);

  teardown?.();
});

test('finish-time parser errors do not retry an accepted success terminal', async () => {
  jest.clearAllMocks();
  const parserError = new Error('Structured output is incomplete');
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 2],
      [selectStreamingMessageError, parserError],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(parserError)]);

  teardown?.();
});

test('accepted RUN_FINISHED remains successful when its dispatch triggers stop', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 2],
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const dispatch = store.dispatch;
  store.dispatch = (action) => {
    dispatch(action);
    if (
      action.type === apiActions.generateMessageEvent.type &&
      'payload' in action &&
      (action.payload as AGUIEvent).type === EventType.RUN_FINISHED
    ) {
      void store.trigger(devActions.stopMessageGeneration(true));
    }
  };
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Hi'),
      message: { role: 'user', content: 'Hi' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageSuccess.type),
  ).toHaveLength(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);
  teardown?.();
});

test('real store commits terminal state when RUN_FINISHED dispatch reentrantly stops', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request, [
      { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-terminal-stop',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'assistant-terminal-stop',
        delta: 'Done',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'assistant-terminal-stop',
      },
    ]),
  }));
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'Stop at terminal.' }],
      canonicalMessages: canonicalUser('Stop at terminal.'),
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();
  const unsubscribe = store.when(apiActions.generateMessageEvent, (action) => {
    if (action.payload.type === EventType.RUN_FINISHED) {
      store.dispatch(devActions.stopMessageGeneration(true));
    }
  });

  store.dispatch(internalActions.start());
  await waitForMockCalls(send, 1);
  await waitForStoreGenerationToSettle(store);

  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 9 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 9 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);

  unsubscribe();
  teardown();
});

test.each([
  {
    name: 'sendMessage',
    startsReplacementAttempt: true,
    trigger: (store: ReturnType<typeof createRealEffectStore>) =>
      store.dispatch(
        devActions.sendMessage({
          canonicalMessages: canonicalUser('Second.'),
          message: { role: 'user', content: 'Second.' },
        }),
      ),
  },
  {
    name: 'setMessages',
    startsReplacementAttempt: true,
    trigger: (store: ReturnType<typeof createRealEffectStore>) =>
      store.dispatch(
        devActions.setMessages({
          canonicalMessages: canonicalUser('Replacement.'),
          messages: [{ role: 'user', content: 'Replacement.' }],
        }),
      ),
  },
  {
    name: 'resendMessages',
    startsReplacementAttempt: false,
    trigger: (store: ReturnType<typeof createRealEffectStore>) =>
      store.dispatch(devActions.resendMessages()),
  },
])(
  'real store commits accepted terminal drafts before reentrant $name owns the store',
  async ({ startsReplacementAttempt, trigger }) => {
    jest.clearAllMocks();
    const firstAttemptReady = createDeferred<void>();
    const finishFirstAttempt = createDeferred<void>();
    const replacementStarted = createDeferred<void>();
    let sendCount = 0;
    makeSelection(async (request) => {
      sendCount++;
      if (sendCount === 1) {
        return {
          events: (async function* () {
            const identity = getInputIdentity(request);
            yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
            yield {
              type: EventType.STATE_SNAPSHOT,
              snapshot: { count: 9 },
            } as AGUIEvent;
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: 'assistant-before-replacement',
              role: 'assistant',
            } as AGUIEvent;
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: 'assistant-before-replacement',
              delta: 'Complete',
            } as AGUIEvent;
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: 'assistant-before-replacement',
            } as AGUIEvent;
            firstAttemptReady.resolve();
            await finishFirstAttempt.promise;
            yield { type: EventType.RUN_FINISHED, ...identity } as AGUIEvent;
          })(),
        };
      }

      return {
        events: (async function* () {
          yield {
            type: EventType.RUN_STARTED,
            ...getInputIdentity(request),
          } as AGUIEvent;
          replacementStarted.resolve();
          await waitForAbort(request.signal);
        })(),
      };
    });
    const store = createRealEffectStore();
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'First.' }],
        canonicalMessages: canonicalUser('First.'),
        state: { count: 0 },
        retries: 0,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const committedHistorySnapshots: (readonly Readonly<
      import('@ag-ui/core').Message
    >[])[] = [];
    const projectedMessageSnapshots: (readonly Chat.Internal.Message[])[] = [];
    const unsubscribeHistory = store.select(
      ɵselectCommittedAgUiMessages,
      (messages) => committedHistorySnapshots.push(messages),
    );
    const unsubscribeMessages = store.select(selectMessages, (messages) =>
      projectedMessageSnapshots.push(messages),
    );
    const teardown = store.runEffects();
    let successCount = 0;
    const unsubscribeSuccess = store.when(
      apiActions.generateMessageSuccess,
      () => successCount++,
    );
    let superseded = false;
    const unsubscribeTerminal = store.when(
      apiActions.generateMessageEvent,
      (action) => {
        if (!superseded && action.payload.type === EventType.RUN_FINISHED) {
          superseded = true;
          trigger(store);
        }
      },
    );
    store.dispatch(internalActions.start());
    await firstAttemptReady.promise;
    const firstGenerationId = store.read(ɵselectGenerationId);
    const firstAttemptId = store.read(ɵselectGenerationAttemptId);
    finishFirstAttempt.resolve();
    if (startsReplacementAttempt) {
      await replacementStarted.promise;
    } else {
      await waitForStoreGenerationToSettle(store);
    }

    expect(successCount).toBe(1);
    expect(firstGenerationId).toEqual(expect.any(String));
    expect(firstAttemptId).toEqual(expect.any(String));
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 9 });
    expect(
      committedHistorySnapshots.some((messages) =>
        messages.some(
          (message) =>
            message.role === 'assistant' && message.content === 'Complete',
        ),
      ),
    ).toBe(true);
    expect(
      projectedMessageSnapshots.some((messages) =>
        messages.some(
          (message) =>
            message.role === 'assistant' && message.content === 'Complete',
        ),
      ),
    ).toBe(true);
    if (startsReplacementAttempt) {
      expect(store.read(ɵselectGenerationId)).toEqual(expect.any(String));
      expect(store.read(ɵselectGenerationId)).not.toBe(firstGenerationId);
      expect(store.read(ɵselectGenerationAttemptId)).toEqual(
        expect.any(String),
      );
      expect(store.read(ɵselectGenerationAttemptId)).not.toBe(firstAttemptId);
      expect(store.read(ɵselectStateWriteLocked)).toBe(true);
    } else {
      expect(store.read(ɵselectGenerationId)).toBeUndefined();
      expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();
      expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    }

    unsubscribeHistory();
    unsubscribeMessages();
    unsubscribeSuccess();
    unsubscribeTerminal();
    teardown();
  },
);

test('real store ignores delayed cleanup from a superseded attempt', async () => {
  jest.clearAllMocks();
  const firstStarted = createDeferred<void>();
  const oldCleanupStarted = createDeferred<void>();
  const releaseOldCleanup = createDeferred<void>();
  const oldCleanupFinished = createDeferred<void>();
  const secondDraftReady = createDeferred<void>();
  const finishSecond = createDeferred<void>();
  let sendCount = 0;
  makeSelection(async (request) => {
    sendCount++;
    const identity = getInputIdentity(request);
    if (sendCount === 1) {
      let index = 0;
      return {
        events: {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<AGUIEvent>> {
                index++;
                if (index === 1) {
                  firstStarted.resolve();
                  return {
                    done: false,
                    value: { type: EventType.RUN_STARTED, ...identity },
                  };
                }
                if (index === 2) {
                  return {
                    done: false,
                    value: {
                      type: EventType.STATE_SNAPSHOT,
                      snapshot: { count: 1 },
                    },
                  };
                }

                return new Promise(() => undefined);
              },
              async return() {
                oldCleanupStarted.resolve();
                await releaseOldCleanup.promise;
                oldCleanupFinished.resolve();
                return { done: true as const, value: undefined };
              },
            };
          },
        },
      };
    }

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
        yield {
          type: EventType.STATE_SNAPSHOT,
          snapshot: { count: 2 },
        } as AGUIEvent;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-replacement',
          role: 'assistant',
        } as AGUIEvent;
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-replacement',
          delta: 'Replacement',
        } as AGUIEvent;
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-replacement',
        } as AGUIEvent;
        secondDraftReady.resolve();
        await finishSecond.promise;
        yield { type: EventType.RUN_FINISHED, ...identity } as AGUIEvent;
      })(),
    };
  });
  const store = createRealEffectStore();
  store.dispatch(
    devActions.init({
      system: 'You are a test bot',
      messages: [{ role: 'user', content: 'First.' }],
      canonicalMessages: canonicalUser('First.'),
      state: { count: 0 },
      retries: 0,
      debounce: 0,
      transport: configuredTransport,
    }),
  );
  const teardown = store.runEffects();

  store.dispatch(internalActions.start());
  await firstStarted.promise;
  await flushTaskBoundary();
  const firstGenerationId = store.read(ɵselectGenerationId);
  const firstAttemptId = store.read(ɵselectGenerationAttemptId);
  store.dispatch(
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Second.'),
      message: { role: 'user', content: 'Second.' },
    }),
  );
  await oldCleanupStarted.promise;
  await secondDraftReady.promise;
  const replacementGenerationId = store.read(ɵselectGenerationId);
  const replacementAttemptId = store.read(ɵselectGenerationAttemptId);

  releaseOldCleanup.resolve();
  await oldCleanupFinished.promise;
  await flushTaskBoundary();

  expect(firstGenerationId).toEqual(expect.any(String));
  expect(firstAttemptId).toEqual(expect.any(String));
  expect(replacementGenerationId).toEqual(expect.any(String));
  expect(replacementGenerationId).not.toBe(firstGenerationId);
  expect(replacementAttemptId).toEqual(expect.any(String));
  expect(store.read(ɵselectGenerationId)).toBe(replacementGenerationId);
  expect(store.read(ɵselectGenerationAttemptId)).toBe(replacementAttemptId);
  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 2 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(true);

  finishSecond.resolve();
  await waitForStoreGenerationToSettle(store);

  expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 2 });
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 2 });
  expect(store.read(ɵselectStateWriteLocked)).toBe(false);
  expect(store.read(ɵselectGenerationId)).toBeUndefined();
  expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

  teardown();
});

test('does not generate after a non-continuing tool settlement', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      toolCalls: [],
      toolMessages: [],
      canonicalMessages: [],
      continuation: 'stop',
    }),
  );

  expect(send).not.toHaveBeenCalled();
  expect(store.actions).not.toContainEqual(internalActions.start());

  teardown?.();
});

test.each([
  {
    name: 'an invalid state delta',
    invalidEvent: {
      type: EventType.STATE_DELTA,
      delta: 'not-a-json-patch',
    } as unknown as AGUIEvent,
  },
  {
    name: 'an invalid state snapshot',
    invalidEvent: {
      type: EventType.STATE_SNAPSHOT,
      snapshot: BigInt(1),
    } as unknown as AGUIEvent,
  },
  {
    name: 'an incompatible message event',
    invalidEvent: {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'user-Protocol failure.',
      role: 'assistant',
    } as AGUIEvent,
  },
  {
    name: 'an invalid message snapshot',
    invalidEvent: {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: {},
    } as unknown as AGUIEvent,
  },
])(
  'terminates $name without retrying and rolls back every synchronization draft',
  async ({ invalidEvent }) => {
    jest.clearAllMocks();
    const cleanupOrder: string[] = [];
    const initialCanonical = canonicalUser('Protocol failure.');
    let requestSignal: AbortSignal | undefined;
    const { send } = makeSelection(async (request) => {
      requestSignal = request.signal;
      const identity = getInputIdentity(request);
      const events: AGUIEvent[] = [
        { type: EventType.RUN_STARTED, ...identity },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-draft',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-draft',
          delta: 'Draft',
        },
        invalidEvent,
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-draft',
          delta: ' ignored later',
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'assistant-draft',
        },
        { type: EventType.RUN_FINISHED, ...identity },
      ];
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
        dispose: jest.fn(() => {
          cleanupOrder.push('response:dispose');
        }),
      };
    });
    const store = createRealEffectStore();
    store.dispatch(
      devActions.init({
        system: 'You are a test bot',
        messages: [{ role: 'user', content: 'Protocol failure.' }],
        canonicalMessages: initialCanonical,
        state: { count: 0 },
        retries: 2,
        debounce: 0,
        transport: configuredTransport,
      }),
    );
    const teardown = store.runEffects();
    const errors: Error[] = [];
    const observedEvents: AGUIEvent[] = [];
    let exhaustedRetries = 0;
    const unsubscribeError = store.when(
      apiActions.generateMessageError,
      (action) => {
        cleanupOrder.push('terminal:error');
        errors.push(action.payload);
      },
    );
    const unsubscribeEvent = store.when(
      apiActions.generateMessageEvent,
      (action) => observedEvents.push(action.payload),
    );
    const unsubscribeExhausted = store.when(
      apiActions.generateMessageExhaustedRetries,
      () => exhaustedRetries++,
    );

    store.dispatch(internalActions.start());
    await waitForStoreGenerationToSettle(store);

    expect(send).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      name: 'TransportError',
      retryable: false,
      code: 'PROTOCOL_ERROR',
    });
    expect(exhaustedRetries).toBe(0);
    expect(cleanupOrder).toEqual([
      'iterator:return',
      'response:dispose',
      'terminal:error',
    ]);
    expect(requestSignal?.aborted).toBe(false);
    expect(observedEvents).not.toContainEqual(
      expect.objectContaining({
        type: EventType.STATE_SNAPSHOT,
        snapshot: { count: 9 },
      }),
    );
    expect(observedEvents).not.toContainEqual(
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: ' ignored later',
      }),
    );
    expect(observedEvents).not.toContainEqual(
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    );
    expect(store.read(ɵselectCommittedAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectVisibleAgentState)).toEqual({ count: 0 });
    expect(store.read(ɵselectCommittedAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(ɵselectVisibleAgUiMessages)).toEqual(initialCanonical);
    expect(store.read(selectRawStreamingMessage)).toBeNull();
    expect(store.read(selectRawStreamingToolCalls)).toEqual([]);
    expect(store.read(ɵselectStateWriteLocked)).toBe(false);
    expect(store.read(ɵselectGenerationId)).toBeUndefined();
    expect(store.read(ɵselectGenerationAttemptId)).toBeUndefined();

    unsubscribeError();
    unsubscribeEvent();
    unsubscribeExhausted();
    teardown();
  },
);
