import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import OpenAI from 'openai';
import {
  type OpenAIHashbrownRunAgentInput,
  type OpenAITextStreamOptions,
  text,
} from './text.fn';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk;

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

function chunk(
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
): Chunk {
  return {
    id: 'completion-chunk',
    choices: [
      {
        index: 0,
        delta,
        finish_reason: null,
        logprobs: null,
      },
    ],
    created: 0,
    model: 'gpt-test',
    object: 'chat.completion.chunk',
  };
}

function createProviderStream(chunks: readonly Chunk[], sourceError?: Error) {
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
        async next(): Promise<IteratorResult<Chunk>> {
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

function mockProvider(chunks: readonly Chunk[] = [], sourceError?: Error) {
  MockedOpenAI.mockReset();
  const providerStream = createProviderStream(chunks, sourceError);
  const stream = jest.fn().mockReturnValue(providerStream.stream);
  MockedOpenAI.mockImplementation(() => ({
    chat: { completions: { stream } },
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

test('isolates frozen schemas from a mutating transform and omits reasoning', async () => {
  const provider = mockProvider();
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
    }),
  );
  const inputSnapshot = structuredClone(input);
  let capturedOptions:
    OpenAI.Chat.ChatCompletionCreateParamsStreaming | undefined;

  const events = await collectEvents(
    createOptions({
      input,
      transformRequestOptions: (options) => {
        capturedOptions = options;
        const tool = options.tools?.[0];
        if (tool?.type !== 'function') {
          throw new Error('Expected a function tool.');
        }
        const toolParameters = tool.function.parameters as {
          properties: { query: { description: string } };
        };
        const responseFormat = options.response_format;
        if (responseFormat?.type !== 'json_schema') {
          throw new Error('Expected native JSON schema response format.');
        }
        const responseSchema = responseFormat.json_schema.schema as {
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
  expect(capturedOptions?.messages).toEqual([
    { role: 'user', content: 'Use the schema.' },
    { role: 'assistant', content: 'Prior answer.' },
  ]);
  expect(JSON.stringify(capturedOptions)).not.toContain('private reasoning');
  expect(JSON.stringify(capturedOptions)).not.toContain('private signature');
  expect(JSON.stringify(capturedOptions)).not.toContain('private trace');
  const capturedTool = capturedOptions?.tools?.[0];
  expect(capturedTool?.type).toBe('function');
  if (capturedTool?.type !== 'function') {
    throw new Error('Expected a captured function tool.');
  }
  expect(
    (
      capturedTool.function.parameters as {
        properties: { query: { description: string } };
      }
    ).properties.query.description,
  ).toBe('Mutated tool field.');
  expect(input.tools[0]?.parameters).toEqual(
    inputSnapshot.tools[0]?.parameters,
  );
  expect(input.hashbrown?.responseSchema).toEqual(
    inputSnapshot.hashbrown?.responseSchema,
  );
  expect(provider.create).toHaveBeenCalledTimes(1);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});

test('streams refusal fragments through one assistant text lifecycle', async () => {
  const provider = mockProvider([
    chunk({ refusal: 'I cannot' }),
    chunk({ refusal: ' help with that.' }),
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

test('cancellation after content emits no synthetic lifecycle ends', async () => {
  const provider = mockProvider([
    chunk({ content: 'First fragment.' }),
    chunk({ content: 'Second fragment.' }),
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
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_END }),
      expect.objectContaining({ type: EventType.TOOL_CALL_END }),
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
  expect(provider.abort).toHaveBeenCalledTimes(1);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('consumer return aborts an active provider stream', async () => {
  const provider = mockProvider([chunk({ content: 'First fragment.' })]);
  const iterator = text(createOptions())[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.next();
  const returned = await iterator.return?.();

  expect(returned).toEqual({ done: true, value: undefined });
  expect(provider.abort).toHaveBeenCalledTimes(1);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('incomplete tool metadata produces one RUN_ERROR without synthetic ends', async () => {
  const provider = mockProvider([
    chunk({
      tool_calls: [
        {
          index: 0,
          function: { arguments: '{"query":"hashbrown"}' },
        },
      ],
    }),
  ]);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    {
      type: EventType.RUN_ERROR,
      message: 'OpenAI returned incomplete metadata for tool call at index 0',
    },
  ]);
  expect(provider.abort).toHaveBeenCalledTimes(1);
});
