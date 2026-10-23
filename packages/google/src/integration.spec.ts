import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  type Content,
  type GenerateContentParameters,
  ThinkingLevel,
} from '@google/genai';
import {
  type AimockHandle,
  runProviderAGUIWithAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import { type ActivityCallback, HashbrownGoogle } from './index';
import type { GoogleHashbrownRunAgentInput } from './stream/types';

// The cheapest current Gemini (gemini-2.5-flash-lite is closed to new API
// keys). Gemini 3 cannot turn thinking off, so recorded cases think at the
// minimal level, without thought summaries.
const GOOGLE_MODEL = 'gemini-3.5-flash-lite';
// Recorded cases also run against gemini-4-argon. Its tests carry the model in
// their names, so each model has its own recordings; flash-lite's names, and
// so its recordings, are unchanged.
const ARGON_MODEL = 'gemini-4-argon';
const GOOGLE_UPSTREAM = 'https://generativelanguage.googleapis.com';
const GOOGLE_BASE_URL_ENV = 'HASHBROWN_GOOGLE_API_BASE_URL';

// Recorded cases replay `tools/testing/aimock/fixtures/recorded/<slug>/gemini.json`
// and re-record from the live API with `npx nx record-fixtures google`. They
// assert structure only, so a re-record with different wording still passes.
// Thought signatures may be missing from recordings, so nothing depends on them.
//
// Flash-lite's thinking cases stay on hand-written fixtures: recorded through
// aimock, neither gemini-3.5-flash-lite nor gemini-3.1-flash-lite streamed any
// thought part (with `includeThoughts: true` and thinkingLevel HIGH), although
// the same request body sent directly to the API returned thought summaries.
// gemini-4-argon does stream them, so its thinking cases are recorded.
const RECORDED_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 300;
const MAX_THINKING_OUTPUT_TOKENS = 2_000;

/** A model the recorded cases run against, and the suffix its test names carry. */
interface RecordedModel {
  readonly model: string;
  readonly suffix: string;
  /** The lowest thinking level the model accepts, used unless a case tests thinking. */
  readonly minimalThinking: ThinkingLevel;
}

const FLASH_LITE: RecordedModel = {
  model: GOOGLE_MODEL,
  suffix: '',
  minimalThinking: ThinkingLevel.MINIMAL,
};
// gemini-4-argon rejects thinking level MINIMAL.
const ARGON: RecordedModel = {
  model: ARGON_MODEL,
  suffix: ` with ${ARGON_MODEL}`,
  minimalThinking: ThinkingLevel.LOW,
};
const RECORDED_MODELS: readonly RecordedModel[] = [FLASH_LITE, ARGON];

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

function baseInput(userMessage: string): GoogleHashbrownRunAgentInput {
  return {
    threadId: 'thread-google',
    runId: 'run-google',
    messages: [
      {
        id: 'system-google',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      {
        id: 'user-google',
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

/**
 * Points the provider at `baseUrl` for the duration of `body`. The Google
 * provider reads its base URL from the environment when it builds a client.
 */
async function withGoogleBaseUrl<T>(
  baseUrl: string,
  body: () => Promise<T>,
): Promise<T> {
  const previousBaseUrl = process.env[GOOGLE_BASE_URL_ENV];
  process.env[GOOGLE_BASE_URL_ENV] = baseUrl;

  try {
    return await body();
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env[GOOGLE_BASE_URL_ENV];
    } else {
      process.env[GOOGLE_BASE_URL_ENV] = previousBaseUrl;
    }
  }
}

interface HandWrittenRunOptions {
  readonly activities?: ActivityCallback;
  readonly transformRequestOptions?: (
    options: GenerateContentParameters,
  ) => GenerateContentParameters;
}

/** Uses Node's native fetch transport across Jest's VM boundary. */
function withNativeFetch(
  request: GenerateContentParameters,
): GenerateContentParameters {
  // The SDK's default dispatcher reads Undici state from Jest's VM global,
  // while native fetch initializes that state on Node's host global.
  return {
    ...request,
    config: {
      ...request.config,
      httpOptions: {
        ...request.config?.httpOptions,
        fetch: request.config?.httpOptions?.fetch ?? globalThis.fetch,
      },
    },
  };
}

async function* googleTextWithAimock(
  aimock: AimockHandle,
  signal: AbortSignal,
  input: GoogleHashbrownRunAgentInput,
  options: HandWrittenRunOptions = {},
): AsyncIterable<AGUIEvent> {
  const previousBaseUrl = process.env[GOOGLE_BASE_URL_ENV];
  process.env[GOOGLE_BASE_URL_ENV] = aimock.url;

  try {
    yield* HashbrownGoogle.stream.text({
      apiKey: 'test-not-used',
      model: GOOGLE_MODEL,
      input,
      signal,
      activities: options.activities,
      transformRequestOptions: (request) =>
        withNativeFetch(options.transformRequestOptions?.(request) ?? request),
    });
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env[GOOGLE_BASE_URL_ENV];
    } else {
      process.env[GOOGLE_BASE_URL_ENV] = previousBaseUrl;
    }
  }
}

async function runFixture(
  fixtureName: string,
  input: GoogleHashbrownRunAgentInput,
  options: HandWrittenRunOptions & { readonly chunkSize?: number } = {},
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    chunkSize: options.chunkSize,
    createStream: (aimock, signal) =>
      googleTextWithAimock(aimock, signal, input, options),
  });
}

interface RecordedRunOptions {
  /** Request thought summaries instead of minimal thinking. */
  readonly thinking?: boolean;
  readonly transformRequestOptions?: (
    options: GenerateContentParameters,
  ) => GenerateContentParameters;
}

type RecordedRun = (
  input: GoogleHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from the live API with `AIMOCK_RECORD=1`. The provider
 * builds its own Gemini client, so the `X-Test-Id` header that names the
 * recording is added to its requests by wrapping `fetch` for this test only.
 */
async function withRecording<T>(
  target: RecordedModel,
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'gemini',
    upstream: GOOGLE_UPSTREAM,
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
  const run: RecordedRun = (input, options = {}) =>
    Array.fromAsync(
      HashbrownGoogle.stream.text({
        apiKey: recorded.apiKey(process.env['GOOGLE_API_KEY']),
        model: target.model,
        input,
        transformRequestOptions: (request) => {
          const transformed =
            options.transformRequestOptions?.(request) ?? request;

          return withNativeFetch({
            ...transformed,
            config: {
              ...transformed.config,
              ...(options.thinking
                ? {
                    maxOutputTokens: MAX_THINKING_OUTPUT_TOKENS,
                    thinkingConfig: {
                      thinkingLevel: ThinkingLevel.HIGH,
                      includeThoughts: true,
                    },
                  }
                : {
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    thinkingConfig: { thinkingLevel: target.minimalThinking },
                  }),
            },
          });
        },
      }),
      (event) => EventSchemas.parse(event),
    );

  try {
    return await withGoogleBaseUrl(recorded.aimock.url, () => body(run));
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
  input: GoogleHashbrownRunAgentInput,
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
  expectRunFinished(events.at(-1), input, 'stop');
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
  });
  expect(
    contentEvents(events).every((event) => event.messageId === messageId),
  ).toBe(true);
  expect(streamedContent(events).trim()).not.toBe('');
}

/**
 * Asserts the closing `RUN_FINISHED`: the normalized finish reason and a
 * usage entry. Replayed recordings carry aimock's synthesized stop reason and
 * usage, so only the shape is checked.
 */
function expectRunFinished(
  event: AGUIEvent | undefined,
  run: { readonly threadId: string; readonly runId: string },
  finishReason: 'stop' | 'tool_calls',
): void {
  expect(event).toMatchObject({
    type: EventType.RUN_FINISHED,
    threadId: run.threadId,
    runId: run.runId,
    metadata: { hashbrown: { finishReason } },
    usage: [
      expect.objectContaining({
        provider: 'google',
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      }),
    ],
  });
}

/**
 * Asserts a run that finished after calling `toolName` at least once, each
 * call with a complete lifecycle and JSON object arguments.
 */
function expectToolRound(
  events: AGUIEvent[],
  input: GoogleHashbrownRunAgentInput,
  toolName: string,
): void {
  const starts = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START ? [event] : [],
  );

  expect(eventTypes(events)).not.toContain(EventType.RUN_ERROR);
  expectRunFinished(events.at(-1), input, 'tool_calls');
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
 * Asserts that thought parts streamed before any text or tool call, as at
 * least one balanced reasoning message with non-empty summary text. Thought
 * signatures are not asserted: recordings may not carry them.
 */
function expectThoughts(events: AGUIEvent[]): void {
  const types = eventTypes(events);
  const firstReasoning = types.indexOf(EventType.REASONING_MESSAGE_START);
  const firstOutput = types.findIndex(
    (type) =>
      type === EventType.TEXT_MESSAGE_START ||
      type === EventType.TOOL_CALL_START,
  );

  expect(
    events.find((event) => event.type === EventType.REASONING_MESSAGE_START),
  ).toMatchObject({
    role: 'reasoning',
    metadata: { google: { thought: true } },
  });
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
}

/**
 * Builds the next run's AG-UI history from a run's events the way a client
 * would: one reasoning message per thought block, the assistant message with
 * its text and tool calls, then one tool result per call. Thought signatures
 * and Google markers are carried over whenever the run emitted them.
 */
function historyFromEvents(
  previous: readonly Message[],
  runId: string,
  events: readonly AGUIEvent[],
  toolResult: string,
): Message[] {
  const deltasFor = (type: EventType, id: string): string =>
    events
      .flatMap((event) =>
        event.type === type &&
        (('messageId' in event && event.messageId === id) ||
          ('toolCallId' in event && event.toolCallId === id)) &&
        'delta' in event
          ? [event.delta]
          : [],
      )
      .join('');
  const encryptedValueFor = (entityId: string): string | undefined => {
    const encrypted = events.findLast(
      (event) =>
        event.type === EventType.REASONING_ENCRYPTED_VALUE &&
        event.entityId === entityId,
    );
    return encrypted?.type === EventType.REASONING_ENCRYPTED_VALUE
      ? encrypted.encryptedValue
      : undefined;
  };
  const reasoning: Message[] = events.flatMap((event) => {
    if (event.type !== EventType.REASONING_MESSAGE_START) {
      return [];
    }
    const encryptedValue = encryptedValueFor(event.messageId);

    return [
      {
        id: event.messageId,
        role: 'reasoning',
        content: deltasFor(
          EventType.REASONING_MESSAGE_CONTENT,
          event.messageId,
        ),
        ...(encryptedValue === undefined ? {} : { encryptedValue }),
        metadata: event.metadata,
      },
    ];
  });
  const toolCalls = events.flatMap((event) => {
    if (event.type !== EventType.TOOL_CALL_START) {
      return [];
    }
    const encryptedValue = encryptedValueFor(event.toolCallId);

    return [
      {
        id: event.toolCallId,
        type: 'function' as const,
        function: {
          name: event.toolCallName,
          arguments: deltasFor(EventType.TOOL_CALL_ARGS, event.toolCallId),
        },
        ...(encryptedValue === undefined ? {} : { encryptedValue }),
        ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
      },
    ];
  });
  const text = streamedContent([...events]);
  const assistant: Message = {
    id: `${runId}:assistant`,
    role: 'assistant',
    ...(text ? { content: text } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
  const toolResults: Message[] = toolCalls.map((toolCall) => ({
    id: `${toolCall.id}:result`,
    role: 'tool',
    toolCallId: toolCall.id,
    content: toolResult,
  }));

  return [...previous, ...reasoning, assistant, ...toolResults];
}

function lookupResult(): string {
  return JSON.stringify({ fact: 'The code word is green.' });
}

for (const target of RECORDED_MODELS) {
  test(
    `Google consumes AG-UI input and emits a canonical text run${target.suffix}`,
    async () => {
      const input = baseInput('Say hello in three words.');

      const events = await withRecording(target, (run) => run(input));

      expectCanonicalTextRun(events, input);
    },
    RECORDED_TIMEOUT_MS,
  );

  test(
    `Google preserves streamed text across multiple AG-UI events${target.suffix}`,
    async () => {
      const input = baseInput('Write two short sentences about potatoes.');

      const events = await withRecording(target, (run) => run(input), {
        chunkSize: 8,
      });

      expectCanonicalTextRun(events, input);
      expect(contentEvents(events).length).toBeGreaterThan(1);
    },
    RECORDED_TIMEOUT_MS,
  );

  test(
    `Google emits tool call lifecycles and continues after the tool result${target.suffix}`,
    async () => {
      const first = baseInput(
        "Use the lookup tool to look up the code word 'hashbrown', then answer in one short sentence.",
      );
      first.tools = [LOOKUP_TOOL];

      const { firstEvents, second, secondEvents } = await withRecording(
        target,
        async (run) => {
          const firstEvents = await run(first);
          const second: GoogleHashbrownRunAgentInput = {
            ...first,
            runId: 'run-google-2',
            messages: historyFromEvents(
              first.messages,
              first.runId,
              firstEvents,
              lookupResult(),
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
    `Google maps the Hashbrown response schema to native structured output${target.suffix}`,
    async () => {
      const input = baseInput('Describe a potato as structured output.');
      const responseSchema = {
        type: 'object',
        properties: {
          text: { type: 'string' },
          ok: { type: 'boolean' },
        },
        required: ['text', 'ok'],
      };
      input.forwardedProps = { hashbrown: { responseSchema } };
      let capturedConfig: GenerateContentParameters['config'];

      const events = await withRecording(target, (run) =>
        run(input, {
          transformRequestOptions: (options) => {
            capturedConfig = options.config;
            return options;
          },
        }),
      );

      expect(capturedConfig).toEqual(
        expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema: responseSchema,
        }),
      );
      expectCanonicalTextRun(events, input);
      expect(JSON.parse(streamedContent(events))).toEqual({
        text: expect.any(String),
        ok: expect.any(Boolean),
      });
    },
    RECORDED_TIMEOUT_MS,
  );

  test(
    `Google completes a run from a full AG-UI history${target.suffix}`,
    async () => {
      const input = baseInput(
        'What colour is the code word? Answer in one word.',
      );
      input.tools = [LOOKUP_TOOL];
      input.messages = [
        input.messages[0],
        {
          id: 'developer-previous',
          role: 'developer',
          content: 'Keep answers short.',
        },
        {
          id: 'user-previous',
          role: 'user',
          content: "Look up the code word 'potato'.",
        },
        {
          id: 'assistant-previous',
          role: 'assistant',
          content: 'I will look it up.',
          toolCalls: [
            {
              id: 'call_previous',
              type: 'function',
              function: { name: 'lookup', arguments: '{"query":"potato"}' },
            },
          ],
        },
        {
          id: 'tool-previous',
          role: 'tool',
          toolCallId: 'call_previous',
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

      const events = await withRecording(target, (run) => run(input));

      expectCanonicalTextRun(events, input);
    },
    RECORDED_TIMEOUT_MS,
  );
}

// gemini-4-argon streamed its thought parts through aimock, so its thinking
// cases are recorded (flash-lite's stay hand-written, below).
test(
  `Google streams thought summaries before the answer with ${ARGON_MODEL}`,
  async () => {
    const input = baseInput(
      'Ann is older than Ben. Ben is older than Cy. Dee is younger than Cy but older than Eve. Who is the second youngest? Reply with the name only.',
    );

    const events = await withRecording(ARGON, (run) =>
      run(input, { thinking: true }),
    );

    expectThoughts(events);
    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  `Google replays thought parts before a tool call on continuation with ${ARGON_MODEL}`,
  async () => {
    const first = baseInput(
      'Ann is older than Ben. Ben is older than Cy. Dee is younger than Cy but older than Eve. Work out who is second youngest, look that name up with the lookup tool, then answer in one short sentence.',
    );
    first.tools = [LOOKUP_TOOL];
    let continuation: Content[] = [];

    const { firstEvents, second, secondEvents } = await withRecording(
      ARGON,
      async (run) => {
        const firstEvents = await run(first, { thinking: true });
        const second: GoogleHashbrownRunAgentInput = {
          ...first,
          runId: 'run-google-2',
          messages: historyFromEvents(
            first.messages,
            first.runId,
            firstEvents,
            lookupResult(),
          ),
        };
        const secondEvents = await run(second, {
          thinking: true,
          transformRequestOptions: (options) => {
            continuation = Array.isArray(options.contents)
              ? (options.contents as Content[])
              : [];
            return options;
          },
        });
        return { firstEvents, second, secondEvents };
      },
    );
    const replayedModel = continuation[1];

    expectThoughts(firstEvents);
    expectToolRound(firstEvents, first, 'lookup');
    expect(continuation.map((content) => content.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(replayedModel?.parts?.[0]).toMatchObject({
      text: expect.any(String),
      thought: true,
    });
    expect(replayedModel?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionCall: expect.objectContaining({ name: 'lookup' }),
        }),
      ]),
    );
    expect(continuation[2]?.parts).toEqual([
      expect.objectContaining({
        functionResponse: expect.objectContaining({ name: 'lookup' }),
      }),
    ]);
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

// Hand-written fixtures below: provider errors and activity ordering are
// Hashbrown behaviour, not model output, and thought parts could not be
// recorded through aimock (see the note at the top of this file).

test('Google streams thought summaries before the answer', async () => {
  const input = baseInput(
    'Ann is older than Ben. Ben is older than Cy. Dee is younger than Cy but older than Eve. Who is the second youngest? Reply with the name only.',
  );

  const events = await runFixture('google/reasoning-text.json', input, {
    chunkSize: 8,
  });

  expectThoughts(events);
  expectCanonicalTextRun(events, input);
});

test('Google replays thought parts before a tool call on continuation', async () => {
  const first = baseInput('reason before calling lookup');
  first.tools = [LOOKUP_TOOL];
  let continuation: Content[] = [];

  const firstEvents = await runFixture(
    'google/reasoning-tool-call.json',
    first,
    { chunkSize: 8 },
  );
  const second: GoogleHashbrownRunAgentInput = {
    ...first,
    runId: 'run-google-2',
    messages: historyFromEvents(
      first.messages,
      first.runId,
      firstEvents,
      lookupResult(),
    ),
  };
  const secondEvents = await runFixture(
    'google/reasoning-tool-call.json',
    second,
    {
      transformRequestOptions: (options) => {
        continuation = Array.isArray(options.contents)
          ? (options.contents as Content[])
          : [];
        return options;
      },
    },
  );
  const replayedModel = continuation[1];

  expectThoughts(firstEvents);
  expectToolRound(firstEvents, first, 'lookup');
  expect(second.messages.map((message) => message.role)).toEqual([
    'system',
    'user',
    'reasoning',
    'assistant',
    'tool',
  ]);
  expect(continuation.map((content) => content.role)).toEqual([
    'user',
    'model',
    'user',
  ]);
  expect(replayedModel?.parts?.[0]).toEqual({
    text: 'I need the lookup result.',
    thought: true,
  });
  expect(replayedModel?.parts?.[1]).toMatchObject({
    functionCall: {
      id: 'call_google_reasoning_fixture',
      name: 'lookup',
      args: { query: 'hashbrown' },
    },
  });
  expect(continuation[2]?.parts).toEqual([
    {
      functionResponse: {
        id: 'call_google_reasoning_fixture',
        name: 'lookup',
        response: { fact: 'The code word is green.' },
      },
    },
  ]);
  expectCanonicalTextRun(secondEvents, second);
});

test('Google provider errors emit a canonical run error', async () => {
  const input = baseInput('return provider error');

  const events = await runFixture('error.json', input);

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringContaining('Deterministic provider error'),
    }),
  ]);
});

test('Google sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      googleTextWithAimock(aimock, signal, baseInput('say hi briefly'), {
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
  expectRunFinished(
    events.at(-1),
    { threadId: 'thread-google', runId: 'run-google' },
    'stop',
  );
});
