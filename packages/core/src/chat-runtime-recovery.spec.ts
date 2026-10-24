import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { s } from './schema';
import { createChatRuntime } from './chat-runtime';
import type { PendingInterruptBatch } from './models/interrupt';
import type { TransportRequest } from './transport';

function batchOf(runtime: {
  pendingInterrupts(): PendingInterruptBatch | undefined;
}): PendingInterruptBatch {
  const batch = runtime.pendingInterrupts();
  if (!batch) throw new Error('Expected a pending interrupt batch');
  return batch;
}

async function settle() {
  for (let index = 0; index < 10; index++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

const messages: Message[] = [
  { id: 'original-system', role: 'system', content: 'trusted' },
  {
    id: 'original-user',
    role: 'user',
    content: 'approve',
    metadata: { custom: { b: 2, a: 1 } },
  },
];
const snapshot = {
  threadId: 'original-thread',
  configuredSystemMessageId: 'original-system',
  messages,
  state: { count: 2 },
  interrupts: [{ id: 'approval', reason: 'approval' }],
};

test('restores before startup without work and explicitly resumes the exact canonical request', async () => {
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    state: { count: 0 },
    transport: {
      name: 'trusted',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield {
              type: EventType.RUN_FINISHED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
          })(),
        };
      },
    },
  });

  runtime.restoreConversation(snapshot, {
    expectedRevision: runtime.recovery().revision,
  });
  const batch = runtime.pendingInterrupts();
  const cleanup = runtime.start();
  await settle();

  expect(requests).toHaveLength(0);
  expect(runtime.threadId()).toBe('original-thread');
  expect(runtime.state()).toEqual({ count: 2 });
  expect(batch?.interrupts).toEqual(snapshot.interrupts);
  expect(runtime.recovery().required).toBe(false);
  runtime.resume({
    batchId: batchOf(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved', payload: true }],
  });
  await settle();
  expect(requests).toHaveLength(1);
  expect(requests[0].input.messages).toEqual(messages);
  expect(requests[0].input.threadId).toBe('original-thread');
  expect(requests[0].input.state).toEqual({ count: 2 });
  expect(requests[0].input).toEqual({
    threadId: 'original-thread',
    runId: requests[0].input.runId,
    messages,
    state: { count: 2 },
    tools: [],
    context: [],
    forwardedProps: {},
    resume: [{ interruptId: 'approval', status: 'resolved', payload: true }],
  });
  cleanup();
});

test('rejects stale asynchronous recovery after a new idle thread without changing it', async () => {
  const runtime = createChatRuntime({ system: 'trusted' });
  const expectedRevision = runtime.recovery().revision;
  const lookup = Promise.resolve(snapshot);
  runtime.updateOptions({ threadId: 'new-thread' });
  await settle();
  const revision = runtime.recovery().revision;

  const result = await lookup;

  expect(() =>
    runtime.restoreConversation(result, { expectedRevision }),
  ).toThrow(/revision/i);
  expect(runtime.threadId()).toBe('new-thread');
  expect(runtime.recovery().revision).toBe(revision);
});

