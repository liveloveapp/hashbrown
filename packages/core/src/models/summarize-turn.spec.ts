import { groupTurns, type Turn } from './group-turns';
import { summarizeTurn } from './summarize-turn';
import type { AnyMessage, AnyToolCall, ServerToolCall } from './view.models';

function server(overrides: Partial<ServerToolCall> = {}): ServerToolCall {
  return {
    toolCallId: 'server',
    name: 'search',
    status: 'executing',
    args: null,
    ...overrides,
  };
}

function client(done = false): AnyToolCall {
  return done
    ? {
        role: 'tool',
        toolCallId: 'client',
        name: 'client',
        args: {},
        status: 'done',
        result: { status: 'rejected', reason: 'denied cancelled' },
      }
    : {
        role: 'tool',
        toolCallId: 'client',
        name: 'client',
        args: {},
        status: 'pending',
      };
}

function turn(
  calls: readonly ServerToolCall[] = [],
  clients: AnyToolCall[] = [],
) {
  return groupTurns<AnyMessage>([
    {
      role: 'assistant',
      id: 'answer',
      content: 'Hello',
      toolCalls: clients,
      serverToolCalls: calls,
    },
  ])[0];
}

test('summarizes text-only turns without inventing tool calls', () => {
  const input = turn();

  const complete = summarizeTurn(input);
  const working = summarizeTurn(input, { status: 'working' });

  expect(complete).toEqual({
    status: 'complete',
    text: 'Worked',
    meta: '· 0 tool calls',
    live: false,
    toolCallCount: 0,
    sourceCount: 0,
    failedToolCallCount: 0,
    deniedToolCallCount: 0,
    cancelledToolCallCount: 0,
  });
  expect(working).toMatchObject({
    status: 'working',
    text: 'Working',
    live: true,
    toolCallCount: 0,
  });
});

test('derives working from open client and server calls', () => {
  const clientTurn = turn([], [client()]);
  const serverTurns = ['inProgress', 'executing'].map((status) =>
    turn([server({ status: status as ServerToolCall['status'] })]),
  );

  const summaries = [clientTurn, ...serverTurns].map((input) =>
    summarizeTurn(input),
  );

  expect(summaries.map(({ status, live }) => ({ status, live }))).toEqual(
    Array(3).fill({ status: 'working', live: true }),
  );
  expect(summaries[0].text).toBe('Working');
  expect(summaries[1].text).toBe('Using search…');
});

test('uses the newest open server label and application overrides', () => {
  const input = turn([
    server({ label: 'Newer', timing: { startedAt: 20 } }),
    server({ label: 'Older', timing: { startedAt: 10 } }),
    server({
      label: 'Finished',
      status: 'complete',
      timing: { startedAt: 30 },
    }),
  ]);

  const summary = summarizeTurn(input);
  const overridden = summarizeTurn(input, {
    labels: { search: { label: (call) => `App: ${call.label}` } },
  });

  expect(summary.text).toBe('Newer');
  expect(overridden.text).toBe('App: Newer');
});

test('uses later input on timing ties or when either start time is unknown', () => {
  const pairs: readonly [number | undefined, number | undefined][] = [
    [10, 10],
    [20, undefined],
    [undefined, 10],
    [20, NaN],
    [Infinity, 10],
  ];

  const summaries = pairs.map(([first, second]) =>
    summarizeTurn(
      turn([
        server({
          label: 'First',
          ...(first === undefined ? {} : { timing: { startedAt: first } }),
        }),
        server({
          label: 'Second',
          ...(second === undefined ? {} : { timing: { startedAt: second } }),
        }),
      ]),
    ),
  );

  expect(summaries.map((summary) => summary.text)).toEqual(
    pairs.map(() => 'Second'),
  );
});

test('explicit statuses override open calls and run errors', () => {
  const input: Turn<AnyMessage> = {
    ...turn([server()], [client()]),
    errors: [{ role: 'error' as const, content: 'Run failed' }],
  };

  const summaries = (
    ['working', 'awaiting', 'complete', 'failed', 'cancelled'] as const
  ).map((status) => summarizeTurn(input, { status }));

  expect(
    summaries.map(({ status, text, live }) => ({ status, text, live })),
  ).toEqual([
    { status: 'working', text: 'Using search…', live: true },
    { status: 'awaiting', text: 'Waiting for your approval', live: false },
    { status: 'complete', text: 'Worked', live: false },
    { status: 'failed', text: 'Work failed', live: false },
    { status: 'cancelled', text: 'Stopped', live: false },
  ]);
});

test('run errors win over pending client and server calls', () => {
  const input: Turn<AnyMessage> = {
    ...turn([server()], [client()]),
    errors: [{ role: 'error' as const, content: 'Run failed' }],
  };

  const summary = summarizeTurn(input);

  expect(summary).toMatchObject({
    status: 'failed',
    text: 'Work failed',
    live: false,
  });
});

