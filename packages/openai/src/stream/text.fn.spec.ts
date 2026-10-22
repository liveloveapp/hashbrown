import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import OpenAI from 'openai';
import { text } from './text.fn';
import type {
  OpenAIHashbrownRunAgentInput,
  OpenAITextStreamOptions,
} from './types';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

const MockedOpenAI = OpenAI as unknown as jest.Mock;

function createInput(
  overrides: Partial<OpenAIHashbrownRunAgentInput> = {},
): OpenAIHashbrownRunAgentInput {
  return {
    threadId: 'thread-openai',
    runId: 'run-openai',
    messages: [{ id: 'user-openai', role: 'user', content: 'Hello.' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...overrides,
  };
}

function createOptions(
  overrides: Partial<OpenAITextStreamOptions> = {},
): OpenAITextStreamOptions {
  return {
    apiKey: 'test-api-key',
    baseURL: 'https://openai.test/v1',
    model: 'gpt-test',
    input: createInput(),
    ...overrides,
  };
}

function event(value: Record<string, unknown>): StreamEvent {
  return { sequence_number: 0, ...value } as unknown as StreamEvent;
}

function messageAdded(id: string): StreamEvent {
  return event({
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'message', id, role: 'assistant', content: [] },
  });
}

function textDelta(delta: string): StreamEvent {
  return event({
    type: 'response.output_text.delta',
    item_id: 'msg_1',
    output_index: 0,
    content_index: 0,
    delta,
  });
}

const completed = event({ type: 'response.completed', response: {} });

function createProviderStream(
  chunks: readonly StreamEvent[],
  sourceError?: Error,
) {
  const abort = jest.fn();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  let index = 0;
  const stream = {
    abort,
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamEvent>> {
          if (sourceError) {
            throw sourceError;
          }

          const value = chunks[index];
          index += 1;

          return value === undefined
            ? { done: true, value: undefined }
            : { done: false, value };
        },
        return: iteratorReturn,
      };
    },
  };

  return { abort, iteratorReturn, stream };
}

