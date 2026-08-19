import { type AGUIEvent, EventType } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import { apiActions, devActions, internalActions } from '../actions';
import {
  selectApiMessages,
  selectApiTools,
  selectApiUrl,
  selectDebounce,
  selectEmulateStructuredOutput,
  selectMiddleware,
  selectModel,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectStructuredOutput,
  selectSystem,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
} from '../reducers';
import { decodeFrames } from '../frames/decode-frames';
import { createCompletionChunkEventAdapter } from '../transport/completion-chunk-to-agui-events';
import {
  framesToLengthPrefixedStream,
  ModelResolver,
  TransportError,
  type TransportRequest,
} from '../transport';
import {
  _extractMessageDelta,
  _updateMessagesWithDelta,
  generateMessage,
} from './generate-message.effects';

jest.mock('../frames/decode-frames', () => ({
  decodeFrames: jest.fn(async function* (frames: AsyncIterable<unknown>) {
    for await (const frame of frames) {
      yield frame;
    }
  }),
}));

jest.mock('../transport/completion-chunk-to-agui-events', () => {
  const actual = jest.requireActual(
    '../transport/completion-chunk-to-agui-events',
  );
  return {
    ...actual,
    createCompletionChunkEventAdapter: jest.fn(
      actual.createCompletionChunkEventAdapter,
    ),
  };
});

jest.mock('../transport', () => {
  const actual = jest.requireActual('../transport');
  return {
    ...actual,
    ModelResolver: jest.fn(),
    framesToLengthPrefixedStream: jest.fn((frames: unknown) => frames),
  };
});

type SelectorKey = (state: never) => unknown;
type ActionLike = { type: string; payload?: unknown };
type TestHandler = {
  types: string[];
  handler: (action: ActionLike) => unknown | Promise<unknown>;
};
type SelectorMap = Map<SelectorKey, unknown>;

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
    [selectApiTools, []],
    [selectToolEntities, {}],
    [selectTools, []],
    [selectSystem, 'You are a test bot'],
    [selectEmulateStructuredOutput, false],
    [selectStructuredOutput, undefined],
    [selectThreadId, undefined],
    [selectTransport, { kind: 'test-transport' }],
    [selectUiRequested, false],
    [selectRawStreamingMessage, null],
    [selectRawStreamingToolCalls, []],
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
      // After removing the handler, remaining params are action descriptors
      const types = (params as { type: string }[]).map((p) => p.type);
      handlers.push({ types, handler });
      return () => undefined;
    },
    dispatch: (action: ActionLike) => {
      actions.push(action);
    },
    read: <T = unknown>(selector: SelectorKey): T => {
      if (!values.has(selector)) {
        throw new Error(`No value for selector`);
      }
      return values.get(selector) as T;
    },
    // helpers for tests
    async trigger(action: ActionLike) {
      const matches = handlers.filter((h) => h.types.includes(action.type));
      for (const match of matches) {
        await match.handler(action);
      }
    },
  };

  // Hide the bespoke test shape behind unknown so we can pass to the effect
  return store as unknown as Parameters<typeof generateMessage>[0] &
    typeof store;
}

test('extractMessageDelta returns all messages when no assistant is present', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Hello',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual(messages);
});

test('extractMessageDelta returns messages after the last assistant message', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Hi',
    },
    {
      role: 'assistant',
      content: 'Hello there!',
    },
    {
      role: 'user',
      content: 'How are you?',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual([
    {
      role: 'user',
      content: 'How are you?',
    },
  ]);
});

test('extractMessageDelta isolates tool messages following the assistant', () => {
  const toolMessage: Chat.Api.ToolMessage = {
    role: 'tool',
    content: { status: 'fulfilled', value: '42' },
    toolCallId: 'call-1',
    toolName: 'answer',
  };

  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Compute?',
    },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          index: 0,
          type: 'function',
          function: {
            name: 'answer',
            arguments: '{}',
          },
        },
      ],
    },
    toolMessage,
  ];

  expect(_extractMessageDelta(messages)).toEqual([toolMessage]);
});

test('extractMessageDelta returns an empty array when the last message is assistant', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Start',
    },
    {
      role: 'assistant',
      content: 'Done',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual([]);
});

test('updateMessagesWithDelta works without an initial message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: 'Hello, world!',
        },
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

test('updateMessagesWithDelta works with an initial message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: ' world!',
        },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta works with an initial message and a tool call', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: ' world!',
        },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
      toolCalls: [
        {
          id: '1',
          index: 0,
          type: 'function',
          function: {
            name: 'get_current_time',
            arguments: '{}',
          },
        },
      ],
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [
      {
        id: '1',
        index: 0,
        type: 'function',
        function: {
          name: 'get_current_time',
          arguments: '{}',
        },
      },
    ],
  });
});

