import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import {
  ɵcreateAgUiSubagentsState as create,
  ɵfoldAgUiSubagents as fold,
} from './ag-ui-subagents';

/** Folds test events through the real protocol. */
function sequence(
  events: readonly Record<string, unknown>[],
  state = create(),
) {
  return events.reduce(
    (current, event) => fold(current, event as AGUIEvent).state,
    state,
  );
}

/** Builds a lifecycle start with opaque identifiers. */
function start(id = 'child', extra: Record<string, unknown> = {}) {
  return {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: id,
    name: '',
    ...extra,
  };
}

test('owns lifecycle results and uses supplied finite timing only', () => {
  const result = Object.freeze({ nested: Object.freeze([1]) });
  const initial = Object.freeze(create());

  const state = sequence(
    [
      start('child', { timestamp: 3 }),
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 'child',
        timestamp: 8,
        result,
      },
    ],
    initial,
  );

  expect(state.records).toEqual([
    {
      subagentRunId: 'child',
      name: '',
      status: 'complete',
      interruptIds: [],
      timing: { startedAt: 3, settledAt: 8 },
      result,
    },
  ]);
  expect(state.records[0].result).not.toBe(result);
  expect(Object.isFrozen(state.records[0].result)).toBe(true);
  expect(initial.records).toEqual([]);
});

test.each(['', '__proto__'])(
  'supports opaque ID %p and closed parents',
  (id) => {
    const events = [
      start(id),
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: id },
      start('nested', { parentSubagentRunId: id }),
    ];

    const state = sequence(events);

    expect(state.records.map((record) => record.status)).toEqual([
      'complete',
      'running',
    ]);
    expect(state.records[0].timing).toBeUndefined();
  },
);

test.each([
  start('x', { name: 2 }),
  start('x', { description: null }),
  start('x', { parentToolCallId: 3 }),
  start('x', { parentSubagentRunId: 'missing' }),
  { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'x' },
  { type: EventType.SUBAGENT_ERROR, subagentRunId: 'x', message: 'oops' },
  { type: EventType.SUBAGENT_STARTED, subagentRunId: null, name: '' },
])('rejects malformed or inactive lifecycle payload %p', (event) => {
  const state = create();

  expect(() => sequence([event], state)).toThrow();
  expect(state.records).toEqual([]);
});

test.each([
  { outcome: null },
  { outcome: false },
  { outcome: { type: 'other' } },
  { outcome: { type: 'suspended', interruptIds: [3] } },
  { type: EventType.SUBAGENT_ERROR, message: 2 },
  { type: EventType.SUBAGENT_ERROR, message: '', code: null },
])('rejects malformed terminal fields %p', (extra) => {
  const state = sequence([start()]);

  expect(() =>
    sequence(
      [{ type: EventType.SUBAGENT_FINISHED, subagentRunId: 'child', ...extra }],
      state,
    ),
  ).toThrow();
});

test('suspends and continues one row across runs but rejects same-run reuse', () => {
  const awaiting = sequence([
    start(),
    {
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'child',
      outcome: { type: 'suspended', interruptIds: ['i'] },
    },
  ]);

  const resumed = sequence(
    [{ type: EventType.RUN_STARTED, runId: 'next' }, start()],
    awaiting,
  );

  expect(awaiting.records[0]).toMatchObject({
    status: 'awaiting',
    interruptIds: ['i'],
  });
  expect(resumed.records).toHaveLength(1);
  expect(resumed.records[0]).toMatchObject({
    status: 'running',
    runId: 'next',
    interruptIds: [],
  });
  expect(() => sequence([start()], awaiting)).toThrow();
});

test('requires closure at run finish but accepts run error with active children', () => {
  const state = sequence([start()]);

  expect(() => sequence([{ type: EventType.RUN_FINISHED }], state)).toThrow();
  expect(() =>
    sequence([{ type: EventType.RUN_ERROR, message: 'failed' }], state),
  ).not.toThrow();
});

test('accepts unknown and late attribution without invented lifecycle information', () => {
  const state = sequence([
    { type: EventType.CUSTOM, name: 'x', value: 1, subagentRunId: 'unknown' },
    start(),
    {
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: 'child',
      message: 'failed',
    },
    { type: EventType.RAW, event: {}, subagentRunId: 'child' },
  ]);

  expect(state.records[0]).toEqual({
    subagentRunId: 'unknown',
    status: 'unknown',
    interruptIds: [],
  });
  expect(state.records[1]).toMatchObject({
    status: 'failed',
    error: { message: 'failed' },
  });
});

