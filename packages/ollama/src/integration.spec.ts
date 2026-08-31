import { type AGUIEvent, EventType } from '@ag-ui/core';
import { resolve } from 'node:path';
import { runProviderAGUIWithAimock } from '@hashbrownai/testing/aimock';
import { HashbrownOllama, type OllamaHashbrownRunAgentInput } from './index';

const OLLAMA_MODEL = 'gpt-oss:120b';

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

function textContent(events: AGUIEvent[]): string {
  return events
    .filter(
      (
        event,
      ): event is Extract<
        AGUIEvent,
        { type: EventType.TEXT_MESSAGE_CONTENT }
      > => event.type === EventType.TEXT_MESSAGE_CONTENT,
    )
    .map((event) => event.delta)
    .join('');
}

test('Ollama text streaming emits canonical AG-UI events', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: baseInput('say hi briefly'),
        signal,
      }),
  });

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.RAW,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(textContent(events)).toBe('Hello from aimock.');
});

test('Ollama preserves content across deterministic stream chunks', async () => {
  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('streaming.json'),
    chunkSize: 8,
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: baseInput('stream deterministic text'),
        signal,
      }),
  });
  const contentEvents = events.filter(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );

  expect(contentEvents.length).toBeGreaterThan(1);
  expect(textContent(events)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Ollama tool calling emits canonical tool-call events', async () => {
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

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('tool-call.json'),
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input,
        signal,
      }),
  });
  const start = events.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const args = events.find((event) => event.type === EventType.TOOL_CALL_ARGS);

  expect(start).toEqual(
    expect.objectContaining({
      toolCallName: 'lookup',
      parentMessageId: 'run-ollama:assistant',
    }),
  );
  expect(args).toEqual(
    expect.objectContaining({ delta: '{"query":"hashbrown"}' }),
  );
  expect(events.some((event) => event.type === EventType.TOOL_CALL_END)).toBe(
    true,
  );
});

test('Ollama structured output streams JSON text through AG-UI', async () => {
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

  const events = await runProviderAGUIWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input,
        signal,
      }),
  });

  expect(JSON.parse(textContent(events))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

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

test('Ollama sends tool calls and named tool results back on continuation', async () => {
  const fixture = fixturePath('ollama/tool-continuation.json');
  const firstInput = baseInput(
    'continue after the lookup',
    'run-ollama-tool-1',
  );
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
  const firstEvents = await runProviderAGUIWithAimock({
    fixturePath: fixture,
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: firstInput,
        signal,
      }),
  });
  const toolStart = firstEvents.find(
    (event): event is Extract<AGUIEvent, { type: EventType.TOOL_CALL_START }> =>
      event.type === EventType.TOOL_CALL_START,
  );
  const toolArgs = firstEvents.find(
    (event): event is Extract<AGUIEvent, { type: EventType.TOOL_CALL_ARGS }> =>
      event.type === EventType.TOOL_CALL_ARGS,
  );
  if (!toolStart || !toolArgs) {
    throw new Error('Expected the first Ollama run to emit a tool call');
  }
  const secondInput = baseInput(
    'continue after the lookup',
    'run-ollama-tool-2',
  );
  secondInput.tools = firstInput.tools;
  secondInput.messages.push(
    {
      id: toolStart.parentMessageId ?? 'run-ollama-tool-1:assistant',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: toolStart.toolCallId,
          type: 'function',
          function: {
            name: toolStart.toolCallName,
            arguments: toolArgs.delta,
          },
        },
      ],
    },
    {
      id: 'tool-result-ollama',
      role: 'tool',
      toolCallId: toolStart.toolCallId,
      content: '{"result":"fixture"}',
    },
  );

  const secondEvents = await runProviderAGUIWithAimock({
    fixturePath: fixture,
    createStream: (aimock, signal) =>
      HashbrownOllama.stream.text({
        host: aimock.ollamaHost,
        model: OLLAMA_MODEL,
        input: secondInput,
        signal,
      }),
  });

  expect(textContent(secondEvents)).toBe('Ollama continuation complete.');
  expect(
    secondEvents.some((event) => event.type === EventType.RUN_FINISHED),
  ).toBe(true);
});
