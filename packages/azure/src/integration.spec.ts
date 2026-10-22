import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  runProviderAGUIWithAimock,
  startAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import OpenAI from 'openai';
import { type ActivityCallback, HashbrownAzure } from './index';
import { historyFromEvents } from './testing/history-from-events';
import type {
  AzureBuiltInTools,
  AzureHashbrownRunAgentInput,
} from './stream/types';

// AzureOpenAI without a `deployment` posts to
// `{endpoint}/openai/responses?api-version=…`. aimock serves that route with
// its OpenAI Responses handler and, when recording, forwards it unchanged to
// AZURE_ENDPOINT, so Azure recordings are saved as
// `tools/testing/aimock/fixtures/recorded/<slug>/openai.json`. Recorded test
// names start with "Azure OpenAI" so their slugs start with `azure-`, which
// keeps them apart from OpenAI's. Re-record with `npx nx record-fixtures azure`.
// Recorded cases assert structure only, so a re-record still passes.

/** Non-reasoning deployment on the recording resource. */
const AZURE_MODEL = 'gpt-4.1-mini';
/** Reasoning deployment on the recording resource. */
const AZURE_REASONING_MODEL = 'gpt-5-mini';
const AZURE_API_VERSION = '2025-04-01-preview';
const RECORDED_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 300;
const MAX_REASONING_OUTPUT_TOKENS = 4_000;

const LOOKUP_TOOL = {
  name: 'lookup',
  description: 'Looks up a short fact about a code word.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
};

function fixturePath(name: string): string {
  return resolve(__dirname, '../../../tools/testing/aimock/fixtures', name);
}

const OFFLINE_ENDPOINT = 'https://example.openai.azure.com';

function aimockClientOptions(endpoint: string) {
  return {
    apiKey: 'test-not-used',
    endpoint,
    apiVersion: AZURE_API_VERSION,
  };
}

function baseInput(userMessage: string): AzureHashbrownRunAgentInput {
  return {
    threadId: 'thread-azure',
    runId: 'run-azure',
    messages: [
      {
        id: 'system-azure',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      {
        id: 'user-azure',
        role: 'user',
        content: userMessage,
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function runFixture(
  fixtureName: string,
  input: AzureHashbrownRunAgentInput,
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: AZURE_MODEL,
        input,
        signal,
      }),
  });
}

interface RecordedRunOptions {
  readonly model?: string;
  readonly builtInTools?: AzureBuiltInTools;
  readonly transformRequestOptions?: (
    options: OpenAI.Responses.ResponseCreateParamsStreaming,
  ) => OpenAI.Responses.ResponseCreateParamsStreaming;
}

type RecordedRun = (
  input: AzureHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from AZURE_ENDPOINT with `AIMOCK_RECORD=1`. The provider
 * builds its own AzureOpenAI client, so the `X-Test-Id` header that names the
 * recording is added to its requests by wrapping `fetch` for this test only.
 */
async function withRecording<T>(
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'openai',
    fileName: 'openai.json',
    upstream: process.env['AZURE_ENDPOINT'] ?? OFFLINE_ENDPOINT,
    chunkSize: replay.chunkSize,
  });
  const realFetch = globalThis.fetch;
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation((url, init) => {
      // `init.headers` replaces a Request's own headers, so merge both.
      const headers = new Headers(
        url instanceof Request ? url.headers : undefined,
      );
      new Headers(init?.headers).forEach((value, name) => {
        headers.set(name, value);
      });
      for (const [name, value] of Object.entries(recorded.headers)) {
        headers.set(name, value);
      }
      return realFetch(url, { ...init, headers });
    });
  const run: RecordedRun = (input, options = {}) => {
    const model = options.model ?? AZURE_MODEL;
    const reasoningModel = model === AZURE_REASONING_MODEL;

    return Array.fromAsync(
      HashbrownAzure.stream.text({
        // `summary: 'auto'` lets the deployment skip summaries on prompts it
        // finds easy, and a recording without one holds no reasoning at all.
        ...(reasoningModel ? { reasoning: { summary: 'detailed' } } : {}),
        clientOptions: {
          apiKey: recorded.apiKey(process.env['AZURE_API_KEY']),
          endpoint: recorded.aimock.url,
          apiVersion: AZURE_API_VERSION,
        },
        model,
        input,
        ...(options.builtInTools ? { builtInTools: options.builtInTools } : {}),
        transformRequestOptions: (request) => ({
          ...(options.transformRequestOptions?.(request) ?? request),
          max_output_tokens: reasoningModel
            ? MAX_REASONING_OUTPUT_TOKENS
            : MAX_OUTPUT_TOKENS,
        }),
      }),
      (event) => EventSchemas.parse(event),
    );
  };

  try {
    return await body(run);
  } finally {
    fetchSpy.mockRestore();
    await recorded.aimock.stop();
  }
}

