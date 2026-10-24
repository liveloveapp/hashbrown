import { ɵPROVIDER_HISTORY_METADATA_KEY } from '@hashbrownai/core';
import { encodeBedrockNative } from './bedrock-native';
import type { RunAgentInput } from '@ag-ui/core';
import { createBedrockRequestOptions } from './bedrock-request';

function createInput(): RunAgentInput & {
  forwardedProps: { hashbrown: { responseSchema: object } };
} {
  return {
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
    messages: [
      { id: 'system-bedrock', role: 'system', content: 'System prompt.' },
      {
        id: 'developer-bedrock',
        role: 'developer',
        content: 'Developer prompt.',
      },
      { id: 'user-bedrock', role: 'user', content: 'Look it up.' },
      {
        id: 'reasoning-bedrock',
        role: 'reasoning',
        content: 'I need a lookup.',
        encryptedValue: 'reasoning-signature',
        metadata: { bedrock: { blockType: 'reasoning_text' } },
      },
      {
        id: 'assistant-bedrock',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-bedrock',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
          },
        ],
      },
      {
        id: 'tool-bedrock',
        role: 'tool',
        toolCallId: 'call-bedrock',
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
    forwardedProps: {
      hashbrown: {
        responseSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    },
  };
}

test('maps AG-UI messages, tools, reasoning, and structured output to Bedrock', () => {
  const input = createInput();

  const result = createBedrockRequestOptions(input, 'bedrock-model');

  expect(result).toEqual({
    modelId: 'bedrock-model',
    system: [{ text: 'System prompt.' }, { text: 'Developer prompt.' }],
    messages: [
      { role: 'user', content: [{ text: 'Look it up.' }] },
      {
        role: 'assistant',
        content: [
          {
            reasoningContent: {
              reasoningText: {
                text: 'I need a lookup.',
                signature: 'reasoning-signature',
              },
            },
          },
          { text: 'Checking.' },
          {
            toolUse: {
              toolUseId: 'call-bedrock',
              name: 'lookup',
              input: { query: 'hashbrown' },
            },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: 'call-bedrock',
              content: [{ json: { result: 'fixture' } }],
            },
          },
        ],
      },
    ],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'lookup',
            description: 'Lookup a value.',
            inputSchema: {
              json: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          },
        },
      ],
      toolChoice: { auto: {} },
    },
    outputConfig: {
      textFormat: {
        type: 'json_schema',
        structure: {
          jsonSchema: {
            schema: JSON.stringify(
              input.forwardedProps.hashbrown.responseSchema,
            ),
          },
        },
      },
    },
  });
});

test('preserves only provider-owned redacted Bedrock reasoning', () => {
  const input = createInput();
  input.messages.splice(
    3,
    1,
    {
      id: 'other-reasoning',
      role: 'reasoning',
      content: 'Do not send this.',
      encryptedValue: 'other-provider-value',
      metadata: { other: true },
    },
    {
      id: 'redacted-bedrock',
      role: 'reasoning',
      content: '',
      encryptedValue: 'AQID',
      metadata: { bedrock: { blockType: 'redacted_content' } },
    },
  );

  const result = createBedrockRequestOptions(input, 'bedrock-model');

  expect(result.messages?.[1]?.content?.[0]).toEqual({
    reasoningContent: { redactedContent: new Uint8Array([1, 2, 3]) },
  });
  expect(JSON.stringify(result)).not.toContain('Do not send this.');
});

test('maps tool errors without wrapping valid JSON results', () => {
  const input = createInput();
  input.messages[5] = {
    id: 'tool-bedrock',
    role: 'tool',
    toolCallId: 'call-bedrock',
    content: 'lookup failed',
    error: 'upstream timeout',
  };

  const result = createBedrockRequestOptions(input, 'bedrock-model');

  expect(result.messages?.[2]).toEqual({
    role: 'user',
    content: [
      {
        toolResult: {
          toolUseId: 'call-bedrock',
          status: 'error',
          content: [{ text: 'upstream timeout' }],
        },
      },
    ],
  });
});

