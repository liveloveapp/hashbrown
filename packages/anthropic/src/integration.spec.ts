import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  runProviderAGUIWithAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import type Anthropic from '@anthropic-ai/sdk';
import { type ActivityCallback, HashbrownAnthropic } from './index';
import type { AnthropicHashbrownRunAgentInput } from './stream/types';

// The cheapest current Claude with thinking. It thinks adaptively (no
// `budget_tokens`), so recorded cases turn thinking off unless they test it.
const ANTHROPIC_MODEL = 'claude-haiku-5-5';
const ANTHROPIC_UPSTREAM = 'https://api.anthropic.com';

// Recorded cases replay `tools/testing/aimock/fixtures/recorded/<slug>/anthropic.json`
// and re-record from the live API with `npx nx record-fixtures anthropic`. They
// assert structure only, so a re-record with different wording still passes.
const RECORDED_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 300;
const MAX_THINKING_OUTPUT_TOKENS = 4_000;

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

function baseInput(userMessage: string): AnthropicHashbrownRunAgentInput {
  return {
    threadId: 'thread-anthropic',
    runId: 'run-anthropic',
    messages: [
      {
        id: 'system-anthropic',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      {
        id: 'user-anthropic',
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
  input: AnthropicHashbrownRunAgentInput,
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        signal,
      }),
  });
}

interface RecordedRunOptions {
  /** Request summarized adaptive thinking instead of turning thinking off. */
  readonly thinking?: boolean;
  readonly transformRequestOptions?: (
    options: Anthropic.Messages.MessageCreateParamsStreaming,
  ) => Anthropic.Messages.MessageCreateParamsStreaming;
}

