import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  runProviderAGUIWithAimock,
  startAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import OpenAI from 'openai';
import { type ActivityCallback, HashbrownOpenAI } from './index';
import { historyFromEvents } from './testing/history-from-events';
import type { OpenAIHashbrownRunAgentInput } from './stream/types';

const OPENAI_MODEL = 'gpt-4.1-mini';
const OPENAI_REASONING_MODEL = 'gpt-5-mini';
const OPENAI_UPSTREAM = 'https://api.openai.com';

// Recorded cases replay `tools/testing/aimock/fixtures/recorded/<slug>/openai.json`
// and re-record from the live API with `npx nx record-fixtures openai`. They
// assert structure only, so a re-record with different wording still passes.
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

function baseInput(userMessage: string): OpenAIHashbrownRunAgentInput {
  return {
    threadId: 'thread-openai',
    runId: 'run-openai',
    messages: [
      {
        id: 'system-openai',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      {
        id: 'user-openai',
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
  input: OpenAIHashbrownRunAgentInput,
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      HashbrownOpenAI.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.openAiBaseUrl,
        model: OPENAI_MODEL,
        input,
        signal,
      }),
  });
}

interface RecordedRunOptions {
  readonly model?: string;
  readonly transformRequestOptions?: (
    options: OpenAI.Responses.ResponseCreateParamsStreaming,
  ) => OpenAI.Responses.ResponseCreateParamsStreaming;
}

