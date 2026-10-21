import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{}' },
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

test('emits the finished arguments when a function call streamed no argument deltas', async () => {
  const input = [
    functionCallAdded('fc_1', 'call_1', 'lookup'),
    functionCallDone('fc_1', 'call_1', 'lookup', '{"a":1}'),
    functionCallAdded('fc_2', 'call_2', 'search'),
    argsDelta('fc_2', '{"b":2}'),
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
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{"a":1}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_2',
      toolCallName: 'search',
      parentMessageId: messageId,
      metadata: { openai: { itemId: 'fc_2', reasoningItemIds: [] } },
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_2', delta: '{"b":2}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_2' },
  ]);
});

function webSearchAdded(id: string): StreamEvent {
  return event({
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'web_search_call',
      id,
      status: 'in_progress',
      action: { type: 'search' },
    },
  });
}

function webSearchDone(
  id: string,
  action: Record<string, unknown>,
  status = 'completed',
): StreamEvent {
  return event({
    type: 'response.output_item.done',
    output_index: 0,
    item: { type: 'web_search_call', id, status, action },
  });
}

function urlCitation(
  itemId: string,
  url: string,
  title: string,
  start: number,
  end: number,
): StreamEvent {
  return event({
    type: 'response.output_text.annotation.added',
    item_id: itemId,
    output_index: 1,
    content_index: 0,
    annotation_index: 0,
    annotation: {
      type: 'url_citation',
      url,
      title,
      start_index: start,
      end_index: end,
    },
  });
}

function mockClock(...times: number[]): void {
  const spy = jest.spyOn(Date, 'now');
  for (const time of times) {
    spy.mockReturnValueOnce(time);
  }
}

afterAll(() => {
  jest.restoreAllMocks();
});

const runningStep = {
  v: 1,
  kind: 'provider',
  builtin: 'web_search',
  provider: 'openai',
  status: 'running',
  label: 'Searching the web',
  startedAt: 1000,
};

test('a web_search_call becomes a provider step with queries and sources', async () => {
  const action = {
    type: 'search',
    query: 'hashbrown',
    queries: ['hashbrown', 'hashbrown ai'],
    sources: [
      { type: 'url', url: 'https://hashbrown.dev' },
      { type: 'url', url: 'https://github.com/liveloveapp/hashbrown' },
    ],
  };
  const input = [
    webSearchAdded('ws_1'),
    webSearchDone('ws_1', action),
    completed,
  ];
  mockClock(1000, 2000);

  const events = await collectEvents(input);

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'ws_1',
      toolCallName: 'web_search',
      parentMessageId: messageId,
      metadata: {
        openai: { itemId: 'ws_1', itemType: 'web_search_call' },
        'b4.step': runningStep,
      },
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'ws_1',
      delta: JSON.stringify(action),
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'ws_1' },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'ws_1:result',
      toolCallId: 'ws_1',
      content: JSON.stringify({ action, status: 'completed' }),
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'provider',
          builtin: 'web_search',
          provider: 'openai',
          status: 'completed',
          label: "Searched 'hashbrown' · 2 sources",
          queries: ['hashbrown', 'hashbrown ai'],
          sources: [
            {
              id: 'ws_1:0',
              kind: 'url',
              title: 'https://hashbrown.dev',
              href: 'https://hashbrown.dev',
            },
            {
              id: 'ws_1:1',
              kind: 'url',
              title: 'https://github.com/liveloveapp/hashbrown',
              href: 'https://github.com/liveloveapp/hashbrown',
            },
          ],
          startedAt: 1000,
          settledAt: 2000,
        },
      },
    },
  ]);
});

test('a failed web_search_call becomes a failed step', async () => {
  const action = { type: 'search', query: 'hashbrown' };
  const input = [
    webSearchAdded('ws_1'),
    webSearchDone('ws_1', action, 'failed'),
    completed,
  ];
  mockClock(1000, 2000);

  const events = await collectEvents(input);

  expect(events.at(-1)).toEqual({
    type: EventType.TOOL_CALL_RESULT,
    messageId: 'ws_1:result',
    toolCallId: 'ws_1',
    content: JSON.stringify({ action, status: 'failed' }),
    metadata: {
      'b4.step': {
        v: 1,
        kind: 'provider',
        builtin: 'web_search',
        provider: 'openai',
        status: 'failed',
        label: 'Web search failed',
        queries: ['hashbrown'],
        startedAt: 1000,
        settledAt: 2000,
        error: { message: 'Web search failed' },
      },
    },
  });
});

test('url_citation annotations become b4.answer citations pointing at source ids', async () => {
  const action = {
    type: 'search',
    query: 'hashbrown',
    sources: [
      { type: 'url', url: 'https://a.example' },
      { type: 'url', url: 'https://b.example/page' },
    ],
  };
  const input = [
    webSearchAdded('ws_1'),
    webSearchDone('ws_1', action),
    messageAdded('msg_1'),
    textDelta('msg_1', 'Hashbrown is '),
    textDelta('msg_1', 'a framework.'),
    urlCitation(
      'msg_1',
      'https://b.example/page?utm_source=openai',
      'B',
      13,
      24,
    ),
    urlCitation('msg_1', 'https://a.example', 'A', 0, 9),
    completed,
  ];
  mockClock(1000, 2000);

  const events = await collectEvents(input);

  expect(events.at(-1)).toEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    metadata: {
      'b4.answer': {
        v: 1,
        citations: [
          {
            sourceId: 'ws_1:1',
            quote: 'a framework',
            block: 0,
            start: 13,
            end: 24,
          },
          {
            sourceId: 'ws_1:0',
            quote: 'Hashbrown',
            block: 0,
            start: 0,
            end: 9,
          },
        ],
      },
    },
  });
});

