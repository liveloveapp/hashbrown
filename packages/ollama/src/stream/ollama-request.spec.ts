import type { OllamaHashbrownRunAgentInput } from './types';
import { createOllamaRequestOptions } from './ollama-request';

function createInput(): OllamaHashbrownRunAgentInput {
  return {
    threadId: 'thread-ollama',
    runId: 'run-ollama',
    messages: [
      { id: 'system-ollama', role: 'system', content: 'System prompt.' },
      {
        id: 'developer-ollama',
        role: 'developer',
        content: 'Developer prompt.',
      },
      { id: 'user-ollama', role: 'user', content: 'Look it up.' },
      {
        id: 'reasoning-ollama',
        role: 'reasoning',
        content: 'I need a lookup.',
        metadata: { ollama: { thinking: true } },
      },
      {
        id: 'assistant-ollama',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-ollama',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
          },
        ],
      },
      {
        id: 'tool-ollama',
        role: 'tool',
        toolCallId: 'call-ollama',
        content: '{"result":"fixture"}',
      },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Lookup a value.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    },
  };
}

test('maps AG-UI messages, tools, reasoning, and structured output to Ollama', () => {
  const input = createInput();

  const result = createOllamaRequestOptions(input, 'gpt-oss:20b');

  expect(result).toEqual({
    stream: true,
    model: 'gpt-oss:20b',
    messages: [
      { role: 'system', content: 'System prompt.' },
      { role: 'system', content: 'Developer prompt.' },
      { role: 'user', content: 'Look it up.' },
      {
        role: 'assistant',
        content: 'Checking.',
        thinking: 'I need a lookup.',
        tool_calls: [
          {
            function: {
              name: 'lookup',
              arguments: { query: 'hashbrown' },
            },
          },
        ],
      },
      {
        role: 'tool',
        content: '{"result":"fixture"}',
        tool_name: 'lookup',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Lookup a value.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
    ],
    format: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    },
  });
});

test('concatenates adjacent Ollama reasoning records for continuation', () => {
  const input = createInput();
  const assistantIndex = input.messages.findIndex(
    (message) => message.id === 'assistant-ollama',
  );
  input.messages.splice(assistantIndex, 0, {
    id: 'reasoning-ollama-2',
    role: 'reasoning',
    content: ' Then use the tool.',
    metadata: { ollama: { thinking: true } },
  });

  const result = createOllamaRequestOptions(input, 'qwen3');

  expect(result.messages?.[3]?.thinking).toBe(
    'I need a lookup. Then use the tool.',
  );
});

test('ignores reasoning records that are not owned by Ollama', () => {
  const input = createInput();
  const reasoning = input.messages.find(
    (message) => message.id === 'reasoning-ollama',
  );
  if (reasoning?.role === 'reasoning') {
    reasoning.metadata = { google: { thought: true } };
  }

  const result = createOllamaRequestOptions(input, 'qwen3');

  expect(result.messages?.[3]?.thinking).toBeUndefined();
});

test('rejects a tool result whose call cannot be resolved', () => {
  const input = createInput();
  const toolMessage = input.messages.find(
    (message) => message.id === 'tool-ollama',
  );
  if (toolMessage?.role === 'tool') {
    toolMessage.toolCallId = 'missing-call';
  }

  expect(() => createOllamaRequestOptions(input, 'qwen3')).toThrow(
    'Ollama tool result "tool-ollama" references unknown tool call "missing-call"',
  );
});

test('rejects tool-call arguments that are not a JSON object', () => {
  const input = createInput();
  const assistant = input.messages.find(
    (message) => message.id === 'assistant-ollama',
  );
  if (assistant?.role === 'assistant' && assistant.toolCalls?.[0]) {
    assistant.toolCalls[0].function.arguments = 'not-json';
  }

  expect(() => createOllamaRequestOptions(input, 'qwen3')).toThrow(
    'Ollama tool call "call-ollama" arguments must be a JSON object',
  );
});

test('rejects non-text AG-UI user content', () => {
  const input = createInput();
  const user = input.messages.find((message) => message.id === 'user-ollama');
  if (user?.role === 'user') {
    user.content = [
      {
        type: 'image',
        source: { type: 'url', value: 'https://example.com/image.png' },
      },
    ];
  }

  expect(() => createOllamaRequestOptions(input, 'qwen3')).toThrow(
    'Ollama provider currently requires text user content',
  );
});

test('does not mutate input messages, tools, schemas, or parsed arguments', () => {
  const input = createInput();
  const snapshot = structuredClone(input);

  const result = createOllamaRequestOptions(input, 'qwen3');
  const requestTool = result.tools?.[0];
  const requestFormat = result.format as Record<string, unknown>;
  const requestAssistant = result.messages?.[3];
  const requestArguments =
    requestAssistant?.tool_calls?.[0]?.function.arguments;
  if (requestTool?.function.parameters?.properties) {
    requestTool.function.parameters.properties['extra'] = { type: 'string' };
  }
  requestFormat['extra'] = true;
  if (requestArguments) {
    requestArguments['extra'] = true;
  }

  expect(input).toEqual(snapshot);
});
