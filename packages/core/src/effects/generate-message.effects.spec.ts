import { Chat } from '../models';
import {
  _extractMessageDelta,
  _updateMessagesWithDelta,
} from './generate-message.effects';

test('extractMessageDelta returns all messages when no assistant is present', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Hello',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual(messages);
});

test('extractMessageDelta returns messages after the last assistant message', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Hi',
    },
    {
      role: 'assistant',
      content: 'Hello there!',
    },
    {
      role: 'user',
      content: 'How are you?',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual([
    {
      role: 'user',
      content: 'How are you?',
    },
  ]);
});

test('extractMessageDelta isolates tool messages following the assistant', () => {
  const toolMessage: Chat.Api.ToolMessage = {
    role: 'tool',
    content: { status: 'fulfilled', value: '42' },
    toolCallId: 'call-1',
    toolName: 'answer',
  };

  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Compute?',
    },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          index: 0,
          type: 'function',
          function: {
            name: 'answer',
            arguments: '{}',
          },
        },
      ],
    },
    toolMessage,
  ];

  expect(_extractMessageDelta(messages)).toEqual([toolMessage]);
});

test('extractMessageDelta returns an empty array when the last message is assistant', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'user',
      content: 'Start',
    },
    {
      role: 'assistant',
      content: 'Done',
    },
  ];

  expect(_extractMessageDelta(messages)).toEqual([]);
});

test('updateMessagesWithDelta works without an initial message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: 'Hello, world!',
        },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta works with an initial message', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: ' world!',
        },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta works with an initial message and a tool call', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: ' world!',
        },
        finishReason: 'stop',
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
      toolCalls: [
        {
          id: '1',
          index: 0,
          type: 'function',
          function: {
            name: 'get_current_time',
            arguments: '{}',
          },
        },
      ],
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello, world!',
    toolCalls: [
      {
        id: '1',
        index: 0,
        type: 'function',
        function: {
          name: 'get_current_time',
          arguments: '{}',
        },
      },
    ],
  });
});

test('updateMessagesWithDelta works when there are no choices in the delta', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: 'Hello,',
      toolCalls: [],
    },
    delta,
  );

  expect(message).toEqual({
    role: 'assistant',
    content: 'Hello,',
    toolCalls: [],
  });
});

test('updateMessagesWithDelta adds a first tool call', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          // no content in this chunk – only a tool call
          toolCalls: [
            {
              id: 'tc-1',
              index: 0,
              type: 'function',
              function: {
                name: 'get_current_time',
                arguments: '{}',
              },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toEqual({
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'tc-1',
        index: 0,
        type: 'function',
        function: {
          name: 'get_current_time',
          arguments: '{}',
        },
      },
    ],
  });
});

test('updateMessagesWithDelta merges tool-call arguments when index matches', () => {
  const existingToolCall = {
    id: 'tc-1',
    index: 0,
    type: 'function',
    function: {
      name: 'get_current_time',
      arguments: '{"tz":"UTC"}',
    },
  };

  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          toolCalls: [
            {
              index: existingToolCall.index,
              function: {
                arguments: ',"format":"iso8601"',
              },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: '',
      toolCalls: [existingToolCall],
    },
    delta,
  );

  expect(message?.toolCalls).toEqual([
    {
      ...existingToolCall,
      function: {
        ...existingToolCall.function,
        arguments: '{"tz":"UTC"},"format":"iso8601"', // concatenated
      },
    },
  ]);
});

test('updateMessagesWithDelta appends a new tool call when index differs', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          toolCalls: [
            {
              id: 'tc-2',
              index: 1,
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"PDX"}',
              },
            },
          ],
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'tc-1',
          index: 0,
          type: 'function',
          function: {
            name: 'get_current_time',
            arguments: '{}',
          },
        },
      ],
    },
    delta,
  );

  expect(message?.toolCalls).toHaveLength(2);
  expect(message?.toolCalls?.[1]).toMatchObject({
    id: 'tc-2',
    index: 1,
    function: { name: 'get_weather' },
  });
});

test('updateMessagesWithDelta treats undefined content as empty string', () => {
  const delta: Chat.Api.CompletionChunk = {
    choices: [
      {
        index: 0,
        finishReason: 'stop',
        delta: {
          role: 'assistant',
          content: 'Hi!',
        },
      },
    ],
  };

  const message = _updateMessagesWithDelta(
    {
      role: 'assistant',
      toolCalls: [],
    },
    delta,
  );

  expect(message?.content).toBe('Hi!');
});

test('updateMessagesWithDelta returns null when nothing to update', () => {
  const delta: Chat.Api.CompletionChunk = { choices: [] };

  const message = _updateMessagesWithDelta(null, delta);

  expect(message).toBeNull();
});
