import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
  type AimockHandle,
  runProviderAGUIWithAimock,
} from '@hashbrownai/testing/aimock';
import { HashbrownBedrock } from './index';
import type { BedrockHashbrownRunAgentInput } from './stream/types';

const BEDROCK_MODEL = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

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
  transformRequestOptions?: Parameters<
    typeof HashbrownBedrock.stream.text
  >[0]['transformRequestOptions'],
): Promise<AGUIEvent[]> {
  return runProviderAGUIWithAimock({
    fixturePath: fixturePath(fixtureName),
    createStream: (aimock, signal) =>
      HashbrownBedrock.stream.text({
        client: createBedrockClient(aimock),
        model: BEDROCK_MODEL,
        input,
        signal,
        transformRequestOptions,
      }),
  });
}

function streamedContent(events: AGUIEvent[]): string {
  return events
    .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((event) => event.delta)
    .join('');
}

test('Bedrock consumes AG-UI input and emits a canonical text run', async () => {
  const input = baseInput('say hi briefly');

  const events = await runFixture('text.json', input);

  expect(events[0]).toEqual({
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  });
  expect(streamedContent(events)).toBe('Hello from aimock.');
  expect(events).toContainEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'run-bedrock:assistant',
  });
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  });
});

test('Bedrock preserves streamed text across multiple AG-UI events', async () => {
  const input = baseInput('stream deterministic text');

  const events = await runFixture('streaming.json', input);
  const contentEvents = events.filter(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );

  expect(contentEvents.length).toBeGreaterThan(1);
  expect(streamedContent(events)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Bedrock emits complete AG-UI tool call lifecycles', async () => {
  const input = baseInput('call the lookup tool');
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

  const events = await runFixture('tool-call.json', input, (options) => ({
    ...options,
    toolConfig: options.toolConfig
      ? { ...options.toolConfig, toolChoice: { any: {} } }
      : undefined,
  }));
  const start = events.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const args = events
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');

  expect(start).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallName: 'lookup',
    parentMessageId: 'run-bedrock:assistant',
  });
  expect(JSON.parse(args)).toEqual({ query: 'hashbrown' });
  expect(events).toContainEqual({
    type: EventType.TOOL_CALL_END,
    toolCallId:
      start?.type === EventType.TOOL_CALL_START
        ? start.toolCallId
        : 'missing-tool-call',
  });
});

test('Bedrock maps the Hashbrown response schema to native structured output', async () => {
  const input = baseInput('return structured output');
  input.hashbrown = {
    responseSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ok: { type: 'boolean' },
      },
      required: ['text', 'ok'],
      additionalProperties: false,
    },
  };
  let outputConfig: unknown;

  const events = await runFixture(
    'structured-output.json',
    input,
    (options) => {
      outputConfig = options.outputConfig;
      return options;
    },
  );

  expect(JSON.parse(streamedContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
  expect(outputConfig).toEqual({
    textFormat: {
      type: 'json_schema',
      structure: {
        jsonSchema: {
          schema: JSON.stringify(input.hashbrown.responseSchema),
        },
      },
    },
  });
});

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
