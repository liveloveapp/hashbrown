import { type AGUIEvent, EventType } from '@ag-ui/core';
import { Chat } from '../models';
import { createCompletionChunkEventAdapter } from './completion-chunk-to-agui-events';

function chunk(
  delta: Chat.Api.CompletionChunk['choices'][number]['delta'],
): Chat.Api.CompletionChunk {
  return {
    choices: [{ index: 0, delta, finishReason: null }],
  };
}

test('converts legacy text chunks into AG-UI text events', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const first = adapter.push(chunk({ role: 'assistant', content: 'Hello' }));
  const second = adapter.push(chunk({ content: ' world' }));
  const finished = adapter.finish();

  expect([...first, ...second, ...finished]).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'Hello',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: ' world',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-1',
    },
  ] satisfies AGUIEvent[]);
});

test('converts interleaved legacy tool deltas into AG-UI tool events', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const first = adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-weather',
          type: 'function',
          function: { name: 'weather', arguments: '{"city":' },
        },
        {
          index: 1,
          id: 'call-time',
          type: 'function',
          function: { name: 'time', arguments: '{"zone":' },
        },
      ],
    }),
  );
  const second = adapter.push(
    chunk({
      toolCalls: [
        { index: 1, function: { arguments: '"UTC"}' } },
        { index: 0, function: { arguments: '"Paris"}' } },
      ],
    }),
  );
  const finished = adapter.finish();

  expect([...first, ...second, ...finished]).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-weather',
      delta: '{"city":',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-time',
      toolCallName: 'time',
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-time',
      delta: '{"zone":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-time',
      delta: '"UTC"}',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-weather',
      delta: '"Paris"}',
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-weather',
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-time',
    },
  ] satisfies AGUIEvent[]);
});

test('buffers tool arguments until legacy chunks provide an id and name', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const buffered = adapter.push(
    chunk({
      toolCalls: [{ index: 0, function: { arguments: '{"value":' } }],
    }),
  );
  const identified = adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-1',
          function: { name: 'submit', arguments: '1}' },
        },
      ],
    }),
  );

  expect(buffered).toEqual([]);
  expect(identified).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'submit',
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '{"value":1}',
    },
  ] satisfies AGUIEvent[]);
});

test('serializes object-valued legacy tool arguments into AG-UI deltas', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const events = adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-weather',
          type: 'function',
          function: {
            name: 'weather',
            arguments: { city: 'Paris' } as unknown as string,
          },
        },
      ],
    }),
  );

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-weather',
      delta: '{"city":"Paris"}',
    },
  ] satisfies AGUIEvent[]);
});

test('preserves tool metadata and resolves indexless deltas by id', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const started = adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-1',
          type: 'function',
          function: { name: 'submit', arguments: '{"value":' },
        },
      ],
    }),
  );
  const continued = adapter.push(
    chunk({
      toolCalls: [
        {
          id: 'call-1',
          function: { arguments: '1}' },
          metadata: { signature: 'opaque' },
        },
      ],
    }),
  );

  expect([...started, ...continued]).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'submit',
      parentMessageId: 'message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '{"value":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '1}',
      rawEvent: {
        hashbrown: {
          metadata: { signature: 'opaque' },
        },
      },
    },
  ] satisfies AGUIEvent[]);
});

test('emits metadata-only legacy deltas after a tool call starts', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');
  adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-1',
          type: 'function',
          function: { name: 'submit', arguments: '{}' },
        },
      ],
    }),
  );

  const events = adapter.push(
    chunk({
      toolCalls: [
        {
          index: 0,
          id: 'call-1',
          metadata: { google: { thoughtSignature: 'opaque' } },
        },
      ],
    }),
  );

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '',
      rawEvent: {
        hashbrown: {
          metadata: { google: { thoughtSignature: 'opaque' } },
        },
      },
    },
  ] satisfies AGUIEvent[]);
});

test('ignores empty legacy chunks and finishes idempotently', () => {
  const adapter = createCompletionChunkEventAdapter('message-1');

  const empty = adapter.push({ choices: [] });
  const firstFinish = adapter.finish();
  const secondFinish = adapter.finish();

  expect(empty).toEqual([]);
  expect(firstFinish).toEqual([]);
  expect(secondFinish).toEqual([]);
});
