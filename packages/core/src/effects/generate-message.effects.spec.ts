import { Chat } from '../models';
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

// In tests we don't care about selector input typing; loosen to avoid variance
type SelectorKey = (state: any) => unknown;
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

const ModelResolverMock = jest.mocked(ModelResolver);
const decodeFramesMock = jest.mocked(decodeFrames);

type MockTransportResponse = {
  frames?: AsyncIterable<unknown>;
  stream?: AsyncIterable<unknown>;
  dispose?: jest.Mock;
  metadata?: unknown;
};

function makeSelection(
  transportResponseFactory: () => Promise<MockTransportResponse>,
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

test('generateMessage dispatches start, chunk, success, and finalize on happy path', async () => {
  jest.clearAllMocks();
  const frames = async function* () {
    yield { type: 'response.created' as const, response: { id: 'resp-1' } };
    yield {
      type: 'response.output_text.delta' as const,
      itemId: 'item-1',
      outputIndex: 0,
      contentIndex: 0,
      delta: 'Hello',
    };
    yield {
      type: 'response.completed' as const,
      response: { id: 'resp-1' },
    };
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
  expect(store.actions.map((a) => a.type)).toEqual([
    apiActions.generateMessageStart.type,
    apiActions.generateMessageChunk.type,
    apiActions.generateMessageFinish.type,
    apiActions.generateMessageSuccess.type,
    apiActions.assistantTurnFinalized.type,
  ]);
  expect(store.actions[1].payload).toMatchObject({
    choices: [
      {
        delta: expect.objectContaining({
          content: 'Hello',
          role: 'assistant',
        }),
      },
    ],
  });
  expect(store.actions[3].payload).toMatchObject({
    message: {
      role: 'assistant',
      content: 'Hello',
    },
    toolCalls: [],
  });
  expect(dispose).toHaveBeenCalledTimes(1);

  teardown?.();
});

test('generateMessage retries on retryable transport errors and eventually succeeds', async () => {
  jest.clearAllMocks();
  const retries = 1;

  let attempt = 0;

  const { send } = makeSelection(async () => {
    attempt++;
    if (attempt === 1) {
      throw new TransportError('temporary boom', { retryable: true });
    }
    return {
      frames: (async function* () {
        yield {
          type: 'response.created' as const,
          response: { id: 'resp-2' },
        };
        yield {
          type: 'response.output_text.delta' as const,
          itemId: 'item-2',
          outputIndex: 0,
          contentIndex: 0,
          delta: 'Hi after retry',
        };
        yield {
          type: 'response.completed' as const,
          response: { id: 'resp-2' },
        };
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
  expect(store.actions.map((a) => a.type)).toEqual([
    apiActions.generateMessageError.type,
    apiActions.generateMessageStart.type,
    apiActions.generateMessageChunk.type,
    apiActions.generateMessageFinish.type,
    apiActions.generateMessageSuccess.type,
    apiActions.assistantTurnFinalized.type,
    apiActions.generateMessageExhaustedRetries.type,
  ]);
  const chunkPayload = (store.actions[2].payload ??
    {}) as Chat.Api.CompletionChunk;
  expect(chunkPayload.choices[0]?.delta?.content).toBe('Hi after retry');

  teardown?.();
});

test('generateMessage dispatches exhausted retries after max retryable failures', async () => {
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