test('updateMessagesWithDelta works when there are no choices in the delta', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
      toolCalls: [],
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello,',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta adds a first tool call', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          // no content in this chunk – only a tool call
          toolCalls: [
            {
              id: 'tc-1',
              index: 0,
              type: 'function',
              function: {
                name: 'get_current_time',
                arguments: '{}',
              },
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
        function: {
          name: 'get_current_time',
          arguments: '{}',
        },
      },
    ],
  });
});

test('updateMessagesWithDelta merges tool-call arguments when index matches', () => {
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
              index: existingToolCall.index,
              function: {
                arguments: ',"format":"iso8601"',
              },
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
      toolCalls: [existingToolCall],
    },
    delta,
  );

  expect(message?.toolCalls).toEqual([
    {
      ...existingToolCall,
      function: {
        ...existingToolCall.function,
        arguments: '{"tz":"UTC"},"format":"iso8601"', // concatenated
      },
    },
  ]);
});

test('updateMessagesWithDelta appends a new tool call when index differs', () => {
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
              function: {
                name: 'get_weather',
                arguments: '{"city":"PDX"}',
              },
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
          function: {
            name: 'get_current_time',
            arguments: '{}',
          },
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

test('updateMessagesWithDelta treats undefined content as empty string', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          content: 'Hi!',
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      toolCalls: [],
    },
    delta,
  );

  expect(message?.content).toBe('Hi!');
});

test('updateMessagesWithDelta returns null when nothing to update', () => {
  const delta: Chat.Api.CompletionChunk = { choices: [] };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toBeNull();
});

test('generateMessage sends schema response format mode by default for structured output', async () => {
  const send = mockSuccessfulSelection();
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectResponseSchema, s.object('response', {})],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: {},
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({
        responseFormat: expect.any(Object),
        responseFormatMode: 'schema',
        toolChoice: undefined,
      }),
    }),
  );

  teardown?.();
});

test('generateMessage sends json response format mode without provider schema', async () => {
  const send = mockSuccessfulSelection();
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectResponseSchema, s.object('response', {})],
      [selectStructuredOutput, { mode: 'json' }],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: {},
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({
        responseFormat: undefined,
        responseFormatMode: 'json',
        toolChoice: undefined,
      }),
    }),
  );

  teardown?.();
});

test('generateMessage lets resource-level tool mode override strict structured output', async () => {
  const send = mockSuccessfulSelection();
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectResponseSchema, s.object('response', {})],
      [selectStructuredOutput, { mode: 'tool' }],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: {},
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({
        responseFormat: undefined,
        responseFormatMode: undefined,
        toolChoice: 'required',
      }),
    }),
  );

  teardown?.();
});

function mockSuccessfulSelection() {
  const ModelResolverMock = jest.mocked(ModelResolver);
  const send = jest.fn(async () => ({
    frames: (async function* () {
      yield { type: 'generation-start' as const };
      yield { type: 'generation-finish' as const };
    })(),
  }));
  const selection = {
    spec: { name: 'selected-model' },
    transport: { send },
    metadata: { chosenSpec: 'selected-model', skippedSpecs: [] },
  };

  ModelResolverMock.mockImplementation(
    () =>
      ({
        select: jest.fn(async () => selection),
        skipFromError: jest.fn(),
        getMetadata: jest.fn(() => selection.metadata),
      }) as unknown as ModelResolver,
  );

  return send;
}

const ModelResolverMock = jest.mocked(ModelResolver);
const decodeFramesMock = jest.mocked(decodeFrames);
const framesToLengthPrefixedStreamMock = jest.mocked(
  framesToLengthPrefixedStream,
);
const createCompletionChunkEventAdapterMock = jest.mocked(
  createCompletionChunkEventAdapter,
);

type MockTransportResponse = {
  events?: AsyncIterable<AGUIEvent>;
  frames?: AsyncIterable<unknown>;
  stream?: AsyncIterable<unknown>;
  dispose?: jest.Mock;
  metadata?: unknown;
};

function makeSelection(
  transportResponseFactory: (
    request: TransportRequest,
  ) => Promise<MockTransportResponse>,
  transportOverrides: { supportsLegacyThreadLoading?: boolean } = {},
) {
  const send = jest.fn().mockImplementation(transportResponseFactory);
  const selection = {
    spec: { name: 'selected-model' },
    transport: { ...transportOverrides, send },
    metadata: { chosenSpec: 'selected-model', skippedSpecs: [] },
  };
  const select = jest.fn(async () => selection);
  ModelResolverMock.mockImplementation(
    () =>
      ({
        select,
        skipFromError: jest.fn(),
        getMetadata: jest.fn(() => selection.metadata),
      }) as unknown as ModelResolver,
  );
  return { select, send, selection };
}

type TestSelection = {
  spec: { name: string };
  transport: {
    send: jest.Mock;
    supportsLegacyThreadLoading?: boolean;
  };
  metadata: { chosenSpec: string; skippedSpecs: [] };
};

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

