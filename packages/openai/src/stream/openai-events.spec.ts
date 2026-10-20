import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import { mapOpenAIEvents } from './openai-events';

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

const messageId = 'run-openai:assistant';

async function* source(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  yield* events;
}

async function collectEvents(
  events: StreamEvent[],
  signal?: AbortSignal,
): Promise<AGUIEvent[]> {
  const output: AGUIEvent[] = [];

  for await (const event of mapOpenAIEvents({
    events: source(events),
    messageId,
    signal,
  })) {
    output.push(EventSchemas.parse(event));
  }

  return output;
}

function event(value: Record<string, unknown>): StreamEvent {
  return { sequence_number: 0, ...value } as unknown as StreamEvent;
}

function messageAdded(id: string): StreamEvent {
  return event({
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'message',
      id,
      role: 'assistant',
      status: 'in_progress',
      content: [],
    },
  });
}

function textDelta(itemId: string, delta: string): StreamEvent {
  return event({
    type: 'response.output_text.delta',
    item_id: itemId,
    output_index: 0,
    content_index: 0,
    delta,
    logprobs: [],
  });
}

function reasoningAdded(id: string, encrypted?: string): StreamEvent {
  return event({
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'reasoning',
      id,
      summary: [],
      ...(encrypted === undefined ? {} : { encrypted_content: encrypted }),
    },
  });
}

function reasoningDone(id: string, encrypted?: string | null): StreamEvent {
  return event({
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'reasoning',
      id,
      summary: [],
      ...(encrypted === undefined ? {} : { encrypted_content: encrypted }),
    },
  });
}

function summaryDelta(
  itemId: string,
  summaryIndex: number,
  delta: string,
): StreamEvent {
  return event({
    type: 'response.reasoning_summary_text.delta',
    item_id: itemId,
    output_index: 0,
    summary_index: summaryIndex,
    delta,
  });
}

function functionCallAdded(id: string, callId: string, name: string) {
  return event({
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'function_call', id, call_id: callId, name, arguments: '' },
  });
}

function functionCallDone(
  id: string,
  callId: string,
  name: string,
  args: string,
) {
  return event({
    type: 'response.output_item.done',
    output_index: 0,
    item: { type: 'function_call', id, call_id: callId, name, arguments: args },
  });
}

function argsDelta(itemId: string, delta: string): StreamEvent {
  return event({
    type: 'response.function_call_arguments.delta',
    item_id: itemId,
    output_index: 0,
    delta,
  });
}

const completed = event({ type: 'response.completed', response: {} });

test('maps output text and refusal deltas into one assistant message', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'Accepted. '),
    event({
      type: 'response.refusal.delta',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 1,
      delta: 'Declined.',
    }),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Accepted. ' },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Declined.' },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ]);
});

test('maps a reasoning item with two summary parts and encrypted content', async () => {
  const input = [
    reasoningAdded('rs_1'),
    summaryDelta('rs_1', 0, 'First.'),
    summaryDelta('rs_1', 1, 'Second.'),
    reasoningDone('rs_1', 'enc'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'rs_1',
      role: 'reasoning',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'rs_1',
      delta: 'First.',
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'rs_1',
      delta: '\n\n',
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'rs_1',
      delta: 'Second.',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'rs_1',
      encryptedValue: 'enc',
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_1' },
  ]);
});

test('maps a reasoning item with an empty summary to start and end only', async () => {
  const input = [
    reasoningAdded('rs_1'),
    summaryDelta('rs_1', 0, ''),
    reasoningDone('rs_1', ''),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'rs_1',
      role: 'reasoning',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_1' },
  ]);
});

