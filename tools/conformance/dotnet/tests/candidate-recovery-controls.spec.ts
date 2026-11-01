import type {
  ConversationRecoveryConfiguration,
  PendingConversationRecovery,
} from '@hashbrownai/core';
import {
  buildCandidateRecoveryOptions,
  buildCandidateRecoveryRead,
  createCandidateReadGuard,
  parseCandidateRecoveryEnvelope,
} from '../candidate-consumer/templates/recovery';

/** Unit envelope fixture only; real browser acceptance must obtain genuine server publication. */
function envelope() {
  return {
    schemaVersion: 2,
    disposition: 'Pending',
    serverRevision: 27,
    snapshot: {
      threadId: 'retained-thread',
      configuredSystemMessageId: 'original-system',
      messages: [
        { id: 'original-system', role: 'system', content: 'trusted' },
        { id: 'original-user', role: 'user', content: 'weather' },
        {
          id: 'original-assistant',
          role: 'assistant',
          toolCalls: [
            {
              id: 'b1',
              type: 'function',
              function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
            },
            {
              id: 'p1',
              type: 'function',
              function: { name: 'lookupAirport', arguments: '{"code":"PDX"}' },
            },
          ],
        },
      ],
      interrupts: [{ id: 'request-1', reason: 'approval', toolCallId: 'p1' }],
      pendingBrowserRecovery: {
        protocolVersion: 1,
        serverRevision: 27,
        callIds: ['b1'],
      },
    },
  };
}

/** Inert form-unit data; this never substitutes for runtime-produced browser pending state. */
function pending(): PendingConversationRecovery {
  return {
    id: 'local-batch',
    serverRevision: 27,
    toolCalls: [
      { id: 'b1', name: 'getWeather', arguments: { city: 'Paris' } },
      { id: 'b2', name: 'getWeather', arguments: { city: 'London' } },
    ],
    interrupts: [
      { id: 'request-1', reason: 'approval', toolCallId: 'p1' },
      { id: 'request-2', reason: 'approval', toolCallId: 'p2' },
      { id: 'request-3', reason: 'approval', toolCallId: 'p3' },
    ],
  };
}

/** Supplies deliberately unordered complete forms so canonical pending order must win. */
function forms() {
  return {
    outcomes: [
      { toolCallId: 'b2', status: 'unavailable' as const },
      {
        toolCallId: 'b1',
        status: 'result' as const,
        json: JSON.stringify('  café 🛫\n<img src=x onerror=owned()>'),
      },
    ],
    decisions: [
      { interruptId: 'request-3', decision: 'cancel' as const },
      { interruptId: 'request-1', decision: 'approve' as const },
      { interruptId: 'request-2', decision: 'decline' as const },
    ],
  };
}

test('candidate envelope requires genuine V2 Pending capability with matching thread and positive captured server revision', () => {
  const original = envelope();
  const before = JSON.stringify(original);

  const result = parseCandidateRecoveryEnvelope(original, 'retained-thread', [
    'getWeather',
  ]);

  expect(result).toEqual(original);
  expect(result).not.toBe(original);
  expect(result.snapshot).not.toBe(original.snapshot);
  expect(JSON.stringify(original)).toBe(before);
});

test('candidate envelope refuses V1 downgrade unsupported versions revisions and foreign-thread snapshots', () => {
  const original = envelope();
  const invalid = [
    { ...original, schemaVersion: 1 },
    { ...original, schemaVersion: 3 },
    { ...original, serverRevision: 0 },
    { ...original, serverRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...original, serverRevision: 28 },
    { ...original, disposition: 'InventedReady' },
    {
      ...original,
      snapshot: { ...original.snapshot, threadId: 'other-thread' },
    },
  ];

  for (const value of invalid)
    expect(() =>
      parseCandidateRecoveryEnvelope(value, 'retained-thread', ['getWeather']),
    ).toThrow();
});

test('candidate envelope rejects missing duplicate foreign settled protected and malformed browser capability identifiers', () => {
  const original = envelope();
  const capabilities = [
    undefined,
    { protocolVersion: 999, serverRevision: 27, callIds: ['b1'] },
    { protocolVersion: 1, serverRevision: 26, callIds: ['b1'] },
    { protocolVersion: 1, serverRevision: 27, callIds: [] },
    { protocolVersion: 1, serverRevision: 27, callIds: ['b1', 'b1'] },
    { protocolVersion: 1, serverRevision: 27, callIds: ['foreign'] },
    { protocolVersion: 1, serverRevision: 27, callIds: ['p1'] },
    {
      protocolVersion: 1,
      serverRevision: 27,
      callIds: ['b1'],
      unexpected: true,
    },
  ];

  for (const capability of capabilities)
    expect(() =>
      parseCandidateRecoveryEnvelope(
        {
          ...original,
          snapshot: {
            ...original.snapshot,
            pendingBrowserRecovery: capability,
          },
        },
        'retained-thread',
        ['getWeather'],
      ),
    ).toThrow();
  expect(() =>
    parseCandidateRecoveryEnvelope(
      {
        ...original,
        snapshot: {
          ...original.snapshot,
          messages: [
            ...original.snapshot.messages,
            {
              id: 'settled-browser',
              role: 'tool',
              toolCallId: 'b1',
              content: 'already known',
            },
          ],
        },
      },
      'retained-thread',
      ['getWeather'],
    ),
  ).toThrow();
});

