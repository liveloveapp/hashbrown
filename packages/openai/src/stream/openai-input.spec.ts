import type { Message } from '@ag-ui/core';
import { mapInput } from './openai-input';

test('maps system, user, assistant text, tool calls and tool results in order', () => {
  const messages: Message[] = [
    { id: 'm-1', role: 'system', content: 'Be brief.' },
    { id: 'm-2', role: 'developer', content: 'Use tools.' },
    { id: 'm-3', role: 'user', content: 'Weather?' },
    {
      id: 'm-4',
      role: 'assistant',
      content: 'Checking.',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
        },
      ],
    },
    { id: 'm-5', role: 'tool', toolCallId: 'call_1', content: 'Sunny' },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    { role: 'system', content: 'Be brief.' },
    { role: 'developer', content: 'Use tools.' },
    { role: 'user', content: 'Weather?' },
    { role: 'assistant', content: 'Checking.' },
    {
      type: 'function_call',
      call_id: 'call_1',
      name: 'getWeather',
      arguments: '{"city":"Paris"}',
    },
    { type: 'function_call_output', call_id: 'call_1', output: 'Sunny' },
  ]);
});

test('replays OpenAI reasoning with encrypted content before the turn it preceded, with item ids', () => {
  const messages: Message[] = [
    { id: 'm-1', role: 'user', content: 'Weather?' },
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Need the weather tool.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'm-2',
      role: 'assistant',
      content: 'Checking.',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1'] } },
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{}' },
          metadata: { openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
        },
      ],
    },
    { id: 'm-3', role: 'tool', toolCallId: 'call_1', content: 'Sunny' },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    { role: 'user', content: 'Weather?' },
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'Need the weather tool.' }],
      encrypted_content: 'enc-1',
    },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Checking.', annotations: [] }],
      status: 'completed',
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'getWeather',
      arguments: '{}',
    },
    { type: 'function_call_output', call_id: 'call_1', output: 'Sunny' },
  ]);
});

test('sends an empty summary array for a reasoning message with no text', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: '',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Hi.',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1'] } },
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [],
      encrypted_content: 'enc-1',
    },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hi.', annotations: [] }],
      status: 'completed',
    },
  ]);
});

test('groups several reasoning messages before one turn, in order', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'First.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: 'Second.',
      encryptedValue: 'enc-2',
      metadata: { openai: { itemId: 'rs_2' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'a', arguments: '{}' },
          metadata: { openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'b', arguments: '{}' },
          metadata: {
            openai: { itemId: 'fc_2', reasoningItemIds: ['rs_1', 'rs_2'] },
          },
        },
      ],
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'First.' }],
      encrypted_content: 'enc-1',
    },
    {
      type: 'reasoning',
      id: 'rs_2',
      summary: [{ type: 'summary_text', text: 'Second.' }],
      encrypted_content: 'enc-2',
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'a',
      arguments: '{}',
    },
    {
      type: 'function_call',
      id: 'fc_2',
      call_id: 'call_2',
      name: 'b',
      arguments: '{}',
    },
  ]);
});

test('strips item ids from a turn whose reasoning cannot be replayed', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Checking.',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1'] } },
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'a', arguments: '{}' },
          metadata: { openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
        },
      ],
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    { role: 'assistant', content: 'Checking.' },
    { type: 'function_call', call_id: 'call_1', name: 'a', arguments: '{}' },
  ]);
});

test('keeps item ids on turns that had no reasoning', () => {
  const messages: Message[] = [
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Checking.',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: [] } },
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'a', arguments: '{}' },
          metadata: { openai: { itemId: 'fc_1', reasoningItemIds: [] } },
        },
      ],
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Checking.', annotations: [] }],
      status: 'completed',
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'a',
      arguments: '{}',
    },
  ]);
});

test('drops a trailing reasoning group with nothing after it', () => {
  const messages: Message[] = [
    { id: 'm-1', role: 'user', content: 'Hi' },
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: 'More.',
      encryptedValue: 'enc-2',
      metadata: { openai: { itemId: 'rs_2' } },
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([{ role: 'user', content: 'Hi' }]);
});

test('drops a reasoning group followed by an empty assistant message', () => {
  const messages: Message[] = [
    { id: 'm-1', role: 'user', content: 'Hi' },
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'm-2',
      role: 'assistant',
      content: '',
      metadata: { openai: { reasoningItemIds: ['rs_1'] } },
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([{ role: 'user', content: 'Hi' }]);
});

test('drops reasoning from other providers', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      encryptedValue: 'sig-1',
      metadata: { anthropic: { blockType: 'thinking' } },
    },
    { id: 'm-1', role: 'assistant', content: 'Hi.' },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([{ role: 'assistant', content: 'Hi.' }]);
});