function createTestSelection(
  name: string,
  send: jest.Mock,
  supportsLegacyThreadLoading?: boolean,
): TestSelection {
  return {
    spec: { name },
    transport: { send, supportsLegacyThreadLoading },
    metadata: { chosenSpec: name, skippedSpecs: [] },
  };
}

function getInputIdentity(request: TransportRequest) {
  if (!request.input) {
    throw new Error('Expected modern AG-UI input');
  }

  return {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
}

test.each(['FEATURE_UNSUPPORTED', 'PLATFORM_UNSUPPORTED'] as const)(
  'sends a compatible replacement after %s without consuming a retry',
  async (code) => {
    jest.clearAllMocks();
    const unsupportedSend = jest.fn<
      Promise<MockTransportResponse>,
      [TransportRequest]
    >(async () => {
      throw new TransportError('unsupported transport', {
        retryable: false,
        code,
      });
    });
    const replacementSend = jest.fn(async (request: TransportRequest) => {
      const identity = getInputIdentity(request);

      return {
        events: (async function* () {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    });
    const unsupportedSelection = createTestSelection(
      'unsupported',
      unsupportedSend,
    );
    const replacementSelection = createTestSelection(
      'replacement',
      replacementSend,
    );
    const { select, skipFromError } = mockSelectionSequence([
      unsupportedSelection,
      replacementSelection,
    ]);
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [
          selectRawStreamingMessage,
          {
            role: 'assistant',
            content: 'Fallback succeeded',
            toolCallIds: [],
          },
        ],
      ]),
    );
    const teardown = generateMessage(store);

    await store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
    );

    expect(select).toHaveBeenCalledTimes(2);
    expect(skipFromError).toHaveBeenCalledWith(
      unsupportedSelection.spec,
      expect.objectContaining({ code }),
    );
    expect(unsupportedSend).toHaveBeenCalledTimes(1);
    expect(replacementSend).toHaveBeenCalledTimes(1);
    expect(unsupportedSend.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      maxAttempts: 1,
      params: { model: 'unsupported' },
    });
    expect(replacementSend.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      maxAttempts: 1,
      params: { model: 'replacement' },
    });
    expect(
      store.actions.filter(
        (action) => action.type === apiActions.generateMessageSuccess.type,
      ),
    ).toHaveLength(1);

    teardown?.();
  },
);

test('does not load an empty configured thread through a modern transport', async () => {
  jest.clearAllMocks();
  const send = jest.fn();
  const modernSelection = createTestSelection('modern', send, false);
  const { select, skipFromError } = mockSelectionSequence([
    modernSelection,
    undefined,
  ]);
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectApiMessages, []],
      [selectShouldGenerateMessage, false],
      [selectThreadId, 'configured-thread'],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(internalActions.sizzle());

  expect(select).toHaveBeenCalledTimes(2);
  expect(skipFromError).toHaveBeenCalledWith(
    modernSelection.spec,
    expect.objectContaining({
      name: 'TransportError',
      code: 'FEATURE_UNSUPPORTED',
      retryable: false,
      message: expect.stringMatching(/legacy thread load/i),
    }),
  );
  expect(send).not.toHaveBeenCalled();

  teardown?.();
});

test('skips a modern transport and loads an empty thread with the next legacy transport', async () => {
  jest.clearAllMocks();
  const modernSend = jest.fn();
  const legacySend = jest.fn<
    Promise<MockTransportResponse>,
    [TransportRequest]
  >(async () => ({
    frames: (async function* () {
      yield { type: 'thread-load-start' as const };
      yield { type: 'thread-load-success' as const, thread: [] };
    })(),
  }));
  const modernSelection = createTestSelection('modern', modernSend, false);
  const legacySelection = createTestSelection('legacy', legacySend, true);
  const { select, skipFromError } = mockSelectionSequence([
    modernSelection,
    legacySelection,
  ]);
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectApiMessages, []],
      [selectShouldGenerateMessage, false],
      [selectThreadId, 'configured-thread'],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(internalActions.sizzle());

  expect(select).toHaveBeenCalledTimes(2);
  expect(skipFromError).toHaveBeenCalledTimes(1);
  expect(modernSend).not.toHaveBeenCalled();
  expect(legacySend).toHaveBeenCalledTimes(1);
  expect(legacySend.mock.calls[0]?.[0]).toMatchObject({
    attempt: 1,
    params: { operation: 'load-thread', messages: [] },
  });

  teardown?.();
});

