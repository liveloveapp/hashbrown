import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { text } from './text.fn';
import type {
  GoogleHashbrownRunAgentInput,
  GoogleTextStreamOptions,
} from './types';

jest.mock('@google/genai', () => {
  const actual =
    jest.requireActual<typeof import('@google/genai')>('@google/genai');
  return { ...actual, GoogleGenAI: jest.fn() };
});

const MockedGoogleGenAI = jest.mocked(GoogleGenAI);

function createInput(): GoogleHashbrownRunAgentInput {
  return {
    threadId: 'thread-google',
    runId: 'run-google',
    messages: [{ id: 'user-google', role: 'user', content: 'Hello.' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function createOptions(
  overrides: Partial<GoogleTextStreamOptions> = {},
): GoogleTextStreamOptions {
  return {
    apiKey: 'test-api-key',
    model: 'gemini-3-flash',
    input: createInput(),
    ...overrides,
  } as GoogleTextStreamOptions;
}

function mockProvider(
  responses: GenerateContentResponse[],
  sourceError?: Error,
) {
  MockedGoogleGenAI.mockReset();
  let index = 0;
  const iteratorReturn = jest.fn(
    async (): Promise<IteratorResult<GenerateContentResponse>> => ({
      done: true,
      value: undefined,
    }),
  );
  const provider = {
    async next(): Promise<IteratorResult<GenerateContentResponse>> {
      const value = responses[index];
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
  } as unknown as AsyncGenerator<GenerateContentResponse>;
  const generateContentStream = jest.fn().mockResolvedValue(provider);
  MockedGoogleGenAI.mockImplementation(
    () => ({ models: { generateContentStream } }) as unknown as GoogleGenAI,
  );

  return { generateContentStream, iteratorReturn };
}

async function collectEvents(
  options: GoogleTextStreamOptions,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of text(options)) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('streams canonical AG-UI run and text events from Google', async () => {
  const provider = mockProvider([
    {
      candidates: [
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'Hello from Google.' }] },
          finishReason: 'STOP',
        },
      ],
    } as GenerateContentResponse,
  ]);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-google',
      runId: 'run-google',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-google:assistant',
      role: 'assistant',
      metadata: {
        google: {
          responseId: 'run-google:assistant:response',
          chunkIndex: 0,
          partIndex: 0,
          nativePart: { text: 'Hello from Google.' },
        },
      },
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-google:assistant',
      delta: 'Hello from Google.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-google:assistant',
    },
    {
      type: EventType.CUSTOM,
      name: 'hashbrown.provider-history',
      value: {
        v: 1,
        provider: 'google',
        responseId: 'run-google:assistant:response',
        ownerMessageId: 'run-google:assistant',
        complete: true,
        payload: {
          contents: [
            { role: 'model', parts: [{ text: 'Hello from Google.' }] },
          ],
          representedMessageIds: ['run-google:assistant'],
        },
      },
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-google',
      runId: 'run-google',
      metadata: {
        hashbrown: { finishReason: 'stop' },
        google: { finishReason: 'STOP' },
      },
    },
  ]);
  expect(MockedGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
  expect(provider.generateContentStream).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gemini-3-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello.' }] }],
    }),
  );
});

test('cancellation after content closes the Google stream once without synthetic ends', async () => {
  const provider = mockProvider([
    {
      candidates: [
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'First fragment.' }] },
        },
      ],
    } as GenerateContentResponse,
    {
      candidates: [
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'Second fragment.' }] },
        },
      ],
    } as GenerateContentResponse,
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
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('maps a Google source rejection to one RUN_ERROR and cleans up', async () => {
  const provider = mockProvider([], new Error('Google source failed'));

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-google',
      runId: 'run-google',
    },
    { type: EventType.RUN_ERROR, message: 'Google source failed' },
  ]);
  expect(provider.iteratorReturn).toHaveBeenCalledTimes(1);
});

test('maps transform rejection to one RUN_ERROR without creating a provider', async () => {
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
      threadId: 'thread-google',
      runId: 'run-google',
    },
    { type: EventType.RUN_ERROR, message: 'Transform rejected request' },
  ]);
  expect(MockedGoogleGenAI).not.toHaveBeenCalled();
  expect(provider.generateContentStream).not.toHaveBeenCalled();
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
      threadId: 'thread-google',
      runId: 'run-google',
    },
  ]);
  expect(MockedGoogleGenAI).not.toHaveBeenCalled();
  expect(provider.generateContentStream).not.toHaveBeenCalled();
});

test('creates the Google SDK client with Vertex AI authentication', async () => {
  const provider = mockProvider([]);

  await collectEvents(
    createOptions({
      apiKey: undefined,
      vertexai: true,
      project: 'google-project',
      location: 'us-central1',
    }),
  );

  expect(MockedGoogleGenAI).toHaveBeenCalledWith({
    vertexai: true,
    project: 'google-project',
    location: 'us-central1',
  });
  expect(provider.generateContentStream).toHaveBeenCalledTimes(1);
});

function finished(metadata: Record<string, unknown>, usage?: unknown[]) {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-google',
    runId: 'run-google',
    ...(usage ? { usage } : {}),
    metadata,
  };
}

function textChunk(
  text: string,
  extra: Partial<GenerateContentResponse> = {},
  candidate: Record<string, unknown> = {},
): GenerateContentResponse {
  return {
    candidates: [
      {
        index: 0,
        content: { role: 'model', parts: [{ text }] },
        ...candidate,
      },
    ],
    ...extra,
  } as GenerateContentResponse;
}

