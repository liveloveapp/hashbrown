import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  GENERATIVE_UI_PROMPT,
  generativeUiResponseSchema,
  parseGenerativeUi,
  runProviderAGUIWithAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import { type ChatRequest, Ollama } from 'ollama';
import {
  type ActivityCallback,
  HashbrownOllama,
  type OllamaHashbrownRunAgentInput,
} from './index';

// Recorded cases replay `tools/testing/aimock/fixtures/recorded/<slug>/ollama.json`
// and re-record from a local Ollama server (OLLAMA_HOST, OLLAMA_MODEL in the
// developer .env) with `npx nx record-fixtures ollama`. They assert structure
// only, so a re-record with different wording still passes. Recordings match
// on the model name, so re-recording with another OLLAMA_MODEL means updating
// RECORDED_OLLAMA_MODEL too.
const RECORDED_OLLAMA_MODEL = 'qwen2.5:14b';
const OLLAMA_DEFAULT_HOST = 'http://127.0.0.1:11434';
const RECORDED_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_TOKENS = 300;

// Hand-written fixtures do not match on the model.
const OLLAMA_MODEL = 'gpt-oss:120b';

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

type OllamaStreamRequest = ChatRequest & { stream: true };

function fixturePath(name: string): string {
  return resolve(__dirname, '../../../tools/testing/aimock/fixtures', name);
}

