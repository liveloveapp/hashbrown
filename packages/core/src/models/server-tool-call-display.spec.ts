import {
  getServerToolCallLabel,
  groupServerToolCalls,
  type ServerToolCallLabelOverrides,
} from './server-tool-call-display';
import type { ServerToolCall } from './view.models';

function call(overrides: Partial<ServerToolCall> = {}): ServerToolCall {
  return {
    toolCallId: 'call',
    name: 'search',
    status: 'complete',
    args: null,
    ...overrides,
  };
}

function groupLabel(labels: readonly string[]): string | undefined {
  const grouped = groupServerToolCalls(labels.map((label) => call({ label })));
  return grouped[0]?.kind === 'group' ? grouped[0].label : undefined;
}

test.each([
  [{ status: 'inProgress' }, 'Using search…'],
  [{ status: 'executing' }, 'Using search…'],
  [{}, 'Used search'],
  [{ outcome: 'success' }, 'Used search'],
  [{ outcome: 'failure' }, 'search failed'],
  [{ outcome: 'denied' }, 'Denied search'],
  [{ outcome: 'cancelled' }, 'Cancelled search'],
  [{ result: { status: 'rejected', reason: 'private' } }, 'search failed'],
  [{ error: { message: 'private' } }, 'search failed'],
  [{ outcome: 'success', error: { message: 'private' } }, 'Used search'],
  [
    { outcome: 'success', result: { status: 'rejected', reason: 'private' } },
    'Used search',
  ],
] as const)('resolves lifecycle label for %j', (properties, expected) => {
  const input = call(properties);

  const label = getServerToolCallLabel(input);

  expect(label).toBe(expected);
});

test('prefers trimmed application labels, then producer labels, then generic wording', () => {
  const input = call({ label: ' Producer ', args: { secret: 'private' } });
  const overrides = {
    search: {
      label: (value: Readonly<ServerToolCall>) => ` App ${value.name} `,
    },
  };

  const label = getServerToolCallLabel(input, overrides);

  expect(label).toBe('App search');
  expect(getServerToolCallLabel(input)).toBe('Producer');
  expect(getServerToolCallLabel(call({ label: ' ' }))).toBe('Used search');
});

test.each([
  undefined,
  ' ',
  3,
  () => {
    throw new Error('private');
  },
])('falls back from invalid callback %p', (value) => {
  const input = call({ label: 'Producer' });
  const label = typeof value === 'function' ? value : () => value;
  const overrides = {
    search: { label },
  } as unknown as ServerToolCallLabelOverrides;

  const result = getServerToolCallLabel(input, overrides);

  expect(result).toBe('Producer');
});

test.each(['constructor', 'toString', '__proto__'])(
  'uses only own override keys for %s',
  (name) => {
    const inherited = Object.create({
      [name]: { label: () => 'Unsafe', group: () => 'Unsafe' },
    });
    const calls = [call({ name }), call({ name })];

    const label = getServerToolCallLabel(calls[0], inherited);
    const groups = groupServerToolCalls(calls, { labels: inherited });

    expect(label).toBe(`Used ${name}`);
    expect(groups[0]).toMatchObject({ label: `Used ${name} 2 times` });
    expect(
      getServerToolCallLabel(calls[0], { [name]: { label: () => 'Own' } }),
    ).toBe('Own');
  },
);

test('bounds all label paths by Unicode code points including ellipsis', () => {
  const long = '😀'.repeat(130);
  const inputs = [call({ name: long }), call({ label: long }), call()];

  const labels = inputs.map((input, index) =>
    getServerToolCallLabel(
      input,
      index === 2 ? { search: { label: () => long } } : undefined,
    ),
  );

  for (const label of labels) {
    expect(Array.from(label)).toHaveLength(120);
    expect(label.endsWith('…')).toBe(true);
    expect(label).not.toContain('\ufffd');
  }
});

test('groups adjacent calls preserving frozen inputs, member identity and source ids', () => {
  const firstSource = Object.freeze({
    id: 'one',
    kind: 'url' as const,
    title: 'First',
    href: 'https://same',
  });
  const secondSource = Object.freeze({
    id: 'two',
    kind: 'url' as const,
    title: 'Second',
    href: 'https://same',
  });
  const first = Object.freeze(
    call({ toolCallId: 'one', sources: Object.freeze([firstSource]) }),
  );
  const second = Object.freeze(
    call({
      toolCallId: 'two',
      sources: Object.freeze([
        { ...firstSource, title: 'Duplicate' },
        secondSource,
      ]),
    }),
  );
  const last = Object.freeze(call({ name: 'other' }));
  const calls = Object.freeze([first, second, last]);

  const result = groupServerToolCalls(calls);

  expect(result).toHaveLength(2);
  expect(result[1]).toBe(last);
  expect(result[0]).toMatchObject({
    kind: 'group',
    name: 'search',
    label: 'Used search 2 times',
    calls: [first, second],
    sources: [firstSource, secondSource],
  });
  if (result[0].kind === 'group') {
    expect(result[0].calls[0]).toBe(first);
    expect(result[0].calls[1]).toBe(second);
    expect(result[0].sources[0]).toBe(firstSource);
    expect(result[0].sources[1]).toBe(secondSource);
  }
});

