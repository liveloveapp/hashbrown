import { type AGUIEvent, EventType } from '@ag-ui/core';
import { mapAnthropicEvents } from './anthropic-events';
import {
  contentStop,
  messageDelta,
  messageStart,
  messageStop,
  rawEvent,
  toAsyncIterable,
} from './anthropic-events.test-utils';

function call(index = 0, name = 'web_search') {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'server_tool_use',
      id: 'server-1',
      name,
      input: { query: 'weather' },
      caller: { type: 'direct' },
    },
  });
}
function result(index = 1) {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 'server-1',
      content: [
        {
          type: 'web_search_result',
          title: 'Weather',
          url: 'https://weather.test',
          encrypted_content: 'opaque',
          page_age: null,
        },
      ],
    },
  });
}
async function collect(
  events: ReturnType<typeof messageStart>[],
  context = {},
) {
  const output: AGUIEvent[] = [];
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable(events),
    messageId: 'answer',
    ...context,
  });
  while (true) {
    const next = await iterator.next();
    if (next.done) return { output, finish: next.value };
    output.push(next.value);
  }
}

test('streams provider execution immediately and settles only at its native result', async () => {
  const events = [
    messageStart(),
    call(),
    contentStop(0),
    result(),
    contentStop(1),
    messageDelta(),
    messageStop(),
  ];

  const { output, finish } = await collect(events);

  expect(
    output.filter((event) => event.type === EventType.TOOL_CALL_START),
  ).toEqual([
    expect.objectContaining({
      toolCallId: 'server-1',
      metadata: expect.objectContaining({
        'b4.step': expect.objectContaining({
          kind: 'provider',
          provider: 'anthropic',
          status: 'running',
        }),
      }),
    }),
  ]);
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_ARGS),
  ).toMatchObject({ delta: '{"query":"weather"}' });
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_END),
  ).toMatchObject({ metadata: { 'b4.step': { status: 'running' } } });
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({
    messageId: 'answer:provider-result:1',
    metadata: {
      'b4.step': { status: 'completed', sources: [{ id: 'server-1:0' }] },
    },
  });
  expect(output.at(-1)).toMatchObject({
    type: EventType.CUSTOM,
    name: 'hashbrown.provider-history',
    value: {
      ownerMessageId: 'answer',
      payload: {
        representedMessageIds: ['answer', 'answer:provider-result:1'],
      },
    },
  });
  expect(finish?.finishReason).toBe('stop');
});

test('emits provider START before requesting the rest of a blocked native stream', async () => {
  let reads = 0;
  const events = {
    async *[Symbol.asyncIterator]() {
      reads++;
      yield messageStart();
      reads++;
      yield call();
      reads++;
      await new Promise(() => undefined);
    },
  };
  const iterator = mapAnthropicEvents({ events, messageId: 'answer' });

  let event = await iterator.next();
  while (!event.done && event.value.type !== EventType.TOOL_CALL_START)
    event = await iterator.next();

  expect(event.value).toMatchObject({ type: EventType.TOOL_CALL_START });
  expect(reads).toBe(2);
});

test('a result-only later response settles a prior call with a fresh native-history owner', async () => {
  const requestOptions = {
    model: 'test',
    stream: true as const,
    max_tokens: 1,
    messages: [
      {
        role: 'assistant' as const,
        content: [
          (
            call() as Extract<
              ReturnType<typeof messageStart>,
              { type: 'content_block_start' }
            >
          ).content_block,
        ],
      },
    ],
  };

  const { output } = await collect(
    [messageStart(), result(0), contentStop(0), messageStop()],
    { requestOptions },
  );

  expect(output.some((event) => event.type === EventType.TOOL_CALL_START)).toBe(
    false,
  );
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({
    messageId: 'answer:provider-result:0',
    toolCallId: 'server-1',
  });
  expect(output.at(-1)).toMatchObject({
    value: {
      ownerMessageId: 'answer:provider-result:0',
      payload: { representedMessageIds: ['answer:provider-result:0'] },
    },
  });
});