function contentEvents(events: AGUIEvent[]) {
  return events.filter(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );
}

function streamedContent(events: AGUIEvent[]): string {
  return contentEvents(events)
    .map((event) => event.delta)
    .join('');
}

function eventTypes(events: readonly AGUIEvent[]): EventType[] {
  return events.map((event) => event.type);
}

/**
 * Asserts a run that started and finished for `input`, with no error, and
 * streamed one non-empty assistant text message.
 */
function expectCanonicalTextRun(
  events: AGUIEvent[],
  input: AzureHashbrownRunAgentInput,
): void {
  const messageId = `${input.runId}:assistant`;
  const textTypes = eventTypes(events).filter((type) =>
    [
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ].includes(type),
  );

  expect(eventTypes(events)).not.toContain(EventType.RUN_ERROR);
  expect(events[0]).toEqual({
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  });
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  });
  expect(textTypes[0]).toBe(EventType.TEXT_MESSAGE_START);
  expect(textTypes.at(-1)).toBe(EventType.TEXT_MESSAGE_END);
  expect(
    textTypes
      .slice(1, -1)
      .every((type) => type === EventType.TEXT_MESSAGE_CONTENT),
  ).toBe(true);
  expect(
    events.find((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toEqual({
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    metadata: {
      azure: {
        itemId: expect.any(String),
        reasoningItemIds: expect.any(Array),
      },
    },
  });
  expect(
    contentEvents(events).every((event) => event.messageId === messageId),
  ).toBe(true);
  expect(streamedContent(events).trim()).not.toBe('');
}

/**
 * Asserts a run that finished after calling `toolName` at least once, each
 * call with a complete lifecycle and JSON object arguments.
 */
function expectToolRound(
  events: AGUIEvent[],
  input: AzureHashbrownRunAgentInput,
  toolName: string,
): void {
  const starts = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START ? [event] : [],
  );

  expect(eventTypes(events)).not.toContain(EventType.RUN_ERROR);
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  });
  expect(starts.length).toBeGreaterThanOrEqual(1);
  for (const start of starts) {
    const args = events
      .flatMap((event) =>
        event.type === EventType.TOOL_CALL_ARGS &&
        event.toolCallId === start.toolCallId
          ? [event.delta]
          : [],
      )
      .join('');
    const endIndex = events.findIndex(
      (event) =>
        event.type === EventType.TOOL_CALL_END &&
        event.toolCallId === start.toolCallId,
    );

    expect(start).toMatchObject({
      toolCallName: toolName,
      parentMessageId: `${input.runId}:assistant`,
    });
    expect(JSON.parse(args)).toEqual({ query: expect.any(String) });
    expect(endIndex).toBeGreaterThan(events.indexOf(start));
  }
}

/**
 * Asserts that reasoning streamed before any text or tool call, as at least
 * one message with non-empty summary text and an encrypted value.
 */