test.each([
  { status: 'inProgress' },
  { status: 'executing' },
  { outcome: 'failure' },
  { outcome: 'denied' },
  { outcome: 'cancelled' },
  { result: { status: 'rejected', reason: 'private' } },
  { error: { message: 'private' } },
  { outcome: 'success', result: { status: 'rejected', reason: 'private' } },
  { outcome: 'success', error: { message: 'private' } },
] as const)(
  'treats unsuccessful or open call %j as a grouping barrier',
  (properties) => {
    const calls = [call(), call(properties), call()];

    const result = groupServerToolCalls(calls);

    expect(result).toEqual(calls);
    calls.forEach((value, index) => expect(result[index]).toBe(value));
  },
);

test.each([
  { name: 'other' },
  { kind: 'server' },
  { kind: 'provider' },
  { builtin: 'web_search' },
  { parentToolCallId: 'parent' },
  { metadata: { 'b4.step': { v: 1, status: 'completed', provider: 'one' } } },
  { metadata: { 'b4.step': { v: 1, provider: 'one' } } },
] as const)('separates calls with different identity %j', (properties) => {
  const calls = [call(), call(properties)];

  const result = groupServerToolCalls(calls);

  expect(result).toEqual(calls);
});

test('groups matching providers and respects exclusions without hardcoded tool names', () => {
  const calls = [
    call({
      metadata: { 'b4.step': { v: 1, status: 'completed', provider: 'one' } },
    }),
    call({
      metadata: { 'b4.step': { v: 1, status: 'completed', provider: 'one' } },
    }),
  ];

  const grouped = groupServerToolCalls(calls);
  const excluded = groupServerToolCalls(calls, {
    exclude: Object.freeze(['search']),
  });

  expect(grouped).toHaveLength(1);
  expect(excluded).toEqual(calls);
  expect(
    groupServerToolCalls([call({ name: 'task' }), call({ name: 'task' })]),
  ).toHaveLength(1);
});

test.each([
  [['Read alpha', 'Read beta'], 'Read alpha and beta'],
  [['Read alpha', 'Read beta', 'Read gamma'], 'Read alpha, beta and gamma'],
  [
    ['Read alpha', 'Read beta', 'Read gamma', 'Read delta'],
    'Read alpha, beta and 2 more',
  ],
  [['Read alpha (2 records)', 'Read beta (3 records)'], 'Read alpha and beta'],
  [['Searched for alpha', 'Searched for beta'], 'Searched for alpha and beta'],
  [['Read alpha', 'Read alpha'], 'Used search 2 times'],
  [['Read alpha', 'Read beta: secret'], 'Used search 2 times'],
  [['Read alpha', 'Read beta, gamma'], 'Used search 2 times'],
  [['Read alpha', 'Read beta; gamma'], 'Used search 2 times'],
  [['Read alpha', 'Read beta…'], 'Used search 2 times'],
  [['Read alpha', 'Read one two three four five'], 'Used search 2 times'],
  [['Read alpha', `Read ${'x'.repeat(33)}`], 'Used search 2 times'],
  [['Read alpha', 'Found beta'], 'Used search 2 times'],
] as const)(
  'conservatively combines resolved labels %j',
  (labels, expected) => {
    const result = groupLabel(labels);

    expect(result).toBe(expected);
  },
);

test('uses application group labels with safe fallback and length limits', () => {
  const calls = Object.freeze([
    Object.freeze(call({ label: 'Read alpha' })),
    Object.freeze(call({ label: 'Read beta' })),
  ]);
  const group = jest.fn(
    (members: readonly Readonly<ServerToolCall>[]) =>
      ` ${members.length} results `,
  );

  const result = groupServerToolCalls(calls, { labels: { search: { group } } });

  expect(result[0]).toMatchObject({ label: '2 results' });
  expect(group.mock.calls[0][0][0]).toBe(calls[0]);
  for (const invalid of [
    () => ' ',
    () => undefined,
    () => 3,
    () => {
      throw new Error('private');
    },
  ]) {
    expect(
      groupServerToolCalls(calls, {
        labels: { search: { group: invalid } } as ServerToolCallLabelOverrides,
      })[0],
    ).toMatchObject({ label: 'Read alpha and beta' });
  }
  const long = groupServerToolCalls(calls, {
    labels: { search: { group: () => '😀'.repeat(121) } },
  });
  if (long[0].kind === 'group')
    expect(Array.from(long[0].label)).toHaveLength(120);
});