test('an unresolved provider call remains running through pause_turn', async () => {
  const delta = rawEvent({
    ...messageDelta(),
    delta: { stop_reason: 'pause_turn' },
  });

  const { output, finish } = await collect([
    messageStart(),
    call(),
    contentStop(0),
    delta,
    messageStop(),
  ]);

  expect(
    output.some((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toBe(false);
  expect(finish?.finishReason).toBe('other');
  expect(output.at(-1)).toMatchObject({ value: { complete: true } });
});

test('maps initial and incremental native citations into quote-only answer annotations', async () => {
  const text = rawEvent({
    type: 'content_block_start',
    index: 2,
    content_block: {
      type: 'text',
      text: 'Weather',
      citations: [
        {
          type: 'web_search_result_location',
          title: 'Weather',
          url: 'https://weather.test',
          encrypted_index: 'opaque',
          cited_text: 'sunny',
        },
      ],
    },
  });
  const citation = rawEvent({
    type: 'content_block_delta',
    index: 2,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        title: 'Weather',
        url: 'https://weather.test',
        encrypted_index: 'opaque',
        cited_text: 'warm',
      },
    },
  });

  const { output } = await collect([
    messageStart(),
    call(),
    contentStop(0),
    result(),
    contentStop(1),
    text,
    citation,
    contentStop(2),
    messageStop(),
  ]);

  expect(
    output.find((event) => event.type === EventType.TEXT_MESSAGE_END),
  ).toMatchObject({
    metadata: {
      'b4.answer': {
        v: 1,
        citations: [
          { sourceId: 'server-1:0', quote: 'sunny' },
          { sourceId: 'server-1:0', quote: 'warm' },
        ],
      },
    },
  });
});

test.each([
  [
    'web_fetch',
    'web_fetch_tool_result',
    {
      type: 'web_fetch_result',
      url: 'https://fetch.test',
      content: {
        type: 'document',
        title: 'Fetched',
        source: { type: 'text', data: 'page' },
      },
    },
    'completed',
  ],
  [
    'code_execution',
    'code_execution_tool_result',
    {
      type: 'code_execution_result',
      stdout: 'ok',
      stderr: '',
      return_code: 0,
      content: [],
    },
    'completed',
  ],
  [
    'bash_code_execution',
    'bash_code_execution_tool_result',
    {
      type: 'bash_code_execution_result',
      stdout: '',
      stderr: 'bad',
      return_code: 2,
      content: [],
    },
    'failed',
  ],
  [
    'text_editor_code_execution',
    'text_editor_code_execution_tool_result',
    { type: 'text_editor_code_execution_create_result', is_file_update: false },
    'completed',
  ],
  [
    'web_search',
    'web_search_tool_result',
    { type: 'web_search_tool_result_error', error_code: 'too_many_requests' },
    'failed',
  ],
])('settles native %s from %s content', async (name, type, content, status) => {
  const nativeResult = rawEvent({
    type: 'content_block_start',
    index: 1,
    content_block: { type, tool_use_id: 'server-1', content },
  });

  const { output } = await collect([
    messageStart(),
    call(0, name),
    contentStop(0),
    nativeResult,
    contentStop(1),
    messageStop(),
  ]);

  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({ metadata: { 'b4.step': { kind: 'provider', status } } });
});

test('keeps same-name client tools separate from provider tools and preserves caller identity', async () => {
  const client = rawEvent({
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'client-1',
      name: 'web_search',
      input: {},
      caller: { type: 'code_execution_20250825', tool_id: 'server-1' },
    },
  });

  const { output, finish } = await collect([
    messageStart(),
    call(),
    contentStop(0),
    client,
    contentStop(1),
    messageDelta(),
    messageStop(),
  ]);

  const starts = output.filter(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  expect(starts).toHaveLength(2);
  expect(starts[1]).toMatchObject({
    toolCallId: 'client-1',
    metadata: {
      anthropic: { nativeBlock: { caller: { tool_id: 'server-1' } } },
    },
  });
  expect(starts[1].metadata?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'running',
    parentToolCallId: 'server-1',
  });
  expect(
    output.find(
      (event) =>
        event.type === EventType.TOOL_CALL_END &&
        event.toolCallId === 'client-1',
    ),
  ).toMatchObject({
    metadata: {
      'b4.step': {
        kind: 'server',
        status: 'running',
        parentToolCallId: 'server-1',
      },
    },
  });
  expect(finish?.finishReason).toBe('tool_calls');
});