test('retains state and record identities for unchanged events and normalizes null attribution', () => {
  const state = sequence([
    { type: EventType.RAW, event: {}, subagentRunId: 'unknown' },
  ]);

  const unchanged = fold(state, {
    type: EventType.RAW,
    event: {},
    subagentRunId: null,
  } as unknown as AGUIEvent);

  expect(unchanged.state).toBe(state);
  expect(unchanged.events[0]).not.toHaveProperty('subagentRunId');
  expect(() =>
    sequence([{ type: EventType.RAW, event: {}, subagentRunId: 2 }], state),
  ).toThrow();
});

test('seeds distinct ownership buckets and native call inheritance from history', () => {
  const history = [
    {
      id: 'm',
      role: 'assistant',
      content: '',
      subagentRunId: 'child',
      toolCalls: [
        {
          id: 't',
          type: 'function',
          function: { name: 'tool', arguments: '' },
        },
      ],
    },
    { id: 'r', role: 'tool', toolCallId: 't', content: '' },
    { id: 'm', role: 'reasoning', content: '', subagentRunId: 'reason' },
  ] as Message[];

  const state = create(Object.freeze(history));

  expect(state.owners.message.get('m')).toBe('child');
  expect(state.owners.reasoning.get('m')).toBe('reason');
  expect(state.owners.tool.get('t')).toBe('child');
  expect(state.owners.message.has('r')).toBe(true);
  expect(state.owners.message.get('r')).toBeUndefined();
});

