import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import type OpenAI from 'openai';
import { mapAzureEvents } from './azure-events';

async function* source(
  chunks: OpenAI.Chat.Completions.ChatCompletionChunk[],
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  yield* chunks;
}

async function collectEvents(
  chunks: OpenAI.Chat.Completions.ChatCompletionChunk[],
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of mapAzureEvents({
    events: source(chunks),
    messageId: 'run-azure:assistant',
  })) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('maps Azure OpenAI text and refusal deltas into one AG-UI lifecycle', async () => {
  const chunks = [
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 1,
          delta: { content: 'Alternative.' },
          finish_reason: null,
        },
        {
          index: 0,
          delta: { content: 'Accepted. ', refusal: 'Declined.' },
          finish_reason: null,
        },
      ],
    },
  ] as OpenAI.Chat.Completions.ChatCompletionChunk[];

  const events = await collectEvents(chunks);

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-azure:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-azure:assistant',
      delta: 'Accepted. ',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-azure:assistant',
      delta: 'Declined.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-azure:assistant',
    },
  ]);
});

test('maps fragmented Azure OpenAI tool calls into complete AG-UI lifecycles', async () => {
  const chunks = [
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-azure',
                type: 'function',
                function: { name: 'lookup', arguments: '{"query":' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'completion-azure',
      created: 1,
      model: 'gpt-4.1',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"hashbrown"}' } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
  ] as OpenAI.Chat.Completions.ChatCompletionChunk[];

  const events = await collectEvents(chunks);

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-azure',
      toolCallName: 'lookup',
      parentMessageId: 'run-azure:assistant',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-azure',
      delta: '{"query":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-azure',
      delta: '"hashbrown"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call-azure' },
  ]);
});
