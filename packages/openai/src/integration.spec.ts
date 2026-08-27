import { resolve } from 'node:path';
import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import {
  runProviderAGUIWithAimock,
  startAimock,
} from '@hashbrownai/testing/aimock';
import OpenAI from 'openai';
import { HashbrownOpenAI } from './index';
import type { OpenAIHashbrownRunAgentInput } from './stream/text.fn';

const OPENAI_MODEL = 'gpt-4.1-mini';

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

test('OpenAI consumes AG-UI input and emits a canonical text run', async () => {
  const events = await runFixture('text.json', baseInput('say hi briefly'));

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-openai:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-openai:assistant',
      delta: 'Hello from aimock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-openai:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-openai',
      runId: 'run-openai',
    },
  ]);
});

test('OpenAI preserves streamed text across multiple AG-UI events', async () => {
  const events = await runFixture(
    'streaming.json',
    baseInput('stream deterministic text'),
  );

  expect(contentEvents(events).length).toBeGreaterThan(1);
  expect(streamedContent(events)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('OpenAI emits complete AG-UI tool call lifecycles', async () => {
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
    parentMessageId: 'run-openai:assistant',
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

test('OpenAI maps the Hashbrown response schema to native structured output', async () => {
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
      HashbrownOpenAI.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.openAiBaseUrl,
        model: OPENAI_MODEL,
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
  let capturedMessages: OpenAI.ChatCompletionMessageParam[] | undefined;

  await Array.fromAsync(
    HashbrownOpenAI.stream.text({
      apiKey: 'test-not-used',
      model: OPENAI_MODEL,
      input,
      transformRequestOptions: (options) => {
        capturedMessages = options.messages;
        throw new Error('stop after capture');
      },
    }),
    (event) => EventSchemas.parse(event),
  );

  expect(capturedMessages).toEqual([
    {
      role: 'system',
      content: 'You are a deterministic test assistant.',
    },
    { role: 'user', content: 'previous question' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-previous',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"previous"}' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call-previous',
      content: '{"answer":"previous result"}',
    },
    { role: 'user', content: 'new question' },
  ]);
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