test('does not send an empty thread request to a modern fallback', async () => {
  jest.clearAllMocks();
  const legacySend = jest.fn<
    Promise<MockTransportResponse>,
    [TransportRequest]
  >(async () => {
    throw new TransportError('legacy transport unavailable', {
      retryable: false,
      code: 'FEATURE_UNSUPPORTED',
    });
  });
  const modernSend = jest.fn(async (request: TransportRequest) => {
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const legacySelection = createTestSelection('legacy', legacySend, true);
  const modernSelection = createTestSelection('modern', modernSend, false);
  const { select, skipFromError } = mockSelectionSequence([
    legacySelection,
    modernSelection,
    undefined,
  ]);
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectApiMessages, []],
      [selectShouldGenerateMessage, false],
      [selectThreadId, 'configured-thread'],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(internalActions.sizzle());

  expect(select).toHaveBeenCalledTimes(3);
  expect(skipFromError).toHaveBeenNthCalledWith(
    1,
    legacySelection.spec,
    expect.objectContaining({ code: 'FEATURE_UNSUPPORTED' }),
  );
  expect(skipFromError).toHaveBeenNthCalledWith(
    2,
    modernSelection.spec,
    expect.objectContaining({
      code: 'FEATURE_UNSUPPORTED',
      retryable: false,
    }),
  );
  expect(legacySend).toHaveBeenCalledTimes(1);
  expect(legacySend.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 });
  expect(modernSend).not.toHaveBeenCalled();

  teardown?.();
});

test.each([undefined, true])(
  'loads an empty configured thread when legacy capability is %s',
  async (supportsLegacyThreadLoading) => {
    jest.clearAllMocks();
    const dispose = jest.fn();
    const { send } = makeSelection(
      async () => ({
        frames: (async function* () {
          yield { type: 'thread-load-start' as const };
          yield { type: 'thread-load-success' as const, thread: [] };
        })(),
        dispose,
      }),
      supportsLegacyThreadLoading === undefined
        ? {}
        : { supportsLegacyThreadLoading },
    );
    const store = createTestStore(
      new Map<SelectorKey, unknown>([
        [selectApiMessages, []],
        [selectShouldGenerateMessage, false],
        [selectThreadId, 'configured-thread'],
      ]),
    );
    const teardown = generateMessage(store);

    await store.trigger(internalActions.sizzle());

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].params).toMatchObject({
      operation: 'load-thread',
      messages: [],
      threadId: 'configured-thread',
    });
    expect(dispose).toHaveBeenCalledTimes(1);

    teardown?.();
  },
);

test('reuses a generated thread across retries and tool continuation', async () => {
  jest.clearAllMocks();
  let sendCount = 0;
  const { send } = makeSelection(async (request) => {
    sendCount++;
    if (sendCount === 1) {
      throw new TransportError('retry once', { retryable: true });
    }

    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Done',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  await store.trigger(
    internalActions.runToolCallsSuccess({ toolMessages: [] }),
  );

  const requests = send.mock.calls.map(([request]) => request);
  expect(requests).toHaveLength(3);
  expect(new Set(requests.map((request) => request.input?.threadId)).size).toBe(
    1,
  );
  expect(new Set(requests.map((request) => request.input?.runId)).size).toBe(3);
  expect(new Set(requests.map((request) => request.requestId)).size).toBe(3);
  expect(
    requests.every((request) => request.input?.runId === request.requestId),
  ).toBe(true);

  teardown?.();
});

test('sends full modern input while preserving legacy completion params', async () => {
  jest.clearAllMocks();
  const responseSchema = s.object('answer', {
    answer: s.string('answer text'),
  });
  const jsonSchema = s.toJsonSchema(responseSchema);
  const messages: Chat.Api.Message[] = [
    { role: 'user', content: 'First question' },
    { role: 'assistant', content: 'First answer' },
    { role: 'user', content: 'Follow-up question' },
  ];
  const internalTool: Chat.Internal.Tool = {
    name: 'search',
    description: 'Search records',
    schema: s.object('search input', { query: s.string('query') }),
    handler: async () => undefined,
  };
  const modernTool = Chat.helpers.toApiToolsFromInternal(
    [internalTool],
    false,
    responseSchema,
  )[0];
  const legacyTools = Chat.helpers.toApiToolsFromInternal(
    [internalTool],
    true,
    responseSchema,
  );
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectApiMessages, messages],
      [selectApiTools, legacyTools],
      [selectTools, [internalTool]],
      [selectToolEntities, { search: internalTool }],
      [selectResponseSchema, responseSchema],
      [selectStructuredOutput, { mode: 'tool' }],
      [selectThreadId, 'configured-thread'],
      [selectUiRequested, true],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Second answer',
          toolCallIds: [],
        },
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
  expect(request.params).toEqual({
    operation: 'generate',
    model: 'selected-model',
    system: 'You are a test bot',
    messages: [{ role: 'user', content: 'Follow-up question' }],
    tools: legacyTools,
    toolChoice: 'required',
    responseFormat: undefined,
    responseFormatMode: undefined,
    threadId: 'configured-thread',
  });
  expect(request.input).toEqual({
    threadId: 'configured-thread',
    runId: request.requestId,
    messages: [
      {
        id: 'configured-thread:system',
        role: 'system',
        content: 'You are a test bot',
      },
      {
        id: 'configured-thread:message:0',
        role: 'user',
        content: 'First question',
      },
      {
        id: 'configured-thread:message:1',
        role: 'assistant',
        content: 'First answer',
      },
      {
        id: 'configured-thread:message:2',
        role: 'user',
        content: 'Follow-up question',
      },
    ],
    tools: [
      {
        name: modernTool?.name,
        description: modernTool?.description,
        parameters: modernTool?.parameters,
      },
    ],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: { responseSchema: jsonSchema, ui: true },
  });
  expect(request.input).not.toHaveProperty('model');
  expect(request.input).not.toHaveProperty('provider');
  expect(request.input).not.toHaveProperty('emulateStructuredOutput');
  expect(
    request.input?.tools.map((tool: { name: string }) => tool.name),
  ).not.toContain('output');
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageStart.type,
    )?.payload,
  ).toEqual({
    responseSchema,
    emulateStructuredOutput: false,
    toolsByName: { search: internalTool },
  });

  teardown?.();
});

