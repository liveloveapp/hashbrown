import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  BedrockRuntimeClient,
  type ConverseStreamCommandInput,
  type ServiceInputTypes,
  type ServiceOutputTypes,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { FinalizeRequestMiddleware } from '@smithy/types';
import {
  type AimockHandle,
  runProviderAGUIWithAimock,
  startRecordedAimock,
} from '@hashbrownai/testing/aimock';
import { type ActivityCallback, HashbrownBedrock } from './index';
import type { BedrockHashbrownRunAgentInput } from './stream/types';

// Recorded cases replay `tools/testing/aimock/fixtures/recorded/<slug>/bedrock.json`
// and re-record from live Amazon Bedrock (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY and optional AWS_SESSION_TOKEN, BEDROCK_REGION and
// BEDROCK_MODEL_ID in the developer .env) with `npx nx record-fixtures bedrock`.
// They assert structure only, so a re-record with different wording still
// passes. Recordings match on the model in the request path, so re-recording
// with another BEDROCK_MODEL_ID means updating RECORDED_BEDROCK_MODEL too.
const RECORDED_BEDROCK_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const BEDROCK_DEFAULT_REGION = 'us-east-1';
const RECORDED_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 300;

// Hand-written fixtures do not match on the model.
const BEDROCK_MODEL = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

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

function createBedrockClient(aimock: AimockHandle): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: 'us-east-1',
    endpoint: aimock.url,
    credentials: {
      accessKeyId: 'test-not-used',
      secretAccessKey: 'test-not-used',
    },
    requestHandler: new NodeHttpHandler(),
  });
}

function baseInput(userMessage: string): BedrockHashbrownRunAgentInput {
  return {
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
    messages: [
      {
        id: 'system-bedrock',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      { id: 'user-bedrock', role: 'user', content: userMessage },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function runFixture(
  fixtureName: string,
  input: BedrockHashbrownRunAgentInput,
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      HashbrownBedrock.stream.text({
        client: createBedrockClient(aimock),
        model: BEDROCK_MODEL,
        input,
        signal,
      }),
  });
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
 * The model recordings are made with: BEDROCK_MODEL_ID when recording, which
 * must match the model the committed recordings were made with.
 */
function recordedModel(recording: boolean): string {
  const configured = process.env['BEDROCK_MODEL_ID'];
  if (recording && configured && configured !== RECORDED_BEDROCK_MODEL) {
    throw new Error(
      `BEDROCK_MODEL_ID is "${configured}" but the recordings use ` +
        `"${RECORDED_BEDROCK_MODEL}"; update RECORDED_BEDROCK_MODEL to re-record.`,
    );
  }
  return RECORDED_BEDROCK_MODEL;
}

/** The fields of a smithy `HttpRequest` the redirect rewrites. */
interface SignedHttpRequest {
  readonly protocol: string;
  readonly hostname: string;
  readonly port?: number;
  readonly headers: Record<string, string>;
}

function isSignedHttpRequest(value: unknown): value is SignedHttpRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'hostname' in value &&
    'headers' in value
  );
}

/**
 * Builds a Bedrock client that signs SigV4 for the real regional endpoint, then
 * sends the signed request to aimock. Middleware placed after
 * `httpSigningMiddleware` swaps the destination and adds the `X-Test-Id`
 * header once the signature is computed, so neither is signed. When
 * recording, aimock strips `X-Test-Id` and forwards the request otherwise
 * unchanged (through the testing package's Bedrock Converse shim) to the real
 * host, where the signature still matches.
 */
function createRecordingBedrockClient(options: {
  readonly region: string;
  readonly aimockUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
  };
}): BedrockRuntimeClient {
  const target = new URL(options.aimockUrl);
  const client = new BedrockRuntimeClient({
    region: options.region,
    endpoint: `https://bedrock-runtime.${options.region}.amazonaws.com`,
    credentials: options.credentials,
    requestHandler: new NodeHttpHandler(),
  });
  const redirect: FinalizeRequestMiddleware<
    ServiceInputTypes,
    ServiceOutputTypes
  > = (next) => (args) => {
    const { request } = args;
    if (!isSignedHttpRequest(request)) {
      return next(args);
    }
    const redirected = Object.assign(
      Object.create(Object.getPrototypeOf(request)),
      request,
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: Number(target.port),
        headers: { ...request.headers, ...options.headers },
      },
    );
    return next({ ...args, request: redirected });
  };
  client.middlewareStack.addRelativeTo(redirect, {
    name: 'redirectSignedRequestToAimock',
    relation: 'after',
    toMiddleware: 'httpSigningMiddleware',
  });
  return client;
}

