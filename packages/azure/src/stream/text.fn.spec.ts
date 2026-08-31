import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import { text } from './text.fn';
import type {
  AzureHashbrownRunAgentInput,
  AzureTextStreamOptions,
} from './types';

jest.mock('openai', () => {
  const actual = jest.requireActual<typeof import('openai')>('openai');
  return { ...actual, AzureOpenAI: jest.fn() };
});

const MockedAzureOpenAI = jest.mocked(AzureOpenAI);

function createInput(): AzureHashbrownRunAgentInput {
  return {
    threadId: 'thread-azure',
    runId: 'run-azure',
    messages: [{ id: 'user-azure', role: 'user', content: 'Hello.' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function createOptions(
  overrides: Partial<AzureTextStreamOptions> = {},
): AzureTextStreamOptions {
  return {
    clientOptions: {
      apiKey: 'test-api-key',
      endpoint: 'https://example.openai.azure.com',
      apiVersion: '2025-01-01-preview',
      deployment: 'chat-deployment',
    },
    model: 'gpt-4.1',
    input: createInput(),
    ...overrides,
  };
}

function mockProvider(
  chunks: OpenAI.Chat.Completions.ChatCompletionChunk[],
  sourceError?: Error,
) {
  MockedAzureOpenAI.mockReset();
  let index = 0;
  const abort = jest.fn();
  const iteratorReturn = jest.fn(
    async (): Promise<
      IteratorResult<OpenAI.Chat.Completions.ChatCompletionChunk>
    > => ({ done: true, value: undefined }),
  );
  const provider = {
    abort,
    async next(): Promise<
      IteratorResult<OpenAI.Chat.Completions.ChatCompletionChunk>
    > {
      const value = chunks[index];
      index += 1;

      if (value === undefined && sourceError) {
        throw sourceError;
      }

      return value === undefined
        ? { done: true, value: undefined }
        : { done: false, value };
    },
    return: iteratorReturn,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  const stream = jest.fn().mockReturnValue(provider);
  MockedAzureOpenAI.mockImplementation(
    () => ({ chat: { completions: { stream } } }) as unknown as AzureOpenAI,
  );

  return { abort, iteratorReturn, stream };
}

async function collectEvents(
  options: AzureTextStreamOptions,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of text(options)) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('streams canonical AG-UI run and text events from Azure OpenAI', async () => {
  const provider = mockProvider([
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: { content: 'Hello from Azure.' },
          finish_reason: 'stop',
        },
      ],
    },
  ] as OpenAI.Chat.Completions.ChatCompletionChunk[]);
  const options = createOptions();

  const events = await collectEvents(options);

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-azure:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-azure:assistant',
      delta: 'Hello from Azure.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-azure:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
  ]);
  expect(MockedAzureOpenAI).toHaveBeenCalledWith(options.clientOptions);
  expect(provider.stream).toHaveBeenCalledWith(
    expect.objectContaining({
      stream: true,
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello.' }],
    }),
    { signal: undefined },
  );
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('maps an Azure source rejection to one RUN_ERROR and aborts the stream', async () => {
  const provider = mockProvider([], new Error('Azure source failed'));

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    { type: EventType.RUN_ERROR, message: 'Azure source failed' },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('maps incomplete Azure tool metadata to RUN_ERROR without terminal events', async () => {
  const provider = mockProvider([
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '{"query":"hashbrown"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
  ] as OpenAI.Chat.Completions.ChatCompletionChunk[]);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    {
      type: EventType.RUN_ERROR,
      message:
        'Azure OpenAI returned incomplete metadata for tool call at index 0',
    },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('maps transform rejection to one RUN_ERROR without creating a client', async () => {
  const provider = mockProvider([]);
  const transformRequestOptions = jest
    .fn()
    .mockRejectedValue(new Error('Transform rejected request'));

  const events = await collectEvents(
    createOptions({ transformRequestOptions }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    { type: EventType.RUN_ERROR, message: 'Transform rejected request' },
  ]);
  expect(MockedAzureOpenAI).not.toHaveBeenCalled();
  expect(provider.stream).not.toHaveBeenCalled();
});

test('returns only RUN_STARTED when the signal is already aborted', async () => {
  const provider = mockProvider([]);
  const controller = new AbortController();
  controller.abort();

  const events = await collectEvents(
    createOptions({ signal: controller.signal }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
  ]);
  expect(MockedAzureOpenAI).not.toHaveBeenCalled();
  expect(provider.stream).not.toHaveBeenCalled();
});

test('cancellation after content emits no synthetic lifecycle ends', async () => {
  const provider = mockProvider([
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: { content: 'First fragment.' },
          finish_reason: null,
        },
      ],
    },
  ] as OpenAI.Chat.Completions.ChatCompletionChunk[]);
  const controller = new AbortController();
  const iterator = text(createOptions({ signal: controller.signal }))[
    Symbol.asyncIterator
  ]();
  const events = [
    EventSchemas.parse((await iterator.next()).value),
    EventSchemas.parse((await iterator.next()).value),
    EventSchemas.parse((await iterator.next()).value),
  ];

  controller.abort();
  const done = await iterator.next();

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
  ]);
  expect(done).toEqual({ done: true, value: undefined });
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_END }),
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
  expect(provider.abort).toHaveBeenCalledTimes(1);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});
