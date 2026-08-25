import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectApiUrl,
  selectDebounce,
  selectMiddleware,
  selectModel,
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
import {
  ModelResolver,
  TransportError,
  type TransportRequest,
} from '../transport';
import {
  _updateMessagesWithDelta,
  generateMessage,
} from './generate-message.effects';

jest.mock('../transport', () => {
  const actual = jest.requireActual('../transport');
  return {
    ...actual,
    ModelResolver: jest.fn(),
  };
});

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
type TestSelection = {
  spec: { name: string };
  transport: { send: jest.Mock };
  metadata: { chosenSpec: string; skippedSpecs: [] };
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
    [selectApiUrl, 'https://example.test'],
    [selectMiddleware, undefined],
    [selectModel, 'stub-model'],
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
    [selectTransport, { kind: 'test-transport' }],
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

const ModelResolverMock = jest.mocked(ModelResolver);

function makeSelection(
  transportResponseFactory: (
    request: TransportRequest,
  ) => Promise<MockTransportResponse>,
) {
  const send = jest.fn().mockImplementation(transportResponseFactory);
  const selection = createTestSelection('selected-model', send);
  const select = jest.fn(async () => selection);
  const skipFromError = jest.fn();
  ModelResolverMock.mockImplementation(
    () =>
      ({
        select,
        skipFromError,
        getMetadata: jest.fn(() => selection.metadata),
      }) as unknown as ModelResolver,
  );

  return { select, send, selection, skipFromError };
}

function createTestSelection(name: string, send: jest.Mock): TestSelection {
  return {
    spec: { name },
    transport: { send },
    metadata: { chosenSpec: name, skippedSpecs: [] },
  };
}

function mockSelectionSequence(selections: Array<TestSelection | undefined>) {
  const select = jest.fn();
  for (const selection of selections) {
    select.mockResolvedValueOnce(selection);
  }
  select.mockResolvedValue(undefined);
  const skipFromError = jest.fn();
  ModelResolverMock.mockImplementation(
    () =>
      ({
        select,
        skipFromError,
        getMetadata: jest.fn(() => ({ skippedSpecs: [] })),
      }) as unknown as ModelResolver,
  );

  return { select, skipFromError };
}

function mockResolverSelect(select: jest.Mock) {
  const skipFromError = jest.fn();
  ModelResolverMock.mockImplementation(
    () =>
      ({
        select,
        skipFromError,
        getMetadata: jest.fn(() => ({ skippedSpecs: [] })),
      }) as unknown as ModelResolver,
  );

  return { skipFromError };
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

test('configured thread with no messages sends no request and never selects', async () => {
  jest.clearAllMocks();
  const { select, send } = makeSelection(async (request) => ({
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

  await store.trigger(internalActions.sizzle());

  expect(select).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();

  teardown?.();
});

test.each(['undefined', 'rejection'] as const)(
  'supersession owns a late initial selection %s',
  async (settlement) => {
    jest.clearAllMocks();
    const selectionStarted = createDeferred<void>();
    const delayedSelection = createDeferred<TestSelection | undefined>();
    const secondSend = jest.fn(async (request: TransportRequest) => ({
      events: successfulEvents(request),
    }));
    const secondSelection = createTestSelection('second', secondSend);
    const select = jest
      .fn()
      .mockImplementationOnce(() => {
        selectionStarted.resolve();
        return delayedSelection.promise;
      })
      .mockResolvedValueOnce(secondSelection);
    mockResolverSelect(select);
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
    await selectionStarted.promise;
    await store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Second' } }),
    );
    const actionsBeforeSettlement = [...store.actions];
    if (settlement === 'undefined') {
      delayedSelection.resolve(undefined);
    } else {
      delayedSelection.reject(new Error('late selection failure'));
    }
    await expect(firstGeneration).resolves.toBeUndefined();

    expect(store.actions).toEqual(actionsBeforeSettlement);
    expect(secondSend).toHaveBeenCalledTimes(1);
    expect(
      getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
    ).toHaveLength(1);

    teardown?.();
  },
);

test.each(['undefined', 'rejection'] as const)(
  'explicit stop owns a late initial selection %s',
  async (settlement) => {
    jest.clearAllMocks();
    const selectionStarted = createDeferred<void>();
    const delayedSelection = createDeferred<TestSelection | undefined>();
    const select = jest.fn(() => {
      selectionStarted.resolve();
      return delayedSelection.promise;
    });
    mockResolverSelect(select);
    const store = createTestStore();
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );
    await selectionStarted.promise;
    await store.trigger(devActions.stopMessageGeneration(true));
    if (settlement === 'undefined') {
      delayedSelection.resolve(undefined);
    } else {
      delayedSelection.reject(new Error('late selection failure'));
    }
    await expect(generation).resolves.toBeUndefined();

    expect(store.actions).toHaveLength(0);

    teardown?.();
  },
);

test.each(['undefined', 'rejection'] as const)(
  'effect teardown owns a late initial selection %s',
  async (settlement) => {
    jest.clearAllMocks();
    const selectionStarted = createDeferred<void>();
    const delayedSelection = createDeferred<TestSelection | undefined>();
    const select = jest.fn(() => {
      selectionStarted.resolve();
      return delayedSelection.promise;
    });
    mockResolverSelect(select);
    const store = createTestStore();
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );
    await selectionStarted.promise;
    teardown?.();
    if (settlement === 'undefined') {
      delayedSelection.resolve(undefined);
    } else {
      delayedSelection.reject(new Error('late selection failure'));
    }
    await expect(generation).resolves.toBeUndefined();

    expect(store.actions).toHaveLength(0);
  },
);

test('active initial selection rejection dispatches the selection error', async () => {
  jest.clearAllMocks();
  const selectionError = new Error('selection failed');
  const select = jest.fn().mockRejectedValue(selectionError);
  mockResolverSelect(select);
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([apiActions.generateMessageError(selectionError)]);
  expect(
    getActionsOfType(store.actions, apiActions.assistantTurnFinalized.type),
  ).toHaveLength(0);

  teardown?.();
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
  await store.trigger(internalActions.sizzle());

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0].input?.threadId).toBe(acceptedThreadId);

  teardown?.();
});