test.each([
  ['empty thread', { ...snapshot, threadId: ' ' }],
  [
    'duplicate IDs',
    { ...snapshot, messages: [messages[0], messages[1], messages[1]] },
  ],
  [
    'missing system provenance',
    { ...snapshot, configuredSystemMessageId: undefined },
  ],
  [
    'wrong system identity',
    { ...snapshot, configuredSystemMessageId: 'other' },
  ],
  [
    'unsupported configured overlay metadata',
    {
      ...snapshot,
      messages: [
        { ...messages[0], metadata: { external: 'significant' } },
        messages[1],
      ],
    },
  ],
  [
    'untrusted system text',
    {
      ...snapshot,
      messages: [{ ...messages[0], content: 'untrusted' }, messages[1]],
    },
  ],
  ['non-JSON state', { ...snapshot, state: { count: NaN } }],
  ['invalid interrupts', { ...snapshot, interrupts: [{ id: 'x', reason: 2 }] }],
  [
    'duplicate interrupts',
    {
      ...snapshot,
      interrupts: [snapshot.interrupts[0], snapshot.interrupts[0]],
    },
  ],
  [
    'expired interrupts',
    {
      ...snapshot,
      interrupts: [
        { id: 'x', reason: 'approval', expiresAt: '2020-01-01T00:00:00Z' },
      ],
    },
  ],
])('rejects %s atomically', (_name, invalid) => {
  const runtime = createChatRuntime({ system: 'trusted', state: { count: 1 } });
  const before = {
    messages: runtime.messages(),
    state: runtime.state(),
    thread: runtime.threadId(),
    recovery: runtime.recovery(),
    batch: runtime.pendingInterrupts(),
  };

  expect(() =>
    runtime.restoreConversation(invalid as typeof snapshot, {
      expectedRevision: runtime.recovery().revision,
    }),
  ).toThrow();

  expect(runtime.messages()).toBe(before.messages);
  expect(runtime.state()).toBe(before.state);
  expect(runtime.threadId()).toBe(before.thread);
  expect(runtime.recovery()).toEqual(before.recovery);
  expect(runtime.pendingInterrupts()).toBe(before.batch);
});

test('owns restored state and interrupts and replaces local batch tokens even on the same thread', () => {
  const runtime = createChatRuntime({ system: 'trusted', state: { count: 0 } });
  const mutable = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
  runtime.restoreConversation(mutable, {
    expectedRevision: runtime.recovery().revision,
  });
  const oldBatch = batchOf(runtime);
  mutable.state.count = 99;
  mutable.messages[1].content = 'changed';
  mutable.interrupts[0].reason = 'changed';

  expect(runtime.state()).toEqual({ count: 2 });
  expect(runtime.messages()[0].content).toBe('approve');
  expect(runtime.pendingInterrupts()?.interrupts[0].reason).toBe('approval');
  runtime.restoreConversation(snapshot, {
    expectedRevision: runtime.recovery().revision,
  });
  expect(runtime.pendingInterrupts()?.id).not.toBe(oldBatch.id);
  expect(() =>
    runtime.resume({
      batchId: oldBatch.id,
      entries: [{ interruptId: 'approval', status: 'cancelled' }],
    }),
  ).toThrow(/stale/i);
});

test('restored trailing user history stays silent through startup and restart without interrupts', async () => {
  const send = jest.fn();
  const runtime = createChatRuntime({
    system: 'trusted',
    transport: { name: 'trusted', send },
  });

  runtime.restoreConversation(
    { ...snapshot, interrupts: undefined },
    { expectedRevision: runtime.recovery().revision },
  );
  const cleanup = runtime.start();
  await settle();
  cleanup();
  const restartCleanup = runtime.start();
  await settle();

  expect(send).not.toHaveBeenCalled();
  expect(runtime.isLoading()).toBe(false);
  restartCleanup();
});

test('rejects restoration during synchronous generation and resume reservations', async () => {
  const runtime = createChatRuntime({ system: 'trusted' });
  runtime.sendMessage({ role: 'user', content: 'go' });

  expect(() =>
    runtime.restoreConversation(snapshot, {
      expectedRevision: runtime.recovery().revision,
    }),
  ).toThrow(/active/i);

  const paused = createChatRuntime({ system: 'trusted' });
  paused.restoreConversation(snapshot, {
    expectedRevision: paused.recovery().revision,
  });
  paused.resume({
    batchId: batchOf(paused).id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });
  expect(() =>
    paused.restoreConversation(snapshot, {
      expectedRevision: paused.recovery().revision,
    }),
  ).toThrow(/active/i);
  await settle();
});

