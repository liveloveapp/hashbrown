import { type AGUIEvent, EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import { mapOpenAIEvents } from './openai-events';

type NativeEvent = OpenAI.Responses.ResponseStreamEvent;
const frame = (value: object): NativeEvent =>
  ({ sequence_number: 0, ...value }) as NativeEvent;
const item = (
  id = 'ci_1',
  code: string | null = null,
  status = 'completed',
) => ({
  type: 'code_interpreter_call',
  id,
  code,
  status,
  container_id: 'container_1',
  outputs: [
    { type: 'logs', logs: '42' },
    { type: 'image', url: 'https://example.com/image.png' },
  ],
});
const added = (id = 'ci_1') =>
  frame({
    type: 'response.output_item.added',
    output_index: 0,
    item: item(id, null, 'in_progress'),
  });
const done = (value: object) =>
  frame({ type: 'response.output_item.done', output_index: 0, item: value });
const delta = (code: string, id = 'ci_1') =>
  frame({
    type: 'response.code_interpreter_call_code.delta',
    item_id: id,
    output_index: 0,
    delta: code,
  });
const codeDone = (code: string, id = 'ci_1') =>
  frame({
    type: 'response.code_interpreter_call_code.done',
    item_id: id,
    output_index: 0,
    code,
  });
const terminal = (output: object[] = [], type = 'response.completed') =>
  frame({ type, response: { output } });
async function* source(input: NativeEvent[]) {
  yield* input;
}
async function collect(input: NativeEvent[], signal?: AbortSignal) {
  const events: AGUIEvent[] = [];
  for await (const output of mapOpenAIEvents({
    events: source(input),
    messageId: 'assistant',
    signal,
  })) {
    events.push(EventSchemas.parse(output));
  }
  return events;
}
function args(events: AGUIEvent[], id = 'ci_1') {
  return events
    .flatMap((e) =>
      e.type === EventType.TOOL_CALL_ARGS && e.toolCallId === id
        ? [e.delta]
        : [],
    )
    .join('');
}

test('announces code execution and streams partial arguments while the producer is blocked', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* producer() {
    yield added();
    yield delta('print(');
    await blocked;
    yield codeDone('print(42)');
    yield done(item('ci_1', 'print(42)'));
    yield terminal();
  }
  const stream = mapOpenAIEvents({
    events: producer(),
    messageId: 'assistant',
  });

  const start = await Promise.race([
    stream.next(),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        release();
        reject(new Error('START was not emitted before producer blocked'));
      }, 100),
    ),
  ]);
  const partial = await stream.next();
  release();
  const rest: AGUIEvent[] = [];
  for await (const output of stream) rest.push(EventSchemas.parse(output));

  expect(EventSchemas.parse(start.value)).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallName: 'code_interpreter',
    metadata: {
      openai: { itemId: 'ci_1', itemType: 'code_interpreter_call' },
      'b4.step': {
        kind: 'provider',
        builtin: 'code_execution',
        provider: 'openai',
        icon: 'run',
        status: 'running',
        startedAt: expect.any(Number),
      },
    },
  });
  expect(partial.value).toMatchObject({
    type: EventType.TOOL_CALL_ARGS,
    delta: '{"code":"print(',
  });
  expect(JSON.parse(args([partial.value as AGUIEvent, ...rest]))).toEqual({
    code: 'print(42)',
  });
  expect(rest.filter((e) => e.type === EventType.TOOL_CALL_END)).toHaveLength(
    1,
  );
});

test('escapes quotes backslashes newlines and split Unicode in one argument object', async () => {
  const code = '"\\\n😀';

  const events = await collect([
    added(),
    ...[...code.slice(0, 3), '\ud83d', '\ude00'].map((c) => delta(c)),
    codeDone(code),
    done(item('ci_1', code)),
    terminal(),
  ]);

  expect(JSON.parse(args(events))).toEqual({ code });
});

test('keeps interleaved calls independent and accepts native code suffixes', async () => {
  const events = await collect([
    added(),
    added('ci_2'),
    delta('a'),
    delta('b', 'ci_2'),
    done(item('ci_2', 'b2')),
    done(item('ci_1', 'a1')),
    terminal(),
  ]);

  expect(JSON.parse(args(events))).toEqual({ code: 'a1' });
  expect(JSON.parse(args(events, 'ci_2'))).toEqual({ code: 'b2' });
});

