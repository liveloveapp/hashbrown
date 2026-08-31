import type { RunAgentInput } from '@ag-ui/core';
import { createAzureRequestOptions } from './azure-request';

function createInput(): RunAgentInput & {
  hashbrown: { responseSchema: object };
} {
  return {
    threadId: 'thread-azure',
    runId: 'run-azure',
    messages: [
      { id: 'system-azure', role: 'system', content: 'System prompt.' },
      {
        id: 'developer-azure',
        role: 'developer',
        content: 'Developer prompt.',
      },
      { id: 'user-azure', role: 'user', content: 'Look it up.' },
      {
        id: 'assistant-azure',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-azure',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
          },
        ],
      },
      {
        id: 'tool-azure',
        role: 'tool',
        toolCallId: 'call-azure',
        content: '{"result":"fixture"}',
      },
      {
        id: 'reasoning-azure',
        role: 'reasoning',
        content: 'Provider-private reasoning.',
      },
      {
        id: 'activity-azure',
        role: 'activity',
        activityType: 'status',
        content: { message: 'Working.' },
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

test('maps AG-UI messages, tools, and structured output to Azure OpenAI', () => {
  const input = createInput();

  const result = createAzureRequestOptions(input, 'gpt-4.1');

  expect(result).toEqual({
    stream: true,
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: 'System prompt.' },
      { role: 'developer', content: 'Developer prompt.' },
      { role: 'user', content: 'Look it up.' },
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          {
            id: 'call-azure',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: '{"result":"fixture"}',
        tool_call_id: 'call-azure',
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
          strict: true,
        },
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        strict: true,
        name: 'schema',
        description: '',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
    },
  });
});