test('reads encrypted content only from the done item', async () => {
  const input = [
    reasoningAdded('rs_1', 'partial'),
    reasoningDone('rs_1', 'final'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(
    events.filter(
      (output) => output.type === EventType.REASONING_ENCRYPTED_VALUE,
    ),
  ).toEqual([
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'rs_1',
      encryptedValue: 'final',
    },
  ]);
});

test('maps parallel function calls with interleaved argument deltas by item id', async () => {
  const input = [
    functionCallAdded('fc_1', 'call_1', 'lookup'),
    functionCallAdded('fc_2', 'call_2', 'search'),
    argsDelta('fc_1', '{"a":'),
    argsDelta('fc_2', '{"b":'),
    argsDelta('fc_1', '1}'),
    argsDelta('fc_2', '2}'),
    functionCallDone('fc_1', 'call_1', 'lookup', '{"a":1}'),
    functionCallDone('fc_2', 'call_2', 'search', '{"b":2}'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'lookup',
      parentMessageId: messageId,
      metadata: { openai: { itemId: 'fc_1', reasoningItemIds: [] } },
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_2',
      toolCallName: 'search',
      parentMessageId: messageId,
      metadata: { openai: { itemId: 'fc_2', reasoningItemIds: [] } },
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{"a":' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_2', delta: '{"b":' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '1}' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_2', delta: '2}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_2' },
  ]);
});

test('records reasoning item ids on the text message and tool calls that follow', async () => {
  const input = [
    reasoningAdded('rs_1'),
    reasoningDone('rs_1'),
    functionCallAdded('fc_1', 'call_1', 'lookup'),
    functionCallDone('fc_1', 'call_1', 'lookup', '{}'),
    reasoningAdded('rs_2'),
    reasoningDone('rs_2'),
    messageAdded('msg_1'),
    textDelta('msg_1', 'Done.'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'rs_1',
      role: 'reasoning',
      metadata: { openai: { itemId: 'rs_1' } },
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_1' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'lookup',
      parentMessageId: messageId,
      metadata: { openai: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'rs_2',
      role: 'reasoning',
      metadata: { openai: { itemId: 'rs_2' } },
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_2' },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      metadata: {
        openai: { itemId: 'msg_1', reasoningItemIds: ['rs_1', 'rs_2'] },
      },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Done.' },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ]);
});

test('keeps reasoning out of structured-output text', async () => {
  const json = '{"answer":"hashbrown","items":[1,2]}';
  const input = [
    reasoningAdded('rs_1'),
    summaryDelta('rs_1', 0, 'Planning the {"not":"json"} answer.'),
    reasoningDone('rs_1', 'enc'),
    messageAdded('msg_1'),
    textDelta('msg_1', '{"answer":'),
    textDelta('msg_1', '"hashbrown",'),
    textDelta('msg_1', '"items":[1,2]}'),
    completed,
  ];

  const events = await collectEvents(input);

  const text = events
    .flatMap((output) =>
      output.type === EventType.TEXT_MESSAGE_CONTENT ? [output.delta] : [],
    )
    .join('');
  expect(text).toBe(json);
  expect(JSON.parse(text)).toEqual({ answer: 'hashbrown', items: [1, 2] });
});

test('keeps text open across tool calls and ends it at completion', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'Looking. '),
    functionCallAdded('fc_1', 'call_1', 'lookup'),
    argsDelta('fc_1', '{}'),
    functionCallDone('fc_1', 'call_1', 'lookup', '{}'),
    messageAdded('msg_2'),
    textDelta('msg_2', 'Found.'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Looking. ' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'lookup',
      parentMessageId: messageId,
      metadata: { openai: { itemId: 'fc_1', reasoningItemIds: [] } },
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Found.' },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ]);
});

test('ignores built-in tool events', async () => {
  const input = [
    event({
      type: 'response.web_search_call.searching',
      item_id: 'ws_1',
      output_index: 0,
    }),
    event({ type: 'response.something_new', item_id: 'x' }),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events).toEqual([]);
});

test('throws the provider message on response.failed', async () => {
  const input = [
    event({
      type: 'response.failed',
      response: { error: { code: 'server_error', message: 'Model exploded' } },
    }),
  ];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow('Model exploded');
});

test('throws on error events', async () => {
  const input = [
    event({
      type: 'error',
      code: 'rate_limit',
      message: 'Too many requests',
      param: null,
    }),
  ];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow('Too many requests');
});

test('throws on response.incomplete', async () => {
  const input = [
    event({
      type: 'response.incomplete',
      response: { incomplete_details: { reason: 'max_output_tokens' } },
    }),
  ];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow(
    'OpenAI response incomplete: max_output_tokens',
  );
});

test('stops yielding once aborted', async () => {
  const controller = new AbortController();
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'One.'),
    textDelta('msg_1', 'Two.'),
    completed,
  ];
  const events: AGUIEvent[] = [];

  for await (const output of mapOpenAIEvents({
    events: source(input),
    messageId,
    signal: controller.signal,
  })) {
    events.push(output);
    if (output.type === EventType.TEXT_MESSAGE_CONTENT) {
      controller.abort();
    }
  }

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      metadata: { openai: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'One.' },
  ]);
});

test('throws when the stream ends before response.completed', async () => {
  const input = [messageAdded('msg_1'), textDelta('msg_1', 'Cut off.')];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow(
    'OpenAI stream ended before response.completed',
  );
});