test.each([
  'completed',
  'failed',
  'incomplete',
  'in_progress',
  'interpreting',
  'unknown',
])(
  'preserves authoritative native %s results without inventing success',
  async (status) => {
    const native = Object.freeze(item('ci_1', 'print(42)', status));

    const events = await collect([done(native), terminal([native])]);
    const results = events.filter((e) => e.type === EventType.TOOL_CALL_RESULT);

    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_START),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_END),
    ).toHaveLength(
      ['completed', 'failed', 'incomplete'].includes(status) ? 1 : 0,
    );
    if (['completed', 'failed', 'incomplete'].includes(status)) {
      expect(JSON.parse(args(events))).toEqual({ code: 'print(42)' });
      expect(results).toHaveLength(1);
      expect(JSON.parse(results[0].content as string)).toMatchObject(native);
      expect(results[0].metadata).toMatchObject({
        'b4.step': {
          status: status === 'completed' ? 'completed' : 'failed',
          settledAt: expect.any(Number),
          ...(status === 'completed'
            ? {}
            : { error: { message: expect.any(String) } }),
        },
      });
      if (status !== 'completed')
        expect(JSON.parse(results[0].content as string)).toHaveProperty(
          'error.message',
        );
    } else expect(results).toHaveLength(0);
  },
);

test.each([null, ''])(
  'preserves final code %s and closes arguments once',
  async (code) => {
    const native = item('ci_1', code);

    const events = await collect([
      added(),
      done(native),
      done(native),
      terminal([native]),
    ]);

    expect(JSON.parse(args(events))).toEqual(code === null ? {} : { code });
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_END),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_RESULT),
    ).toHaveLength(1);
    expect(
      JSON.parse((events.at(-1) as { content: string }).content).code,
    ).toBe(code);
  },
);

test('null final code preserves observed arguments without a protocol contradiction', async () => {
  const events = await collect([
    added(),
    delta('observed'),
    done(item()),
    terminal(),
  ]);

  expect(JSON.parse(args(events))).toEqual({ code: 'observed' });
  expect(
    JSON.parse((events.at(-1) as { content: string }).content).code,
  ).toBeNull();
});

test('rejects contradictory final code without including raw code in the error', async () => {
  await expect(
    collect([
      added(),
      delta('secret'),
      done(item('ci_1', 'contradiction')),
      terminal(),
    ]),
  ).rejects.toThrow('Code execution protocol error');
});

test('phase completion alone emits neither argument end nor fabricated result', async () => {
  const events = await collect([
    frame({
      type: 'response.code_interpreter_call.completed',
      item_id: 'ci_1',
      output_index: 0,
    }),
    terminal(),
  ]);

  expect(events.map((e) => e.type)).toEqual([EventType.TOOL_CALL_START]);
});

test('terminal response output backfills a missing item and preserves stop finish reason', async () => {
  const stream = mapOpenAIEvents({
    events: source([terminal([item('ci_1', '42')])]),
    messageId: 'assistant',
  });
  const events: AGUIEvent[] = [];
  let result = await stream.next();
  while (!result.done) {
    events.push(EventSchemas.parse(result.value));
    result = await stream.next();
  }

  expect(JSON.parse(args(events))).toEqual({ code: '42' });
  expect(result.value?.finishReason).toBe('stop');
});

test('yields failed response native details before throwing the run error', async () => {
  const events: AGUIEvent[] = [];
  const stream = mapOpenAIEvents({
    events: source([
      terminal([item('ci_1', null, 'failed')], 'response.failed'),
    ]),
    messageId: 'assistant',
  });

  await expect(
    (async () => {
      for await (const output of stream)
        events.push(EventSchemas.parse(output));
    })(),
  ).rejects.toThrow('OpenAI response failed');

  expect(events.at(-1)).toMatchObject({
    type: EventType.TOOL_CALL_RESULT,
    metadata: { 'b4.step': { status: 'failed' } },
  });
});