test('consumes direct AG-UI events without invoking the legacy stream path', async () => {
  jest.clearAllMocks();
  let serverEvents: AGUIEvent[] = [];
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const dispose = jest.fn();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);
    serverEvents = [
      { type: EventType.RUN_STARTED, ...identity },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'server-message',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'server-message',
        delta: 'Hello',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'server-message',
      },
      {
        type: EventType.CUSTOM,
        name: 'server-metadata',
        value: { source: 'server' },
      },
      { type: EventType.RUN_FINISHED, ...identity },
    ];
    const events = {
      [Symbol.asyncIterator]() {
        const iterator = serverEvents[Symbol.iterator]();
        return {
          next: async () => iterator.next(),
          return: iteratorReturn,
        };
      },
    };

    return { events, dispose };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Hello',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(decodeFramesMock).not.toHaveBeenCalled();
  expect(framesToLengthPrefixedStreamMock).not.toHaveBeenCalled();
  expect(createCompletionChunkEventAdapterMock).not.toHaveBeenCalled();
  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    ...serverEvents.map(() => apiActions.generateMessageEvent.type),
    apiActions.generateMessageSuccess.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(
    store.actions
      .filter((action) => action.type === apiActions.generateMessageEvent.type)
      .map((action) => action.payload),
  ).toEqual(serverEvents);
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageSuccess.type,
    )?.payload,
  ).toEqual({
    message: {
      role: 'assistant',
      content: 'Hello',
      toolCallIds: [],
    },
    toolCalls: [],
  });
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('retries when direct iterator cleanup rejects before message commit', async () => {
  jest.clearAllMocks();
  const cleanupError = new Error('iterator cleanup failed');
  const iteratorReturn = jest.fn(async () => {
    throw cleanupError;
  });
  const firstDispose = jest.fn();
  const secondDispose = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      const serverEvents: AGUIEvent[] = [
        { type: EventType.RUN_STARTED, ...identity },
        { type: EventType.RUN_FINISHED, ...identity },
      ];
      return {
        events: {
          [Symbol.asyncIterator]() {
            const iterator = serverEvents[Symbol.iterator]();
            return {
              next: async () => iterator.next(),
              return: iteratorReturn,
            };
          },
        },
        dispose: firstDispose,
      };
    }

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
      dispose: secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const errorIndex = store.actions.findIndex(
    (action) => action.type === apiActions.generateMessageError.type,
  );
  const successIndex = store.actions.findIndex(
    (action) => action.type === apiActions.generateMessageSuccess.type,
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toEqual([apiActions.generateMessageError(cleanupError)]);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageSuccess.type,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.filter(
      (action) =>
        action.type === apiActions.generateMessageEvent.type &&
        (action.payload as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);
  expect(errorIndex).toBeLessThan(successIndex);

  teardown?.();
});

test('retries when direct response disposal rejects before message commit', async () => {
  jest.clearAllMocks();
  const disposeError = new Error('response disposal failed');
  const firstDispose = jest.fn(async () => {
    throw disposeError;
  });
  const secondDispose = jest.fn();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
      dispose: attempt === 1 ? firstDispose : secondDispose,
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);
  let thrown: unknown;

  try {
    await store.trigger(
      devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
    );
  } catch (error) {
    thrown = error;
  }

  const errorIndex = store.actions.findIndex(
    (action) => action.type === apiActions.generateMessageError.type,
  );
  const successIndex = store.actions.findIndex(
    (action) => action.type === apiActions.generateMessageSuccess.type,
  );
  expect(thrown).toBeUndefined();
  expect(send).toHaveBeenCalledTimes(2);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  expect(secondDispose).toHaveBeenCalledTimes(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toEqual([apiActions.generateMessageError(disposeError)]);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageSuccess.type,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.filter(
      (action) =>
        action.type === apiActions.generateMessageEvent.type &&
        (action.payload as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);
  expect(errorIndex).toBeLessThan(successIndex);

  teardown?.();
});

test('retries an early direct server RUN_ERROR without starting the failed attempt', async () => {
  jest.clearAllMocks();
  const serverError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server rejected request',
  };
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    if (attempt === 1) {
      return {
        events: (async function* () {
          yield serverError;
        })(),
      };
    }

    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const dispatchedEvents = store.actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload);
  expect(send).toHaveBeenCalledTimes(2);
  expect(dispatchedEvents.filter((event) => event === serverError)).toEqual([
    serverError,
  ]);
  expect(
    dispatchedEvents.filter(
      (event) => (event as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageStart.type,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toEqual([apiActions.generateMessageError(new Error(serverError.message))]);

  teardown?.();
});

test('retries a direct server RUN_ERROR without dispatching it twice', async () => {
  jest.clearAllMocks();
  const serverError: AGUIEvent = {
    type: EventType.RUN_ERROR,
    message: 'server failed',
  };
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      return {
        events: (async function* () {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield serverError;
          yield {
            type: EventType.CUSTOM,
            name: 'must-not-dispatch',
            value: 'tail',
          };
        })(),
      };
    }

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const dispatchedEvents = store.actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload);
  expect(send).toHaveBeenCalledTimes(2);
  expect(dispatchedEvents.filter((event) => event === serverError)).toEqual([
    serverError,
  ]);
  expect(dispatchedEvents).not.toContainEqual(
    expect.objectContaining({ name: 'must-not-dispatch' }),
  );
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageSuccess.type,
    ),
  ).toHaveLength(1);

  teardown?.();
});