test('candidate envelope never exposes pending authority from Busy UnknownEffect Expired or unavailable states', () => {
  const original = envelope();

  for (const disposition of [
    'Busy',
    'UnknownEffect',
    'Expired',
    'Unavailable',
  ]) {
    expect(
      parseCandidateRecoveryEnvelope(
        { schemaVersion: 2, disposition, serverRevision: 27, snapshot: null },
        'retained-thread',
        ['getWeather'],
      ),
    ).toEqual({ schemaVersion: 2, disposition, serverRevision: 27 });
    expect(() =>
      parseCandidateRecoveryEnvelope(
        { ...original, disposition },
        'retained-thread',
        ['getWeather'],
      ),
    ).toThrow();
  }
});

test('candidate recovery forms preserve exact known strings and submit all genuine decisions in canonical pending order', () => {
  const batch = pending();
  const input = forms();
  const before = JSON.stringify({ batch, input });

  const result = buildCandidateRecoveryOptions(batch, input);

  expect(result).toEqual({
    batchId: 'local-batch',
    outcomes: [
      {
        toolCallId: 'b1',
        status: 'result',
        value: '  café 🛫\n<img src=x onerror=owned()>',
      },
      { toolCallId: 'b2', status: 'unavailable' },
    ],
    entries: [
      {
        interruptId: 'request-1',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'request-2',
        status: 'resolved',
        payload: { approved: false },
      },
      { interruptId: 'request-3', status: 'cancelled' },
    ],
  });
  expect(JSON.stringify({ batch, input })).toBe(before);
});

test('candidate known object null and exact reserved marker remain actual explicit result values', () => {
  const batch = {
    ...pending(),
    interrupts: [],
    toolCalls: [pending().toolCalls[0]],
  };
  const marker =
    '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';

  for (const value of [
    { nested: [true, null, 'café'] },
    null,
    marker,
    marker + ' ',
  ]) {
    const result = buildCandidateRecoveryOptions(batch, {
      outcomes: [
        { toolCallId: 'b1', status: 'result', json: JSON.stringify(value) },
      ],
      decisions: [],
    });

    expect(result).toEqual({
      batchId: batch.id,
      outcomes: [{ toolCallId: 'b1', status: 'result', value }],
    });
  }
});

test('candidate forms reject incomplete duplicate foreign and browser-as-native choices atomically', () => {
  const batch = pending();
  const input = forms();
  const before = JSON.stringify({ batch, input });
  const invalid = [
    { ...input, outcomes: input.outcomes.slice(1) },
    { ...input, outcomes: [...input.outcomes, input.outcomes[0]] },
    {
      ...input,
      outcomes: [
        ...input.outcomes,
        { toolCallId: 'foreign', status: 'unavailable' },
      ],
    },
    { ...input, decisions: input.decisions.slice(1) },
    { ...input, decisions: [...input.decisions, input.decisions[0]] },
    {
      ...input,
      decisions: [
        ...input.decisions,
        { interruptId: 'b1', decision: 'approve' },
      ],
    },
    {
      ...input,
      outcomes: [{ toolCallId: 'b1', status: '' }, input.outcomes[0]],
    },
    {
      ...input,
      outcomes: [
        { toolCallId: 'b1', status: 'result', json: '{broken' },
        input.outcomes[0],
      ],
    },
  ];

  for (const value of invalid)
    expect(() => buildCandidateRecoveryOptions(batch, value)).toThrow();

  expect(JSON.stringify({ batch, input })).toBe(before);
});

test('candidate recovery read uses unchanged trusted configuration and exactly one V2 header with captured thread URL', () => {
  const configuration: ConversationRecoveryConfiguration = {
    system: 'trusted',
    tools: [
      {
        name: 'getWeather',
        description: 'Get weather',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    ],
    forwardedProps: { hashbrown: { responseSchema: { type: 'object' } } },
  };
  const original = JSON.stringify(configuration);

  const result = buildCandidateRecoveryRead(
    {
      endpoint: 'http://127.0.0.1:4321',
      threadId: 'opaque/thread ? café',
      principal: 'alice',
    },
    configuration,
  );
  const headers = new Headers(result.init.headers);

  expect(result.url).toBe(
    'http://127.0.0.1:4321/threads/opaque%2Fthread%20%3F%20caf%C3%A9/native-session',
  );
  expect(result.init.method).toBe('POST');
  expect(result.init.body).toBe(original);
  expect(headers.get('hashbrown-recovery-version')).toBe('2');
  expect(
    [...headers.keys()].filter((name) => name === 'hashbrown-recovery-version'),
  ).toHaveLength(1);
  expect(headers.get('x-fixture-principal')).toBe('alice');
  expect(JSON.stringify(configuration)).toBe(original);
});

test('candidate read generation guard refuses stale local revisions threads superseded reads and explicit invalidation', () => {
  const guard = createCandidateReadGuard();
  const first = guard.begin('thread-a', 3);

  expect(guard.isCurrent(first, 'thread-a', 3)).toBe(true);
  expect(guard.isCurrent(first, 'thread-a', 4)).toBe(false);
  expect(guard.isCurrent(first, 'thread-b', 3)).toBe(false);
  const next = guard.begin('thread-a', 3);
  expect(guard.isCurrent(first, 'thread-a', 3)).toBe(false);
  expect(guard.isCurrent(next, 'thread-a', 3)).toBe(true);
  guard.invalidate();
  expect(guard.isCurrent(next, 'thread-a', 3)).toBe(false);
});
