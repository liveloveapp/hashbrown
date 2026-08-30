import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { runProviderAGUIWithAimock } from '@hashbrownai/testing/aimock';
import type Anthropic from '@anthropic-ai/sdk';
import { HashbrownAnthropic } from './index';
import type { AnthropicHashbrownRunAgentInput } from './stream/types';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

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

function expectNoTerminalEvents(events: AGUIEvent[]): void {
  expect(events).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: EventType.RUN_ERROR }),
      expect.objectContaining({ type: EventType.RUN_FINISHED }),
    ]),
  );
}

function reasoningContent(events: AGUIEvent[]): string {
  return events
    .filter((event) => event.type === EventType.REASONING_MESSAGE_CONTENT)
    .map((event) => event.delta)
    .join('');
}

test('Anthropic consumes AG-UI input and emits a canonical text run', async () => {
  const events = await runFixture('text.json', baseInput('say hi briefly'));

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-anthropic',
      runId: 'run-anthropic',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-anthropic:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-anthropic:assistant',
      delta: 'Hello from aimock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-anthropic:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-anthropic',
      runId: 'run-anthropic',
    },
  ]);
});

test('Anthropic preserves deterministic multi-chunk AG-UI text', async () => {
  const events = await runFixture(
    'streaming.json',
    baseInput('stream deterministic text'),
  );

  expect(contentEvents(events).length).toBeGreaterThan(1);
  expect(streamedContent(events)).toBe(
    'Streaming fixture response with enough text to cross several deterministic chunk boundaries.',
  );
  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-anthropic',
    runId: 'run-anthropic',
  });
});

test('Anthropic emits balanced reasoning before assistant text', async () => {
  const input = baseInput('reason before answering');

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('anthropic/reasoning.json'),
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        signal,
        transformRequestOptions: (options) => ({
          ...options,
          thinking: { type: 'enabled', budget_tokens: 1024 },
        }),
      }),
  });

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'run-anthropic:assistant:reasoning:0',
      role: 'reasoning',
      metadata: { anthropic: { blockType: 'thinking' } },
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'run-anthropic:assistant:reasoning:0',
      delta: 'I will answer deterministically.',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-anthropic:assistant:reasoning:0',
      encryptedValue: 'signature_reasoning_fixture',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'run-anthropic:assistant:reasoning:0',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-anthropic:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-anthropic:assistant',
      delta: 'Reasoned answer from aimock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-anthropic:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ]);
});

test('Anthropic replays signed reasoning before a tool on continuation', async () => {
  const fixture = fixturePath('anthropic/reasoning-tool-call.json');
  const firstInput = baseInput('reason before calling lookup');
  firstInput.tools = [
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
  let firstRequest: Anthropic.Messages.MessageCreateParamsStreaming | undefined;

  const firstEvents = await runProviderAGUIWithAimock({
    fixturePath: fixture,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input: firstInput,
        signal,
        transformRequestOptions: (options) => {
          firstRequest = {
            ...options,
            thinking: { type: 'enabled', budget_tokens: 1024 },
          };
          return firstRequest;
        },
      }),
  });
  const reasoningStart = firstEvents.find(
    (event) => event.type === EventType.REASONING_MESSAGE_START,
  );
  const reasoningEncryptedValue = firstEvents.find(
    (event) => event.type === EventType.REASONING_ENCRYPTED_VALUE,
  );
  const toolStart = firstEvents.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const toolArguments = firstEvents
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');

  expect(firstRequest).toEqual({
    stream: true,
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: 'You are a deterministic test assistant.',
    messages: [{ role: 'user', content: 'reason before calling lookup' }],
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
    thinking: { type: 'enabled', budget_tokens: 1024 },
  });
  expect(firstEvents.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.REASONING_MESSAGE_START,
    EventType.REASONING_MESSAGE_CONTENT,
    EventType.REASONING_ENCRYPTED_VALUE,
    EventType.REASONING_MESSAGE_END,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.RUN_FINISHED,
  ]);
  expect(reasoningStart).toBeDefined();
  expect(reasoningEncryptedValue).toBeDefined();
  expect(toolStart).toBeDefined();
  if (
    reasoningStart?.type !== EventType.REASONING_MESSAGE_START ||
    reasoningEncryptedValue?.type !== EventType.REASONING_ENCRYPTED_VALUE ||
    toolStart?.type !== EventType.TOOL_CALL_START
  ) {
    throw new Error('Expected reasoning and tool events from the first run.');
  }

  const secondInput: AnthropicHashbrownRunAgentInput = {
    ...firstInput,
    runId: 'run-anthropic-continuation',
    messages: [
      ...firstInput.messages,
      {
        id: reasoningStart.messageId,
        role: 'reasoning',
        content: reasoningContent(firstEvents),
        encryptedValue: reasoningEncryptedValue.encryptedValue,
        metadata: reasoningStart.metadata,
      },
      {
        id: 'run-anthropic:assistant',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: toolStart.toolCallId,
            type: 'function',
            function: {
              name: toolStart.toolCallName,
              arguments: toolArguments,
            },
          },
        ],
      },
      {
        id: 'tool-result-reasoning-fixture',
        role: 'tool',
        toolCallId: toolStart.toolCallId,
        content: '{"answer":"fixture continuation result"}',
      },
    ],
  };
  let secondRequest:
    Anthropic.Messages.MessageCreateParamsStreaming | undefined;

  const secondEvents = await runProviderAGUIWithAimock({
    fixturePath: fixture,
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input: secondInput,
        signal,
        transformRequestOptions: (options) => {
          secondRequest = {
            ...options,
            thinking: { type: 'enabled', budget_tokens: 1024 },
          };
          return secondRequest;
        },
      }),
  });

  expect(secondRequest?.messages).toEqual([
    { role: 'user', content: 'reason before calling lookup' },
    {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'I need the lookup result.',
          signature: 'signature_tool_fixture',
        },
        {
          type: 'tool_use',
          id: 'call_reasoning_lookup_fixture',
          name: 'lookup',
          input: { query: 'hashbrown' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_reasoning_lookup_fixture',
          content: '{"answer":"fixture continuation result"}',
        },
      ],
    },
  ]);
  expect(secondEvents.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(streamedContent(secondEvents)).toBe('Continued answer from aimock.');
});

test('Anthropic emits complete tool events with streamed arguments', async () => {
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

  expect(start).toEqual({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call_lookup_fixture',
    toolCallName: 'lookup',
    parentMessageId: 'run-anthropic:assistant',
  });
  expect(args).toBe('{"query":"hashbrown"}');
  expect(end).toEqual({
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call_lookup_fixture',
  });
  expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
});

test('Anthropic streams structured-output JSON without hidden emulation', async () => {
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
    ui: true,
  };
  let capturedOptions:
    Anthropic.Messages.MessageCreateParamsStreaming | undefined;

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock, signal) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        model: ANTHROPIC_MODEL,
        input,
        signal,
        transformRequestOptions: (options) => {
          capturedOptions = options;
          return options;
        },
      }),
  });

  expect(capturedOptions).toEqual({
    stream: true,
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: 'You are a deterministic test assistant.',
    messages: [{ role: 'user', content: 'return structured output' }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            ok: { type: 'boolean' },
          },
          required: ['text', 'ok'],
        },
      },
    },
  });
  expect(capturedOptions).not.toHaveProperty('response_format');
  expect(capturedOptions?.tools).toBeUndefined();
  expect(JSON.parse(streamedContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

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
  input.forwardedProps = { model: 'client-selected-model' };
  input.hashbrown = {
    responseSchema: { type: 'object' },
    ui: true,
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
