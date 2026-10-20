import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  runProviderAGUIWithAimock,
  startAimock,
} from '@hashbrownai/testing/aimock';
import OpenAI from 'openai';
import { HashbrownAzure } from './index';
import { historyFromEvents } from './testing/history-from-events';
import type { AzureHashbrownRunAgentInput } from './stream/types';

// aimock serves the Azure Responses route: AzureOpenAI without a `deployment`
// posts to `{endpoint}/openai/responses?api-version=…`, which aimock
// normalizes to its OpenAI `/v1/responses` handler, so the shared OpenAI
// Responses fixtures (including `openai/reasoning*.json`) drive these runs.

const AZURE_MODEL = 'gpt-4.1-mini';
const AZURE_API_VERSION = 'preview';

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
      metadata: {
        openai: { itemId: expect.any(String), reasoningItemIds: [] },
      },
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
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];

  const events = await runFixture('tool-call.json', input);
  const toolEvents = events.filter((event) =>
    [
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ].includes(event.type),
  );
  const start = toolEvents.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const args = toolEvents
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');
  const end = toolEvents.find(
    (event) => event.type === EventType.TOOL_CALL_END,
  );

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
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  });
});

test('Azure OpenAI maps the Hashbrown response schema to native structured output', async () => {
  const input = baseInput('return structured output');
  input.forwardedProps = {
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          ok: { type: 'boolean' },
        },
        required: ['text', 'ok'],
      },
    },
  };
  let capturedTextFormat: unknown;
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: AZURE_MODEL,
        input,
        signal,
        transformRequestOptions: (options) => {
          capturedTextFormat = options.text?.format;
          return options;
        },
      }),
  });

  expect(capturedTextFormat).toEqual({
    type: 'json_schema',
    name: 'schema',
    schema: input.forwardedProps?.hashbrown?.responseSchema,
    strict: true,
  });
  expect(JSON.parse(streamedContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

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

const LOOKUP_TOOL = {
  name: 'lookup',
  description: 'Lookup deterministic fixture data.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

test('Azure OpenAI streams reasoning summaries and encrypted reasoning from a reasoning model', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('openai/reasoning.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: 'gpt-5-mini',
        input: baseInput('reason before answering'),
        signal,
      }),
  });

  const types = events.map((event) => event.type);
  expect(types.slice(0, 6)).toEqual([
    EventType.RUN_STARTED,
    EventType.REASONING_MESSAGE_START,
    EventType.REASONING_MESSAGE_CONTENT,
    EventType.REASONING_ENCRYPTED_VALUE,
    EventType.REASONING_MESSAGE_END,
    EventType.TEXT_MESSAGE_START,
  ]);
  expect(
    events
      .filter((event) => event.type === EventType.REASONING_MESSAGE_CONTENT)
      .map((event) => event.delta)
      .join(''),
  ).toBe('I will answer deterministically.');
  expect(streamedContent(events)).toBe('Reasoned answer from aimock.');
  expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
});

test('Azure OpenAI replays reasoning across a tool round trip', async () => {
  const first = baseInput('reason before calling lookup');
  first.tools = [LOOKUP_TOOL];
  const firstEvents = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('openai/reasoning-tool-call.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: 'gpt-5-mini',
        input: first,
        signal,
      }),
  });
  const history = historyFromEvents(
    first.messages,
    first.runId,
    firstEvents,
    () => 'fixture continuation result',
  );
  const second: AzureHashbrownRunAgentInput = {
    ...first,
    runId: 'run-azure-2',
    messages: history,
  };
  let capturedInput: OpenAI.Responses.ResponseCreateParamsStreaming['input'];

  const secondEvents = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('openai/reasoning-tool-call.json'),
    createStream: (aimock, signal) =>
      HashbrownAzure.stream.text({
        clientOptions: aimockClientOptions(aimock.url),
        model: 'gpt-5-mini',
        input: second,
        signal,
        transformRequestOptions: (options) => {
          capturedInput = options.input;
          return options;
        },
      }),
  });

  expect(history.map((message) => message.role)).toEqual([
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
  expect(streamedContent(secondEvents)).toBe('Continued answer from aimock.');
  expect(secondEvents.at(-1)?.type).toBe(EventType.RUN_FINISHED);
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
        String(url).includes('/openai/responses?api-version=preview'),
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