function expectReasoning(events: AGUIEvent[]): void {
  const types = eventTypes(events);
  const firstReasoning = types.indexOf(EventType.REASONING_MESSAGE_START);
  const firstOutput = types.findIndex(
    (type) =>
      type === EventType.TEXT_MESSAGE_START ||
      type === EventType.TOOL_CALL_START,
  );

  expect(firstReasoning).toBeGreaterThan(0);
  expect(firstReasoning).toBeLessThan(firstOutput);
  expect(types).toContain(EventType.REASONING_MESSAGE_END);
  expect(
    events
      .flatMap((event) =>
        event.type === EventType.REASONING_MESSAGE_CONTENT ? [event.delta] : [],
      )
      .join('')
      .trim(),
  ).not.toBe('');
  expect(
    events.find((event) => event.type === EventType.REASONING_ENCRYPTED_VALUE),
  ).toMatchObject({ encryptedValue: expect.any(String) });
}

function lookupResult(): string {
  return JSON.stringify({ fact: 'The code word is blue.' });
}

const WEB_SEARCH_PROMPT =
  'Search the web for the current stable version of Node.js. Answer in one short sentence and cite your source.';

/**
 * Asserts one or more `web_search` calls that ran on the provider: each with
 * a running `b4.step` on its start and a completed step with at least one
 * query on its result. Returns the first call's id.
 *
 * aimock's recorder keeps only each search's query, so recorded cases cannot
 * replay sources or `url_citation` annotations; those are covered by the
 * live-captured event fixture in `openai-events.spec.ts`.
 */
function expectWebSearchStep(events: AGUIEvent[]): string {
  const starts = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START ? [event] : [],
  );

  expect(starts.length).toBeGreaterThanOrEqual(1);
  for (const start of starts) {
    const result = events.find(
      (event) =>
        event.type === EventType.TOOL_CALL_RESULT &&
        event.toolCallId === start.toolCallId,
    );

    expect(start).toMatchObject({
      toolCallName: 'web_search',
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'provider',
          builtin: 'web_search',
          status: 'running',
          label: expect.any(String),
        },
      },
    });
    expect(result).toMatchObject({
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'provider',
          builtin: 'web_search',
          status: 'completed',
          label: expect.stringMatching(/^Searched/),
          queries: expect.arrayContaining([expect.any(String)]),
        },
      },
    });
  }

  return starts[0]?.toolCallId ?? '';
}

/** Returns the provider's own result content for each call in `events`. */
function recordedResult(events: AGUIEvent[]) {
  return ({ id }: { readonly id: string }): string => {
    const result = events.find(
      (event) =>
        event.type === EventType.TOOL_CALL_RESULT && event.toolCallId === id,
    );
    return result?.type === EventType.TOOL_CALL_RESULT &&
      typeof result.content === 'string'
      ? result.content
      : '';
  };
}