test('a url_citation with no matching source adds an answer-level source', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'See the docs.'),
    urlCitation('msg_1', 'https://docs.example', 'Docs', 4, 12),
    urlCitation('msg_1', 'https://docs.example', 'Docs', 0, 3),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events.at(-1)).toEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    metadata: {
      'b4.answer': {
        v: 1,
        citations: [
          {
            sourceId: `${messageId}:cite:0`,
            quote: 'the docs',
            block: 0,
            start: 4,
            end: 12,
          },
          {
            sourceId: `${messageId}:cite:0`,
            quote: 'See',
            block: 0,
            start: 0,
            end: 3,
          },
        ],
        sources: [
          {
            id: `${messageId}:cite:0`,
            kind: 'url',
            title: 'Docs',
            href: 'https://docs.example',
          },
        ],
      },
    },
  });
});

test('citation spans count text from earlier message items', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'One. '),
    messageAdded('msg_2'),
    textDelta('msg_2', 'Two.'),
    urlCitation('msg_2', 'https://two.example', 'Two', 0, 3),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events.at(-1)).toMatchObject({
    metadata: {
      'b4.answer': {
        citations: [
          {
            sourceId: `${messageId}:cite:0`,
            quote: 'Two',
            block: 0,
            start: 5,
            end: 8,
          },
        ],
      },
    },
  });
});

test('a web_search_call added via transformRequestOptions still maps, without sources', async () => {
  const action = { type: 'search', query: 'hashbrown' };
  const input = [
    webSearchAdded('ws_1'),
    webSearchDone('ws_1', action),
    completed,
  ];
  mockClock(1000, 2000);

  const events = await collectEvents(input);

  expect(events.map((output) => output.type)).toEqual([
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.TOOL_CALL_RESULT,
  ]);
  expect(events.at(-1)).toMatchObject({
    metadata: {
      'b4.step': {
        status: 'completed',
        label: "Searched 'hashbrown'",
        queries: ['hashbrown'],
      },
    },
  });
  expect(
    (events.at(-1) as { metadata: Record<string, Record<string, unknown>> })
      .metadata['b4.step'],
  ).not.toHaveProperty('sources');
});

test('ignores non-url annotations', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'Text.'),
    event({
      type: 'response.output_text.annotation.added',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 0,
      annotation_index: 0,
      annotation: {
        type: 'file_citation',
        file_id: 'f',
        filename: 'f',
        index: 0,
      },
    }),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events.at(-1)).toEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
  });
});

test('skips a url_citation for a part with no recorded offset', async () => {
  const input = [
    messageAdded('msg_1'),
    textDelta('msg_1', 'Text.'),
    event({
      type: 'response.output_text.annotation.added',
      item_id: 'msg_1',
      output_index: 0,
      content_index: 3,
      annotation_index: 0,
      annotation: {
        type: 'url_citation',
        url: 'https://a.example',
        title: 'A',
        start_index: 0,
        end_index: 4,
      },
    }),
    completed,
  ];

  const events = await collectEvents(input);

  expect(events.at(-1)).toEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
  });
});

test('maps a live-captured web search turn to a provider step, sources and citations', async () => {
  // Responses SSE events captured once from the live API (gpt-4.1-mini with
  // web_search and `web_search_call.action.sources`). aimock's recorder keeps
  // only search queries, so sources and citations are proven here.
  const input = JSON.parse(
    readFileSync(
      resolve(__dirname, 'fixtures/web-search-live.events.json'),
      'utf8',
    ),
  ) as StreamEvent[];

  const events = await collectEvents(input);

  const text = events
    .flatMap((output) =>
      output.type === EventType.TEXT_MESSAGE_CONTENT ? [output.delta] : [],
    )
    .join('');
  const result = events.find(
    (output) => output.type === EventType.TOOL_CALL_RESULT,
  );
  const step = (result?.metadata as Record<string, unknown> | undefined)?.[
    'b4.step'
  ] as { sources?: { id: string; href?: string }[] } | undefined;
  const end = events.find(
    (output) => output.type === EventType.TEXT_MESSAGE_END,
  );
  const answer = (end?.metadata as Record<string, unknown> | undefined)?.[
    'b4.answer'
  ] as
    | {
        citations?: {
          sourceId: string;
          quote?: string;
          start?: number;
          end?: number;
        }[];
        sources?: { id: string }[];
      }
    | undefined;
  const sourceIds = new Set(
    [...(step?.sources ?? []), ...(answer?.sources ?? [])].map(
      (source) => source.id,
    ),
  );

  expect(step?.sources?.length ?? 0).toBeGreaterThanOrEqual(1);
  expect(
    step?.sources?.every((source) => typeof source.href === 'string'),
  ).toBe(true);
  expect(answer?.citations?.length ?? 0).toBeGreaterThanOrEqual(1);
  for (const citation of answer?.citations ?? []) {
    expect(sourceIds.has(citation.sourceId)).toBe(true);
    expect(citation.quote).toBe(text.slice(citation.start, citation.end));
  }
});
