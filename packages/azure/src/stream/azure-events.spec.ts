import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import { mapAzureEvents } from './azure-events';

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

const messageId = 'run-azure:assistant';

async function* source(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  yield* events;
}

async function collectEvents(
  events: StreamEvent[],
  signal?: AbortSignal,
): Promise<AGUIEvent[]> {
  const output: AGUIEvent[] = [];

  for await (const event of mapAzureEvents({
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
      metadata: { azure: { itemId: 'msg_1', reasoningItemIds: [] } },
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
      metadata: { azure: { itemId: 'rs_1' } },
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
      metadata: { azure: { itemId: 'rs_1' } },
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
      metadata: { azure: { itemId: 'fc_1', reasoningItemIds: [] } },
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_2',
      toolCallName: 'search',
      parentMessageId: messageId,
      metadata: { azure: { itemId: 'fc_2', reasoningItemIds: [] } },
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
      metadata: { azure: { itemId: 'rs_1' } },
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_1' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'lookup',
      parentMessageId: messageId,
      metadata: { azure: { itemId: 'fc_1', reasoningItemIds: ['rs_1'] } },
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'rs_2',
      role: 'reasoning',
      metadata: { azure: { itemId: 'rs_2' } },
    },
    { type: EventType.REASONING_MESSAGE_END, messageId: 'rs_2' },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      metadata: {
        azure: { itemId: 'msg_1', reasoningItemIds: ['rs_1', 'rs_2'] },
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
      metadata: { azure: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Looking. ' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'lookup',
      parentMessageId: messageId,
      metadata: { azure: { itemId: 'fc_1', reasoningItemIds: [] } },
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

test('ends the text at response.incomplete instead of throwing', async () => {
  const input = [
    event({
      type: 'response.output_text.delta',
      item_id: 'msg_1',
      delta: 'Cut',
    }),
    event({
      type: 'response.incomplete',
      response: {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      },
    }),
  ];

  const events = await collectEvents(input);

  expect(events.map((event) => event.type)).toEqual([
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
  ]);
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

  for await (const output of mapAzureEvents({
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
      metadata: { azure: { itemId: 'msg_1', reasoningItemIds: [] } },
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'One.' },
  ]);
});

test('throws when the stream ends before response.completed', async () => {
  const input = [messageAdded('msg_1'), textDelta('msg_1', 'Cut off.')];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow(
    'Azure OpenAI stream ended before response.completed',
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
      metadata: { azure: { itemId: 'fc_1', reasoningItemIds: [] } },
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{"a":1}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call_1' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_2',
      toolCallName: 'search',
      parentMessageId: messageId,
      metadata: { azure: { itemId: 'fc_2', reasoningItemIds: [] } },
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
  annotationIndex = 0,
): StreamEvent {
  return event({
    type: 'response.output_text.annotation.added',
    item_id: itemId,
    output_index: 1,
    content_index: 0,
    annotation_index: annotationIndex,
    annotation: {
      type: 'url_citation',
      url,
      title,
      start_index: start,
      end_index: end,
    },
  });
}

function mockClock(...times: number[]): jest.SpiedFunction<typeof Date.now> {
  const spy = jest.spyOn(Date, 'now');
  for (const time of times) {
    spy.mockReturnValueOnce(time);
  }
  return spy;
}

const runningStep = {
  v: 1,
  kind: 'provider',
  builtin: 'web_search',
  provider: 'azure',
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
  const clock = mockClock(1000, 2000);

  const events = await collectEvents(input);
  clock.mockRestore();

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'ws_1',
      toolCallName: 'web_search',
      parentMessageId: messageId,
      metadata: {
        azure: { itemId: 'ws_1', itemType: 'web_search_call' },
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
          provider: 'azure',
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
  const clock = mockClock(1000, 2000);

  const events = await collectEvents(input);
  clock.mockRestore();

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
        provider: 'azure',
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
    urlCitation('msg_1', 'https://a.example', 'A', 0, 9, 1),
    completed,
  ];
  const clock = mockClock(1000, 2000);

  const events = await collectEvents(input);
  clock.mockRestore();

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

test('a citation matches a source that alone carries utm_source', async () => {
  const action = {
    type: 'search',
    query: 'hashbrown',
    sources: [
      { type: 'url', url: 'https://a.example/?utm_source=openai' },
      { type: 'url', url: 'https://b.example/page?utm_source=openai' },
    ],
  };
  const input = [
    webSearchAdded('ws_1'),
    webSearchDone('ws_1', action),
    messageAdded('msg_1'),
    textDelta('msg_1', 'Hashbrown is a framework.'),
    urlCitation('msg_1', 'https://b.example/page', 'B', 13, 24),
    urlCitation('msg_1', 'https://a.example', 'A', 0, 9, 1),
    completed,
  ];
  const clock = mockClock(1000, 2000);

  const events = await collectEvents(input);
  clock.mockRestore();

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
    urlCitation('msg_1', 'https://docs.example', 'Docs', 0, 3, 1),
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
  const clock = mockClock(1000, 2000);

  const events = await collectEvents(input);
  clock.mockRestore();

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

test('ignores unsupported annotations', async () => {
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
        type: 'unsupported',
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

test('maps the OpenAI live-captured web search turn to a provider step, sources and citations', async () => {
  // Reuses the OpenAI live capture (gpt-4.1-mini with web_search and
  // `web_search_call.action.sources`): Azure streams the same Responses event
  // shapes. Azure's own sources and citations are not yet verified live, since
  // aimock's recorder keeps only search queries.
  const input = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../openai/src/stream/fixtures/web-search-live.events.json',
      ),
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
    expect(typeof citation.start).toBe('number');
    expect(typeof citation.end).toBe('number');
    expect(citation.quote).toBe(text.slice(citation.start, citation.end));
  }
});

function nativeMessage(text: string, annotations: unknown[] = []) {
  return {
    type: 'message',
    id: 'native',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations }],
  };
}

function fileAnnotation(fields: Record<string, unknown> = {}) {
  return {
    type: 'container_file_citation',
    file_id: 'file',
    container_id: 'container',
    filename: 'report.csv',
    start_index: 0,
    end_index: 4,
    ...fields,
  };
}

function nativeAnnotation(annotation: unknown, index = 0, contentIndex = 0) {
  return event({
    type: 'response.output_text.annotation.added',
    item_id: 'native',
    content_index: contentIndex,
    annotation_index: index,
    annotation,
  });
}

function answerOf(events: AGUIEvent[]) {
  return (events.at(-1) as { metadata?: Record<string, unknown> }).metadata?.[
    'b4.answer'
  ] as {
    sources: Record<string, unknown>[];
    citations: Record<string, unknown>[];
  };
}

test('reconciles final-only text and native file annotations once per occurrence', async () => {
  const annotation = fileAnnotation();
  const item = nativeMessage('File ready', [annotation, annotation]);
  const input = [
    nativeAnnotation(annotation),
    event({ type: 'response.output_item.done', item }),
    event({ type: 'response.completed', response: { output: [item] } }),
  ];

  const events = await collectEvents(input);
  const answer = answerOf(events);

  expect(
    events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta)
      .join(''),
  ).toBe('File ready');
  expect(answer.sources).toEqual([
    {
      id: `${messageId}:cite:0`,
      kind: 'file',
      title: 'report.csv',
      fileId: 'file',
      containerId: 'container',
    },
  ]);
  expect(answer.citations).toHaveLength(2);
  expect(answer.citations[0]).toEqual({
    sourceId: `${messageId}:cite:0`,
    quote: 'File',
    block: 0,
    start: 0,
    end: 4,
  });
});

test('appends only the final native suffix for each text part', async () => {
  const input = [
    textDelta('native', 'File'),
    event({
      type: 'response.output_item.done',
      item: nativeMessage('File ready', [fileAnnotation()]),
    }),
    completed,
  ];

  const events = await collectEvents(input);

  expect(
    events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta),
  ).toEqual(['File', ' ready']);
  expect(answerOf(events).citations[0]['quote']).toBe('File');
});

test('rejects contradictory final text without exposing native text', async () => {
  const input = [
    textDelta('native', 'File'),
    event({
      type: 'response.output_item.done',
      item: nativeMessage('PRIVATE'),
    }),
    completed,
  ];

  const result = collectEvents(input);

  await expect(result).rejects.toThrow('Inconsistent native response text');
});

for (const fields of [
  {
    type: 'file_citation',
    index: 0,
    start_index: undefined,
    end_index: undefined,
  },
  { start_index: -1 },
  { end_index: 100 },
  { start_index: 1.5 },
  { end_index: 0 },
]) {
  test(`retains file source without invalid span ${JSON.stringify(fields)}`, async () => {
    const input = [
      textDelta('native', 'File'),
      nativeAnnotation(fileAnnotation(fields)),
      completed,
    ];

    const events = await collectEvents(input);

    expect(answerOf(events).sources[0]['fileId']).toBe('file');
    expect(answerOf(events).citations).toEqual([
      { sourceId: `${messageId}:cite:0` },
    ]);
  });
}

test('uses file and container identity and keeps mixed URL occurrences', async () => {
  const annotations = [
    fileAnnotation(),
    fileAnnotation({ filename: 'renamed.csv' }),
    fileAnnotation({ container_id: 'other' }),
    {
      type: 'url_citation',
      url: 'https://example.com',
      title: 'Web',
      start_index: 0,
      end_index: 4,
    },
  ];
  const input = [
    event({
      type: 'response.completed',
      response: { output: [nativeMessage('File', annotations)] },
    }),
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).sources.map((s) => s['kind'])).toEqual([
    'file',
    'file',
    'url',
  ]);
  expect(answerOf(events).citations).toHaveLength(4);
  expect(answerOf(events).citations[0]['sourceId']).toBe(
    answerOf(events).citations[1]['sourceId'],
  );
});

test('omits file spans for astral text', async () => {
  const input = [
    textDelta('native', 'File 😀'),
    nativeAnnotation(fileAnnotation()),
    completed,
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).citations).toEqual([
    { sourceId: `${messageId}:cite:0` },
  ]);
});

test('omits file spans for interleaved parts but keeps separate part positions', async () => {
  const second = event({
    type: 'response.output_text.delta',
    item_id: 'native',
    content_index: 1,
    delta: 'Second',
  });
  const input = [
    textDelta('native', 'Fi'),
    second,
    textDelta('native', 'le'),
    nativeAnnotation(fileAnnotation()),
    nativeAnnotation(fileAnnotation({ file_id: 'second', end_index: 6 }), 0, 1),
    completed,
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).citations[0]).toEqual({
    sourceId: `${messageId}:cite:0`,
  });
  expect(answerOf(events).citations[1]).toEqual({
    sourceId: `${messageId}:cite:1`,
    quote: 'Second',
    block: 0,
    start: 2,
    end: 8,
  });
});

test('retains annotations on an empty native message without inventing text', async () => {
  const input = [
    event({
      type: 'response.completed',
      response: { output: [nativeMessage('', [fileAnnotation()])] },
    }),
  ];

  const events = await collectEvents(input);

  expect(events.map((e) => e.type)).toEqual([
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_END,
  ]);
  expect(answerOf(events).citations).toEqual([
    { sourceId: `${messageId}:cite:0` },
  ]);
});

test('retains streamed annotation before text and deduplicates repeated delivery', async () => {
  const annotation = nativeAnnotation(fileAnnotation());
  const input = [
    annotation,
    annotation,
    textDelta('native', 'File'),
    completed,
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).citations).toHaveLength(1);
  expect(answerOf(events).citations[0]['quote']).toBe('File');
});

test('keeps file annotations with unknown part offsets without positions', async () => {
  const input = [
    textDelta('native', 'File'),
    nativeAnnotation(fileAnnotation(), 0, 5),
    completed,
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).citations).toEqual([
    { sourceId: `${messageId}:cite:0` },
  ]);
});

test('reconciles final multipart suffix and annotation offsets', async () => {
  const item = {
    ...nativeMessage('First', []),
    content: [
      { type: 'output_text', text: 'First', annotations: [] },
      {
        type: 'output_text',
        text: 'File ready',
        annotations: [fileAnnotation()],
      },
    ],
  };
  const input = [
    textDelta('native', 'First'),
    event({
      type: 'response.output_text.delta',
      item_id: 'native',
      content_index: 1,
      delta: 'File',
    }),
    event({ type: 'response.completed', response: { output: [item] } }),
  ];

  const events = await collectEvents(input);

  expect(
    events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta)
      .join(''),
  ).toBe('FirstFile ready');
  expect(answerOf(events).citations[0]).toEqual({
    sourceId: `${messageId}:cite:0`,
    quote: 'File',
    block: 0,
    start: 5,
    end: 9,
  });
});