test('continues known IDs without tags and rejects explicit ownership conflicts including reopen', () => {
  const state = sequence([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm',
      role: 'assistant',
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    delta: 'hi',
  });

  expect(next.events[0]).toMatchObject({ subagentRunId: 'child' });
  expect(() =>
    sequence(
      [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm',
          role: 'assistant',
          subagentRunId: 'sibling',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('inherits tools from lane-local assistants and attributes results independently', () => {
  const state = sequence([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'parent',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'child-m',
      role: 'assistant',
      subagentRunId: 'child',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 't',
      toolCallName: 'tool',
      subagentRunId: 'child',
    },
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 't',
      messageId: 'r',
      content: '',
    },
  ]);

  expect(state.owners.tool.get('t')).toBe('child');
  expect(state.owners.message.get('r')).toBeUndefined();
  expect(state.lanes.get('child')?.assistantMessageId).toBe('child-m');
  expect(() =>
    sequence(
      [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'bad',
          toolCallName: 'tool',
          parentMessageId: 'parent',
          subagentRunId: 'child',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('live snapshots replace restated ownership but retain active lifecycle', () => {
  const state = sequence([
    start(),
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm',
      role: 'assistant',
      subagentRunId: 'child',
    },
  ]);

  const next = sequence(
    [
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [{ id: 'm', role: 'assistant', content: '' }],
      },
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'child' },
    ],
    state,
  );

  expect(next.owners.message.has('m')).toBe(true);
  expect(next.owners.message.get('m')).toBeUndefined();
  expect(next.records[0].status).toBe('complete');
});

test('activity replacement can re-own while nonreplacement and delta retain ownership', () => {
  const state = sequence([
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'a',
      activityType: 'plan',
      content: {},
      subagentRunId: 'child',
    },
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'a',
      activityType: 'plan',
      content: {},
      replace: false,
      subagentRunId: 'other',
    },
  ]);

  const replacement = sequence(
    [
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'a',
        activityType: 'plan',
        content: {},
      },
    ],
    state,
  );

  expect(state.owners.activity.get('a')).toBe('child');
  expect(replacement.owners.activity.get('a')).toBeUndefined();
  expect(() =>
    sequence(
      [
        {
          type: EventType.ACTIVITY_DELTA,
          messageId: 'a',
          patch: [],
          subagentRunId: 'other',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('same named steps belong independently to parent and empty child IDs', () => {
  const state = sequence([
    { type: EventType.STEP_STARTED, stepName: 'work' },
    { type: EventType.STEP_STARTED, stepName: 'work', subagentRunId: '' },
  ]);

  const next = sequence(
    [{ type: EventType.STEP_FINISHED, stepName: 'work', subagentRunId: '' }],
    state,
  );

  expect(next.steps.get(undefined)?.has('work')).toBe(true);
  expect(next.steps.get('')?.has('work')).toBe(false);
  expect(() =>
    sequence(
      [
        {
          type: EventType.STEP_FINISHED,
          stepName: 'work',
          subagentRunId: 'other',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('chunk continuations prefer parent then sole compatible lane and reject ambiguity atomically', () => {
  const siblings = sequence([
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'a',
      delta: 'a',
      subagentRunId: 'a',
    },
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'b',
      delta: 'b',
      subagentRunId: 'b',
    },
  ]);
  const parent = sequence(
    [{ type: EventType.TEXT_MESSAGE_CHUNK, messageId: 'p', delta: 'p' }],
    siblings,
  );

  const next = fold(parent, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    delta: 'next',
  });

  expect(next.events[0]).toMatchObject({ messageId: 'p' });
  expect(() =>
    sequence([{ type: EventType.TEXT_MESSAGE_CHUNK, delta: '?' }], siblings),
  ).toThrow(/ambiguous/i);
  expect(
    fold(
      sequence([
        {
          type: EventType.TEXT_MESSAGE_CHUNK,
          messageId: 'a',
          subagentRunId: 'a',
        },
      ]),
      { type: EventType.TEXT_MESSAGE_CHUNK, delta: 'sole' },
    ).events[0],
  ).toMatchObject({ messageId: 'a', subagentRunId: 'a' });
});

test('first tool chunk resolves parent ownership before closing its lane', () => {
  const state = sequence([
    { type: EventType.TEXT_MESSAGE_CHUNK, messageId: 'parent', delta: 'p' },
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'child-m',
      delta: 'c',
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, {
    type: EventType.TOOL_CALL_CHUNK,
    toolCallId: 't',
    toolCallName: 'tool',
    parentMessageId: 'child-m',
    delta: '{}',
  });

  expect(next.events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'child-m',
      subagentRunId: 'child',
    },
    expect.objectContaining({
      type: EventType.TOOL_CALL_CHUNK,
      subagentRunId: 'child',
    }),
  ]);
  expect(next.state.lanes.get(undefined)?.pending?.id).toBe('parent');
});

test('validates repeated chunk identity fields and closes only affected lanes', () => {
  const state = sequence([
    start('a'),
    start('b'),
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'a-m',
      role: 'assistant',
      subagentRunId: 'a',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'b-t',
      toolCallName: 'tool',
      parentMessageId: 'b-m',
      subagentRunId: 'b',
    },
  ]);

  const terminal = fold(state, {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'a',
  });

  expect(terminal.events[0]).toEqual({
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'a-m',
    subagentRunId: 'a',
  });
  expect(terminal.state.lanes.get('b')?.pending?.id).toBe('b-t');
  expect(() =>
    sequence(
      [{ type: EventType.TEXT_MESSAGE_CHUNK, messageId: 'a-m', role: 'user' }],
      state,
    ),
  ).toThrow();
  expect(() =>
    sequence(
      [
        {
          type: EventType.TOOL_CALL_CHUNK,
          toolCallId: 'b-t',
          toolCallName: 'different',
        },
      ],
      state,
    ),
  ).toThrow();
  expect(() =>
    sequence(
      [
        {
          type: EventType.TOOL_CALL_CHUNK,
          toolCallId: 'b-t',
          parentMessageId: 'different',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('reopens snapshot tool IDs in their established owner lane when tag and parent are absent', () => {
  const state = create([
    {
      id: 'child-m',
      role: 'assistant',
      content: '',
      subagentRunId: 'child',
      toolCalls: [
        {
          id: 't',
          type: 'function',
          function: { name: 'tool', arguments: '' },
        },
      ],
    },
    { id: 'parent', role: 'assistant', content: '' },
  ]);

  const next = fold(state, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'tool',
  });

  expect(next.events[0]).toMatchObject({
    subagentRunId: 'child',
    parentMessageId: 'assistant-t',
  });
});

test('does not replay opening chunk payload or provider metadata on continuation', () => {
  const state = sequence([
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'm',
      delta: 'first',
      rawEvent: { original: true },
      metadata: { once: true },
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    delta: 'next',
  });

  expect(next.events[0]).not.toHaveProperty('rawEvent');
  expect(next.events[0]).not.toHaveProperty('metadata');
});

test('keeps finite timestamp knownness and rejects non-JSON terminal results atomically', () => {
  const state = sequence([start('a', { timestamp: Infinity })]);

  const terminal = sequence(
    [{ type: EventType.SUBAGENT_FINISHED, subagentRunId: 'a', timestamp: 9 }],
    state,
  );

  expect(state.records[0].timing).toBeUndefined();
  expect(terminal.records[0].timing).toEqual({ settledAt: 9 });
  expect(() =>
    sequence(
      [
        {
          type: EventType.SUBAGENT_FINISHED,
          subagentRunId: 'a',
          result: { invalid: undefined },
        },
      ],
      state,
    ),
  ).toThrow();
  expect(state.active.has('a')).toBe(true);
});

test('closes all pending chunks on snapshot and retains activity owners absent from snapshot', () => {
  const state = sequence([
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'a',
      activityType: 'plan',
      content: {},
      subagentRunId: 'child',
    },
    { type: EventType.TEXT_MESSAGE_CHUNK, messageId: 'p' },
    {
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'r',
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, { type: EventType.MESSAGES_SNAPSHOT, messages: [] });

  expect(next.events.map((event) => event.type)).toEqual([
    EventType.TEXT_MESSAGE_END,
    EventType.REASONING_MESSAGE_END,
    EventType.MESSAGES_SNAPSHOT,
  ]);
  expect(next.state.owners.activity.get('a')).toBe('child');
  expect(next.state.lanes.get('child')?.pending).toBeUndefined();
});

test('retains historical owners across run reset while clearing owner step validation', () => {
  const state = sequence([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm',
      role: 'assistant',
      subagentRunId: 'child',
    },
    { type: EventType.STEP_STARTED, stepName: 'work', subagentRunId: 'child' },
  ]);

  const next = sequence(
    [{ type: EventType.RUN_STARTED, runId: 'next' }],
    state,
  );

  expect(next.owners.message.get('m')).toBe('child');
  expect(next.records).toBe(state.records);
  expect(next.steps.size).toBe(0);
});

test('run start clears historical lane pointers before parenting new tools', () => {
  const initial = create([
    { id: 'child-m', role: 'assistant', content: '', subagentRunId: 'child' },
  ]);
  const state = sequence(
    [{ type: EventType.RUN_STARTED, runId: 'run' }],
    initial,
  );

  const next = fold(state, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'tool',
    subagentRunId: 'child',
  });

  expect(next.events[0]).toMatchObject({ parentMessageId: 'assistant-t' });
});

test('rejects known tool chunks whose explicit parent has a conflicting owner', () => {
  const state = create([
    {
      id: 'child-m',
      role: 'assistant',
      content: '',
      subagentRunId: 'child',
      toolCalls: [
        {
          id: 't',
          type: 'function',
          function: { name: 'tool', arguments: '' },
        },
      ],
    },
    { id: 'parent', role: 'assistant', content: '' },
  ]);

  expect(() =>
    sequence(
      [
        {
          type: EventType.TOOL_CALL_CHUNK,
          toolCallId: 't',
          toolCallName: 'tool',
          parentMessageId: 'parent',
        },
      ],
      state,
    ),
  ).toThrow();
});

test('owns synthetic assistant fallback IDs in the tool lane', () => {
  const state = sequence([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 't',
      toolCallName: 'tool',
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'assistant-t',
    delta: 'later',
  });

  expect(state.owners.message.get('assistant-t')).toBe('child');
  expect(next.events[0]).toMatchObject({ subagentRunId: 'child' });
});

test('each tool result remints independent message ownership', () => {
  const state = sequence([
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 't',
      messageId: 'r',
      content: '',
      subagentRunId: 'child',
    },
  ]);

  const next = sequence(
    [
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 't',
        messageId: 'r',
        content: '',
      },
    ],
    state,
  );

  expect(next.owners.message.get('r')).toBeUndefined();
});

test('reasoning span owners also govern the inner reasoning message and end', () => {
  const state = sequence([
    { type: EventType.REASONING_START, messageId: 'r', subagentRunId: 'child' },
  ]);

  const next = fold(state, {
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'r',
    role: 'reasoning',
  });

  expect(next.events[0]).toMatchObject({ subagentRunId: 'child' });
  expect(() =>
    sequence(
      [
        {
          type: EventType.REASONING_END,
          messageId: 'r',
          subagentRunId: 'other',
        },
      ],
      state,
    ),
  ).toThrow();
});

test.each(['tool-call', 'message'])(
  'encrypted %s values respect native entity ownership',
  (subtype) => {
    const state = sequence([
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'm',
        role: 'assistant',
        subagentRunId: 'child',
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 't',
        toolCallName: 'tool',
        parentMessageId: 'm',
      },
    ]);
    const event = {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype,
      entityId: subtype === 'tool-call' ? 't' : 'm',
      encryptedValue: 'encrypted',
    };

    const next = fold(state, event as AGUIEvent);

    expect(next.events[0]).toMatchObject({ subagentRunId: 'child' });
    expect(() =>
      sequence([{ ...event, subagentRunId: 'other' }], state),
    ).toThrow();
  },
);

test('unchanged native snapshots preserve ownership, lane and record identities', () => {
  const history: Message[] = [
    { id: 'm', role: 'assistant', content: '', subagentRunId: 'child' },
  ];
  const state = create(history);

  const next = fold(state, {
    type: EventType.MESSAGES_SNAPSHOT,
    messages: history,
  });

  expect(next.state).toBe(state);
  expect(next.state.records).toBe(state.records);
});

test('initial history owners do not turn historical assistants into new tool parents', () => {
  const state = create([
    { id: 'old', role: 'assistant', content: '' },
    { id: 'user', role: 'user', content: 'new request' },
  ]);

  const next = fold(state, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'tool',
  });

  expect(next.events[0]).toMatchObject({ parentMessageId: 'assistant-t' });
});

test('no-ID chunks correlate explicit owner-local streams and retain explicit ends', () => {
  const state = sequence([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm',
      role: 'assistant',
      subagentRunId: 'child',
    },
  ]);

  const next = fold(state, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    delta: 'continued',
  });
  const terminal = fold(next.state, {
    type: EventType.RUN_ERROR,
    message: 'failure',
  });

  expect(next.events).toEqual([
    expect.objectContaining({
      messageId: 'm',
      subagentRunId: 'child',
      delta: 'continued',
    }),
  ]);
  expect(terminal.events).toHaveLength(1);
});

test('live snapshots clear active pointers before new tool inference', () => {
  const state = sequence([
    { type: EventType.TEXT_MESSAGE_START, messageId: 'old', role: 'assistant' },
  ]);
  const snapshot = sequence(
    [
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [{ id: 'old', role: 'assistant', content: '' }],
      },
    ],
    state,
  );

  const next = fold(snapshot, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'tool',
  });

  expect(next.events[0]).toMatchObject({ parentMessageId: 'assistant-t' });
});

test.each([EventType.RUN_ERROR, EventType.SUBAGENT_FINISHED])(
  'explicit chunks remain explicit when another same-kind chunk is pending before %s',
  (type) => {
    const state = sequence([
      start('child'),
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'explicit',
        role: 'assistant',
        subagentRunId: 'child',
      },
      {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: 'implicit',
        delta: 'chunk',
        subagentRunId: 'child',
      },
    ]);

    const continued = fold(state, {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'explicit',
      delta: 'more',
    });
    const terminal = fold(continued.state, {
      type,
      subagentRunId: 'child',
      message: 'failure',
    } as AGUIEvent);

    expect(continued.events).toEqual([
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: 'explicit',
        subagentRunId: 'child',
      }),
    ]);
    expect(terminal.events).toEqual([
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'implicit',
        subagentRunId: 'child',
      },
      expect.objectContaining({ type }),
    ]);
  },
);

test('restored tool chunks recover the stored tool name and parent without active lane pointers', () => {
  const state = create([
    {
      id: 'a',
      role: 'assistant',
      content: '',
      subagentRunId: 's',
      toolCalls: [
        {
          id: 't',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ]);

  const next = fold(state, {
    type: EventType.TOOL_CALL_CHUNK,
    toolCallId: 't',
    delta: ' ',
  });

  expect(state.lanes.size).toBe(0);
  expect(next.events).toEqual([
    expect.objectContaining({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 't',
      toolCallName: 'lookup',
      parentMessageId: 'a',
      subagentRunId: 's',
      delta: ' ',
    }),
  ]);
});

test.each([{ toolCallName: 'different' }, { parentMessageId: 'b' }])(
  'restored tool chunks reject supplied identity conflicts %p',
  (conflict) => {
    const state = create([
      {
        id: 'a',
        role: 'assistant',
        content: '',
        subagentRunId: 's',
        toolCalls: [
          {
            id: 't',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { id: 'b', role: 'assistant', content: '', subagentRunId: 's' },
    ]);
    const identity = state.toolIdentities.get('t');

    expect(() =>
      fold(state, {
        type: EventType.TOOL_CALL_CHUNK,
        toolCallId: 't',
        delta: ' ',
        ...conflict,
      }),
    ).toThrow(/Conflicting chunk/);
    expect(state.toolIdentities.get('t')).toBe(identity);
    expect(identity).toEqual({ toolCallName: 'lookup', parentMessageId: 'a' });
  },
);