test('acknowledged failed resume can be replaced atomically without replaying its decision', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    retries: 0,
    transport: {
      name: 'trusted',
      send: async (request) => {
        calls++;
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            throw new Error('acknowledged stream failed');
          })(),
        };
      },
    },
  });
  runtime.restoreConversation(snapshot, {
    expectedRevision: runtime.recovery().revision,
  });
  const cleanup = runtime.start();
  await settle();
  runtime.resume({
    batchId: batchOf(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved', payload: true }],
  });
  await settle();
  expect(runtime.recovery().required).toBe(true);

  runtime.restoreConversation(snapshot, {
    expectedRevision: runtime.recovery().revision,
  });
  await settle();

  expect(calls).toBe(1);
  expect(runtime.recovery().required).toBe(false);
  expect(runtime.error()).toBeUndefined();
  expect(runtime.pendingInterrupts()?.interrupts).toEqual(snapshot.interrupts);
  cleanup();
});

test('recovery configuration is owned and matches the actual structured native request', async () => {
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    ui: true,
    responseSchema: s.object('answer', { answer: s.string('answer') }),
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler: async () => true,
      },
    ],
    transport: {
      name: 'trusted',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield {
              type: EventType.RUN_FINISHED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
          })(),
        };
      },
    },
  });
  const getterRuntime = runtime as typeof runtime & {
    getRecoveryConfiguration(): {
      system?: string;
      tools: unknown;
      forwardedProps: unknown;
    };
  };

  const config = getterRuntime.getRecoveryConfiguration();
  expect(requests).toHaveLength(0);
  runtime.restoreConversation(snapshot, {
    expectedRevision: runtime.recovery().revision,
  });
  const cleanup = runtime.start();
  await settle();
  runtime.resume({
    batchId: batchOf(runtime).id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });
  await settle();

  expect(config).toEqual({
    system: 'trusted',
    tools: requests[0].input.tools,
    forwardedProps: requests[0].input.forwardedProps,
  });
  expect(Object.isFrozen(config)).toBe(true);
  expect(Object.isFrozen(config.tools)).toBe(true);
  expect(Object.isFrozen(config.forwardedProps)).toBe(true);
  expect(JSON.stringify(config)).not.toContain('handler');
  cleanup();
});

test('restoration rejects pending reentrant configuration writes before their queued commit', () => {
  const runtime = createChatRuntime({ system: 'trusted' });
  const initialRevision = runtime.recovery().revision;
  let checked = false;
  let rejection: unknown;
  const cleanup = runtime.recovery.subscribe(() => {
    if (checked || runtime.recovery().revision === initialRevision) return;
    checked = true;
    runtime.updateOptions({ debounce: 2 });
    try {
      runtime.restoreConversation(snapshot, {
        expectedRevision: runtime.recovery().revision,
      });
    } catch (error) {
      rejection = error;
    }
  });

  runtime.updateOptions({ debounce: 1 });

  expect(rejection).toBeInstanceOf(Error);
  expect(runtime.threadId()).toBeUndefined();
  cleanup();
});

test('validates structured history and registered tool arguments before any state changes', () => {
  const runtime = createChatRuntime({
    system: 'trusted',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler: async () => true,
      },
    ],
  });
  const revision = runtime.recovery().revision;
  const badAssistant = {
    ...snapshot,
    messages: [
      ...messages,
      {
        id: 'assistant',
        role: 'assistant' as const,
        content: '{"wrong":true}',
      },
    ],
  };
  const call = {
    id: 'call',
    type: 'function' as const,
    function: { name: 'save', arguments: '{"value":"wrong"}' },
  };
  const unresolved = {
    ...snapshot,
    messages: [
      ...messages,
      { id: 'assistant', role: 'assistant' as const, toolCalls: [call] },
    ],
  };
  const badArguments = {
    ...unresolved,
    messages: [
      ...unresolved.messages,
      {
        id: 'result',
        role: 'tool' as const,
        toolCallId: 'call',
        content: 'done',
      },
    ],
  };

  expect(() =>
    runtime.restoreConversation(badAssistant, { expectedRevision: revision }),
  ).toThrow(/schema/i);
  expect(() =>
    runtime.restoreConversation(unresolved, { expectedRevision: revision }),
  ).toThrow(/unresolved/i);
  expect(() =>
    runtime.restoreConversation(badArguments, { expectedRevision: revision }),
  ).toThrow(/arguments/i);

  expect(runtime.recovery().revision).toBe(revision);
  expect(runtime.messages()).toEqual([]);
});