test('merges parallel tool results and a following user message into one user turn', () => {
  const input = createInput();
  input.messages = [
    { id: 'user-bedrock', role: 'user', content: 'Look up two things.' },
    {
      id: 'assistant-bedrock',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"a"}' },
        },
        {
          id: 'call-2',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"b"}' },
        },
      ],
    },
    { id: 'tool-1', role: 'tool', toolCallId: 'call-1', content: '"A"' },
    { id: 'tool-2', role: 'tool', toolCallId: 'call-2', content: '"B"' },
    { id: 'user-2', role: 'user', content: 'Now compare them.' },
  ];

  const result = createBedrockRequestOptions(input, 'bedrock-model');

  expect(result.messages?.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'user',
  ]);
  expect(result.messages?.[2]).toEqual({
    role: 'user',
    content: [
      { toolResult: { toolUseId: 'call-1', content: [{ text: 'A' }] } },
      { toolResult: { toolUseId: 'call-2', content: [{ text: 'B' }] } },
      { text: 'Now compare them.' },
    ],
  });
});

test('does not mutate AG-UI input while constructing a Bedrock request', () => {
  const input = createInput();
  const before = structuredClone(input);

  createBedrockRequestOptions(input, 'bedrock-model');

  expect(input).toEqual(before);
});

test('rejects structured tool result content', () => {
  const input = createInput();
  input.messages = input.messages.map((message) =>
    message.role === 'tool'
      ? { ...message, content: [{ type: 'text', text: 'Structured result.' }] }
      : message,
  );

  const act = () => createBedrockRequestOptions(input, 'bedrock-model');

  expect(act).toThrow(
    'Bedrock provider currently requires text tool result content',
  );
});

test('ignores a top-level hashbrown key', () => {
  const { forwardedProps, ...standard } = createInput();
  const legacy = {
    ...standard,
    forwardedProps: {},
    hashbrown: forwardedProps.hashbrown,
  };
  const bare = { ...standard, forwardedProps: {} };

  const result = createBedrockRequestOptions(legacy, 'bedrock-model');

  expect(result).toEqual(createBedrockRequestOptions(bare, 'bedrock-model'));
});

test('adds native grounding defaults alongside application tools', () => {
  const input = createInput();

  const result = createBedrockRequestOptions(input, 'model', {
    builtInTools: { webSearch: true },
  });

  expect(result.toolConfig?.tools?.[1]).toEqual({
    systemTool: { name: 'nova_grounding' },
  });
  expect(result.toolConfig?.toolChoice).toEqual({ auto: {} });
});

test('filters foreign future provider calls and results from application replay', () => {
  const input = createInput();
  input.messages = [
    {
      id: 'a',
      role: 'assistant',
      content: 'answer',
      toolCalls: [
        {
          id: 'p',
          type: 'function',
          function: { name: 'search', arguments: '{}' },
          metadata: {
            'b4.step': { v: 99, kind: 'provider', provider: 'other' },
          },
        },
      ],
    },
    {
      id: 'r',
      role: 'tool',
      toolCallId: 'p',
      content: 'native',
      metadata: { 'b4.step': { kind: 'provider', provider: 'other' } },
    },
  ];

  const result = createBedrockRequestOptions(input, 'model');

  expect(result.messages).toEqual([
    { role: 'assistant', content: [{ text: 'answer' }] },
  ]);
});

test('clones grounding object settings while fixing the native tool name', () => {
  const input = createInput();
  const settings = {};
  const before = structuredClone(input);

  const result = createBedrockRequestOptions(input, 'model', {
    builtInTools: { webSearch: settings },
  });

  expect(result.toolConfig?.tools?.[1]).toEqual({
    systemTool: { name: 'nova_grounding' },
  });
  expect(input).toEqual(before);
  expect(settings).toEqual({});
});

test('replays ordered native content once at the earliest carrier through wire JSON', () => {
  const input = createInput();
  const content = [
    { reasoningContent: { redactedContent: new Uint8Array([0, 255]) } },
    { text: 'answer' },
  ];
  input.messages = [
    {
      id: 'reason',
      role: 'reasoning',
      content: '',
      encryptedValue: 'AP8=',
      metadata: {
        bedrock: { responseId: 'response', blockType: 'redacted_content' },
      },
    },
    {
      id: 'answer',
      role: 'assistant',
      content: 'answer',
      metadata: {
        bedrock: { responseId: 'response' },
        [ɵPROVIDER_HISTORY_METADATA_KEY]: {
          v: 1,
          provider: 'bedrock',
          ownerMessageId: 'answer',
          responseId: 'response',
          complete: true,
          payload: {
            content: encodeBedrockNative(content),
            representedMessageIds: ['reason', 'answer'],
          },
        },
      },
    },
  ];
  const restored = JSON.parse(JSON.stringify(input));
  const before = structuredClone(restored);

  const result = createBedrockRequestOptions(restored, 'model');

  expect(result.messages).toEqual([{ role: 'assistant', content }]);
  expect(restored).toEqual(before);
});