test('restores pending invocation identity and original timing from canonical native metadata', async () => {
  const native = (
    call() as Extract<
      ReturnType<typeof messageStart>,
      { type: 'content_block_start' }
    >
  ).content_block;
  const inputMessages = [
    {
      id: 'old-answer',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'server-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"weather"}' },
          metadata: {
            anthropic: { responseId: 'old-response', nativeBlock: native },
            'b4.step': {
              v: 1,
              kind: 'provider',
              provider: 'anthropic',
              builtin: 'web_search',
              status: 'running',
              startedAt: 42,
            },
          },
        },
      ],
    },
  ];

  const { output } = await collect(
    [messageStart(), result(0), contentStop(0), messageStop()],
    { inputMessages },
  );

  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({
    metadata: { 'b4.step': { startedAt: 42, status: 'completed' } },
  });
});

test('streams provider arguments and updates final native input without settling at END', async () => {
  const input = rawEvent({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{"query":"updated"}' },
  });

  const { output } = await collect([
    messageStart(),
    call(),
    input,
    contentStop(0),
    messageStop(),
  ]);

  expect(
    output.filter((event) => event.type === EventType.TOOL_CALL_ARGS),
  ).toEqual([
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'server-1',
      delta: '{"query":"updated"}',
    },
  ]);
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_END),
  ).toMatchObject({
    metadata: {
      'b4.step': { status: 'running', queries: ['updated'] },
      anthropic: { nativeBlock: { input: { query: 'updated' } } },
    },
  });
});

test('owns a reasoning-only response without creating empty assistant text', async () => {
  const thinking = rawEvent({
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'thinking',
      thinking: 'reason',
      signature: 'signature',
    },
  });

  const { output } = await collect([
    messageStart(),
    thinking,
    contentStop(0),
    messageStop(),
  ]);

  expect(
    output.some((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toBe(false);
  expect(output.at(-1)).toMatchObject({
    value: {
      ownerMessageId: 'answer:reasoning:0',
      payload: {
        blocks: [{ signature: 'signature' }],
        representedMessageIds: ['answer:reasoning:0'],
      },
    },
  });
});

test('settles result before reading final container and emits the container in the footer', async () => {
  const delta = rawEvent({
    ...messageDelta(),
    delta: {
      stop_reason: 'end_turn',
      container: { id: 'container-final', expires_at: 'later', skills: null },
    },
  });

  const { output } = await collect([
    messageStart(),
    call(),
    contentStop(0),
    result(),
    contentStop(1),
    delta,
    messageStop(),
  ]);

  const resultIndex = output.findIndex(
    (event) => event.type === EventType.TOOL_CALL_RESULT,
  );
  expect(resultIndex).toBeGreaterThan(-1);
  expect(resultIndex).toBeLessThan(output.length - 1);
  expect(output.at(-1)).toMatchObject({
    value: { payload: { container: { id: 'container-final' } } },
  });
});

test('aborting a provider invocation emits no fabricated settlement or complete footer', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      call(),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'answer',
    signal: controller.signal,
  });

  const first = await iterator.next();
  controller.abort();
  const last = await iterator.next();

  expect(first.value).toMatchObject({ type: EventType.TOOL_CALL_START });
  expect(last).toEqual({ done: true, value: undefined });
});

test('unknown result ids remain RAW without inventing a provider invocation', async () => {
  const { output } = await collect([
    messageStart(),
    result(0),
    contentStop(0),
    messageStop(),
  ]);

  expect(output.map((event) => event.type)).toEqual([
    EventType.RAW,
    EventType.RAW,
  ]);
});

test('retains unsupported native result families as RAW without false settlement', async () => {
  const unsupported = rawEvent({
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_search_tool_result',
      tool_use_id: 'server-1',
      content: { type: 'tool_search_tool_search_result', tool_references: [] },
    },
  });

  const { output } = await collect([
    messageStart(),
    call(),
    contentStop(0),
    unsupported,
    contentStop(1),
    messageStop(),
  ]);

  expect(
    output.some((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toBe(false);
  expect(output.at(-1)).toMatchObject({
    value: {
      payload: {
        blocks: [
          { type: 'server_tool_use' },
          { type: 'tool_search_tool_result' },
        ],
      },
    },
  });
});

test.each(['id', 'name'])(
  'rejects empty native server invocation %s with block context',
  async (field) => {
    const native = (
      call() as Extract<
        ReturnType<typeof messageStart>,
        { type: 'content_block_start' }
      >
    ).content_block;
    const malformed = rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { ...native, [field]: '' },
    });

    const act = collect([messageStart(), malformed]);

    await expect(act).rejects.toThrow(
      `Anthropic server tool block at index 0 has an empty ${field}`,
    );
  },
);
