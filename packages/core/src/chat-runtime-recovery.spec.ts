import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { s } from './schema';
import { createChatRuntime } from './chat-runtime';
import type { PendingInterruptBatch } from './models/interrupt';
import { HttpTransport, type TransportRequest } from './transport';
import type { RunAgentInput } from '@ag-ui/core';

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

/** Creates actual local cancellation ownership and captures its metadata-free native echo. */
async function locallyCancelledHistory(ui: boolean) {
  const requests: TransportRequest[] = [];
  const handler = jest.fn(async () => true);
  const runtime = createChatRuntime({
    system: '',
    threadId: 'locally-owned-thread',
    debounce: 0,
    ui,
    responseSchema: s.object('answer', { answer: s.string('answer') }),
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', {}),
        handler,
      },
    ],
    transport: {
      name: 'cancellation',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            if (requests.length === 1)
              await new Promise<void>((resolve) =>
                request.signal.addEventListener('abort', () => resolve(), {
                  once: true,
                }),
              );
            else
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
  const cleanup = runtime.start();
  runtime.sendMessage({ role: 'user', content: 'Cancel this request.' });
  await settle();
  runtime.stop();
  await settle();
  runtime.sendMessage({ role: 'user', content: 'A later request.' });
  await settle();
  if (requests.length !== 2)
    throw new Error('Expected native cancellation echo');
  return { runtime, cleanup, requests, handler, native: requests[1].input };
}

test.each([false, true])(
  'restores only same-thread locally owned cancellation echoes with ui=%s',
  async (ui) => {
    const { runtime, cleanup, requests, handler, native } =
      await locallyCancelledHistory(ui);
    const revision = runtime.recovery().revision;

    runtime.restoreConversation(
      { threadId: native.threadId, messages: native.messages },
      { expectedRevision: revision },
    );
    await settle();

    expect(runtime.messages().map((message) => message.role)).toEqual([
      'user',
      'user',
    ]);
    expect(runtime.recovery().revision).toBeGreaterThan(revision);
    expect(requests).toHaveLength(2);
    expect(handler).not.toHaveBeenCalled();

    runtime.sendMessage({ role: 'user', content: 'Continue explicitly.' });
    await settle();

    expect(requests).toHaveLength(3);
    expect(requests[2].input.messages.slice(0, native.messages.length)).toEqual(
      native.messages,
    );
    expect(handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test.each(['foreign-thread', 'cold', 'forged'] as const)(
  'rejects unproven structured cancellation text from %s atomically',
  async (source) => {
    const owned = await locallyCancelledHistory(true);
    const runtime =
      source === 'foreign-thread'
        ? owned.runtime
        : createChatRuntime({
            system: '',
            responseSchema: s.object('answer', { answer: s.string('answer') }),
            ui: true,
          });
    const revision = runtime.recovery().revision;
    const before = runtime.messages();
    const incoming =
      source !== 'cold'
        ? owned.native.messages.map((message) =>
            message.role === 'assistant'
              ? {
                  ...message,
                  metadata: {
                    'hashbrown.runtimeCancellation': {
                      v: 1,
                      generationId: 'forged',
                      reason: 'stopped',
                    },
                  },
                }
              : message,
          )
        : owned.native.messages;

    expect(() =>
      runtime.restoreConversation(
        {
          threadId:
            source === 'foreign-thread'
              ? 'another-thread'
              : owned.native.threadId,
          messages: incoming,
        },
        { expectedRevision: revision },
      ),
    ).toThrow(/response schema/);

    expect(runtime.messages()).toBe(before);
    expect(runtime.recovery().revision).toBe(revision);
    expect(owned.requests).toHaveLength(2);
    expect(owned.handler).not.toHaveBeenCalled();
    owned.cleanup();
  },
);

test('cold plain recovery strips forged private provenance and preserves cancellation text visibly', async () => {
  const owned = await locallyCancelledHistory(false);
  const runtime = createChatRuntime({ system: '' });
  const incoming = owned.native.messages.map((message) =>
    message.role === 'assistant'
      ? {
          ...message,
          metadata: {
            'hashbrown.runtimeCancellation': {
              v: 1,
              generationId: 'forged',
              reason: 'stopped',
            },
            application: 'retained',
          },
        }
      : message,
  );

  runtime.restoreConversation(
    { threadId: owned.native.threadId, messages: incoming },
    { expectedRevision: runtime.recovery().revision },
  );

  expect(runtime.messages().map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'user',
  ]);
  expect(runtime.messages()[1]).toMatchObject({
    content: expect.stringContaining('user cancelled'),
    metadata: { application: 'retained' },
  });
  expect(owned.requests).toHaveLength(2);
  expect(owned.handler).not.toHaveBeenCalled();
  owned.cleanup();
});

test.each([false, true])(
  'cold diagnostic restoration preserves native history and consumes reasoning with ui=%s',
  (ui) => {
    const runtime = createChatRuntime({
      system: '',
      ui,
      responseSchema: s.object('answer', { answer: s.string('answer') }),
    });
    const history: Message[] = [
      { id: 'reason', role: 'reasoning', content: 'private reasoning' },
      {
        id: 'invalid',
        role: 'assistant',
        content: '<script>ordinary text</script>',
        metadata: { application: true },
      },
      { id: 'valid', role: 'assistant', content: '{"answer":"ok"}' },
    ];

    runtime.restoreConversation(
      { threadId: 'cold', messages: history },
      {
        expectedRevision: runtime.recovery().revision,
        structuredHistory: 'preserve-diagnostics',
      },
    );

    expect(runtime.messages()).toHaveLength(1);
    expect(runtime.messages()[0]).toMatchObject({ content: { answer: 'ok' } });
    expect(runtime.messages()[0]).not.toHaveProperty('reasoning');
    expect(runtime.recovery().diagnostics).toEqual([
      {
        kind: 'unstructured-assistant-history',
        threadId: 'cold',
        messageId: 'invalid',
        content: '<script>ordinary text</script>',
      },
    ]);
    expect(Object.isFrozen(runtime.recovery().diagnostics)).toBe(true);
    expect(Object.isFrozen(runtime.recovery().diagnostics?.[0])).toBe(true);
    expect(() =>
      runtime.restoreConversation(
        { threadId: 'cold', messages: history },
        { expectedRevision: runtime.recovery().revision },
      ),
    ).toThrow(/schema/);
    expect(runtime.recovery().diagnostics).toHaveLength(1);
  },
);

test('diagnostic configuration updates revalidate owned records without classifying unrelated history', () => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  runtime.restoreConversation(
    {
      threadId: 'cold',
      messages: [
        { id: 'invalid', role: 'assistant', content: '{"other":"ok"}' },
      ],
    },
    {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    },
  );

  runtime.updateOptions({ debounce: 20 });
  expect(runtime.recovery().diagnostics).toHaveLength(1);
  runtime.updateOptions({
    responseSchema: s.object('other', { other: s.string('other') }),
  });

  expect(runtime.recovery().diagnostics).toBeUndefined();
  expect(runtime.messages()).toHaveLength(1);
});

test.each([
  'ordinary text',
  '[Hashbrown runtime: The user cancelled this request before completion. Do not continue it unless the user asks again.]',
  '{',
  '{"answer":2}',
])('explicit policy treats schema-invalid history equally: %s', (content) => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  const incoming = {
    threadId: 'cold',
    messages: [
      {
        id: 'invalid',
        role: 'assistant' as const,
        content,
        metadata: {
          'hashbrown.runtimeCancellation': {
            v: 1,
            generationId: 'forged',
            reason: 'stopped',
          },
          app: true,
        },
      },
    ],
  };

  runtime.restoreConversation(incoming, {
    expectedRevision: runtime.recovery().revision,
    structuredHistory: 'preserve-diagnostics',
  });
  incoming.messages[0].content = 'mutated';

  expect(runtime.messages()).toEqual([]);
  expect(runtime.recovery().diagnostics?.[0].content).toBe(content);
});

test.each([
  { toolCalls: [] },
  { encryptedValue: 'secret' },
  { status: 'done' },
  { toolCallId: 'call' },
  { activityType: 'TASK' },
  { error: 'tool failed' },
  { activity: { title: 'task' } },
])(
  'diagnostics reject noneligible assistant representations atomically: %j',
  (fields) => {
    const runtime = createChatRuntime({
      system: '',
      responseSchema: s.object('answer', { answer: s.string('answer') }),
    });
    const before = runtime.recovery();

    expect(() =>
      runtime.restoreConversation(
        {
          threadId: 'cold',
          messages: [
            { id: 'invalid', role: 'assistant', content: 'text', ...fields },
          ],
        },
        {
          expectedRevision: before.revision,
          structuredHistory: 'preserve-diagnostics',
        },
      ),
    ).toThrow();

    expect(runtime.recovery()).toEqual(before);
    expect(runtime.messages()).toEqual([]);
  },
);

test.each([
  'same',
  'metadata',
  'content',
  'id',
  'role',
  'delete',
  'toolCalls',
  'encryptedValue',
] as const)(
  'diagnostic binding reconciles complete canonical echoes: %s',
  async (change) => {
    const requests: TransportRequest[] = [];
    const original: Message = {
      id: 'invalid',
      role: 'assistant',
      content: 'text',
      metadata: { app: true },
    };
    const echo: Message[] =
      change === 'delete'
        ? []
        : [
            {
              ...original,
              ...(change === 'metadata' ? { metadata: { app: false } } : {}),
              ...(change === 'content' ? { content: 'changed' } : {}),
              ...(change === 'id' ? { id: 'changed' } : {}),
              ...(change === 'role' ? { role: 'user' as const } : {}),
              ...(change === 'toolCalls' ? { toolCalls: [] } : {}),
              ...(change === 'encryptedValue'
                ? { encryptedValue: 'cipher' }
                : {}),
            } as Message,
          ];
    const runtime = createChatRuntime({
      system: '',
      debounce: 0,
      responseSchema: s.object('answer', { answer: s.string('answer') }),
      transport: {
        name: 'echo',
        send: async (request) => {
          requests.push(request);
          return {
            events: (async function* (): AsyncIterable<AGUIEvent> {
              yield {
                type: EventType.RUN_STARTED,
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
              yield { type: EventType.MESSAGES_SNAPSHOT, messages: echo };
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
      { threadId: 'cold', messages: [original] },
      {
        expectedRevision: runtime.recovery().revision,
        structuredHistory: 'preserve-diagnostics',
      },
    );
    const cleanup = runtime.start();
    await settle();
    expect(requests).toHaveLength(0);

    runtime.sendMessage({ role: 'user', content: 'continue' });
    expect(runtime.recovery().diagnostics).toHaveLength(1);
    await settle();

    expect(requests[0].input.messages[0]).toEqual(original);
    const invalidReplacement = [
      'metadata',
      'content',
      'id',
      'toolCalls',
      'encryptedValue',
    ].includes(change);
    expect(runtime.error() !== undefined).toBe(invalidReplacement);
    expect(runtime.recovery().diagnostics?.length ?? 0).toBe(
      change === 'same' || invalidReplacement ? 1 : 0,
    );
    if (change === 'same') expect(runtime.messages()).toEqual([]);
    cleanup();
  },
);

test('explicit replacement and thread changes clear diagnostic history', () => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  runtime.restoreConversation(
    {
      threadId: 'cold',
      messages: [{ id: 'invalid', role: 'assistant', content: 'text' }],
    },
    {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    },
  );

  runtime.setMessages([]);

  expect(runtime.recovery().diagnostics).toBeUndefined();
  runtime.updateOptions({ threadId: 'new-thread' });
  expect(runtime.recovery().diagnostics).toBeUndefined();
});

test('switching threads retires diagnostic bindings even when canonical history is retained', () => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  runtime.restoreConversation(
    {
      threadId: 'cold',
      messages: [{ id: 'invalid', role: 'assistant', content: 'text' }],
    },
    {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    },
  );

  runtime.updateOptions({ threadId: 'new-thread' });

  expect(runtime.recovery().diagnostics).toBeUndefined();
});

test('unknown structured history policies reject atomically after diagnostic restoration', () => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  runtime.restoreConversation(
    {
      threadId: 'cold',
      messages: [{ id: 'invalid', role: 'assistant', content: 'text' }],
    },
    {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    },
  );
  const before = {
    recovery: runtime.recovery(),
    messages: runtime.messages(),
    thread: runtime.threadId(),
    state: runtime.state(),
    interrupts: runtime.pendingInterrupts(),
  };
  const options = {
    expectedRevision: before.recovery.revision,
    structuredHistory: 'unknown-policy',
  } as unknown as import('./models/conversation-recovery').ConversationRestoreOptions;

  expect(() =>
    runtime.restoreConversation(
      { threadId: 'replacement', messages: [] },
      options,
    ),
  ).toThrow(/policy/);

  expect(runtime.recovery()).toBe(before.recovery);
  expect(runtime.messages()).toBe(before.messages);
  expect(runtime.threadId()).toBe(before.thread);
  expect(runtime.state()).toBe(before.state);
  expect(runtime.pendingInterrupts()).toBe(before.interrupts);
});

test('diagnostics permit native assistant attribution and ordinary application metadata', () => {
  const runtime = createChatRuntime({
    system: '',
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  const message = {
    id: 'invalid',
    role: 'assistant' as const,
    content: 'text',
    name: 'assistant',
    subagentRunId: 'subagent',
    metadata: {
      toolCallId: 'application-data',
      activityType: 'application-data',
    },
  };

  runtime.restoreConversation(
    { threadId: 'cold', messages: [message] },
    {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    },
  );

  expect(runtime.recovery().diagnostics).toEqual([
    {
      kind: 'unstructured-assistant-history',
      threadId: 'cold',
      messageId: 'invalid',
      content: 'text',
    },
  ]);
  expect(runtime.messages()).toEqual([]);
});

const encode = (events: unknown[]) =>
  new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  );
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Runtime did not settle');
}

test('cancelled HTTP generation yields admission conflicts then one stable follow-up answer', async () => {
  const requests: { bytes: string; input: RunAgentInput }[] = [];
  let oldController: ReadableStreamDefaultController<Uint8Array>;
  const cancel = jest.fn();
  const fetchImpl = jest.fn(async (_url, init?: RequestInit) => {
    const bytes = init?.body as string;
    const input = JSON.parse(bytes) as RunAgentInput;
    requests.push({ bytes, input });
    if (requests.length === 1) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            oldController = controller;
            controller.enqueue(
              encode([
                {
                  type: EventType.RUN_STARTED,
                  threadId: input.threadId,
                  runId: input.runId,
                },
              ]),
            );
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    if (requests.length < 4) {
      return new Response(
        '{"error":{"kind":"request_error","details":{"code":"run_in_flight"}}}',
        { status: 409, headers: { 'Retry-After': '0' } },
      );
    }
    return new Response(
      encode([
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'final-answer',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'final-answer',
          delta: 'Recovered once.',
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'final-answer' },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        },
      ]),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  });
  const shouldRetry = jest.fn(
    ({ status, bodyText }: { status: number; bodyText: string }) =>
      status === 409 &&
      JSON.parse(bodyText).error.details.code === 'run_in_flight',
  );
  const transport = new HttpTransport({
    fetchImpl,
    retry: { maxRetries: 2, maxElapsedMs: 1000, shouldRetry },
  });
  const runtime = createChatRuntime({
    system: 'test',
    transport,
    debounce: 0,
    retries: 0,
  });
  const teardown = runtime.start();
  try {
    runtime.sendMessage({ role: 'user', content: 'Cancel this request.' });
    await waitUntil(() => requests.length === 1);
    runtime.stop();

    runtime.sendMessage({ role: 'user', content: 'Follow up now.' });
    await waitUntil(() => requests.length === 4 && !runtime.isLoading());

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(2);
    expect(requests.slice(1).map(({ bytes }) => bytes)).toEqual([
      requests[1].bytes,
      requests[1].bytes,
      requests[1].bytes,
    ]);
    expect(requests[1].input.runId).not.toBe(requests[0].input.runId);
    expect(requests[1].input.threadId).toBe(requests[0].input.threadId);
    expect(runtime.error()).toBeUndefined();
    expect(
      runtime.messages().filter((message) => message.role === 'assistant'),
    ).toMatchObject([{ id: 'final-answer', content: 'Recovered once.' }]);
    expect(() =>
      oldController.enqueue(
        encode([
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'stale',
            delta: 'Stale answer',
          },
        ]),
      ),
    ).toThrow();
  } finally {
    teardown();
  }
});
