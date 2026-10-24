import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import { mapBedrockEvents } from './bedrock-events';
import { decodeBedrockNative } from './bedrock-native';

const start = (index = 4, name = 'nova_grounding', type = 'server_tool_use') =>
  ({
    contentBlockStart: {
      contentBlockIndex: index,
      start: { toolUse: { toolUseId: 'native-call', name, type } },
    },
  }) as ConverseStreamOutput;
const args = {
  contentBlockDelta: {
    contentBlockIndex: 4,
    delta: { toolUse: { input: '{"query":"weather"}' } },
  },
} as ConverseStreamOutput;
const stop = (index: number) => ({
  contentBlockStop: { contentBlockIndex: index },
});
const result = {
  contentBlockStart: {
    contentBlockIndex: 9,
    start: {
      toolResult: {
        toolUseId: 'native-call',
        type: 'server_tool_result',
        status: 'success',
      },
    },
  },
} as ConverseStreamOutput;
async function collect(events: ConverseStreamOutput[]) {
  const output: AGUIEvent[] = [];
  const iterator = mapBedrockEvents({
    events: (async function* () {
      yield* events;
    })(),
    messageId: 'answer',
  });
  let next = await iterator.next();
  while (!next.done) {
    output.push(next.value);
    next = await iterator.next();
  }
  return { output, finish: next.value };
}

test('announces provider START before asking for another native event', async () => {
  let reads = 0;
  const iterator = mapBedrockEvents({
    messageId: 'answer',
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          reads++;
          return reads === 1
            ? { done: false, value: start() }
            : new Promise(() => undefined);
        },
      }),
    },
  });

  const next = await iterator.next();

  expect(next.value).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'native-call',
    metadata: {
      'b4.step': { kind: 'provider', status: 'running', builtin: 'web_search' },
    },
  });
  expect(reads).toBe(1);
  await iterator.return(undefined);
});

test.each(['nova_grounding', 'nova_code_interpreter', 'future_server_tool'])(
  'maps %s invocation and ID-correlated result with independent ownership',
  async (name) => {
    const { output, finish } = await collect([
      start(4, name),
      args,
      stop(4),
      result,
      {
        contentBlockDelta: {
          contentBlockIndex: 9,
          delta: { toolResult: [{ text: 'done' }] },
        },
      },
      stop(9),
      { messageStop: { stopReason: 'tool_use' } },
    ]);

    expect(
      output.find((event) => event.type === EventType.TOOL_CALL_END),
    ).toMatchObject({
      metadata: { 'b4.step': { status: 'running', provider: 'bedrock' } },
    });
    expect(
      output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      messageId: 'answer:provider-result:9',
      content: 'done',
      metadata: {
        'b4.step': { status: 'completed' },
        bedrock: { responseId: 'answer' },
      },
    });
    expect(
      output.find((event) => event.type === EventType.TEXT_MESSAGE_END),
    ).toMatchObject({
      messageId: 'answer',
      metadata: { bedrock: { responseId: 'answer' } },
    });
    expect(output.at(-1)).toMatchObject({
      type: EventType.CUSTOM,
      value: {
        ownerMessageId: 'answer',
        payload: {
          representedMessageIds: ['answer', 'answer:provider-result:9'],
        },
      },
    });
    expect(finish).toMatchObject({
      finishReason: 'stop',
      providerMetadata: { stopReason: 'tool_use' },
    });
  },
);

test('unknown tool discriminator stays RAW and never dispatches an application tool', async () => {
  const { output } = await collect([
    start(4, 'nova_grounding', 'future_tool_use'),
    args,
    stop(4),
  ]);

  expect(output.some((event) => event.type === EventType.TOOL_CALL_START)).toBe(
    false,
  );
});

test('invocation closure and truncated EOF never settle or claim a complete capture', async () => {
  const { output } = await collect([start(), args, stop(4)]);

  expect(
    output.some(
      (event) =>
        event.type === EventType.TOOL_CALL_RESULT ||
        event.type === EventType.CUSTOM,
    ),
  ).toBe(false);
  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_END),
  ).toMatchObject({ metadata: { 'b4.step': { status: 'running' } } });
});

test('preserves signed reasoning bytes and chooses its real owner', async () => {
  const { output } = await collect([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([1, 2]) },
        },
      },
    },
    stop(0),
    { messageStop: { stopReason: 'end_turn' } },
  ]);
  const footer = output.find((event) => event.type === EventType.CUSTOM);

  expect(footer).toMatchObject({
    value: { ownerMessageId: 'answer:reasoning:0' },
  });
  if (footer?.type === EventType.CUSTOM)
    expect(decodeBedrockNative(footer.value.payload.content)).toEqual([
      { reasoningContent: { redactedContent: new Uint8Array([1, 2]) } },
    ]);
});

test('ownerless citation metadata remains RAW without fabricated messages or footer', async () => {
  const { output } = await collect([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { citation: { title: 'Source', source: 'https://example.com' } },
      },
    },
    stop(0),
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(output.every((event) => event.type === EventType.RAW)).toBe(true);
});

