import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type AimockHandle,
  runProviderAGUIWithAimock,
} from '@hashbrownai/testing/aimock';
import { HashbrownGoogle } from './index';
import type { GoogleHashbrownRunAgentInput } from './stream/types';

const GOOGLE_MODEL = 'gemini-2.5-flash';
const GOOGLE_BASE_URL_ENV = 'HASHBROWN_GOOGLE_API_BASE_URL';

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

async function* googleTextWithAimock(
  aimock: AimockHandle,
  signal: AbortSignal,
  input: GoogleHashbrownRunAgentInput,
): AsyncIterable<AGUIEvent> {
  const previousBaseUrl = process.env[GOOGLE_BASE_URL_ENV];
  process.env[GOOGLE_BASE_URL_ENV] = aimock.url;

  try {
    yield* HashbrownGoogle.stream.text({
      apiKey: 'test-not-used',
      model: GOOGLE_MODEL,
      input,
      signal,
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
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      googleTextWithAimock(aimock, signal, input),
  });
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

test('Google consumes AG-UI input and emits a canonical text run', async () => {
  const events = await runFixture('text.json', baseInput('say hi briefly'));

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
      delta: 'Hello from aimock.',
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
});

test('Google preserves streamed text across multiple AG-UI events', async () => {
  const events = await runFixture(
    'streaming.json',
    baseInput('stream deterministic text'),
  );

  expect(contentEvents(events).length).toBeGreaterThan(1);
  expect(streamedContent(events)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Google emits complete AG-UI tool call lifecycles', async () => {
  const input = baseInput('call the lookup tool');
  input.tools = [
    {
      name: 'lookup',
      description: 'Lookup deterministic fixture data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];

  const events = await runFixture('tool-call.json', input);
  const start = events.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const args = events
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');
  const end = events.find((event) => event.type === EventType.TOOL_CALL_END);

  expect(start).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallName: 'lookup',
    parentMessageId: 'run-google:assistant',
  });
  expect(args).toContain('"query":"hashbrown"');
  expect(end).toMatchObject({
    type: EventType.TOOL_CALL_END,
    toolCallId:
      start?.type === EventType.TOOL_CALL_START
        ? start.toolCallId
        : 'missing-tool-call',
  });
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  });
});

test('Google maps Gemini thought parts to AG-UI reasoning records', async () => {
  const input = baseInput('reason before calling lookup');
  input.tools = [
    {
      name: 'lookup',
      description: 'Lookup deterministic fixture data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('google/reasoning-tool-call.json'),
    chunkSize: 8,
    createStream: (aimock, signal) =>
      googleTextWithAimock(aimock, signal, input),
  });
  const reasoningEvents = events.filter((event) =>
    [
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_END,
    ].includes(event.type),
  );

  expect(reasoningEvents[0]).toMatchObject({
    type: EventType.REASONING_MESSAGE_START,
    role: 'reasoning',
    metadata: { google: { thought: true } },
  });
  expect(
    reasoningEvents
      .filter((event) => event.type === EventType.REASONING_MESSAGE_CONTENT)
      .map((event) => event.delta)
      .join(''),
  ).toBe('I need the lookup result.');
  expect(reasoningEvents.at(-1)).toMatchObject({
    type: EventType.REASONING_MESSAGE_END,
  });
  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_google_reasoning_fixture',
      toolCallName: 'lookup',
    }),
  );
});

test('Google maps the Hashbrown response schema to native structured output', async () => {
  const input = baseInput('return structured output');
  input.hashbrown = {
    responseSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ok: { type: 'boolean' },
      },
      required: ['text', 'ok'],
    },
  };
  let capturedConfig: unknown;
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock, signal) => {
      const previousBaseUrl = process.env[GOOGLE_BASE_URL_ENV];
      process.env[GOOGLE_BASE_URL_ENV] = aimock.url;

      return (async function* () {
        try {
          yield* HashbrownGoogle.stream.text({
            apiKey: 'test-not-used',
            model: GOOGLE_MODEL,
            input,
            signal,
            transformRequestOptions: (options) => {
              capturedConfig = options.config;
              return options;
            },
          });
        } finally {
          if (previousBaseUrl === undefined) {
            delete process.env[GOOGLE_BASE_URL_ENV];
          } else {
            process.env[GOOGLE_BASE_URL_ENV] = previousBaseUrl;
          }
        }
      })();
    },
  });

  expect(capturedConfig).toEqual(
    expect.objectContaining({
      responseMimeType: 'application/json',
      responseJsonSchema: input.hashbrown.responseSchema,
    }),
  );
  expect(JSON.parse(streamedContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
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
