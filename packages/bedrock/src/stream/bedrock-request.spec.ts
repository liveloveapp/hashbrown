import type { RunAgentInput } from '@ag-ui/core';
import { createBedrockRequestOptions } from './bedrock-request';

function createInput(): RunAgentInput & {
  hashbrown: { responseSchema: object };
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
    forwardedProps: {},
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
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
            schema: JSON.stringify(input.hashbrown.responseSchema),
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

test('does not mutate AG-UI input while constructing a Bedrock request', () => {
  const input = createInput();
  const before = structuredClone(input);

  createBedrockRequestOptions(input, 'bedrock-model');

  expect(input).toEqual(before);
});
