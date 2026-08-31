import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
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
      type: EventType.RUN_FINISHED,
      threadId: 'thread-google',
      runId: 'run-google',
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