test('sends one RunAgentInput and requests only tools, structured, and ui', async () => {
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
  const { select, send } = makeSelection(async (request) => ({
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
  expect(select).toHaveBeenCalledWith({
    tools: true,
    structured: true,
    ui: true,
  });
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

test.each(['FEATURE_UNSUPPORTED', 'PLATFORM_UNSUPPORTED'] as const)(
  'falls back after %s without consuming a retry and preserves thread identity',
  async (code) => {
    jest.clearAllMocks();
    const firstDispose = jest.fn();
    const secondDispose = jest.fn();
    const unsupportedSend = jest.fn<
      Promise<MockTransportResponse>,
      [TransportRequest]
    >(async () => ({
      events: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              throw new TransportError('unsupported transport', {
                retryable: false,
                code,
              });
            },
          };
        },
      },
      dispose: firstDispose,
    }));
    const replacementSend = jest.fn(async (request: TransportRequest) => ({
      events: successfulEvents(request),
      dispose: secondDispose,
    }));
    const firstSelection = createTestSelection('unsupported', unsupportedSend);
    const secondSelection = createTestSelection('replacement', replacementSend);
    const { select, skipFromError } = mockSelectionSequence([
      firstSelection,
      secondSelection,
    ]);
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

    const firstRequest = unsupportedSend.mock.calls[0]?.[0];
    const secondRequest = replacementSend.mock.calls[0]?.[0];
    expect(select).toHaveBeenCalledTimes(2);
    expect(skipFromError).toHaveBeenCalledWith(
      firstSelection.spec,
      expect.objectContaining({ code }),
    );
    expect(firstRequest?.attempt).toBe(1);
    expect(secondRequest?.attempt).toBe(1);
    expect(firstRequest?.input?.threadId).toBe(secondRequest?.input?.threadId);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);

    teardown?.();
  },
);

test.each(['undefined', 'rejection'] as const)(
  'explicit stop owns a late fallback selection %s',
  async (settlement) => {
    jest.clearAllMocks();
    const fallbackStarted = createDeferred<void>();
    const delayedFallback = createDeferred<TestSelection | undefined>();
    const unsupportedError = new TransportError('unsupported transport', {
      retryable: false,
      code: 'FEATURE_UNSUPPORTED',
    });
    const unsupportedSend = jest.fn().mockRejectedValue(unsupportedError);
    const firstSelection = createTestSelection('unsupported', unsupportedSend);
    const select = jest
      .fn()
      .mockResolvedValueOnce(firstSelection)
      .mockImplementationOnce(() => {
        fallbackStarted.resolve();
        return delayedFallback.promise;
      });
    const { skipFromError } = mockResolverSelect(select);
    const store = createTestStore();
    const teardown = generateMessage(store);

    const generation = store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );
    await fallbackStarted.promise;
    await store.trigger(devActions.stopMessageGeneration(true));
    const actionsBeforeSettlement = [...store.actions];
    if (settlement === 'undefined') {
      delayedFallback.resolve(undefined);
    } else {
      delayedFallback.reject(new Error('late fallback failure'));
    }
    await expect(generation).resolves.toBeUndefined();

    expect(skipFromError).toHaveBeenCalledWith(
      firstSelection.spec,
      unsupportedError,
    );
    expect(store.actions).toEqual(actionsBeforeSettlement);

    teardown?.();
  },
);

test('active fallback selection rejection dispatches the selection error', async () => {
  jest.clearAllMocks();
  const unsupportedError = new TransportError('unsupported transport', {
    retryable: false,
    code: 'FEATURE_UNSUPPORTED',
  });
  const fallbackError = new Error('fallback selection failed');
  const unsupportedSend = jest.fn().mockRejectedValue(unsupportedError);
  const firstSelection = createTestSelection('unsupported', unsupportedSend);
  const select = jest
    .fn()
    .mockResolvedValueOnce(firstSelection)
    .mockRejectedValueOnce(fallbackError);
  mockResolverSelect(select);
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    getActionsOfType(store.actions, apiActions.generateMessageError.type),
  ).toEqual([
    apiActions.generateMessageError(unsupportedError),
    apiActions.generateMessageError(fallbackError),
  ]);

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
  expect(store.actions).not.toContainEqual(internalActions.sizzle());

  teardown?.();
});