test('cleanup failure prevents a complete history footer', async () => {
  const output: AGUIEvent[] = [];
  const events = [
    start(),
    args,
    stop(4),
    { messageStop: { stopReason: 'end_turn' } } as ConverseStreamOutput,
  ];
  const iterator = mapBedrockEvents({
    messageId: 'answer',
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () =>
          events.length
            ? { done: false, value: events.shift() as ConverseStreamOutput }
            : { done: true, value: undefined },
        return: async () => {
          throw new Error('cleanup failed');
        },
      }),
    },
  });

  await expect(
    (async () => {
      for await (const event of iterator) output.push(event);
    })(),
  ).rejects.toThrow('cleanup failed');

  expect(output.some((event) => event.type === EventType.CUSTOM)).toBe(false);
});

test.each(['success', 'error'])(
  'normalizes explicit result %s without using native indexes for identity',
  async (status) => {
    const resultStart = {
      contentBlockStart: {
        contentBlockIndex: 9,
        start: {
          toolResult: {
            toolUseId: 'native-call',
            type: 'server_tool_result',
            status,
          },
        },
      },
    } as ConverseStreamOutput;
    const { output } = await collect([
      start(4, 'nova_code_interpreter'),
      args,
      stop(4),
      resultStart,
      {
        contentBlockDelta: {
          contentBlockIndex: 9,
          delta: {
            toolResult: [
              { text: '{"exitCode":' },
              { text: '0,"stdOut":"ok"}' },
            ],
          },
        },
      },
      stop(9),
    ]);

    expect(
      output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      metadata: {
        'b4.step': { status: status === 'error' ? 'failed' : 'completed' },
      },
    });
  },
);

test('rejects conflicting native invocations and mismatched result families', async () => {
  await expect(collect([start(), args, stop(4), start(12)])).rejects.toThrow(
    'identity',
  );
  const conflicting = {
    contentBlockStart: {
      contentBlockIndex: 9,
      start: {
        toolResult: {
          toolUseId: 'native-call',
          type: 'nova_code_interpreter_result',
        },
      },
    },
  } as ConverseStreamOutput;

  await expect(
    collect([start(), args, stop(4), conflicting, stop(9)]),
  ).rejects.toThrow('family');
});

test('same-named ordinary calls remain application tools', async () => {
  const ordinary = {
    contentBlockStart: {
      contentBlockIndex: 4,
      start: { toolUse: { toolUseId: 'native-call', name: 'nova_grounding' } },
    },
  };
  const { output, finish } = await collect([
    ordinary,
    args,
    stop(4),
    { messageStop: { stopReason: 'tool_use' } },
  ]);

  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_START),
  ).not.toHaveProperty('metadata.b4.step');
  expect(finish?.finishReason).toBe('tool_calls');
});

test('announces a closed result before reading the next chunk', async () => {
  const events = [
    start(),
    args,
    stop(4),
    result,
    {
      contentBlockDelta: {
        contentBlockIndex: 9,
        delta: { toolResult: [{ text: 'done' }] },
      },
    } as ConverseStreamOutput,
    stop(9),
  ];
  let reads = 0;
  const iterator = mapBedrockEvents({
    messageId: 'answer',
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          reads++;
          return events.length
            ? { done: false, value: events.shift() as ConverseStreamOutput }
            : new Promise(() => undefined);
        },
      }),
    },
  });

  let next = await iterator.next();
  while (!next.done && next.value.type !== EventType.TOOL_CALL_RESULT)
    next = await iterator.next();

  expect(reads).toBe(6);
  expect(next.value).toMatchObject({
    content: 'done',
    messageId: 'answer:provider-result:9',
  });
  await iterator.return(undefined);
});

