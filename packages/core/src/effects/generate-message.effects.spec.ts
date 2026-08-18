import { EventType } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import { apiActions, devActions } from '../actions';
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
  selectTransport,
  selectUiRequested,
} from '../reducers';
import { decodeFrames } from '../frames/decode-frames';
import { ModelResolver, TransportError } from '../transport';
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

type MockTransportResponse = {
  frames?: AsyncIterable<unknown>;
  stream?: AsyncIterable<unknown>;
  dispose?: jest.Mock;
  metadata?: unknown;
};

function makeSelection(
  transportResponseFactory: (request: {
    signal: AbortSignal;
  }) => Promise<MockTransportResponse>,
) {
  const send = jest.fn().mockImplementation(transportResponseFactory);
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
  return { send, selection };
}

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