function mockProvider(
  chunks: readonly StreamEvent[] = [],
  sourceError?: Error,
) {
  MockedOpenAI.mockReset();
  const providerStream = createProviderStream(chunks, sourceError);
  const stream = jest.fn().mockReturnValue(providerStream.stream);
  MockedOpenAI.mockImplementation(() => ({
    responses: { stream },
  }));

  return { ...providerStream, create: stream };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

async function collectEvents(
  options: OpenAITextStreamOptions,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of text(options)) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('isolates frozen schemas from a mutating transform and omits foreign reasoning', async () => {
  const provider = mockProvider([completed]);
  const input = deepFreeze(
    createInput({
      messages: [
        { id: 'user-openai', role: 'user', content: 'Use the schema.' },
        {
          id: 'reasoning-openai',
          role: 'reasoning',
          content: 'private reasoning',
          encryptedValue: 'private signature',
          metadata: { provider: { trace: ['private trace'] } },
        },
        { id: 'assistant-openai', role: 'assistant', content: 'Prior answer.' },
      ],
      tools: [
        {
          name: 'lookup',
          description: 'Lookup a value.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Original tool field.' },
            },
            required: ['query'],
          },
        },
      ],
      forwardedProps: {
        hashbrown: {
          responseSchema: {
            type: 'object',
            properties: {
              answer: {
                type: 'string',
                description: 'Original response field.',
              },
            },
            required: ['answer'],
          },
        },
      },
    }),
  );
  const inputSnapshot = structuredClone(input);
  let capturedOptions:
    OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

  const events = await collectEvents(
    createOptions({
      input,
      transformRequestOptions: (options) => {
        capturedOptions = options;
        const tool = options.tools?.[0];
        if (tool?.type !== 'function') {
          throw new Error('Expected a function tool.');
        }
        const toolParameters = tool.parameters as {
          properties: { query: { description: string } };
        };
        const format = options.text?.format;
        if (format?.type !== 'json_schema') {
          throw new Error('Expected native JSON schema response format.');
        }
        const responseSchema = format.schema as {
          properties: { answer: { description: string } };
        };

        toolParameters.properties.query.description = 'Mutated tool field.';
        responseSchema.properties.answer.description =
          'Mutated response field.';
        return options;
      },
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
  expect(input).toEqual(inputSnapshot);
  expect(capturedOptions?.input).toEqual([
    { role: 'user', content: 'Use the schema.' },
    { role: 'assistant', content: 'Prior answer.' },
  ]);
  expect(JSON.stringify(capturedOptions)).not.toContain('private reasoning');
  expect(JSON.stringify(capturedOptions)).not.toContain('private signature');
  expect(JSON.stringify(capturedOptions)).not.toContain('private trace');
  expect(input.tools[0]?.parameters).toEqual(
    inputSnapshot.tools[0]?.parameters,
  );
  expect(input.forwardedProps?.hashbrown?.responseSchema).toEqual(
    inputSnapshot.forwardedProps?.hashbrown?.responseSchema,
  );
  expect(provider.create).toHaveBeenCalledTimes(1);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('streams refusal fragments through one assistant text lifecycle', async () => {
  const provider = mockProvider([
    messageAdded('msg_1'),
    event({
      type: 'response.refusal.delta',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      delta: 'I cannot',
    }),
    event({
      type: 'response.refusal.delta',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      delta: ' help with that.',
    }),
    completed,
  ]);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-openai:assistant',
      role: 'assistant',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-openai:assistant',
      delta: 'I cannot',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-openai:assistant',
      delta: ' help with that.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-openai:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-openai',
      runId: 'run-openai',
      metadata: { hashbrown: { finishReason: 'refusal' } },
    },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('maps a provider source rejection to one RUN_ERROR and cleans up', async () => {
  const sourceError = new Error('OpenAI source failed');
  const provider = mockProvider([], sourceError);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    { type: EventType.RUN_ERROR, message: 'OpenAI source failed' },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('a stream that ends before response.completed produces one RUN_ERROR', async () => {
  const provider = mockProvider([messageAdded('msg_1'), textDelta('Cut off.')]);

  const events = await collectEvents(createOptions());

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.RUN_ERROR,
  ]);
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_ERROR,
    message: 'OpenAI stream ended before response.completed',
  });
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('cancellation after content emits no synthetic lifecycle ends', async () => {
  const provider = mockProvider([
    messageAdded('msg_1'),
    textDelta('First fragment.'),
    textDelta('Second fragment.'),
    completed,
  ]);
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
  expect(provider.abort).toHaveBeenCalledTimes(1);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('consumer return aborts an active provider stream', async () => {
  const provider = mockProvider([
    messageAdded('msg_1'),
    textDelta('First fragment.'),
    completed,
  ]);
  const iterator = text(createOptions())[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.next();
  const returned = await iterator.return?.();

  expect(returned).toEqual({ done: true, value: undefined });
  expect(provider.abort).toHaveBeenCalledTimes(1);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('maps structured tool result content to one RUN_ERROR', async () => {
  const provider = mockProvider();
  const input = createInput({
    messages: [
      { id: 'user-openai', role: 'user', content: 'Look it up.' },
      {
        id: 'assistant-openai',
        role: 'assistant',
        toolCalls: [
          {
            id: 'call-openai',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      {
        id: 'tool-openai',
        role: 'tool',
        toolCallId: 'call-openai',
        content: [{ type: 'text', text: 'Structured result.' }],
      },
    ],
  });

  const events = await collectEvents(createOptions({ input }));

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    {
      type: EventType.RUN_ERROR,
      message: 'OpenAI provider currently requires text tool result content',
    },
  ]);
  expect(provider.create).not.toHaveBeenCalled();
});

test('reads the response schema from forwardedProps.hashbrown', async () => {
  mockProvider([completed]);
  const responseSchema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  };
  let capturedOptions:
    OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

  await collectEvents(
    createOptions({
      input: createInput({ forwardedProps: { hashbrown: { responseSchema } } }),
      transformRequestOptions: (options) => {
        capturedOptions = options;
        return options;
      },
    }),
  );

  expect(capturedOptions?.text).toEqual({
    format: {
      type: 'json_schema',
      name: 'schema',
      schema: responseSchema,
      strict: true,
    },
  });
});

test('ignores a top-level hashbrown key', async () => {
  mockProvider([completed]);
  const input = {
    ...createInput(),
    hashbrown: { responseSchema: { type: 'object' } },
  };
  let capturedOptions:
    OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

  await collectEvents(
    createOptions({
      input,
      transformRequestOptions: (options) => {
        capturedOptions = options;
        return options;
      },
    }),
  );

  expect(capturedOptions?.text).toBeUndefined();
});

test('sends reasoning for a reasoning model and omits it when disabled', async () => {
  mockProvider([completed]);
  const captured: OpenAI.Responses.ResponseCreateParamsStreaming[] = [];
  const capture = (options: OpenAI.Responses.ResponseCreateParamsStreaming) => {
    captured.push(options);
    return options;
  };

  await collectEvents(
    createOptions({ model: 'gpt-5-mini', transformRequestOptions: capture }),
  );
  await collectEvents(
    createOptions({
      model: 'gpt-5-mini',
      reasoning: false,
      transformRequestOptions: capture,
    }),
  );

  expect(captured[0]).toMatchObject({
    store: false,
    reasoning: { summary: 'auto' },
    include: ['reasoning.encrypted_content'],
  });
  expect(captured[1]?.reasoning).toBeUndefined();
});

test('passes builtInTools to the request', async () => {
  mockProvider([completed]);
  const captured: OpenAI.Responses.ResponseCreateParamsStreaming[] = [];
  const capture = (options: OpenAI.Responses.ResponseCreateParamsStreaming) => {
    captured.push(options);
    return options;
  };

  await collectEvents(
    createOptions({
      builtInTools: { webSearch: true },
      transformRequestOptions: capture,
    }),
  );

  expect(captured[0]).toMatchObject({
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
  });
});

function finished(metadata: Record<string, unknown>, usage?: unknown[]) {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-openai',
    runId: 'run-openai',
    ...(usage ? { usage } : {}),
    metadata,
  };
}

test('ends a completed run with its usage and a stop reason', async () => {
  mockProvider([
    messageAdded('msg_1'),
    textDelta('Hello.'),
    event({
      type: 'response.completed',
      response: {
        status: 'completed',
        model: 'gpt-test-2026',
        usage: {
          input_tokens: 120,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 40,
          output_tokens_details: { reasoning_tokens: 30 },
          total_tokens: 160,
        },
      },
    }),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished(
      {
        hashbrown: { finishReason: 'stop' },
        openai: { status: 'completed' },
      },
      [
        {
          provider: 'openai',
          model: 'gpt-test-2026',
          inputTokens: 120,
          outputTokens: 40,
          totalTokens: 160,
          reasoningTokens: 30,
          cachedInputTokens: 100,
        },
      ],
    ),
  );
});

test('reports tool_calls when the response called a function', async () => {
  mockProvider([
    event({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '',
      },
    }),
    event({
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{}',
      },
    }),
    event({ type: 'response.completed', response: { status: 'completed' } }),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'tool_calls' },
      openai: { status: 'completed' },
    }),
  );
});

test.each([
  { reason: 'max_output_tokens', finishReason: 'length' },
  { reason: 'content_filter', finishReason: 'content_filter' },
  { reason: 'something_new', finishReason: 'other' },
])(
  'finishes an incomplete response ($reason) with the partial answer and $finishReason',
  async ({ reason, finishReason }) => {
    mockProvider([
      messageAdded('msg_1'),
      textDelta('Cut off'),
      event({
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          incomplete_details: { reason },
          usage: { input_tokens: 10, output_tokens: 300, total_tokens: 310 },
        },
      }),
    ]);

    const events = await collectEvents(createOptions());

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events.at(-1)).toEqual(
      finished(
        {
          hashbrown: { finishReason },
          openai: { status: 'incomplete', incompleteReason: reason },
        },
        [
          {
            provider: 'openai',
            inputTokens: 10,
            outputTokens: 300,
            totalTokens: 310,
          },
        ],
      ),
    );
  },
);

test('reports a refusal when the model refused', async () => {
  mockProvider([
    messageAdded('msg_1'),
    event({
      type: 'response.refusal.delta',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      delta: 'I cannot help with that.',
    }),
    event({ type: 'response.completed', response: { status: 'completed' } }),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'refusal' },
      openai: { status: 'completed' },
    }),
  );
});