test('matches real code image URLs to call sources without assigning files to a call', async () => {
  const item = {
    type: 'code_interpreter_call',
    id: 'code',
    code: null,
    container_id: 'container',
    status: 'completed',
    outputs: [{ type: 'image', url: 'https://image.example/file' }],
  };
  const annotations = [
    {
      type: 'url_citation',
      url: 'https://image.example/file?utm_source=openai',
      title: 'Image',
      start_index: 0,
      end_index: 4,
    },
    fileAnnotation(),
  ];
  const input = [
    event({
      type: 'response.completed',
      response: { output: [item, nativeMessage('File', annotations)] },
    }),
  ];

  const events = await collectEvents(input);

  expect(answerOf(events).citations[0]['sourceId']).toBe('code:image:0');
  expect(answerOf(events).sources).toEqual([
    {
      id: `${messageId}:cite:1`,
      kind: 'file',
      title: 'report.csv',
      fileId: 'file',
      containerId: 'container',
    },
  ]);
});

test('yields valid partial answer annotations before the enclosing failed response error', async () => {
  const input = [
    textDelta('native', 'File'),
    event({
      type: 'response.failed',
      response: {
        error: { message: 'run failure' },
        output: [nativeMessage('File', [fileAnnotation()])],
      },
    }),
  ];
  const events: AGUIEvent[] = [];

  const result = (async () => {
    for await (const output of mapAzureEvents({
      events: source(input),
      messageId,
    }))
      events.push(output);
  })();

  await expect(result).rejects.toThrow('run failure');
  expect(answerOf(events).citations[0]['quote']).toBe('File');
});