interface RecordedRunOptions {
  readonly transformRequestOptions?: (
    options: ConverseStreamCommandInput,
  ) => ConverseStreamCommandInput;
}

type RecordedRun = (
  input: BedrockHashbrownRunAgentInput,
  options?: RecordedRunOptions,
) => Promise<AGUIEvent[]>;

/**
 * Runs `body` against the current test's recording: replayed strictly by
 * default, recorded from live Amazon Bedrock with `AIMOCK_RECORD=1`. Each run
 * gets a client that signs for the real regional endpoint and sends to aimock
 * with the `X-Test-Id` header that names the recording.
 */
async function withRecording<T>(
  body: (run: RecordedRun) => Promise<T>,
  replay: { readonly chunkSize?: number } = {},
): Promise<T> {
  const region = process.env['BEDROCK_REGION'] || BEDROCK_DEFAULT_REGION;
  const recorded = await startRecordedAimock({
    testName: expect.getState().currentTestName ?? '',
    provider: 'bedrock',
    upstream: `https://bedrock-runtime.${region}.amazonaws.com`,
    chunkSize: replay.chunkSize,
  });
  const sessionToken = recorded.recording
    ? process.env['AWS_SESSION_TOKEN']
    : undefined;
  const run: RecordedRun = (input, options = {}) =>
    Array.fromAsync(
      HashbrownBedrock.stream.text({
        client: createRecordingBedrockClient({
          region,
          aimockUrl: recorded.aimock.url,
          headers: recorded.headers,
          credentials: {
            accessKeyId: recorded.apiKey(process.env['AWS_ACCESS_KEY_ID']),
            secretAccessKey: recorded.apiKey(
              process.env['AWS_SECRET_ACCESS_KEY'],
            ),
            ...(sessionToken ? { sessionToken } : {}),
          },
        }),
        model: recordedModel(recorded.recording),
        input,
        transformRequestOptions: (request) => {
          const transformed =
            options.transformRequestOptions?.(request) ?? request;

          return {
            ...transformed,
            inferenceConfig: {
              ...transformed.inferenceConfig,
              maxTokens: MAX_OUTPUT_TOKENS,
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
  input: BedrockHashbrownRunAgentInput,
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
  });
  expect(
    contentEvents(events).every((event) => event.messageId === messageId),
  ).toBe(true);
  expect(textContent(events).trim()).not.toBe('');
}

/**
 * Asserts a run that finished after calling `toolName` at least once, each
 * call with a complete lifecycle and JSON object arguments.
 */
function expectToolRound(
  events: AGUIEvent[],
  input: BedrockHashbrownRunAgentInput,
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
  'Bedrock consumes AG-UI input and emits a canonical text run',
  async () => {
    const input = baseInput('Greet a Bedrock tester in three words.');

    const events = await withRecording((run) => run(input));

    expectCanonicalTextRun(events, input);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Bedrock preserves streamed text across multiple AG-UI events',
  async () => {
    const input = baseInput('Write two short sentences about hash browns.');

    const events = await withRecording((run) => run(input), { chunkSize: 8 });

    expectCanonicalTextRun(events, input);
    expect(contentEvents(events).length).toBeGreaterThan(1);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Bedrock emits tool call lifecycles and continues after the tool result',
  async () => {
    const first = baseInput(
      "Use the lookup tool to look up the code word 'bedrock', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];
    let continuation: ConverseStreamCommandInput['messages'] = [];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: BedrockHashbrownRunAgentInput = {
          ...first,
          runId: 'run-bedrock-2',
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
    const toolUseId = firstEvents.find(
      (event) => event.type === EventType.TOOL_CALL_START,
    );

    expectToolRound(firstEvents, first, 'lookup');
    expect(continuation?.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(continuation?.[1]?.content).toContainEqual({
      toolUse: {
        toolUseId:
          toolUseId?.type === EventType.TOOL_CALL_START
            ? toolUseId.toolCallId
            : 'missing-tool-call',
        name: 'lookup',
        input: { query: expect.any(String) },
      },
    });
    expect(continuation?.[2]?.content).toEqual([
      {
        toolResult: {
          toolUseId:
            toolUseId?.type === EventType.TOOL_CALL_START
              ? toolUseId.toolCallId
              : 'missing-tool-call',
          content: [{ json: { fact: 'The code word is green.' } }],
        },
      },
    ]);
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Bedrock continues after parallel tool calls in one user turn',
  async () => {
    const first = baseInput(
      "Call the lookup tool twice in parallel, once for the code word 'alpha' and once for 'beta', then answer in one short sentence.",
    );
    first.tools = [LOOKUP_TOOL];
    let continuation: ConverseStreamCommandInput['messages'] = [];

    const { firstEvents, second, secondEvents } = await withRecording(
      async (run) => {
        const firstEvents = await run(first);
        const second: BedrockHashbrownRunAgentInput = {
          ...first,
          runId: 'run-bedrock-2',
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
    const toolCallIds = firstEvents.flatMap((event) =>
      event.type === EventType.TOOL_CALL_START ? [event.toolCallId] : [],
    );

    expectToolRound(firstEvents, first, 'lookup');
    expect(toolCallIds.length).toBeGreaterThanOrEqual(2);
    expect(continuation?.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(
      continuation?.[2]?.content?.map((block) => block.toolResult?.toolUseId),
    ).toEqual(toolCallIds);
    expectCanonicalTextRun(secondEvents, second);
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Bedrock maps the Hashbrown response schema to native structured output',
  async () => {
    const input = baseInput('Describe a hash brown as structured output.');
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
    let outputConfig: unknown;

    const events = await withRecording((run) =>
      run(input, {
        transformRequestOptions: (options) => {
          outputConfig = options.outputConfig;
          return options;
        },
      }),
    );

    expect(outputConfig).toEqual({
      textFormat: {
        type: 'json_schema',
        structure: {
          jsonSchema: { schema: JSON.stringify(responseSchema) },
        },
      },
    });
    expectCanonicalTextRun(events, input);
    expect(JSON.parse(textContent(events))).toEqual({
      text: expect.any(String),
      ok: expect.any(Boolean),
    });
  },
  RECORDED_TIMEOUT_MS,
);

test(
  'Bedrock completes a run from a full AG-UI history',
  async () => {
    const input = baseInput(
      'From the lookup result above, what colour is the code word? Answer in one word without calling a tool.',
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
        content: "Look up the code word 'granite'.",
      },
      {
        id: 'assistant-previous',
        role: 'assistant',
        content: 'I will look it up.',
        toolCalls: [
          {
            id: 'call-previous',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"granite"}' },
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

test('Bedrock provider errors emit an AG-UI RUN_ERROR', async () => {
  const events = await runFixture(
    'error.json',
    baseInput('return provider error'),
  );

  expect(events[0]?.type).toBe(EventType.RUN_STARTED);
  expect(events.at(-1)).toMatchObject({
    type: EventType.RUN_ERROR,
    message: expect.any(String),
  });
  expect(events).not.toContainEqual(
    expect.objectContaining({ type: EventType.RUN_FINISHED }),
  );
});

test('Bedrock cancellation stops without synthetic terminal events', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('streaming.json'),
    chunkSize: 8,
    createStream: (aimock, signal) =>
      HashbrownBedrock.stream.text({
        client: createBedrockClient(aimock),
        model: BEDROCK_MODEL,
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
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_END }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
      expect.objectContaining({ type: EventType.RUN_ERROR }),
    ]),
  );
});

test('Bedrock sends callback activities inside the run', async () => {
  const activities: ActivityCallback = async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', { status: 'running' });
    await model;
    plan.patch([{ op: 'replace', path: '/status', value: 'done' }]);
  };

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownBedrock.stream.text({
        client: createBedrockClient(aimock),
        model: BEDROCK_MODEL,
        input: baseInput('say hi briefly'),
        signal,
        activities,
      }),
  });

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.ACTIVITY_SNAPSHOT,
    EventType.RAW,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RAW,
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
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
  });
});
