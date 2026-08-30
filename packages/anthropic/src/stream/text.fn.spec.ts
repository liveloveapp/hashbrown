import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import { text } from './text.fn';
import type {
  AnthropicHashbrownRunAgentInput,
  AnthropicTextStreamOptions,
} from './types';

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type RawEvent = Anthropic.Messages.RawMessageStreamEvent;
type RequestOptions = Anthropic.Messages.MessageCreateParamsStreaming;

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

const MockedAnthropic = Anthropic as unknown as jest.Mock;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createInput(
  overrides: Partial<AnthropicHashbrownRunAgentInput> = {},
): AnthropicHashbrownRunAgentInput {
  return {
    threadId: 'thread-anthropic',
    runId: 'run-anthropic',
    messages: [
      { id: 'user-anthropic', role: 'user', content: 'Hello, Claude.' },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...overrides,
  };
}

function createOptions(
  overrides: Partial<AnthropicTextStreamOptions> = {},
): AnthropicTextStreamOptions {
  return {
    apiKey: 'test-api-key',
    baseURL: 'https://anthropic.test',
    model: 'claude-server-model',
    input: createInput(),
    ...overrides,
  };
}

function completeTextEvents(textValue = 'Hello from Anthropic.'): RawEvent[] {
  return [
    {
      type: 'message_start',
      message: {
        id: 'provider-message',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-server-model',
        container: null,
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: {
          cache_creation: null,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          inference_geo: null,
          input_tokens: 1,
          output_tokens: 0,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: null,
        },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '', citations: null },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: textValue },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: {
        container: null,
        stop_details: null,
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        input_tokens: null,
        output_tokens: 4,
        output_tokens_details: null,
        server_tool_use: null,
      },
    },
    { type: 'message_stop' },
  ];
}

function createProviderStream(events: readonly RawEvent[]) {
  const abort = jest.fn();
  let index = 0;
  const stream = {
    controller: { abort },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<RawEvent>> {
          const value = events[index];
          index += 1;

          return value === undefined
            ? { done: true, value: undefined }
            : { done: false, value };
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          return { done: true, value: undefined };
        },
      };
    },
  };

  return { abort, stream };
}

function mockProvider(events: readonly RawEvent[] = completeTextEvents()) {
  MockedAnthropic.mockReset();
  const providerStream = createProviderStream(events);
  const create = jest.fn().mockResolvedValue(providerStream.stream);
  MockedAnthropic.mockImplementation(() => ({ messages: { create } }));

  return { ...providerStream, create };
}

async function collectEvents(
  options: AnthropicTextStreamOptions,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of text(options)) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('emits RUN_STARTED before mapping and maps mapping failures to RUN_ERROR', async () => {
  const provider = mockProvider();
  const input = createInput({
    messages: [
      {
        id: 'structured-user',
        role: 'user',
        content: [{ type: 'text', text: 'Structured user content.' }],
      },
    ],
  });

  const events = await collectEvents(createOptions({ input }));

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    {
      type: EventType.RUN_ERROR,
      message: 'Anthropic provider currently requires text user content',
    },
  ]);
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('returns only RUN_STARTED for a pre-aborted signal', async () => {
  const provider = mockProvider();
  const controller = new AbortController();
  const input = createInput({
    messages: [
      {
        id: 'structured-user',
        role: 'user',
        content: [{ type: 'text', text: 'Must not be mapped.' }],
      },
    ],
  });
  controller.abort();

  const events = await collectEvents(
    createOptions({ input, signal: controller.signal }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ]);
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('awaits a transform of the final mapped request before provider creation', async () => {
  const provider = mockProvider();
  const input = createInput();
  let receivedOptions: RequestOptions | undefined;
  const transformRequestOptions = jest.fn(
    async (options: RequestOptions): Promise<RequestOptions> => {
      receivedOptions = options;
      await Promise.resolve();

      return { ...options, max_tokens: 123, temperature: 0 };
    },
  );

  await collectEvents(createOptions({ input, transformRequestOptions }));

  expect(receivedOptions).toEqual({
    stream: true,
    model: 'claude-server-model',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'Hello, Claude.' }],
  });
  expect(MockedAnthropic).toHaveBeenCalledWith({
    apiKey: 'test-api-key',
    baseURL: 'https://anthropic.test',
  });
  expect(provider.create).toHaveBeenCalledWith(
    {
      ...receivedOptions,
      max_tokens: 123,
      temperature: 0,
    },
    { signal: undefined },
  );
});