test(
  'Azure OpenAI consumes AG-UI input and emits a canonical text run',
  async () => {
    const input = baseInput('Say good morning in four words.');

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI preserves streamed text across multiple AG-UI events',
  async () => {
    const input = baseInput('Write two short sentences about hash browns.');

    const events = await withRecording((run) => run(input), { chunkSize: 8 });

    expectCanonicalTextRun(events, input);
    expect(contentEvents(events).length).toBeGreaterThan(1);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI emits tool call lifecycles and continues after the tool result',
  async () => {
    const first = baseInput(
      "Use the lookup tool to look up the code word 'skillet', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: AzureHashbrownRunAgentInput = {
          ...first,
          runId: 'run-azure-2',
          messages: historyFromEvents(
            first.messages,
            first.runId,
            firstEvents,
            lookupResult,
          ),
        };
        return { firstEvents, second, secondEvents: await run(second) };
      },
    );

    expectToolRound(firstEvents, first, 'lookup');
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI maps the Hashbrown response schema to native structured output',
  async () => {
    const input = baseInput('Describe an onion as structured output.');
    const responseSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ok: { type: 'boolean' },
      },
      required: ['text', 'ok'],
      additionalProperties: false,
    };
    input.forwardedProps = { hashbrown: { responseSchema } };
    let capturedTextFormat: unknown;

    const events = await withRecording((run) =>
      run(input, {
        transformRequestOptions: (options) => {
          capturedTextFormat = options.text?.format;
          return options;
        },
      }),
    );

    expect(capturedTextFormat).toEqual({
      type: 'json_schema',
      name: 'schema',
      schema: responseSchema,
      strict: true,
    });
    expectCanonicalTextRun(events, input);
    expect(JSON.parse(streamedContent(events))).toEqual({
      text: expect.any(String),
      ok: expect.any(Boolean),
    });
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI completes a run from a full AG-UI history',
  async () => {
    const input = baseInput(
      'What colour is the code word? Answer in one word.',
    );
    input.tools = [LOOKUP_TOOL];
    const history: Message[] = [
      input.messages[0],
      {
        id: 'user-previous',
        role: 'user',
        content: "Look up the code word 'griddle'.",
      },
      {
        id: 'assistant-previous',
        role: 'assistant',
        toolCalls: [
          {
            id: 'call-previous',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"griddle"}' },
          },
        ],
      },
      {
        id: 'call-previous',
        role: 'tool',
        toolCallId: 'call-previous',
        content: lookupResult(),
      },
      {
        id: 'assistant-previous-answer',
        role: 'assistant',
        content: 'I looked up the code word.',
      },
      {
        id: 'reasoning-previous',
        role: 'reasoning',
        content: 'display-only reasoning',
      },
      {
        id: 'activity-previous',
        role: 'activity',
        activityType: 'progress',
        content: { label: 'display-only activity' },
      },
      input.messages[1],
    ];
    input.messages = history;

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI streams reasoning summaries and encrypted reasoning from a reasoning model',
  async () => {
    const input = baseInput(
      'Find the smallest positive integer that leaves remainder 2 when divided by 3, remainder 3 when divided by 5 and remainder 2 when divided by 7. Reply with the number only.',
    );

    const events = await withRecording((run) =>
      run(input, { model: AZURE_REASONING_MODEL }),
    );

    expectReasoning(events);
    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI replays reasoning across a tool round trip',
  async () => {
    const first = baseInput(
      'Find the number between 20 and 40 that leaves remainder 1 when divided by 4 and by 6 and is divisible by 5. Look that number up with the lookup tool, then answer in one short sentence.',
    );
    first.tools = [LOOKUP_TOOL];
    let capturedInput: OpenAI.Responses.ResponseCreateParamsStreaming['input'];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first, {
          model: AZURE_REASONING_MODEL,
        });
        const second: AzureHashbrownRunAgentInput = {
          ...first,
          runId: 'run-azure-2',
          messages: historyFromEvents(
            first.messages,
            first.runId,
            firstEvents,
            lookupResult,
          ),
        };
        const secondEvents = await run(second, {
          model: AZURE_REASONING_MODEL,
          transformRequestOptions: (options) => {
            capturedInput = options.input;
            return options;
          },
        });
        return { firstEvents, second, secondEvents };
      },
    );

    expectReasoning(firstEvents);
    expectToolRound(firstEvents, first, 'lookup');
    expect(second.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'reasoning',
      'assistant',
      'tool',
    ]);
    expect(Array.isArray(capturedInput) ? capturedInput : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          encrypted_content: expect.any(String),
        }),
        expect.objectContaining({ type: 'function_call', name: 'lookup' }),
        expect.objectContaining({ type: 'function_call_output' }),
      ]),
    );
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI web search streams a provider step with its query',
  async () => {
    const input = baseInput(WEB_SEARCH_PROMPT);

    const events = await withRecording((run) =>
      run(input, { builtInTools: { webSearch: true } }),
    );

    expectWebSearchStep(events);
    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Azure OpenAI web search follow-up replays the history without the provider call',
  async () => {
    const first = baseInput(WEB_SEARCH_PROMPT);
    let capturedInput: OpenAI.Responses.ResponseCreateParamsStreaming['input'];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first, {
          builtInTools: { webSearch: true },
        });
        const second: AzureHashbrownRunAgentInput = {
          ...first,
          runId: 'run-azure-2',
          messages: [
            ...historyFromEvents(
              first.messages,
              first.runId,
              firstEvents,
              recordedResult(firstEvents),
            ),
            {
              id: 'user-follow-up',
              role: 'user',
              content:
                'Without searching again, repeat that version number only.',
            },
          ],
        };
        const secondEvents = await run(second, {
          builtInTools: { webSearch: true },
          transformRequestOptions: (options) => {
            capturedInput = options.input;
            return options;
          },
        });
        return { firstEvents, second, secondEvents };
      },
    );

    const toolCallId = expectWebSearchStep(firstEvents);
    expect(second.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          toolCalls: expect.arrayContaining([
            expect.objectContaining({
              id: toolCallId,
              function: expect.objectContaining({ name: 'web_search' }),
            }),
          ]),
        }),
        expect.objectContaining({ role: 'tool', toolCallId }),
      ]),
    );
    expect(Array.isArray(capturedInput)).toBe(true);
    const replayed = Array.isArray(capturedInput) ? capturedInput : [];
    expect(replayed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'Without searching again, repeat that version number only.',
        }),
      ]),
    );
    expect(replayed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'function_call', name: 'web_search' }),
      ]),
    );
    expect(replayed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call_id: toolCallId }),
      ]),
    );
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