test('ends a stopped run with the last chunk usage and a stop reason', async () => {
  mockProvider([
    textChunk('Hello', {
      modelVersion: 'gemini-test-2026',
      usageMetadata: { promptTokenCount: 1, totalTokenCount: 1 },
    } as Partial<GenerateContentResponse>),
    textChunk(
      ' there.',
      {
        modelVersion: 'gemini-test-2026',
        usageMetadata: {
          promptTokenCount: 100,
          cachedContentTokenCount: 60,
          toolUsePromptTokenCount: 20,
          candidatesTokenCount: 30,
          thoughtsTokenCount: 50,
          totalTokenCount: 200,
        },
      } as Partial<GenerateContentResponse>,
      { finishReason: 'STOP' },
    ),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished(
      {
        hashbrown: { finishReason: 'stop' },
        google: { finishReason: 'STOP' },
      },
      [
        {
          provider: 'google',
          model: 'gemini-test-2026',
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
          reasoningTokens: 50,
          cachedInputTokens: 60,
        },
      ],
    ),
  );
});

test('reports tool_calls when a STOP response called a function', async () => {
  mockProvider([
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'lookup', args: {} } }],
          },
          finishReason: 'STOP',
        },
      ],
    } as GenerateContentResponse,
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'tool_calls' },
      google: { finishReason: 'STOP' },
    }),
  );
});

test('reports tool_calls for a FUNCTION_CALL finish reason', async () => {
  mockProvider([
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'lookup', args: {} } }],
          },
          finishReason: 'FUNCTION_CALL',
        },
      ],
    } as unknown as GenerateContentResponse,
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'tool_calls' },
      google: { finishReason: 'FUNCTION_CALL' },
    }),
  );
});

test('reports length when the answer hit MAX_TOKENS', async () => {
  mockProvider([textChunk('Cut', {}, { finishReason: 'MAX_TOKENS' })]);

  const events = await collectEvents(createOptions());

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.CUSTOM,
    EventType.RUN_FINISHED,
  ]);
  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'length' },
      google: { finishReason: 'MAX_TOKENS' },
    }),
  );
});

test.each([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
])('reports content_filter for the %s finish reason', async (reason) => {
  mockProvider([
    textChunk(
      'Partial',
      {},
      { finishReason: reason, finishMessage: 'Filtered.' },
    ),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'content_filter' },
      google: { finishReason: reason, finishMessage: 'Filtered.' },
    }),
  );
});

test('reports content_filter when the prompt was blocked', async () => {
  mockProvider([
    {
      promptFeedback: { blockReason: 'SAFETY' },
      modelVersion: 'gemini-test-2026',
      usageMetadata: { promptTokenCount: 12, totalTokenCount: 12 },
    } as GenerateContentResponse,
  ]);

  const events = await collectEvents(createOptions());

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-google',
      runId: 'run-google',
    },
    finished(
      {
        hashbrown: { finishReason: 'content_filter' },
        google: { blockReason: 'SAFETY' },
      },
      [
        {
          provider: 'google',
          model: 'gemini-test-2026',
          inputTokens: 12,
          totalTokens: 12,
        },
      ],
    ),
  ]);
});

test.each([
  'MALFORMED_FUNCTION_CALL',
  'LANGUAGE',
  'OTHER',
  'FINISH_REASON_UNSPECIFIED',
  'UNEXPECTED_TOOL_CALL',
  'SOMETHING_NEW',
])('reports other for the %s finish reason', async (reason) => {
  mockProvider([textChunk('Hmm', {}, { finishReason: reason })]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'other' },
      google: { finishReason: reason },
    }),
  );
});

test('omits usage when Google reports no token counts', async () => {
  mockProvider([
    textChunk(
      'Hi',
      { modelVersion: 'gemini-test-2026', usageMetadata: {} },
      { finishReason: 'STOP' },
    ),
  ]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'stop' },
      google: { finishReason: 'STOP' },
    }),
  );
});

test('reports other when the stream ends without a finish reason', async () => {
  mockProvider([textChunk('Hi')]);

  const events = await collectEvents(createOptions());

  expect(events.at(-1)).toEqual(
    finished({ hashbrown: { finishReason: 'other' } }),
  );
});

test('validates unsupported transformed Vertex options before invoking Google', async () => {
  const provider = mockProvider([]);

  const events = await collectEvents(
    createOptions({
      apiKey: undefined,
      vertexai: true,
      project: 'p',
      location: 'global',
      transformRequestOptions: (request) => ({
        ...request,
        config: {
          ...request.config,
          toolConfig: { includeServerSideToolInvocations: true },
        },
      }),
    }),
  );

  expect(events).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringContaining('Vertex'),
    }),
  ]);
  expect(provider.generateContentStream).not.toHaveBeenCalled();
});

test('passes built-in defaults through the request transform', async () => {
  const provider = mockProvider([]);
  const transformRequestOptions = jest.fn((request) => ({
    ...request,
    config: { ...request.config, temperature: 0.25 },
  }));

  await collectEvents(
    createOptions({
      builtInTools: { webSearch: true },
      transformRequestOptions,
    }),
  );

  expect(transformRequestOptions).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
      }),
    }),
  );
  expect(provider.generateContentStream).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ temperature: 0.25 }),
    }),
  );
});