test('maps transform rejection to exactly one RUN_ERROR without a provider request', async () => {
  const provider = mockProvider();
  const transformRequestOptions = jest
    .fn()
    .mockRejectedValue(new Error('Transform rejected request'));

  const events = await collectEvents(
    createOptions({ transformRequestOptions }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-anthropic',
      runId: 'run-anthropic',
    },
    {
      type: EventType.RUN_ERROR,
      message: 'Transform rejected request',
    },
  ]);
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('checks cancellation after yielding RUN_ERROR', async () => {
  const provider = mockProvider();
  let abortedReads = 0;
  const signal = {
    get aborted() {
      abortedReads += 1;
      return false;
    },
  } as AbortSignal;
  const iterator = text(
    createOptions({
      signal,
      transformRequestOptions: async () => {
        throw new Error('Transform rejected request');
      },
    }),
  )[Symbol.asyncIterator]();

  const started = await iterator.next();
  const errored = await iterator.next();
  const readsAfterError = abortedReads;
  const done = await iterator.next();

  expect(started.value).toMatchObject({ type: EventType.RUN_STARTED });
  expect(errored.value).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Transform rejected request',
  });
  expect(done).toEqual({ done: true, value: undefined });
  expect(abortedReads).toBe(readsAfterError + 1);
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('cancellation while an async transform is pending prevents provider creation', async () => {
  const provider = mockProvider();
  const controller = new AbortController();
  const deferred = createDeferred<RequestOptions>();
  const transformRequestOptions = jest.fn((options: RequestOptions) =>
    deferred.promise.then(() => options),
  );
  const iterator = text(
    createOptions({ signal: controller.signal, transformRequestOptions }),
  )[Symbol.asyncIterator]();

  const started = await iterator.next();
  const pending = iterator.next();
  await Promise.resolve();
  controller.abort();
  deferred.resolve({
    stream: true,
    model: 'unused',
    max_tokens: 1,
    messages: [],
  });
  const done = await pending;

  expect(started).toMatchObject({
    done: false,
    value: { type: EventType.RUN_STARTED },
  });
  expect(transformRequestOptions).toHaveBeenCalledTimes(1);
  expect(done).toEqual({ done: true, value: undefined });
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('cancellation immediately after transform prevents provider and terminal events', async () => {
  const provider = mockProvider();
  const controller = new AbortController();

  const events = await collectEvents(
    createOptions({
      signal: controller.signal,
      transformRequestOptions: (options) => {
        controller.abort();
        return options;
      },
    }),
  );

  expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED]);
  expect(MockedAnthropic).not.toHaveBeenCalled();
  expect(provider.create).not.toHaveBeenCalled();
});

test('maps a native structured-output provider rejection to exactly one RUN_ERROR', async () => {
  MockedAnthropic.mockReset();
  const create = jest.fn().mockRejectedValue(new Error('Provider unavailable'));
  MockedAnthropic.mockImplementation(() => ({ messages: { create } }));
  const input = createInput({
    hashbrown: {
      responseSchema: { type: 'object', properties: {} },
    },
  });

  const events = await collectEvents(createOptions({ input }));

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_ERROR,
  ]);
  expect(events[1]).toEqual({
    type: EventType.RUN_ERROR,
    message: 'Provider unavailable',
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      output_config: {
        format: {
          type: 'json_schema',
          schema: { type: 'object', properties: {} },
        },
      },
    }),
    { signal: undefined },
  );
});

test('emits canonical mapper events followed by one RUN_FINISHED', async () => {
  const provider = mockProvider();

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-anthropic',
      runId: 'run-anthropic',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-anthropic:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-anthropic:assistant',
      delta: 'Hello from Anthropic.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-anthropic:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-anthropic',
      runId: 'run-anthropic',
    },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('cancellation after mapper content suppresses later lifecycle events', async () => {
  const provider = mockProvider();
  const controller = new AbortController();
  const iterator = text(createOptions({ signal: controller.signal }))[
    Symbol.asyncIterator
  ]();
  const events: AGUIEvent[] = [];

  events.push(EventSchemas.parse((await iterator.next()).value));
  events.push(EventSchemas.parse((await iterator.next()).value));
  events.push(EventSchemas.parse((await iterator.next()).value));
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
      expect.objectContaining({ type: EventType.TOOL_CALL_END }),
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('aborts the raw provider stream after a protocol error', async () => {
  const provider = mockProvider([
    {
      type: 'message_start',
      message: {
        id: 'provider-message',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-server-model',
        container: null,
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: {
          cache_creation: null,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          inference_geo: null,
          input_tokens: 1,
          output_tokens: 0,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: null,
        },
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'invalid' },
    },
  ]);

  const events = await collectEvents(createOptions());

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_ERROR,
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('aborts the raw provider stream when the consumer returns early', async () => {
  const provider = mockProvider();
  const iterator = text(createOptions())[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.next();
  const returned = await iterator.return?.();

  expect(returned).toEqual({ done: true, value: undefined });
  expect(provider.abort).toHaveBeenCalledTimes(1);
});