test('completed historical browser tools never run on restore or a later explicit send', async () => {
  const handler = jest.fn(async () => true);
  const requests: TransportRequest[] = [];
  const history: Message[] = [
    ...messages,
    {
      id: 'assistant',
      role: 'assistant',
      toolCalls: [
        {
          id: 'call',
          type: 'function',
          function: { name: 'save', arguments: '{}' },
        },
      ],
    },
    { id: 'result', role: 'tool', toolCallId: 'call', content: 'done' },
  ];
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', {}),
        handler,
      },
    ],
    transport: {
      name: 'trusted',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield {
              type: EventType.RUN_FINISHED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
          })(),
        };
      },
    },
  });

  runtime.restoreConversation(
    { ...snapshot, messages: history, interrupts: undefined },
    { expectedRevision: runtime.recovery().revision },
  );
  const cleanup = runtime.start();
  await settle();
  expect(requests).toHaveLength(0);
  runtime.sendMessage({ role: 'user', content: 'new turn' });
  await settle();

  expect(handler).not.toHaveBeenCalled();
  expect(requests).toHaveLength(1);
  expect(requests[0].input.messages.slice(0, history.length)).toEqual(history);
  cleanup();
});

test('adopts only the first configured system identity and reuses it for later configuration updates', async () => {
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    transport: {
      name: 'trusted',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield {
              type: EventType.RUN_FINISHED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
          })(),
        };
      },
    },
  });
  const laterSystem: Message = {
    id: 'later-system',
    role: 'system',
    content: 'trusted',
  };

  runtime.restoreConversation(
    {
      ...snapshot,
      messages: [...messages, laterSystem],
      interrupts: undefined,
    },
    { expectedRevision: runtime.recovery().revision },
  );
  runtime.updateOptions({ system: 'updated' });
  const cleanup = runtime.start();
  await settle();
  runtime.sendMessage({ role: 'user', content: 'new turn' });
  await settle();

  expect(requests[0].input.messages[0]).toEqual({
    ...messages[0],
    content: 'updated',
  });
  expect(requests[0].input.messages).toContainEqual(laterSystem);
  cleanup();
});

test.each(['send', 'resume'] as const)(
  'explicit %s after restoration before startup executes once when effects start',
  async (command) => {
    const requests: TransportRequest[] = [];
    const runtime = createChatRuntime({
      system: 'trusted',
      debounce: 0,
      transport: {
        name: 'trusted',
        send: async (request) => {
          requests.push(request);
          return {
            events: (async function* (): AsyncIterable<AGUIEvent> {
              yield {
                type: EventType.RUN_STARTED,
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
              yield {
                type: EventType.RUN_FINISHED,
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
            })(),
          };
        },
      },
    });
    runtime.restoreConversation(
      {
        ...snapshot,
        interrupts: command === 'resume' ? snapshot.interrupts : undefined,
      },
      { expectedRevision: runtime.recovery().revision },
    );

    if (command === 'send')
      runtime.sendMessage({ role: 'user', content: 'explicit' });
    else
      runtime.resume({
        batchId: batchOf(runtime).id,
        entries: [
          { interruptId: 'approval', status: 'resolved', payload: true },
        ],
      });
    expect(requests).toHaveLength(0);
    const cleanup = runtime.start();
    await settle();

    expect(requests).toHaveLength(1);
    if (command === 'resume')
      expect(requests[0].input.messages).toEqual(messages);
    cleanup();
  },
);