test('folds call-less answer citations and preserves late signatures', async () => {
  const citation = {
    title: 'Source',
    source: 'https://example.com',
    sourceContent: [{ text: 'quoted' }],
  };
  const { output } = await collect([
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Answer' } } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { citation } } },
    stop(0),
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(
    output.find((event) => event.type === EventType.TEXT_MESSAGE_END),
  ).toMatchObject({
    metadata: {
      'b4.answer': {
        sources: [{ href: 'https://example.com' }],
        citations: [{ quote: 'quoted' }],
      },
    },
  });
  expect(output.at(-1)).toMatchObject({ type: EventType.CUSTOM });
});

test('tool-only assistant accepts citation metadata without a synthetic text START', async () => {
  const { output } = await collect([
    start(),
    args,
    stop(4),
    {
      contentBlockDelta: {
        contentBlockIndex: 5,
        delta: { citation: { source: 'https://example.com' } },
      },
    },
    stop(5),
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(
    output.some((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toBe(false);
  expect(
    output.find((event) => event.type === EventType.TEXT_MESSAGE_END),
  ).toMatchObject({
    metadata: { 'b4.answer': { sources: [{ href: 'https://example.com' }] } },
  });
});

test('abort after final assistant END suppresses complete footer', async () => {
  const controller = new AbortController();
  const output: AGUIEvent[] = [];
  const events = [
    start(),
    args,
    stop(4),
    { messageStop: { stopReason: 'end_turn' } } as ConverseStreamOutput,
  ];

  for await (const event of mapBedrockEvents({
    messageId: 'answer',
    signal: controller.signal,
    events: (async function* () {
      yield* events;
    })(),
  })) {
    output.push(event);
    if (event.type === EventType.TEXT_MESSAGE_END) controller.abort();
  }

  expect(output.some((event) => event.type === EventType.CUSTOM)).toBe(false);
});

test('closed reasoning retains native provenance even when no messageStop arrives', async () => {
  const { output } = await collect([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Private reasoning' } },
      },
    },
    stop(0),
  ]);
  const event = output.find(
    (event) => event.type === EventType.REASONING_MESSAGE_END,
  );

  expect(event).toMatchObject({
    metadata: {
      bedrock: { nativeBlock: expect.any(Array), responseId: 'answer' },
    },
  });
});

test('partial text carries native provenance so an unsafe response cannot replay as lossy text', async () => {
  const { output } = await collect([
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'partial' } } },
  ]);

  expect(output[0]).toMatchObject({
    metadata: { bedrock: { nativeBlock: expect.any(Array) } },
  });
  expect(output.some((event) => event.type === EventType.CUSTOM)).toBe(false);
});

test('unrelated unsupported native events prevent replay but do not hide an independently valid result', async () => {
  const { output } = await collect([
    { $unknown: ['future', {}] },
    start(),
    args,
    stop(4),
    result,
    {
      contentBlockDelta: {
        contentBlockIndex: 9,
        delta: { toolResult: [{ text: 'done' }] },
      },
    },
    stop(9),
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(
    output.find((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toMatchObject({ content: 'done' });
  expect(output.some((event) => event.type === EventType.CUSTOM)).toBe(false);
});

test.each([true, false])(
  'rejects conflicting application and server invocation IDs (server first: %s)',
  async (serverFirst) => {
    const application = {
      contentBlockStart: {
        contentBlockIndex: 12,
        start: { toolUse: { toolUseId: 'native-call', name: 'app' } },
      },
    };
    const blocks = serverFirst
      ? [start(), args, stop(4), application]
      : [application, stop(12), start()];

    await expect(collect(blocks)).rejects.toThrow('identity');
  },
);

test('malformed result fragments never settle from a partial reconstruction', async () => {
  const malformed = {
    contentBlockDelta: {
      contentBlockIndex: 9,
      delta: { $unknown: ['future', {}] },
    },
  } as ConverseStreamOutput;
  const { output } = await collect([
    start(),
    args,
    stop(4),
    result,
    malformed,
    {
      contentBlockDelta: {
        contentBlockIndex: 9,
        delta: { toolResult: [{ text: 'done' }] },
      },
    },
    stop(9),
  ]);

  expect(
    output.some((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toBe(false);
});

test('owns redacted reasoning bytes independently of a reused SDK buffer', async () => {
  const bytes = new Uint8Array([1]);
  const output: AGUIEvent[] = [];
  const events = (async function* (): AsyncGenerator<ConverseStreamOutput> {
    yield {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { redactedContent: bytes } },
      },
    };
    bytes[0] = 9;
    yield stop(0);
    yield { messageStop: { stopReason: 'end_turn' } };
  })();

  for await (const event of mapBedrockEvents({ messageId: 'answer', events }))
    output.push(event);

  expect(
    output.find((event) => event.type === EventType.REASONING_ENCRYPTED_VALUE),
  ).toMatchObject({ encryptedValue: 'AQ==' });
});

test('malformed invocation input cannot settle a provisional call from a later result', async () => {
  const malformed = {
    contentBlockDelta: {
      contentBlockIndex: 4,
      delta: { toolUse: { input: '{invalid' } },
    },
  };
  const { output } = await collect([
    start(),
    malformed,
    stop(4),
    result,
    {
      contentBlockDelta: {
        contentBlockIndex: 9,
        delta: { toolResult: [{ text: 'done' }] },
      },
    },
    stop(9),
  ]);

  expect(
    output.some((event) => event.type === EventType.TOOL_CALL_RESULT),
  ).toBe(false);
});

test('emits a complete footer after the assistant END when text has an empty native start', async () => {
  const { output } = await collect([
    {
      contentBlockStart: { contentBlockIndex: 0, start: {} },
    } as ConverseStreamOutput,
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Recorded answer' },
      },
    },
    stop(0),
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(output.at(-2)).toMatchObject({
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'answer',
  });
  expect(output.at(-1)).toMatchObject({
    type: EventType.CUSTOM,
    value: { complete: true, ownerMessageId: 'answer' },
  });
});