test('owns annotation values independently of subsequent SDK object mutation', async () => {
  const file = fileAnnotation();
  const url = {
    type: 'url_citation',
    url: 'https://original.example',
    title: 'Original',
    start_index: 0,
    end_index: 4,
  };
  async function* input() {
    yield textDelta('native', 'File');
    yield nativeAnnotation(file);
    yield nativeAnnotation(url, 1);
    file.file_id = 'mutated';
    url.url = 'https://mutated.example';
    yield completed;
  }
  const events: AGUIEvent[] = [];

  for await (const output of mapAzureEvents({ events: input(), messageId }))
    events.push(output);

  expect(answerOf(events).sources.map((s) => s['fileId'] ?? s['href'])).toEqual(
    ['file', 'https://original.example'],
  );
});

for (const title of [123, { invalid: true }, '']) {
  test(`uses URL as title for invalid annotation title ${JSON.stringify(title)}`, async () => {
    const input = [
      textDelta('native', 'File'),
      nativeAnnotation({
        type: 'url_citation',
        url: 'https://example.com',
        title,
        start_index: 0,
        end_index: 4,
      }),
      completed,
    ];

    const events = await collectEvents(input);

    expect(answerOf(events).sources[0]['title']).toBe('https://example.com');
  });
}

test('does not repeat an annotation-only answer on repeated terminal delivery', async () => {
  const terminal = event({
    type: 'response.completed',
    response: { output: [nativeMessage('', [fileAnnotation()])] },
  });

  const events = await collectEvents([terminal, terminal]);

  expect(events.map((e) => e.type)).toEqual([
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_END,
  ]);
});