test('treats duplicate direct RUN_STARTED events as a protocol error', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const dispatchedEvents = store.actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload);
  const errorAction = store.actions.find(
    (action) => action.type === apiActions.generateMessageError.type,
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageStart.type,
    ),
  ).toHaveLength(1);
  expect(
    dispatchedEvents.filter(
      (event) => (event as AGUIEvent).type === EventType.RUN_STARTED,
    ),
  ).toHaveLength(1);
  expect(
    dispatchedEvents.filter(
      (event) => (event as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(1);
  expect(errorAction?.payload).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    retryable: true,
  });

  teardown?.();
});

test('retries a mismatched direct RUN_STARTED without accepting the run', async () => {
  jest.clearAllMocks();
  let attempt = 0;
  let mismatchedStart: AGUIEvent | undefined;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      mismatchedStart = {
        type: EventType.RUN_STARTED,
        threadId: identity.threadId,
        runId: `${identity.runId}:mismatch`,
      };
      return {
        events: (async function* () {
          yield mismatchedStart as AGUIEvent;
        })(),
      };
    }

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const dispatchedEvents = store.actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload);
  expect(send).toHaveBeenCalledTimes(2);
  expect(dispatchedEvents).not.toContain(mismatchedStart);
  expect(
    dispatchedEvents.filter(
      (event) => (event as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(0);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageStart.type,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageError.type,
    )?.payload,
  ).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    retryable: true,
  });

  teardown?.();
});

test('retries a mismatched direct RUN_FINISHED with one terminal error', async () => {
  jest.clearAllMocks();
  let attempt = 0;
  let acceptedStart: AGUIEvent | undefined;
  let mismatchedFinish: AGUIEvent | undefined;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    if (attempt === 1) {
      acceptedStart = { type: EventType.RUN_STARTED, ...identity };
      mismatchedFinish = {
        type: EventType.RUN_FINISHED,
        threadId: `${identity.threadId}:mismatch`,
        runId: identity.runId,
      };
      return {
        events: (async function* () {
          yield acceptedStart as AGUIEvent;
          yield mismatchedFinish as AGUIEvent;
        })(),
      };
    }

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Retry' } }),
  );

  const dispatchedEvents = store.actions
    .filter((action) => action.type === apiActions.generateMessageEvent.type)
    .map((action) => action.payload);
  expect(send).toHaveBeenCalledTimes(2);
  expect(dispatchedEvents).toContain(acceptedStart);
  expect(dispatchedEvents).not.toContain(mismatchedFinish);
  expect(
    dispatchedEvents.filter(
      (event) => (event as AGUIEvent).type === EventType.RUN_ERROR,
    ),
  ).toHaveLength(1);
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageError.type,
    )?.payload,
  ).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    retryable: true,
  });

  teardown?.();
});

test('retries premature direct EOF after start with one terminal error', async () => {
  jest.clearAllMocks();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        if (attempt === 2) {
          yield { type: EventType.RUN_FINISHED, ...identity };
        }
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const runErrors = store.actions.filter(
    (action) =>
      action.type === apiActions.generateMessageEvent.type &&
      (action.payload as AGUIEvent).type === EventType.RUN_ERROR,
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(runErrors).toHaveLength(1);
  expect(runErrors[0]?.payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Generation stream ended before RUN_FINISHED or RUN_ERROR',
  });

  teardown?.();
});