test('counts outcomes without promoting individual tool failure to run failure', () => {
  const input = turn(
    [
      server({ status: 'complete', outcome: 'success' }),
      server({ status: 'complete', outcome: 'failure' }),
      server({
        status: 'complete',
        outcome: 'denied',
        result: { status: 'rejected', reason: 'denied' },
      }),
      server({ status: 'complete', outcome: 'cancelled' }),
    ],
    [client(true)],
  );

  const summary = summarizeTurn(input);

  expect(summary).toMatchObject({
    status: 'complete',
    toolCallCount: 5,
    failedToolCallCount: 2,
    deniedToolCallCount: 1,
    cancelledToolCallCount: 1,
    meta: '· 5 tool calls · 2 failed · 1 denied · 1 cancelled',
  });
});

test('counts legacy completed rejections and errors as failures', () => {
  const input = turn([
    server({
      status: 'complete',
      result: { status: 'rejected', reason: 'failure' },
    }),
    server({ status: 'complete', error: { message: 'failed' } }),
  ]);

  const summary = summarizeTurn(input);

  expect(summary).toMatchObject({
    status: 'complete',
    failedToolCallCount: 2,
    deniedToolCallCount: 0,
    cancelledToolCallCount: 0,
  });
});

test('counts sources by first ID across assistant and server sources', () => {
  const source = { id: 'one', kind: 'url' as const, title: 'First' };
  const input: Turn<AnyMessage> = {
    ...turn([
      server({
        status: 'complete',
        sources: [{ ...source, title: 'Duplicate' }],
      }),
    ]),
    assistants: [
      {
        ...turn([server({ status: 'complete', sources: [source] })])
          .assistants[0],
        sources: [source],
      },
    ],
  };

  const summary = summarizeTurn(input);

  expect(summary).toMatchObject({
    sourceCount: 1,
    meta: '· 1 tool call · 1 source',
  });
});

test('uses supplied elapsed times for active statuses and settled wording', () => {
  const input = turn();

  const summaries = (
    ['working', 'awaiting', 'complete', 'failed', 'cancelled'] as const
  ).map((status) =>
    summarizeTurn(input, {
      status,
      startedAt: 100,
      settledAt: 65100,
      now: 999999,
    }),
  );

  expect(summaries.map((summary) => summary.durationMs)).toEqual(
    Array(5).fill(65000),
  );
  expect(summaries.map((summary) => summary.text)).toEqual([
    'Working',
    'Waiting for your approval',
    'Worked for 1m 5s',
    'Work failed after 1m 5s',
    'Stopped after 1m 5s',
  ]);
  expect(summaries[0].meta).toBe('· 0 tool calls · 1m 5s');
  expect(summaries[1].meta).toBe('· 0 tool calls · 1m 5s');
  expect(summaries[2].meta).toBe('· 0 tool calls');
});

test('uses now only for active statuses and permits zero or negative timestamps', () => {
  const input = turn();

  const working = summarizeTurn(input, {
    status: 'working',
    startedAt: -100,
    now: 900,
  });
  const awaiting = summarizeTurn(input, {
    status: 'awaiting',
    startedAt: 0,
    now: 0,
  });
  const settled = (['complete', 'failed', 'cancelled'] as const).map((status) =>
    summarizeTurn(input, { status, startedAt: 0, now: 1000 }),
  );

  expect(working.durationMs).toBe(1000);
  expect(awaiting.durationMs).toBe(0);
  expect(awaiting.meta).toContain('<1s');
  expect(settled.every((summary) => summary.durationMs === undefined)).toBe(
    true,
  );
});

test('omits unknown and invalid duration without deriving tool timings', () => {
  const input = turn([server({ timing: { startedAt: 0, settledAt: 1000 } })]);
  const options = [
    {},
    { now: 1000 },
    { startedAt: 0 },
    { startedAt: NaN, now: 1000 },
    { startedAt: 10, now: 0 },
    { startedAt: 0, settledAt: Infinity, now: 1000 },
    { startedAt: 10, settledAt: 0, now: 1000 },
    { startedAt: -Number.MAX_VALUE, settledAt: Number.MAX_VALUE },
  ];

  const summaries = options.map((option) => summarizeTurn(input, option));

  expect(summaries.every((summary) => summary.durationMs === undefined)).toBe(
    true,
  );
});

test('reads no clock and preserves frozen inputs', () => {
  const call = Object.freeze(
    server({ label: 'Searching', timing: Object.freeze({ startedAt: 0 }) }),
  );
  const input: Turn<AnyMessage> = Object.freeze(turn(Object.freeze([call])));
  Object.freeze(input.assistants[0].toolCalls);
  Object.freeze(input.assistants[0]);
  Object.freeze(input.assistants);
  const options = Object.freeze({
    status: 'working' as const,
    startedAt: 0,
    now: 1000,
  });
  const originalNow = Date.now;
  Date.now = () => {
    throw new Error('Clock access');
  };

  try {
    const summary = summarizeTurn(input, options);

    expect(summary).toMatchObject({ text: 'Searching', durationMs: 1000 });
    expect(input.assistants[0].serverToolCalls?.[0]).toBe(call);
  } finally {
    Date.now = originalNow;
  }
});