type RecordedRun = (
  input: AnthropicHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from the live API with `AIMOCK_RECORD=1`. The provider
 * builds its own Anthropic client, so the `X-Test-Id` header that names the
 * recording is added to its requests by wrapping `fetch` for this test only.
 */
async function withRecording<T>(
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'anthropic',
    upstream: ANTHROPIC_UPSTREAM,
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
      HashbrownAnthropic.stream.text({
        apiKey: recorded.apiKey(process.env['ANTHROPIC_API_KEY']),
        baseURL: recorded.aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        transformRequestOptions: (request) => {
          const transformed =
            options.transformRequestOptions?.(request) ?? request;

          return options.thinking
            ? {
                ...transformed,
                max_tokens: MAX_THINKING_OUTPUT_TOKENS,
                thinking: { type: 'adaptive', display: 'summarized' },
                // Adaptive thinking may skip easy prompts; high effort keeps
                // the recorded thinking block.
                output_config: { ...transformed.output_config, effort: 'high' },
              }
            : {
                ...transformed,
                max_tokens: MAX_OUTPUT_TOKENS,
                thinking: { type: 'disabled' },
              };
        },
      }),
      (event) => EventSchemas.parse(event),
    );

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

function expectNoTerminalEvents(events: AGUIEvent[]): void {
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
}

/**
 * Asserts a run that started and finished for `input`, with no error, and
 * streamed one non-empty assistant text message.
 */
function expectCanonicalTextRun(
  events: AGUIEvent[],
  input: AnthropicHashbrownRunAgentInput,
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
        provider: 'anthropic',
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
  input: AnthropicHashbrownRunAgentInput,
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
 * Asserts that thinking streamed before any text or tool call, as at least
 * one balanced `thinking` block with non-empty summary text and a signature.
 */
function expectThinking(events: AGUIEvent[]): void {
  const types = eventTypes(events);
  const start = events.find(
    (event) => event.type === EventType.REASONING_MESSAGE_START,
  );
  const firstReasoning = types.indexOf(EventType.REASONING_MESSAGE_START);
  const firstOutput = types.findIndex(
    (type) =>
      type === EventType.TEXT_MESSAGE_START ||
      type === EventType.TOOL_CALL_START,
  );

  expect(start).toMatchObject({
    role: 'reasoning',
    metadata: { anthropic: { blockType: 'thinking' } },
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
  expect(
    events.find(
      (event) =>
        event.type === EventType.REASONING_ENCRYPTED_VALUE &&
        start?.type === EventType.REASONING_MESSAGE_START &&
        event.entityId === start.messageId,
    ),
  ).toMatchObject({ subtype: 'message', encryptedValue: expect.any(String) });
}

/**
 * Builds the next run's AG-UI history from a run's events the way a client
 * would: one reasoning message per thinking block (summary, signature and
 * block metadata), the assistant message with its text and tool calls, then
 * one tool result per call.
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
  const reasoning: Message[] = events.flatMap((event) => {
    if (event.type !== EventType.REASONING_MESSAGE_START) {
      return [];
    }
    const encrypted = events.find(
      (candidate) =>
        candidate.type === EventType.REASONING_ENCRYPTED_VALUE &&
        candidate.entityId === event.messageId,
    );

    return [
      {
        id: event.messageId,
        role: 'reasoning',
        content: deltasFor(
          EventType.REASONING_MESSAGE_CONTENT,
          event.messageId,
        ),
        ...(encrypted?.type === EventType.REASONING_ENCRYPTED_VALUE
          ? { encryptedValue: encrypted.encryptedValue }
          : {}),
        metadata: event.metadata,
      },
    ];
  });
  const toolCalls = events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START
      ? [
          {
            id: event.toolCallId,
            type: 'function' as const,
            function: {
              name: event.toolCallName,
              arguments: deltasFor(EventType.TOOL_CALL_ARGS, event.toolCallId),
            },
          },
        ]
      : [],
  );
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

test(
  'Anthropic consumes AG-UI input and emits a canonical text run',
  async () => {
    const input = baseInput('Say hello in three words.');

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Anthropic preserves streamed text across multiple AG-UI events',
  async () => {
    const input = baseInput('Write two short sentences about potatoes.');

    const events = await withRecording((run) => run(input), { chunkSize: 8 });

    expectCanonicalTextRun(events, input);
    expect(contentEvents(events).length).toBeGreaterThan(1);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Anthropic emits tool call lifecycles and continues after the tool result',
  async () => {
    const first = baseInput(
      "Use the lookup tool to look up the code word 'hashbrown', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: AnthropicHashbrownRunAgentInput = {
          ...first,
          runId: 'run-anthropic-2',
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
  'Anthropic maps the Hashbrown response schema to native structured output',
  async () => {
    const input = baseInput('Describe a potato as structured output.');
    const responseSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ok: { type: 'boolean' },
      },
      required: ['text', 'ok'],
      additionalProperties: false,
    };
    input.forwardedProps = { hashbrown: { responseSchema, ui: true } };
    let captured: Anthropic.Messages.MessageCreateParamsStreaming | undefined;

    const events = await withRecording((run) =>
      run(input, {
        transformRequestOptions: (options) => {
          captured = options;
          return options;
        },
      }),
    );

    expect(captured?.output_config).toEqual({
      format: { type: 'json_schema', schema: responseSchema },
    });
    expect(captured).not.toHaveProperty('response_format');
    expect(captured?.tools).toBeUndefined();
    expectCanonicalTextRun(events, input);
    expect(JSON.parse(streamedContent(events))).toEqual({
      text: expect.any(String),
      ok: expect.any(Boolean),
    });
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Anthropic completes a run from a full AG-UI history',
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
            id: 'toolu_previous',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"potato"}' },
          },
        ],
      },
      {
        id: 'tool-previous',
        role: 'tool',
        toolCallId: 'toolu_previous',
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

test(
  'Anthropic streams summarized thinking with a signature before the answer',
  async () => {
    const input = baseInput(
      'Ann is older than Ben. Ben is older than Cy. Dee is younger than Cy but older than Eve. Who is the second youngest? Reply with the name only.',
    );

    const events = await withRecording((run) => run(input, { thinking: true }));

    expectThinking(events);
    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Anthropic replays signed thinking before a tool call on continuation',
  async () => {
    const first = baseInput(
      "Work out which of 'stone', 'apple' and 'river' is a fruit, look that word up with the lookup tool, then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];
    let continuation: Anthropic.Messages.MessageParam[] = [];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first, { thinking: true });
        const second: AnthropicHashbrownRunAgentInput = {
          ...first,
          runId: 'run-anthropic-2',
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
            continuation = options.messages;
            return options;
          },
        });
        return { firstEvents, second, secondEvents };
      },
    );
    const signature = firstEvents.find(
      (event) => event.type === EventType.REASONING_ENCRYPTED_VALUE,
    );
    const replayedAssistant = continuation[1];

    expectThinking(firstEvents);
    expectToolRound(firstEvents, first, 'lookup');
    expect(second.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'reasoning',
      'assistant',
      'tool',
    ]);
    expect(continuation.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(signature).toBeDefined();
    expect(Array.isArray(replayedAssistant?.content)).toBe(true);
    expect(replayedAssistant?.content[0]).toEqual({
      type: 'thinking',
      thinking: expect.any(String),
      signature:
        signature?.type === EventType.REASONING_ENCRYPTED_VALUE
          ? signature.encryptedValue
          : undefined,
    });
    expect(replayedAssistant?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool_use', name: 'lookup' }),
      ]),
    );
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

// Hand-written fixtures below: request shapes, provider errors, cancellation
// and activity ordering are Hashbrown behaviour, not model output.

test('Anthropic maps complete AG-UI request history for aimock', async () => {
  const input = baseInput('say hi briefly');
  input.messages = [
    {
      id: 'system-history',
      role: 'system',
      content: 'System instruction.',
    },
    {
      id: 'developer-history',
      role: 'developer',
      content: 'Developer instruction.',
    },
    { id: 'user-history', role: 'user', content: 'Previous question.' },
    {
      id: 'assistant-history',
      role: 'assistant',
      content: 'I will look it up.',
      toolCalls: [
        {
          id: 'call-history',
          type: 'function',
          function: {
            name: 'lookup',
            arguments: '{"query":"previous"}',
          },
        },
      ],
    },
    {
      id: 'tool-history',
      role: 'tool',
      toolCallId: 'call-history',
      content: '{"answer":"previous result"}',
    },
    {
      id: 'reasoning-history',
      role: 'reasoning',
      content: 'Display-only reasoning.',
    },
    {
      id: 'activity-history',
      role: 'activity',
      activityType: 'progress',
      content: { label: 'Display-only activity.' },
    },
    { id: 'user-anthropic', role: 'user', content: 'say hi briefly' },
  ];
  input.tools = [
    {
      name: 'lookup',
      description: 'Lookup deterministic fixture data.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ];
  input.forwardedProps = {
    model: 'client-selected-model',
    hashbrown: { responseSchema: { type: 'object' }, ui: true },
  };
  let capturedOptions:
    Anthropic.Messages.MessageCreateParamsStreaming | undefined;

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        signal,
        transformRequestOptions: async (options) => {
          await Promise.resolve();
          capturedOptions = options;
          return options;
        },
      }),
  });

  expect(capturedOptions).toEqual({
    stream: true,
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: 'System instruction.\n\nDeveloper instruction.',
    output_config: {
      format: { type: 'json_schema', schema: { type: 'object' } },
    },
    messages: [
      { role: 'user', content: 'Previous question.' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will look it up.' },
          {
            type: 'tool_use',
            id: 'call-history',
            name: 'lookup',
            input: { query: 'previous' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-history',
            content: '{"answer":"previous result"}',
          },
        ],
      },
      { role: 'user', content: 'say hi briefly' },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Lookup deterministic fixture data.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
  });
  expect(capturedOptions).not.toHaveProperty('response_format');
  expect(
    capturedOptions?.tools?.some(
      (tool) => 'name' in tool && tool.name === 'output',
    ),
  ).toBe(false);
  expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
});

test('Anthropic provider errors terminate with RUN_ERROR', async () => {
  const input = baseInput('return provider error');

  const events = await runFixture('anthropic-error.json', input);

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

test('Anthropic abort after RUN_STARTED stops at RUN_STARTED', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    chunkSize: 1,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input: baseInput('say hi briefly'),
        signal,
      }),
    onEvent: (event, controls) => {
      if (event.type === EventType.RUN_STARTED) {
        controls.abort();
      }
    },
  });

  expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED]);
  expectNoTerminalEvents(events);
});

test('Anthropic abort during first text content stops at that content', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('streaming.json'),
    chunkSize: 4,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input: baseInput('stream deterministic text'),
        signal,
      }),
    onEvent: (event, controls) => {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        controls.abort();
      }
    },
  });

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
  ]);
  expectNoTerminalEvents(events);
});

test('Anthropic abort between tool events suppresses args and end', async () => {
  const input = baseInput('call the lookup tool');
  input.tools = [
    {
      name: 'lookup',
      description: 'Lookup deterministic fixture data.',
      parameters: { type: 'object', properties: {} },
    },
  ];

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('tool-call.json'),
    chunkSize: 2,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        signal,
      }),
    onEvent: (event, controls) => {
      if (event.type === EventType.TOOL_CALL_START) {
        controls.abort();
      }
    },
  });

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
  ]);
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.TOOL_CALL_ARGS }),
      expect.objectContaining({ type: EventType.TOOL_CALL_END }),
    ]),
  );
  expectNoTerminalEvents(events);
});

test('Anthropic abort after TEXT_MESSAGE_END suppresses RUN_FINISHED', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    chunkSize: 1,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input: baseInput('say hi briefly'),
        signal,
      }),
    onEvent: (event, controls) => {
      if (event.type === EventType.TEXT_MESSAGE_END) {
        controls.abort();
      }
    },
  });

  expect(events[0]?.type).toBe(EventType.RUN_STARTED);
  expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_START);
  expect(
    events
      .slice(2, -1)
      .every((event) => event.type === EventType.TEXT_MESSAGE_CONTENT),
  ).toBe(true);
  expect(streamedContent(events)).toBe('Hello from aimock.');
  expect(events.at(-1)?.type).toBe(EventType.TEXT_MESSAGE_END);
  expectNoTerminalEvents(events);
});

test('Anthropic sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
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
  expectRunFinished(
    events.at(-1),
    { threadId: 'thread-anthropic', runId: 'run-anthropic' },
    'stop',
  );
});