// Hand-written fixtures below: request shapes, provider errors, cancellation
// and activity ordering are Hashbrown behaviour, not model output.

test('Azure OpenAI maps complete AG-UI history without provider-specific wire keys', async () => {
  const input = baseInput('new question');
  input.messages = [
    input.messages[0],
    { id: 'user-previous', role: 'user', content: 'previous question' },
    {
      id: 'assistant-previous',
      role: 'assistant',
      toolCalls: [
        {
          id: 'call-previous',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"previous"}' },
        },
      ],
    },
    {
      id: 'call-previous',
      role: 'tool',
      toolCallId: 'call-previous',
      content: '{"answer":"previous result"}',
    },
    {
      id: 'reasoning-previous',
      role: 'reasoning',
      content: 'display-only reasoning',
    },
    {
      id: 'activity-previous',
      role: 'activity',
      activityType: 'progress',
      content: { label: 'display-only activity' },
    },
    input.messages[1],
  ];
  let capturedInput: OpenAI.Responses.ResponseCreateParamsStreaming['input'];

  await Array.fromAsync(
    HashbrownAzure.stream.text({
      clientOptions: aimockClientOptions(OFFLINE_ENDPOINT),
      model: AZURE_MODEL,
      input,
      transformRequestOptions: (options) => {
        capturedInput = options.input;
        throw new Error('stop after capture');
      },
    }),
    (event) => EventSchemas.parse(event),
  );

  expect(capturedInput).toEqual([
    { role: 'system', content: 'You are a deterministic test assistant.' },
    { role: 'user', content: 'previous question' },
    {
      type: 'function_call',
      call_id: 'call-previous',
      name: 'lookup',
      arguments: '{"query":"previous"}',
    },
    {
      type: 'function_call_output',
      call_id: 'call-previous',
      output: '{"answer":"previous result"}',
    },
    { role: 'user', content: 'new question' },
  ]);
});

test('transformRequestOptions receives Responses params sent to the Azure Responses route', async () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  let received: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

  try {
    const events = await runProviderAGUIWithAimock({
      fixturePath: fixturePath('text.json'),
      createStream: (aimock, signal) =>
        HashbrownAzure.stream.text({
          clientOptions: aimockClientOptions(aimock.url),
          model: AZURE_MODEL,
          input: baseInput('say hi briefly'),
          signal,
          transformRequestOptions: (options) => {
            received = options;
            return { ...options, max_output_tokens: 321 };
          },
        }),
    });
    const wireBodies = fetchSpy.mock.calls
      .filter(([url]) =>
        String(url).includes(
          `/openai/responses?api-version=${AZURE_API_VERSION}`,
        ),
      )
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(received).toMatchObject({ store: false, stream: true });
    expect(Array.isArray(received?.input)).toBe(true);
    expect(wireBodies).toHaveLength(1);
    expect(wireBodies[0]).toMatchObject({
      max_output_tokens: 321,
      store: false,
    });
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  } finally {
    fetchSpy.mockRestore();
  }
});