test('retries premature direct EOF before start without a terminal event', async () => {
  jest.clearAllMocks();
  let attempt = 0;
  const { send } = makeSelection(async (request) => {
    attempt++;
    const identity = getInputIdentity(request);
    return {
      events: (async function* () {
        if (attempt === 2) {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield { type: EventType.RUN_FINISHED, ...identity };
        }
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, 1],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Recovered',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  const runErrors = store.actions.filter(
    (action) =>
      action.type === apiActions.generateMessageEvent.type &&
      (action.payload as AGUIEvent).type === EventType.RUN_ERROR,
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(runErrors).toHaveLength(0);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toHaveLength(1);

  teardown?.();
});

test('rejects direct RUN_FINISHED before RUN_STARTED as a protocol error', async () => {
  jest.clearAllMocks();
  makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageEvent.type,
    ),
  ).toHaveLength(0);
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageError.type,
    )?.payload,
  ).toMatchObject({
    name: 'TransportError',
    code: 'PROTOCOL_ERROR',
    retryable: true,
  });

  teardown?.();
});

test('does not retry a direct finish-time parser error', async () => {
  jest.clearAllMocks();
  const parserError = new Error('Structured output is incomplete');
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
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
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageError.type,
    ),
  ).toEqual([apiActions.generateMessageError(parserError)]);

  teardown?.();
});

test('does not retry when direct RUN_FINISHED produces no message', async () => {
  jest.clearAllMocks();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 2]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    store.actions.find(
      (action) => action.type === apiActions.generateMessageError.type,
    )?.payload,
  ).toEqual(new Error('No message was generated'));

  teardown?.();
});

test('cancels a direct active run once without retrying and disposes', async () => {
  jest.clearAllMocks();
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const dispose = jest.fn();
  const { send } = makeSelection(async (request) => {
    const identity = getInputIdentity(request);

    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        notifyStarted();
        await new Promise<void>((resolve) => {
          if (request.signal.aborted) {
            resolve();
            return;
          }
          request.signal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
      })(),
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
  await started;
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  const runErrors = store.actions.filter(
    (action) =>
      action.type === apiActions.generateMessageEvent.type &&
      (action.payload as AGUIEvent).type === EventType.RUN_ERROR,
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(runErrors).toHaveLength(1);
  expect(runErrors[0]?.payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Generation cancelled',
  });
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('cancels a direct run before start without a terminal event and disposes', async () => {
  jest.clearAllMocks();
  let notifyWaiting: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => {
    notifyWaiting = resolve;
  });
  const dispose = jest.fn();
  const { send } = makeSelection(async ({ signal }) => ({
    events: {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            notifyWaiting();
            await new Promise<void>((resolve) => {
              if (signal.aborted) {
                resolve();
                return;
              }
              signal.addEventListener('abort', () => resolve(), {
                once: true,
              });
            });
            return { done: true as const, value: undefined };
          },
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
  await waiting;
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(send).toHaveBeenCalledTimes(1);
  expect(
    store.actions.filter(
      (action) => action.type === apiActions.generateMessageEvent.type,
    ),
  ).toHaveLength(0);
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('dispatches AG-UI lifecycle events and success on happy path', async () => {
  jest.clearAllMocks();
  const messageChunk: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Hello' },
        finishReason: 'stop',
      },
    ],
  };

  const frames = async function* () {
    yield { type: 'generation-start' as const };
    yield { type: 'generation-chunk' as const, chunk: messageChunk };
    yield { type: 'generation-finish' as const };
  };

  const dispose = jest.fn();
  const { send } = makeSelection(async () => ({
    frames: frames(),
    dispose,
  }));

  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Hello',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(send).toHaveBeenCalledTimes(1);
  expect(decodeFramesMock).toHaveBeenCalled();
  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageSuccess.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[1].payload).toMatchObject({
    type: EventType.RUN_STARTED,
    threadId: expect.any(String),
    runId: expect.any(String),
  });
  expect(store.actions[2].payload).toMatchObject({
    type: EventType.TEXT_MESSAGE_START,
    messageId: expect.any(String),
    role: 'assistant',
  });
  const runStarted = store.actions[1]?.payload as {
    threadId: string;
    runId: string;
  };
  const textStarted = store.actions[2]?.payload as { messageId: string };
  expect(store.actions[3].payload).toMatchObject({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: textStarted.messageId,
    delta: 'Hello',
  });
  expect(store.actions[4].payload).toMatchObject({
    type: EventType.TEXT_MESSAGE_END,
    messageId: textStarted.messageId,
  });
  expect(store.actions[5].payload).toMatchObject({
    type: EventType.RUN_FINISHED,
    threadId: runStarted.threadId,
    runId: runStarted.runId,
  });
  expect(store.actions[6].payload).toMatchObject({
    message: {
      role: 'assistant',
      content: 'Hello',
    },
    toolCalls: [],
  });
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('retries on retryable transport errors and eventually succeeds', async () => {
  jest.clearAllMocks();
  const retries = 1;

  let attempt = 0;
  const messageChunk: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Hi after retry' },
        finishReason: 'stop',
      },
    ],
  };

  const { send } = makeSelection(async () => {
    attempt++;
    if (attempt === 1) {
      return {
        frames: (async function* () {
          yield { type: 'generation-start' as const };
          throw new TransportError('temporary boom', { retryable: true });
        })(),
        dispose: jest.fn(),
      };
    }
    return {
      frames: (async function* () {
        yield { type: 'generation-start' as const };
        yield { type: 'generation-chunk' as const, chunk: messageChunk };
        yield { type: 'generation-finish' as const };
      })(),
      dispose: jest.fn(),
    };
  });

  const store = createTestStore(
    new Map<SelectorKey, unknown>([
      [selectRetries, retries],
      [
        selectRawStreamingMessage,
        {
          role: 'assistant',
          content: 'Hi after retry',
          toolCallIds: [],
        },
      ],
    ]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({
      message: { role: 'user', content: 'retry me' },
    }),
  );

  expect(send).toHaveBeenCalledTimes(2);
  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageError.type,
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageSuccess.type,
    apiActions.assistantTurnFinalized.type,
    apiActions.generateMessageExhaustedRetries.type,
  ]);
  expect(store.actions[2].payload).toMatchObject({
    type: EventType.RUN_ERROR,
    message: 'temporary boom',
  });
  expect(store.actions[7].payload).toMatchObject({
    type: EventType.TEXT_MESSAGE_CONTENT,
    delta: 'Hi after retry',
  });

  teardown?.();
});

test('dispatches exhausted retries after max retryable failures', async () => {
  jest.clearAllMocks();
  const retries = 1;
  const error = new Error('still broken');

  makeSelection(async () => {
    throw error;
  });

  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, retries]]),
  );
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'fail' } }),
  );

  expect(store.actions.map((a) => a.type)).toEqual([
    apiActions.generateMessageError.type,
    apiActions.generateMessageError.type,
    apiActions.assistantTurnFinalized.type,
    apiActions.generateMessageExhaustedRetries.type,
  ]);

  teardown?.();
});