test('sends a tool error to the model instead of the tool result content', () => {
  const messages: Message[] = [
    {
      id: 't-1',
      role: 'tool',
      toolCallId: 'call-1',
      content: 'lookup failed',
      error: 'upstream timeout',
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    {
      type: 'function_call_output',
      call_id: 'call-1',
      output: '{"error":"upstream timeout"}',
    },
  ]);
});

test('drops activity messages', () => {
  const messages: Message[] = [
    { id: 'm-1', role: 'user', content: 'Hi' },
    {
      id: 'a-1',
      role: 'activity',
      activityType: 'progress',
      content: { step: 1 },
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([{ role: 'user', content: 'Hi' }]);
});

test('throws on malformed metadata.openai', () => {
  const notAnObject: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: '',
      encryptedValue: 'enc-1',
      metadata: { openai: 'rs_1' },
    },
    { id: 'm-1', role: 'assistant', content: 'Hi.' },
  ];
  const nonStringItemId: Message[] = [
    {
      id: 'r-2',
      role: 'reasoning',
      content: '',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 42 } },
    },
    { id: 'm-1', role: 'assistant', content: 'Hi.' },
  ];

  const mapNotAnObject = () => mapInput(notAnObject);
  const mapNonStringItemId = () => mapInput(nonStringItemId);

  expect(mapNotAnObject).toThrow(
    'OpenAI reasoning message "r-1" metadata.openai must be an object',
  );
  expect(mapNonStringItemId).toThrow(
    'OpenAI reasoning message "r-2" metadata.openai.itemId must be a string',
  );
});

test('throws on non-text user content', () => {
  const messages: Message[] = [
    {
      id: 'm-1',
      role: 'user',
      content: [{ type: 'text', text: 'Hi' }],
    },
  ];

  const map = () => mapInput(messages);

  expect(map).toThrow('OpenAI provider currently requires text user content');
});

test("drops all reasoning and item ids when only part of a turn's reasoning can be replayed", () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'First.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: 'Second.',
      metadata: { openai: { itemId: 'rs_2' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Checking.',
      metadata: {
        openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1', 'rs_2'] },
      },
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'a', arguments: '{}' },
          metadata: {
            openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1', 'rs_2'] },
          },
        },
      ],
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    { role: 'assistant', content: 'Checking.' },
    { type: 'function_call', call_id: 'call_1', name: 'a', arguments: '{}' },
  ]);
});

test('drops reasoning and item ids recorded by the Azure provider', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      encryptedValue: 'enc-1',
      metadata: { azure: { itemId: 'rs_1' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Hi.',
      metadata: { azure: { itemId: 'msg_1', reasoningItemIds: ['rs_1'] } },
    },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([{ role: 'assistant', content: 'Hi.' }]);
});

test('a provider web search call and its result are not replayed as function calls', () => {
  const messages: Message[] = [
    { id: 'u-1', role: 'user', content: 'Search' },
    {
      id: 'm-1',
      role: 'assistant',
      content: 'Here is what I found.',
      metadata: { openai: { itemId: 'msg_1' } },
      toolCalls: [
        {
          id: 'ws_1',
          type: 'function',
          function: { name: 'web_search', arguments: '{}' },
          metadata: { openai: { itemType: 'web_search_call' } },
        },
        {
          id: 'ws_2',
          type: 'function',
          function: { name: 'web_search', arguments: '{}' },
          metadata: { 'b4.step': { v: 1, kind: 'provider' } },
        },
      ],
    },
    { id: 't-1', role: 'tool', toolCallId: 'ws_1', content: '{}' },
    { id: 't-2', role: 'tool', toolCallId: 'ws_2', content: '{}' },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    { role: 'user', content: 'Search' },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      content: [
        { type: 'output_text', text: 'Here is what I found.', annotations: [] },
      ],
      status: 'completed',
    },
  ]);
});

test('client function calls in the same turn still replay, with reasoning', () => {
  const messages: Message[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'Thinking.',
      encryptedValue: 'enc-1',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      id: 'm-1',
      role: 'assistant',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1'] } },
      toolCalls: [
        {
          id: 'ws_1',
          type: 'function',
          function: { name: 'web_search', arguments: '{}' },
          metadata: {
            openai: {
              itemType: 'web_search_call',
              reasoningItemIds: ['rs_missing'],
            },
          },
        },
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'a', arguments: '{}' },
          metadata: { openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
        },
      ],
    },
    { id: 't-1', role: 'tool', toolCallId: 'ws_1', content: '{}' },
    { id: 't-2', role: 'tool', toolCallId: 'call_1', content: '"ok"' },
  ];

  const input = mapInput(messages);

  expect(input).toEqual([
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'Thinking.' }],
      encrypted_content: 'enc-1',
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'a',
      arguments: '{}',
    },
    { type: 'function_call_output', call_id: 'call_1', output: '"ok"' },
  ]);
});