test('Azure OpenAI provider errors terminate the AG-UI run with RUN_ERROR', async () => {
  const events = await runFixture(
    'error.json',
    baseInput('return provider error'),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringContaining('Deterministic provider error'),
    }),
  ]);
});

test('Azure OpenAI cancellation stops iteration without emitting a terminal event', async () => {
  const controller = new AbortController();
  const input = baseInput('cancel before provider request');
  const events = HashbrownAzure.stream.text({
    clientOptions: aimockClientOptions(OFFLINE_ENDPOINT),
    model: AZURE_MODEL,
    input,
    signal: controller.signal,
  });
  const iterator = events[Symbol.asyncIterator]();

  const started = await iterator.next();
  controller.abort();
  const done = await iterator.next();

  expect(started).toEqual({
    done: false,
    value: {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
  });
  expect(done.done).toBe(true);
});

test('Azure OpenAI cancellation aborts an active provider stream without a terminal event', async () => {
  const aimock = await startAimock({
    fixturePath: fixturePath('streaming.json'),
  });
  const controller = new AbortController();
  const input = baseInput('stream deterministic text');
  const events = HashbrownAzure.stream.text({
    clientOptions: aimockClientOptions(aimock.url),
    model: AZURE_MODEL,
    input,
    signal: controller.signal,
  });
  const iterator = events[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: EventType.RUN_STARTED },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: EventType.TEXT_MESSAGE_START },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: EventType.TEXT_MESSAGE_CONTENT },
    });

    controller.abort();

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  } finally {
    controller.abort();
    await iterator.return?.();
    await aimock.stop();
  }
});

test('Azure OpenAI cancellation between message events stops the remaining lifecycle', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  const controller = new AbortController();
  const input = baseInput('say hi briefly');
  const events = HashbrownAzure.stream.text({
    clientOptions: aimockClientOptions(aimock.url),
    model: AZURE_MODEL,
    input,
    signal: controller.signal,
  });
  const iterator = events[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: EventType.RUN_STARTED },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: EventType.TEXT_MESSAGE_START },
    });

    controller.abort();

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  } finally {
    controller.abort();
    await iterator.return?.();
    await aimock.stop();
  }
});

test('Azure OpenAI cancellation after a message ends does not finish the run', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  const controller = new AbortController();
  const input = baseInput('say hi briefly');
  const events = HashbrownAzure.stream.text({
    clientOptions: aimockClientOptions(aimock.url),
    model: AZURE_MODEL,
    input,
    signal: controller.signal,
  });
  const iterator = events[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.RUN_STARTED },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.TEXT_MESSAGE_START },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.TEXT_MESSAGE_CONTENT },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.TEXT_MESSAGE_END },
    });

    controller.abort();

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  } finally {
    controller.abort();
    await iterator.return?.();
    await aimock.stop();
  }
});

test('Azure OpenAI sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: AZURE_MODEL,
        input: baseInput('say hi briefly'),
        signal,
        activities,
      }),
  });

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.ACTIVITY_SNAPSHOT,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.ACTIVITY_DELTA,
    EventType.RUN_FINISHED,
  ]);
  expect(events[1]).toEqual({
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: 'plan-1',
    activityType: 'plan',
    content: { status: 'running' },
    replace: true,
  });
  expect(events.at(-2)).toEqual({
    type: EventType.ACTIVITY_DELTA,
    messageId: 'plan-1',
    activityType: 'plan',
    patch: [{ op: 'replace', path: '/status', value: 'done' }],
  });
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-azure',
    runId: 'run-azure',
  });
});
