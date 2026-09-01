import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { createChatRuntime } from '../chat-runtime';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectDebounce,
  selectPendingToolCalls,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectSystem,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
} from '../reducers';
import { s } from '../schema';
import { TransportError, type TransportRequest } from '../transport';
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
      selectApiMessages,
      [{ role: 'user', content: 'Hi!' }] as Chat.Api.Message[],
    ],
    [selectShouldGenerateMessage, true],
    [selectDebounce, 0],
    [selectRetries, 0],
    [selectToolEntities, {}],
    [selectTools, []],
    [selectSystem, 'You are a test bot'],
    [selectThreadId, undefined],
    [selectTransport, configuredTransport],
    [selectUiRequested, false],
    [selectRawStreamingMessage, null],
    [selectRawStreamingToolCalls, []],
    [selectPendingToolCalls, []],
    [selectStreamingMessageError, undefined],
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
    },
    read: <T = unknown>(selector: SelectorKey): T => {
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
      [selectApiMessages, []],
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(initializationError)]);
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toHaveLength(0);

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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
    ).toHaveLength(1);

    teardown?.();
  },
);

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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );
    store.setSelector(selectThreadId, updateThreadId);
    await store.trigger(devActions.updateOptions({ threadId: updateThreadId }));
    await generation;

    expect(send).not.toHaveBeenCalled();
    expect(
      getActionsOfType(store.actions, generationSilentlyRetiredType),
    ).toHaveLength(1);
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
    ).toHaveLength(0);

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
      devActions.sendMessage({ message: { role: 'user', content: 'First' } }),
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
      devActions.sendMessage({ message: { role: 'user', content: 'Second' } }),
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
    expect(
      getActionsOfType(
        actionsAfterRetirement,
        apiActions.assistantTurnFinalized.type,
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
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );
    await iterationBlocked.promise;
    const effectiveThreadId = request?.input?.threadId;
    store.setSelector(selectThreadId, effectiveThreadId);
    store.setSelector(selectSystem, 'Updated system prompt');
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
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const requests = send.mock.calls.map(([request]) => request);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.input?.threadId).toBe(requests[1]?.input?.threadId);
  expect(requests[0]?.input?.runId).not.toBe(requests[1]?.input?.runId);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('validated start then tool continuation reuses the same thread ID', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => ({
    events: successfulEvents(request),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectRawStreamingMessage,
        { role: 'assistant', content: 'Done', toolCallIds: [] },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  const acceptedThreadId = send.mock.calls[0]?.[0].input?.threadId;
  store.setSelector(selectThreadId, acceptedThreadId);
  await store.trigger(
    internalActions.toolTurnSettled({
      toolCalls: [],
      toolMessages: [],
      continuation: 'continue',
    }),
  );
  await store.trigger(internalActions.start());

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0].input?.threadId).toBe(acceptedThreadId);

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
      id: 'call-weather',
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
  capturedAssistant.encryptedValue = 'mutated-captured-assistant';
  capturedToolCall.encryptedValue = 'mutated-captured-tool-call';
  capturedReasoning.encryptedValue = 'mutated-captured-value';
  capturedMetadata.provider.trace[0] = 'mutated-captured-metadata';
  capturedAssistantStep.index = 99;
  capturedToolStep.index = 100;

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
  const toolHandler = jest.fn(async ({ value }: { value: number }) => ({
    recorded: value,
  }));
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
  const messages: Chat.Api.Message[] = [
    { role: 'user', content: 'First question' },
    { role: 'assistant', content: 'First answer' },
    { role: 'user', content: 'Follow-up question' },
  ];
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectApiMessages, messages],
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(3);
  expect(requests.map((request) => request.attempt)).toEqual([1, 2, 3]);
  expect(requests.map((request) => request.maxAttempts)).toEqual([3, 3, 3]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toHaveLength(2);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toHaveLength(0);

  teardown?.();
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
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(([request]) => request.attempt)).toEqual([1, 2]);
  expect(send.mock.calls.map(([request]) => request.maxAttempts)).toEqual([
    2, 2,
  ]);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([
    apiActions.generateMessageError(error),
    apiActions.generateMessageError(error),
  ]);
  expect(
    getActionsOfType(
      store.actions,
      apiActions.generateMessageExhaustedRetries.type,
    ),
  ).toEqual([apiActions.generateMessageExhaustedRetries()]);

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
      devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
    );

    const errors = getActionsOfType(
      store.actions,
      apiActions.generateMessageError.type,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(getDispatchedEvents(store.actions)).not.toContain(earlyEvent);
    expect(errors[0]?.payload).toMatchObject({
      name: 'TransportError',
      code: 'PROTOCOL_ERROR',
      retryable: true,
    });

    teardown?.();
  },
);