function baseInput(
  userMessage: string,
  runId = 'run-ollama',
): OllamaHashbrownRunAgentInput {
  return {
    threadId: 'thread-ollama',
    runId,
    messages: [{ id: `${runId}:user`, role: 'user', content: userMessage }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function recordedInput(userMessage: string): OllamaHashbrownRunAgentInput {
  return {
    ...baseInput(userMessage),
    messages: [
      {
        id: 'system-ollama',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      { id: 'user-ollama', role: 'user', content: userMessage },
    ],
  };
}

function contentEvents(events: AGUIEvent[]) {
  return events.filter(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );
}

function textContent(events: AGUIEvent[]): string {
  return contentEvents(events)
    .map((event) => event.delta)
    .join('');
}

function eventTypes(events: readonly AGUIEvent[]): EventType[] {
  return events.map((event) => event.type);
}

/**
 * The model recordings are made with: OLLAMA_MODEL when recording, which must
 * match the model the committed recordings were made with.
 */
function recordedModel(recording: boolean): string {
  const configured = process.env['OLLAMA_MODEL'];
  if (recording && configured && configured !== RECORDED_OLLAMA_MODEL) {
    throw new Error(
      `OLLAMA_MODEL is "${configured}" but the recordings use ` +
        `"${RECORDED_OLLAMA_MODEL}"; update RECORDED_OLLAMA_MODEL to re-record.`,
    );
  }
  return RECORDED_OLLAMA_MODEL;
}

interface RecordedRunOptions {
  readonly transformRequestOptions?: (
    options: OllamaStreamRequest,
  ) => OllamaStreamRequest;
}

type RecordedRun = (
  input: OllamaHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from the local Ollama server with `AIMOCK_RECORD=1`. Each
 * run gets an Ollama client whose requests carry the `X-Test-Id` header that
 * names the recording.
 */
async function withRecording<T>(
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'ollama',
    upstream: process.env['OLLAMA_HOST'] || OLLAMA_DEFAULT_HOST,
    chunkSize: replay.chunkSize,
  });
  const run: RecordedRun = (input, options = {}) =>
    Array.fromAsync(
      HashbrownOllama.stream.text({
        client: new Ollama({
          host: recorded.aimock.ollamaHost,
          headers: recorded.headers,
        }),
        model: recordedModel(recorded.recording),
        input,
        transformRequestOptions: (request) => {
          const transformed =
            options.transformRequestOptions?.(request) ?? request;

          return {
            ...transformed,
            options: {
              ...transformed.options,
              num_predict: MAX_OUTPUT_TOKENS,
            },
          };
        },
      }),
      (event) => EventSchemas.parse(event),
    );

  try {
    return await body(run);
  } finally {
    await recorded.aimock.stop();
  }
}

/**
 * Asserts a run that started and finished for `input`, with no error, and
 * streamed one non-empty assistant text message.
 */
function expectCanonicalTextRun(
  events: AGUIEvent[],
  input: OllamaHashbrownRunAgentInput,
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
  expect(textContent(events).trim()).not.toBe('');
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
        provider: 'ollama',
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
  input: OllamaHashbrownRunAgentInput,
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
 * Builds the next run's AG-UI history from a run's events the way a client
 * would: the assistant message with its text and tool calls, then one tool
 * result per call.
 */
function historyFromEvents(
  previous: readonly Message[],
  runId: string,
  events: readonly AGUIEvent[],
  toolResult: string,
): Message[] {
  const toolCalls = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START
      ? [
          {
            id: event.toolCallId,
            type: 'function' as const,
            function: {
              name: event.toolCallName,
              arguments: events
                .flatMap((candidate) =>
                  candidate.type === EventType.TOOL_CALL_ARGS &&
                  candidate.toolCallId === event.toolCallId
                    ? [candidate.delta]
                    : [],
                )
                .join(''),
            },
          },
        ]
      : [],
  );
  const text = textContent([...events]);
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

  return [...previous, assistant, ...toolResults];
}

function lookupResult(): string {
  return JSON.stringify({ fact: 'The code word is green.' });
}

test(
  'Ollama consumes AG-UI input and emits a canonical text run',
  async () => {
    const input = recordedInput('Say hello in three words.');

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Ollama preserves streamed text across multiple AG-UI events',
  async () => {
    const input = recordedInput('Write two short sentences about potatoes.');

    const events = await withRecording((run) => run(input), { chunkSize: 8 });

    expectCanonicalTextRun(events, input);
    expect(contentEvents(events).length).toBeGreaterThan(1);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Ollama emits tool call lifecycles and continues with the named tool result',
  async () => {
    const first = recordedInput(
      "Use the lookup tool to look up the code word 'hashbrown', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];
    let continuation: OllamaStreamRequest['messages'] = [];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: OllamaHashbrownRunAgentInput = {
          ...first,
          runId: 'run-ollama-2',
          messages: historyFromEvents(
            first.messages,
            first.runId,
            firstEvents,
            lookupResult(),
          ),
        };
        const secondEvents = await run(second, {
          transformRequestOptions: (options) => {
            continuation = options.messages;
            return options;
          },
        });
        return { firstEvents, second, secondEvents };
      },
    );

    expectToolRound(firstEvents, first, 'lookup');
    expect(continuation?.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
    expect(continuation?.[2]?.tool_calls).toEqual([
      {
        function: { name: 'lookup', arguments: { query: expect.any(String) } },
      },
    ]);
    expect(continuation?.[3]).toMatchObject({ tool_name: 'lookup' });
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Ollama maps the Hashbrown response schema to native structured output',
  async () => {
    const input = recordedInput('Describe a potato as structured output.');
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
    let captured: OllamaStreamRequest | undefined;

    const events = await withRecording((run) =>
      run(input, {
        transformRequestOptions: (options) => {
          captured = options;
          return options;
        },
      }),
    );

    expect(captured?.format).toEqual(responseSchema);
    expectCanonicalTextRun(events, input);
    expect(JSON.parse(textContent(events))).toEqual({
      text: expect.any(String),
      ok: expect.any(Boolean),
    });
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Ollama renders generative UI from the Hashbrown UI schema',
  async () => {
    const input = recordedInput(GENERATIVE_UI_PROMPT);
    const responseSchema = generativeUiResponseSchema();
    input.forwardedProps = { hashbrown: { responseSchema, ui: true } };
    let captured: OllamaStreamRequest | undefined;

    const events = await withRecording((run) =>
      run(input, {
        transformRequestOptions: (options) => {
          captured = options;
          return options;
        },
      }),
    );

    expect(captured?.format).toEqual(responseSchema);
    expectCanonicalTextRun(events, input);
    expect(parseGenerativeUi(textContent(events))).toEqual({
      title: expect.any(String),
      metrics: expect.arrayContaining([
        { label: expect.any(String), value: expect.any(Number) },
      ]),
    });
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Ollama completes a run from a full AG-UI history',
  async () => {
    const input = recordedInput(
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
            id: 'call-previous',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"potato"}' },
          },
        ],
      },
      {
        id: 'tool-previous',
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

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

// Hand-written fixtures below: provider errors, cancellation and activity
// ordering are Hashbrown behaviour, not model output.

test('Ollama provider errors emit RUN_ERROR without terminal events', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('error.json'),
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: baseInput('return provider error'),
        signal,
      }),
  });

  expect(events).toEqual([
    expect.objectContaining({ type: EventType.RUN_STARTED }),
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.any(String),
    }),
  ]);
});

test('Ollama cancellation stops before message and run completion', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('streaming.json'),
    chunkSize: 1,
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: baseInput('stream deterministic text'),
        signal,
      }),
    onEvent: (event, controls) => {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        controls.abort();
      }
    },
  });

  expect(
    events.some((event) => event.type === EventType.TEXT_MESSAGE_CONTENT),
  ).toBe(true);
  expect(
    events.some((event) => event.type === EventType.TEXT_MESSAGE_END),
  ).toBe(false);
  expect(events.some((event) => event.type === EventType.RUN_FINISHED)).toBe(
    false,
  );
  expect(events.some((event) => event.type === EventType.RUN_ERROR)).toBe(
    false,
  );
});

test('Ollama sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
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
    EventType.RAW,
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
    { threadId: 'thread-ollama', runId: 'run-ollama' },
    'stop',
  );
});