type RecordedRun = (
  input: OpenAIHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from the live API with `AIMOCK_RECORD=1`. The provider
 * builds its own OpenAI client, so the `X-Test-Id` header that names the
 * recording is added to its requests by wrapping `fetch` for this test only.
 */
async function withRecording<T>(
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'openai',
    upstream: OPENAI_UPSTREAM,
    chunkSize: replay.chunkSize,
  });
  const realFetch = globalThis.fetch;
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation((url, init) => {
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(recorded.headers)) {
        headers.set(name, value);
      }
      return realFetch(url, { ...init, headers });
    });
  const run: RecordedRun = (input, options = {}) => {
    const model = options.model ?? OPENAI_MODEL;
    const maxOutputTokens =
      model === OPENAI_REASONING_MODEL
        ? MAX_REASONING_OUTPUT_TOKENS
        : MAX_OUTPUT_TOKENS;

    return Array.fromAsync(
      HashbrownOpenAI.stream.text({
        apiKey: recorded.apiKey(process.env['OPENAI_API_KEY']),
        baseURL: recorded.aimock.openAiBaseUrl,
        model,
        input,
        transformRequestOptions: (request) => ({
          ...(options.transformRequestOptions?.(request) ?? request),
          max_output_tokens: maxOutputTokens,
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
  input: OpenAIHashbrownRunAgentInput,
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
      openai: {
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
  input: OpenAIHashbrownRunAgentInput,
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
  return JSON.stringify({ fact: 'The code word is green.' });
}

test(
  'OpenAI consumes AG-UI input and emits a canonical text run',
  async () => {
    const input = baseInput('Say hello in three words.');

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'OpenAI preserves streamed text across multiple AG-UI events',
  async () => {
    const input = baseInput('Write two short sentences about potatoes.');

    const events = await withRecording((run) => run(input), { chunkSize: 8 });

    expectCanonicalTextRun(events, input);
    expect(contentEvents(events).length).toBeGreaterThan(1);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'OpenAI emits tool call lifecycles and continues after the tool result',
  async () => {
    const first = baseInput(
      "Use the lookup tool to look up the code word 'hashbrown', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: OpenAIHashbrownRunAgentInput = {
          ...first,
          runId: 'run-openai-2',
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
  'OpenAI maps the Hashbrown response schema to native structured output',
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
  'OpenAI completes a run from a full AG-UI history',
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
        content: "Look up the code word 'potato'.",
      },
      {
        id: 'assistant-previous',
        role: 'assistant',
        toolCalls: [
          {
            id: 'call-previous',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"potato"}' },
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
  'OpenAI streams reasoning summaries and encrypted reasoning from a reasoning model',
  async () => {
    const input = baseInput(
      'A train leaves at 9:40 and the trip takes 2 hours 35 minutes. When does it arrive? Reply with the time only.',
    );

    const events = await withRecording((run) =>
      run(input, { model: OPENAI_REASONING_MODEL }),
    );

    expectReasoning(events);
    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'OpenAI replays reasoning across a tool round trip',
  async () => {
    const first = baseInput(
      "Work out which of 'stone', 'apple' and 'river' is a fruit, look that word up with the lookup tool, then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];
    let capturedInput: OpenAI.Responses.ResponseCreateParamsStreaming['input'];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first, {
          model: OPENAI_REASONING_MODEL,
        });
        const second: OpenAIHashbrownRunAgentInput = {
          ...first,
          runId: 'run-openai-2',
          messages: historyFromEvents(
            first.messages,
            first.runId,
            firstEvents,
            lookupResult,
          ),
        };
        const secondEvents = await run(second, {
          model: OPENAI_REASONING_MODEL,
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
    expect(second.messages.map((message) => message.role)).toEqual(
      expect.arrayContaining(['reasoning', 'assistant', 'tool']),
    );
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

// Hand-written fixtures below: request shapes, provider errors, cancellation
// and activity ordering are Hashbrown behaviour, not model output.

test('OpenAI maps complete AG-UI history without provider-specific wire keys', async () => {
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
    HashbrownOpenAI.stream.text({
      apiKey: 'test-not-used',
      model: OPENAI_MODEL,
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

test('transformRequestOptions receives Responses params', async () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  let received: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

  try {
    const events = await runProviderAGUIWithAimock({
      fixturePath: fixturePath('text.json'),
      createStream: (aimock, signal) =>
        HashbrownOpenAI.stream.text({
          apiKey: 'test-not-used',
          baseURL: aimock.openAiBaseUrl,
          model: OPENAI_MODEL,
          input: baseInput('say hi briefly'),
          signal,
          transformRequestOptions: (options) => {
            received = options;
            return { ...options, max_output_tokens: 321 };
          },
        }),
    });
    const wireBodies = fetchSpy.mock.calls
      .filter(([url]) => String(url).endsWith('/v1/responses'))
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

test('OpenAI provider errors terminate the AG-UI run with RUN_ERROR', async () => {
  const events = await runFixture(
    'error.json',
    baseInput('return provider error'),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringContaining('Deterministic provider error'),
    }),
  ]);
});

test('OpenAI cancellation stops iteration without emitting a terminal event', async () => {
  const controller = new AbortController();
  const input = baseInput('cancel before provider request');
  const events = HashbrownOpenAI.stream.text({
    apiKey: 'test-not-used',
    model: OPENAI_MODEL,
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

test('OpenAI cancellation aborts an active provider stream without a terminal event', async () => {
  const aimock = await startAimock({
    fixturePath: fixturePath('streaming.json'),
  });
  const controller = new AbortController();
  const input = baseInput('stream deterministic text');
  const events = HashbrownOpenAI.stream.text({
    apiKey: 'test-not-used',
    baseURL: aimock.openAiBaseUrl,
    model: OPENAI_MODEL,
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

test('OpenAI cancellation between message events stops the remaining lifecycle', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  const controller = new AbortController();
  const input = baseInput('say hi briefly');
  const events = HashbrownOpenAI.stream.text({
    apiKey: 'test-not-used',
    baseURL: aimock.openAiBaseUrl,
    model: OPENAI_MODEL,
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

test('OpenAI cancellation after a message ends does not finish the run', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  const controller = new AbortController();
  const input = baseInput('say hi briefly');
  const events = HashbrownOpenAI.stream.text({
    apiKey: 'test-not-used',
    baseURL: aimock.openAiBaseUrl,
    model: OPENAI_MODEL,
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

test('OpenAI sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownOpenAI.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.openAiBaseUrl,
        model: OPENAI_MODEL,
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
    threadId: 'thread-openai',
    runId: 'run-openai',
  });
});