test('rejects duplicate RUN_STARTED and synthesizes one terminal error', async () => {
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    events.filter((event) => event.type === EventType.RUN_STARTED),
  ).toHaveLength(1);
  expect(events.filter((event) => event.type === EventType.RUN_ERROR)).toEqual([
    {
      type: EventType.RUN_ERROR,
      message: 'Received duplicate RUN_STARTED',
    },
  ]);

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
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageStart.type),
  ).toHaveLength(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);

  teardown?.();
});

test('rejects a mismatched RUN_FINISHED and synthesizes one terminal error', async () => {
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toEqual([
    {
      type: EventType.RUN_ERROR,
      message: 'RUN_FINISHED identity does not match the active run',
    },
  ]);

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
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const errors = getActionsOfType(
    store.actions,
    apiActions.generateMessageError.type,
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(errors[0]?.payload).toMatchObject({ retryable: true });
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(start ? 1 : 0);

  teardown?.();
});

test('iterable failure after an accepted start synthesizes exactly one RUN_ERROR', async () => {
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toEqual([{ type: EventType.RUN_ERROR, message: primaryError.message }]);
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(events.filter((event) => event.type === EventType.RUN_ERROR)).toEqual([
    serverError,
  ]);
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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
    ).toEqual([
      apiActions.assistantTurnFinalized({
        toolCalls: [],
        continuation: 'stop',
      }),
    ]);

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
      devActions.sendMessage({ message: { role: 'user', content: 'First' } }),
    );
    await firstSendStarted.promise;
    const firstRequest = send.mock.calls[0]?.[0] as TransportRequest;
    await store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Second' } }),
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
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
    ).toHaveLength(1);

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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(getDispatchedEvents(store.actions)).toHaveLength(0);
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toEqual([
    apiActions.assistantTurnFinalized({
      toolCalls: [],
      continuation: 'stop',
    }),
  ]);

  teardown?.();
});

test('user stop after start synthesizes one cancellation and finalizes once with stop', async () => {
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  await started.promise;
  await waitForDispatchedEvent(store.actions, EventType.RUN_STARTED);
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  const events = getDispatchedEvents(store.actions);
  expect(send).toHaveBeenCalledTimes(1);
  expect(events.filter((event) => event.type === EventType.RUN_ERROR)).toEqual([
    { type: EventType.RUN_ERROR, message: 'Generation cancelled' },
  ]);
  expect(events).not.toContainEqual(
    expect.objectContaining({ name: 'late-event' }),
  );
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toEqual([
    apiActions.assistantTurnFinalized({
      toolCalls: [],
      continuation: 'stop',
    }),
  ]);
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
    devActions.sendMessage({ message: { role: 'user', content: 'First' } }),
  );
  await firstStarted.promise;
  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Second' } }),
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
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toHaveLength(1);
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_FINISHED,
    ),
  ).toHaveLength(1);

  teardown?.();
});

test('effect teardown retires the run without terminal or finalization', async () => {
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
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
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type)[0]
      ?.payload,
  ).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    message: 'Received duplicate RUN_STARTED',
  });
  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toEqual([
    { type: EventType.RUN_ERROR, message: 'Received duplicate RUN_STARTED' },
  ]);
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  await started.promise;
  await waitForDispatchedEvent(store.actions, EventType.RUN_STARTED);
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(
    getDispatchedEvents(store.actions).filter(
      (event) => event.type === EventType.RUN_ERROR,
    ),
  ).toEqual([{ type: EventType.RUN_ERROR, message: 'Generation cancelled' }]);
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(removedFramesIterator).not.toHaveBeenCalled();
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([
    apiActions.generateMessageError(
      new TransportError('Transport response did not provide an event stream', {
        retryable: true,
        code: 'PROTOCOL_ERROR',
      }),
    ),
  ]);

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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([
    apiActions.generateMessageError(
      new TransportError('Transport response did not provide an event stream', {
        retryable: true,
        code: 'PROTOCOL_ERROR',
      }),
    ),
  ]);

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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
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
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toEqual([
    apiActions.assistantTurnFinalized({
      toolCalls: [],
      continuation: 'stop',
    }),
  ]);

  teardown?.();
});

test('finalizes the exact pending tool call snapshot', async () => {
  jest.clearAllMocks();
  const pendingToolCall: Chat.Internal.ToolCall = {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  makeSelection(async (request) => ({ events: successfulEvents(request) }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: '',
          toolCallIds: [pendingToolCall.id],
        },
      ],
      [selectRawStreamingToolCalls, [pendingToolCall]],
      [selectPendingToolCalls, [pendingToolCall]],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Lookup' } }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type)[0]
      ?.payload,
  ).toEqual({ toolCalls: [pendingToolCall], continuation: 'continue' });

  teardown?.();
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
      toolCalls: [],
      toolMessages: [],
      continuation: 'stop',
    }),
  );

  expect(send).not.toHaveBeenCalled();
  expect(store.actions).not.toContainEqual(internalActions.start());

  teardown?.();
});