test('authoritative corrections reuse result identity without repeating argument lifecycle', async () => {
  const events = await collect([
    done(item('ci_1', '42', 'failed')),
    terminal([item('ci_1', '42')]),
  ]);
  const results = events.filter((e) => e.type === EventType.TOOL_CALL_RESULT);

  expect(results).toHaveLength(2);
  expect(results.map((e) => e.messageId)).toEqual([
    'ci_1:result',
    'ci_1:result',
  ]);
  expect(
    events.filter((e) => e.type === EventType.TOOL_CALL_START),
  ).toHaveLength(1);
  expect(events.filter((e) => e.type === EventType.TOOL_CALL_END)).toHaveLength(
    1,
  );
});

test('EOF keeps unfinished calls without forging results and abort returns quietly', async () => {
  const controller = new AbortController();
  const events: AGUIEvent[] = [];

  await expect(
    (async () => {
      for await (const output of mapOpenAIEvents({
        events: source([added(), delta('42')]),
        messageId: 'assistant',
      }))
        events.push(output);
    })(),
  ).rejects.toThrow('stream ended');
  controller.abort();
  const aborted = await collect([done(item()), terminal()], controller.signal);

  expect(events.some((e) => e.type === EventType.TOOL_CALL_RESULT)).toBe(false);
  expect(aborted).toEqual([]);
});

test.each(['in_progress', 'interpreting'])(
  'keeps arguments open after a nonterminal %s item',
  async (status) => {
    const events = await collect([
      added(),
      delta('print('),
      done(item('ci_1', 'print(', status)),
      delta('42)'),
      done(item('ci_1', 'print(42)')),
      terminal(),
    ]);

    expect(JSON.parse(args(events))).toEqual({ code: 'print(42)' });
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_END),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_RESULT),
    ).toHaveLength(1);
  },
);

test('retains execution settlement time when terminal output is enriched', async () => {
  const clock = jest
    .spyOn(Date, 'now')
    .mockReturnValue(3000)
    .mockReturnValueOnce(1000)
    .mockReturnValueOnce(2000);
  let events: AGUIEvent[];

  try {
    events = await collect([
      done(item('ci_1', '42')),
      terminal([
        {
          ...item('ci_1', '42'),
          outputs: [{ type: 'logs', logs: 'enriched' }],
        },
      ]),
    ]);
  } finally {
    clock.mockRestore();
  }

  const results = events.filter((e) => e.type === EventType.TOOL_CALL_RESULT);
  expect(results).toHaveLength(2);
  for (const result of results)
    expect(result.metadata).toMatchObject({
      'b4.step': { startedAt: 1000, settledAt: 2000 },
    });
});

test.each(['top-level', 'nested'])(
  'deduplicates native results with reordered %s object keys',
  async (ordering) => {
    const native = {
      ...item('ci_1', '42'),
      opaque: { z: [1, { two: 2, one: 1 }], a: true },
    };
    const reordered =
      ordering === 'top-level'
        ? Object.fromEntries(Object.entries(native).reverse())
        : {
            ...native,
            opaque: { a: true, z: [1, { one: 1, two: 2 }] },
            outputs: [
              { logs: '42', type: 'logs' },
              { url: 'https://example.com/image.png', type: 'image' },
            ],
          };

    const events = await collect([done(native), terminal([reordered])]);

    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_RESULT),
    ).toHaveLength(1);
    expect(
      JSON.parse((events.at(-1) as { content: string }).content),
    ).toMatchObject(native);
  },
);

test('preserves opaque native extension values and array ordering in result corrections', async () => {
  const native = {
    ...item('ci_1', '42'),
    opaque: { sequence: [1, 2], detail: { native: 'first' } },
  };
  const reorderedArray = {
    ...native,
    opaque: { ...native.opaque, sequence: [2, 1] },
  };
  const changedValue = {
    ...reorderedArray,
    opaque: { ...reorderedArray.opaque, detail: { native: 'second' } },
  };

  const events = await collect([
    done(native),
    done(reorderedArray),
    terminal([changedValue]),
  ]);
  const results = events.filter((e) => e.type === EventType.TOOL_CALL_RESULT);

  expect(results).toHaveLength(3);
  expect(results.map((e) => e.messageId)).toEqual([
    'ci_1:result',
    'ci_1:result',
    'ci_1:result',
  ]);
  expect(JSON.parse(results[2].content as string)).toMatchObject(changedValue);
});
