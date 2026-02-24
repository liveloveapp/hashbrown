import type { Chat } from '@hashbrownai/core';

import { mapChatRequestToOpenResponses } from './mapping';

test('maps chat request fields to open responses request', () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: 'gpt-4.1-mini',
    system: 'Stay terse.',
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
      {
        role: 'assistant',
        content: 'Hi there.',
        toolCalls: [
          {
            index: 0,
            id: 'call-1',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Seattle"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        toolName: 'weather',
        content: {
          status: 'fulfilled',
          value: { temp: 72 },
        },
      },
    ],
    tools: [
      {
        name: 'weather',
        description: 'Fetch the weather',
        parameters: { type: 'object' },
      },
    ],
    toolChoice: 'auto',
    responseFormat: { type: 'json_object' },
  };

  const result = mapChatRequestToOpenResponses(request);

  expect(result).toEqual({
    model: 'gpt-4.1-mini',
    instructions: 'Stay terse.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: 'Hello!',
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'Hi there.',
      },
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'weather',
        arguments: '{"city":"Seattle"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '{"status":"fulfilled","value":{"temp":72}}',
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'weather',
        description: 'Fetch the weather',
        parameters: { type: 'object' },
      },
    ],
    tool_choice: 'auto',
    response_format: { type: 'json_object' },
  });
});

test('serializes non-string content in assistant messages', () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: 'gpt-4.1-mini',
    system: '',
    messages: [
      {
        role: 'assistant',
        content: { summary: 'ok' } as unknown as string,
      },
    ],
  };

  const result = mapChatRequestToOpenResponses(request);

  expect(result.input).toEqual([
    {
      type: 'message',
      role: 'assistant',
      content: '{"summary":"ok"}',
    },
  ]);
});