test('converts generation error frames to AG-UI run errors', async () => {
  jest.clearAllMocks();
  const frames = async function* () {
    yield { type: 'generation-start' as const };
    yield {
      type: 'generation-error' as const,
      error: 'provider failed',
    };
  };
  makeSelection(async () => ({ frames: frames() }));
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageError.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[2].payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'provider failed',
  });

  teardown?.();
});

test('converts decode failures after run start to one AG-UI run error', async () => {
  jest.clearAllMocks();
  const frames = async function* () {
    yield { type: 'generation-start' as const };
    throw new Error('decode failed');
  };
  makeSelection(async () => ({ frames: frames() }));
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageError.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[2].payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'decode failed',
  });

  teardown?.();
});

test('converts premature stream completion to an AG-UI run error', async () => {
  jest.clearAllMocks();
  const frames = async function* () {
    yield { type: 'generation-start' as const };
  };
  makeSelection(async () => ({ frames: frames() }));
  const store = createTestStore();
  const teardown = generateMessage(store);

  await store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );

  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageError.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[2].payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Generation stream ended before generation-finish',
  });

  teardown?.();
});

test('terminates an active AG-UI run when generation is cancelled', async () => {
  jest.clearAllMocks();
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  makeSelection(async ({ signal }) => ({
    frames: (async function* () {
      notifyStarted();
      yield { type: 'generation-start' as const };
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });
    })(),
  }));
  const store = createTestStore();
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  await started;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  const runStarted = store.actions[1]?.payload as {
    threadId: string;
    runId: string;
  };
  expect(store.actions[2].payload).toMatchObject({
    type: EventType.RUN_ERROR,
    message: 'Generation cancelled',
  });
  expect(runStarted).toMatchObject({
    threadId: expect.any(String),
    runId: expect.any(String),
  });

  teardown?.();
});

test('does not retry when decoding throws after generation is cancelled', async () => {
  jest.clearAllMocks();
  let notifyStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const { send } = makeSelection(async ({ signal }) => ({
    frames: (async function* () {
      notifyStarted();
      yield { type: 'generation-start' as const };
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });
      throw new Error('Stream ended with 3 leftover bytes');
    })(),
  }));
  const store = createTestStore(
    new Map<SelectorKey, unknown>([[selectRetries, 1]]),
  );
  const teardown = generateMessage(store);

  const generation = store.trigger(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  await started;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.trigger(devActions.stopMessageGeneration(true));
  await generation;

  expect(send).toHaveBeenCalledTimes(1);
  expect(store.actions.map((action) => action.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageEvent.type,
    apiActions.generateMessageEvent.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[2].payload).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Generation cancelled',
  });

  teardown?.();
});
