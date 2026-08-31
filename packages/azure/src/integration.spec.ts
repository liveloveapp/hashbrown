import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { runProviderAGUIWithAimock } from '@hashbrownai/testing/aimock';
import { HashbrownAzure } from './index';
import type { AzureHashbrownRunAgentInput } from './stream/types';

const AZURE_MODEL = 'gpt-4o';
const AZURE_API_VERSION = '2025-01-01-preview';

function fixturePath(name: string): string {
  return resolve(__dirname, '../../../tools/testing/aimock/fixtures', name);
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
        clientOptions: {
          apiKey: 'test-not-used',
          endpoint: aimock.url,
          apiVersion: AZURE_API_VERSION,
          deployment: AZURE_MODEL,
        },
        model: AZURE_MODEL,
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

function streamedContent(events: AGUIEvent[]): string {
  return contentEvents(events)
    .map((event) => event.delta)
    .join('');
}

test('Azure OpenAI consumes AG-UI input and emits a canonical text run', async () => {
  const events = await runFixture('text.json', baseInput('say hi briefly'));

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-azure:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-azure:assistant',
      delta: 'Hello from aimock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-azure:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-azure',
      runId: 'run-azure',
    },
  ]);
});

test('Azure OpenAI preserves streamed text across multiple AG-UI events', async () => {
  const events = await runFixture(
    'streaming.json',
    baseInput('stream deterministic text'),
  );

  expect(contentEvents(events).length).toBeGreaterThan(1);
  expect(streamedContent(events)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Azure OpenAI emits complete AG-UI tool call lifecycles', async () => {
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
    parentMessageId: 'run-azure:assistant',
  });
  expect(args).toContain('"query":"hashbrown"');
  expect(end).toMatchObject({
    type: EventType.TOOL_CALL_END,
    toolCallId:
      start?.type === EventType.TOOL_CALL_START
        ? start.toolCallId
        : 'missing-tool-call',
  });
});

test('Azure OpenAI maps the Hashbrown response schema to native structured output', async () => {
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
  let capturedResponseFormat: unknown;
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: {
          apiKey: 'test-not-used',
          endpoint: aimock.url,
          apiVersion: AZURE_API_VERSION,
          deployment: AZURE_MODEL,
        },
        model: AZURE_MODEL,
        input,
        signal,
        transformRequestOptions: (options) => {
          capturedResponseFormat = options.response_format;
          return options;
        },
      }),
  });

  expect(capturedResponseFormat).toEqual({
    type: 'json_schema',
    json_schema: {
      strict: true,
      name: 'schema',
      description: '',
      schema: input.hashbrown.responseSchema,
    },
  });
  expect(JSON.parse(streamedContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

test('Azure OpenAI provider errors emit a canonical run error', async () => {
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
