import { Chat } from '../models';
import { updateMessagesWithDelta } from '../utils/update-message';

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

  const message = updateMessagesWithDelta(null, delta);

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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(null, delta);

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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(
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

  const message = updateMessagesWithDelta(null, delta);

  expect(message).toBeNull();
});
