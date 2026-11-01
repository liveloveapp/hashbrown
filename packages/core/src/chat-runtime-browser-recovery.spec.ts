import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import {
  type BrowserRecoveryOutcome,
  type ConversationRecoveryDiagnostic,
  type ConversationSnapshot,
  createChatRuntime,
  type PendingBrowserRecovery,
  type PendingConversationRecovery,
  type ResumeConversationRecoveryOptions,
  type StateSignal,
  ɵgetRuntimeSchedulingState,
  ɵsetRequestResponseSchema,
} from './public_api';
import { s } from './schema';
import { devActions } from './actions';
import { reducers, ɵprepareRootAction } from './reducers';
import { createStore } from './utils/micro-ngrx';
import {
  createHttpTransport,
  TransportError,
  type TransportRequest,
} from './transport';

async function settle() {
  for (let index = 0; index < 10; index++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function fixture(
  mixed = false,
  schema: s.SchemaInput = s.object('args', { value: s.number('value') }),
) {
  const handler = jest.fn(async () => 'must not replay');
  const requests: TransportRequest[] = [];
  const tool = {
    name: 'save',
    description: 'save',
    schema,
    handler,
  };
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    state: { count: 0 },
    tools: [tool],
    transport: {
      name: 'trusted',
      send: async (request) => {
        requests.push(request);
        const identity = {
          threadId: request.input.threadId,
          runId: request.input.runId,
        };
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield { type: EventType.RUN_STARTED, ...identity };
            yield { type: EventType.RUN_FINISHED, ...identity };
          })(),
        };
      },
    },
  });
  const capability: PendingBrowserRecovery = {
    protocolVersion: 1,
    serverRevision: 27,
    callIds: ['browser-call'],
  };
  const messages: Message[] = [
    { id: 'original-system', role: 'system', content: 'trusted' },
    { id: 'original-user', role: 'user', content: 'save this' },
    {
      id: 'original-assistant',
      role: 'assistant',
      toolCalls: [
        {
          id: 'browser-call',
          type: 'function',
          function: { name: 'save', arguments: '{"value":7}' },
        },
        ...(mixed
          ? [
              {
                id: 'protected-call',
                type: 'function' as const,
                function: { name: 'charge', arguments: '{"amount":2}' },
              },
            ]
          : []),
      ],
    },
  ];
  const snapshot: ConversationSnapshot<{ count: number }> = {
    threadId: 'retained-thread',
    configuredSystemMessageId: 'original-system',
    messages,
    state: { count: 2 },
    pendingBrowserRecovery: capability,
    ...(mixed
      ? {
          interrupts: [
            {
              id: 'protected-request',
              reason: 'approval',
              toolCallId: 'protected-call',
            },
          ],
        }
      : {}),
  };
  return { runtime, handler, requests, snapshot, tool };
}

test('exports the exact browser recovery contracts through the public API', () => {
  const { runtime } = fixture();
  const outcomes: readonly BrowserRecoveryOutcome[] = [
    { toolCallId: 'browser-call', status: 'result', value: null },
    { toolCallId: 'other-call', status: 'unavailable' },
  ];
  const options: ResumeConversationRecoveryOptions = {
    batchId: 'local-token',
    outcomes,
    entries: [],
  };
  const pending: StateSignal<PendingConversationRecovery | undefined> =
    runtime.pendingConversationRecovery;
  const resume: (options: ResumeConversationRecoveryOptions) => void =
    runtime.resumeConversationRecovery;

  expect(pending()).toBeUndefined();
  expect(typeof resume).toBe('function');
  expect(options.outcomes[0]).toEqual({
    toolCallId: 'browser-call',
    status: 'result',
    value: null,
  });
});

test.each([false, true])(
  'restores browser recovery inertly through subscriptions and startup: mixed=%s',
  async (mixed) => {
    const { runtime, handler, requests, snapshot } = fixture(mixed);
    const original = JSON.stringify(snapshot);
    const configuration = runtime.getRecoveryConfiguration();

    runtime.restoreConversation(snapshot, {
      expectedRevision: runtime.recovery().revision,
    });
    const pending = runtime.pendingConversationRecovery();
    const unsubscribe = runtime.pendingConversationRecovery.subscribe(
      jest.fn(),
    );
    const cleanup = runtime.start();
    await settle();
    cleanup();
    const cleanupRestarted = runtime.start();
    await settle();

    expect(pending).toEqual({
      id: expect.any(String),
      serverRevision: 27,
      toolCalls: [
        { id: 'browser-call', name: 'save', arguments: { value: 7 } },
      ],
      interrupts: snapshot.interrupts ?? [],
    });
    expect(pending?.id).not.toBe('27');
    expect(Object.isFrozen(pending)).toBe(true);
    expect(Object.isFrozen(pending?.toolCalls)).toBe(true);
    expect(Object.isFrozen(pending?.toolCalls[0].arguments)).toBe(true);
    expect(JSON.stringify(pending)).not.toMatch(/handler|owner|lease|private/i);
    expect(runtime.pendingConversationRecovery()).toBe(pending);
    expect(runtime.threadId()).toBe('retained-thread');
    expect(runtime.state()).toEqual({ count: 2 });
    expect(runtime.getRecoveryConfiguration()).toEqual(configuration);
    expect(JSON.stringify(snapshot)).toBe(original);
    expect(handler).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);

    unsubscribe();
    cleanupRestarted();
  },
);

function observe(runtime: ReturnType<typeof fixture>['runtime']) {
  return {
    pending: runtime.pendingConversationRecovery(),
    interrupts: runtime.pendingInterrupts(),
    messages: runtime.messages(),
    state: runtime.state(),
    recovery: runtime.recovery(),
    threadId: runtime.threadId(),
    configuration: runtime.getRecoveryConfiguration(),
  };
}

function expectUnchanged(
  subject: ReturnType<typeof fixture>,
  before: ReturnType<typeof observe>,
) {
  expect(subject.runtime.pendingConversationRecovery()).toBe(before.pending);
  expect(subject.runtime.pendingInterrupts()).toBe(before.interrupts);
  expect(subject.runtime.messages()).toBe(before.messages);
  expect(subject.runtime.state()).toBe(before.state);
  expect(subject.runtime.recovery()).toBe(before.recovery);
  expect(subject.runtime.threadId()).toBe(before.threadId);
  expect(subject.runtime.getRecoveryConfiguration()).toEqual(
    before.configuration,
  );
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
}

const validCapability = {
  protocolVersion: 1,
  serverRevision: 27,
  callIds: ['browser-call'],
};
const sparseIds = new Array<string>(1);
const extraIds = Object.assign(['browser-call'], { extra: 'hidden call' });
let capabilityGetterCalls = 0;
const accessorCapability = Object.defineProperty(
  { serverRevision: 27, callIds: ['browser-call'] },
  'protocolVersion',
  {
    enumerable: true,
    get: () => {
      capabilityGetterCalls++;
      return 1;
    },
  },
);

test.each([
  ['missing capability', undefined],
  ['unsupported version', { ...validCapability, protocolVersion: 2 }],
  ['zero revision', { ...validCapability, serverRevision: 0 }],
  [
    'unsafe revision',
    { ...validCapability, serverRevision: Number.MAX_SAFE_INTEGER + 1 },
  ],
  ['partial IDs', { ...validCapability, callIds: [] }],
  ['foreign ID', { ...validCapability, callIds: ['foreign'] }],
  [
    'duplicate IDs',
    { ...validCapability, callIds: ['browser-call', 'browser-call'] },
  ],
  ['protected ID', { ...validCapability, callIds: ['protected-call'] }],
  ['extra capability field', { ...validCapability, owner: 'untrusted' }],
  ['accessor capability', accessorCapability],
  ['sparse IDs', { ...validCapability, callIds: sparseIds }],
  ['extra array field', { ...validCapability, callIds: extraIds }],
])(
  'rejects %s atomically after a real pending restoration',
  (_name, capability) => {
    const subject = fixture(true);
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const before = observe(subject.runtime);
    const gettersBefore = capabilityGetterCalls;
    const invalid = {
      ...subject.snapshot,
      pendingBrowserRecovery: capability,
    } as ConversationSnapshot<{ count: number }>;

    expect(() =>
      subject.runtime.restoreConversation(invalid, {
        expectedRevision: before.recovery.revision,
      }),
    ).toThrow();

    expectUnchanged(subject, before);
    expect(capabilityGetterCalls).toBe(gettersBefore);
  },
);

test.each(['system', 'arguments', 'state'] as const)(
  'retains pending identity when restored %s provenance is invalid',
  (field) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const before = observe(subject.runtime);
    const invalid = JSON.parse(
      JSON.stringify(subject.snapshot),
    ) as ConversationSnapshot<{ count: number }>;
    const invalidMessages = invalid.messages as Message[];
    if (field === 'system')
      invalidMessages[0] = {
        id: 'original-system',
        role: 'system',
        content: 'changed',
      };
    if (field === 'arguments')
      invalidMessages[2] = {
        id: 'original-assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'browser-call',
            type: 'function',
            function: {
              name: 'save',
              arguments: '{"value":"wrong"}',
            },
          },
        ],
      };
    const candidate =
      field === 'state' ? { ...invalid, state: { count: NaN } } : invalid;

    expect(() =>
      subject.runtime.restoreConversation(candidate, {
        expectedRevision: before.recovery.revision,
      }),
    ).toThrow();

    expectUnchanged(subject, before);
  },
);

test.each([
  [
    'send',
    (subject: ReturnType<typeof fixture>) =>
      subject.runtime.sendMessage({ role: 'user', content: 'new' }),
  ],
  [
    'resend',
    (subject: ReturnType<typeof fixture>) => subject.runtime.resendMessages(),
  ],
  [
    'setMessages',
    (subject: ReturnType<typeof fixture>) => subject.runtime.setMessages([]),
  ],
  [
    'setState',
    (subject: ReturnType<typeof fixture>) =>
      subject.runtime.setState({ count: 99 }),
  ],
  [
    'warm resume',
    (subject: ReturnType<typeof fixture>) =>
      subject.runtime.resume({
        batchId: subject.runtime.pendingInterrupts()?.id ?? '',
        entries: [{ interruptId: 'protected-request', status: 'cancelled' }],
      }),
  ],
  [
    'system update',
    (subject: ReturnType<typeof fixture>) =>
      subject.runtime.updateOptions({ system: 'changed' }),
  ],
  [
    'tool handler update',
    (subject: ReturnType<typeof fixture>) =>
      subject.runtime.updateOptions({
        tools: [
          { ...subject.tool, handler: jest.fn(async () => 'replacement') },
        ],
      }),
  ],
  [
    'schema setter',
    (subject: ReturnType<typeof fixture>) =>
      ɵsetRequestResponseSchema(
        subject.runtime,
        s.object('changed', { answer: s.string('answer') }),
      ),
  ],
] as const)(
  'rejects %s while pending without changing the batch',
  async (_name, mutate) => {
    const subject = fixture(true);
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const cleanup = subject.runtime.start();
    await settle();
    const before = observe(subject.runtime);

    expect(() => mutate(subject)).toThrow(/recovery|pending/i);
    await settle();

    expectUnchanged(subject, before);
    cleanup();
  },
);

test('identical trusted configuration remains inert through facade updates', async () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const cleanup = subject.runtime.start();

  subject.runtime.updateOptions({ system: 'trusted', tools: [subject.tool] });
  await settle();

  expectUnchanged(subject, before);
  cleanup();
});

test('an explicit new thread retires the pending browser epoch', async () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const oldToken = subject.runtime.pendingConversationRecovery()?.id ?? '';

  subject.runtime.updateOptions({ threadId: 'fresh-thread' });
  await settle();

  expect(subject.runtime.pendingConversationRecovery()).toBeUndefined();
  expect(subject.runtime.pendingInterrupts()).toBeUndefined();
  expect(subject.runtime.threadId()).toBe('fresh-thread');
  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: oldToken,
      outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
    }),
  ).toThrow();
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test.each([
  devActions.init({
    system: 'injected',
    canonicalMessages: [],
    threadId: 'injected',
  }),
  devActions.sendMessage({
    message: { role: 'user', content: 'injected' },
    canonicalMessages: [{ id: 'injected', role: 'user', content: 'injected' }],
  }),
  devActions.setMessages({ messages: [], canonicalMessages: [] }),
  devActions.resendMessages(),
  devActions.setState({ state: { count: 99 } }),
  devActions.updateOptions({ system: 'changed' }),
  devActions.updateOptions({
    ɵrequestResponseSchema: s.object('changed', { answer: s.string('answer') }),
  }),
])(
  'rejects direct action $type while browser recovery is pending',
  async (action) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const pending = subject.runtime.pendingConversationRecovery();
    if (!pending) throw new Error('Expected a real pending browser batch');
    const store = createStore({
      reducers,
      effects: [],
      prepareAction: ɵprepareRootAction,
    });
    store.dispatch(
      devActions.restoreConversation({
        expectedRevision: 0,
        threadId: subject.snapshot.threadId,
        canonicalMessages: subject.snapshot.messages,
        state: { count: 2 },
        toolsByName: {},
        pendingBrowserRecovery: pending,
      }),
    );
    const before = store.read((root) => root);

    await expect(store.dispatchAndWait(action)).rejects.toThrow(
      /recovery|pending/i,
    );

    expect(store.read((root) => root)).toBe(before);
    expect(subject.handler).not.toHaveBeenCalled();
    expect(subject.requests).toHaveLength(0);
  },
);
function snapshotWithCalls(
  subject: ReturnType<typeof fixture>,
  ids: readonly string[],
  capabilityIds = ids,
): ConversationSnapshot<{ count: number }> {
  return {
    ...subject.snapshot,
    messages: [
      ...subject.snapshot.messages.slice(0, 2),
      {
        id: 'original-assistant',
        role: 'assistant',
        toolCalls: ids.map((id, index) => ({
          id,
          type: 'function',
          function: {
            name: 'save',
            arguments: JSON.stringify({ value: index }),
          },
        })),
      },
    ],
    pendingBrowserRecovery: {
      protocolVersion: 1,
      serverRevision: 27,
      callIds: capabilityIds,
    },
  };
}

test('restores 2050 short pending calls whose complete retained input is below 1 MiB', () => {
  const subject = fixture();
  const ids = Array.from({ length: 2050 }, (_, index) => `b${index}`);
  const snapshot = snapshotWithCalls(subject, ids);
  const completeRequest = {
    threadId: snapshot.threadId,
    runId: 'bound-control-run',
    messages: snapshot.messages,
    state: snapshot.state,
    tools: subject.runtime.getRecoveryConfiguration().tools,
    context: [],
    forwardedProps: {
      hashbrown: {
        recovery: {
          version: 1,
          serverRevision: 27,
          outcomes: ids.map((toolCallId) => ({
            toolCallId,
            status: 'unavailable',
          })),
        },
      },
    },
  };
  expect(
    new TextEncoder().encode(JSON.stringify(completeRequest)).byteLength,
  ).toBeLessThan(1024 * 1024);

  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });

  expect(
    subject.runtime
      .pendingConversationRecovery()
      ?.toolCalls.map((call) => call.id),
  ).toEqual(ids);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test('accepts a pending call ID at exactly 1024 UTF-8 bytes', () => {
  const subject = fixture();
  const id = 'é'.repeat(512);
  const snapshot = snapshotWithCalls(subject, [id]);
  expect(new TextEncoder().encode(id)).toHaveLength(1024);

  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });

  expect(subject.runtime.pendingConversationRecovery()?.toolCalls[0].id).toBe(
    id,
  );
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test('rejects a pending call ID one UTF-8 byte over 1024 without retiring its prior token', () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const id = `${'é'.repeat(512)}x`;
  const snapshot = snapshotWithCalls(subject, [id]);
  expect(new TextEncoder().encode(id)).toHaveLength(1025);

  expect(() =>
    subject.runtime.restoreConversation(snapshot, {
      expectedRevision: before.recovery.revision,
    }),
  ).toThrow();

  expectUnchanged(subject, before);
});

test('derives pending descriptors in canonical call order when capability IDs are reversed', () => {
  const subject = fixture();
  const snapshot = snapshotWithCalls(
    subject,
    ['first', 'second'],
    ['second', 'first'],
  );
  const original = JSON.stringify(snapshot);

  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });

  expect(subject.runtime.pendingConversationRecovery()?.toolCalls).toEqual([
    { id: 'first', name: 'save', arguments: { value: 0 } },
    { id: 'second', name: 'save', arguments: { value: 1 } },
  ]);
  expect(JSON.stringify(snapshot)).toBe(original);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test('rejects duplicate canonical call identities atomically', () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const snapshot = snapshotWithCalls(
    subject,
    ['duplicate', 'duplicate'],
    ['duplicate'],
  );

  expect(() =>
    subject.runtime.restoreConversation(snapshot, {
      expectedRevision: before.recovery.revision,
    }),
  ).toThrow();

  expectUnchanged(subject, before);
});

test('startup, cleanup, restart and idle stop preserve the pending epoch without work', async () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);

  const cleanup = subject.runtime.start();
  await settle();
  expect(() => subject.runtime.stop()).toThrow(/not streaming/i);
  cleanup();
  const restartedCleanup = subject.runtime.start();
  await settle();
  restartedCleanup();

  expectUnchanged(subject, before);
});

test('fresh authoritative same-thread restoration replaces the local epoch while stale reads remain atomic', () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const old = observe(subject.runtime);

  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: old.recovery.revision,
  });
  const fresh = observe(subject.runtime);

  expect(fresh.pending?.id).not.toBe(old.pending?.id);
  expect(fresh.interrupts?.id).not.toBe(old.interrupts?.id);
  expect(() =>
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: old.recovery.revision,
    }),
  ).toThrow(/revision/i);
  expectUnchanged(subject, fresh);
});

test.each([false, true])(
  'direct idle cancellation retains the browser pending epoch: clear=%s',
  async (clear) => {
    const subject = fixture(true);
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const pending = subject.runtime.pendingConversationRecovery();
    const batch = subject.runtime.pendingInterrupts();
    const store = createStore({
      reducers,
      effects: [],
      prepareAction: ɵprepareRootAction,
    });
    await store.dispatchAndWait(
      devActions.restoreConversation({
        expectedRevision: 0,
        threadId: subject.snapshot.threadId,
        canonicalMessages: subject.snapshot.messages,
        state: { count: 2 },
        toolsByName: {},
        pendingBrowserRecovery: pending,
        batch,
      }),
    );
    const before = store.read((root) => root);

    await store.dispatchAndWait(devActions.stopMessageGeneration(clear));

    expect(store.read((root) => root.recovery)).toBe(before.recovery);
    expect(store.read((root) => root.interrupts)).toBe(before.interrupts);
    expect(store.read((root) => root.agUiMessages)).toBe(before.agUiMessages);
    expect(store.read((root) => root.agentState)).toBe(before.agentState);
    expect(subject.handler).not.toHaveBeenCalled();
    expect(subject.requests).toHaveLength(0);
  },
);

test('a direct explicit new-thread update retires both browser and genuine interrupt epochs', async () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  await store.dispatchAndWait(
    devActions.restoreConversation({
      expectedRevision: 0,
      threadId: subject.snapshot.threadId,
      canonicalMessages: subject.snapshot.messages,
      state: { count: 2 },
      toolsByName: {},
      pendingBrowserRecovery: subject.runtime.pendingConversationRecovery(),
      batch: subject.runtime.pendingInterrupts(),
    }),
  );

  await store.dispatchAndWait(
    devActions.updateOptions({ threadId: 'direct-fresh-thread' }),
  );

  expect(
    store.read((root) => root.recovery.pendingBrowserRecovery),
  ).toBeUndefined();
  expect(store.read((root) => root.interrupts.pending)).toBeUndefined();
  expect(store.read((root) => root.thread.threadId)).toBe(
    'direct-fresh-thread',
  );
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});
const unavailableResult =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';

test.each([
  ['exact string', 'known é\\nresult', 'known é\\nresult'],
  [
    'JSON object',
    { ok: true, values: [1, null] },
    '{"ok":true,"values":[1,null]}',
  ],
  ['null', null, 'null'],
] as const)(
  'explicit browser-only %s settlement sends one exact canonical continuation',
  async (_label, value, content) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const pending = subject.runtime.pendingConversationRecovery();
    if (!pending) throw new Error('Expected pending browser recovery');
    const configuration = subject.runtime.getRecoveryConfiguration();
    const prefix = JSON.stringify(subject.snapshot.messages);
    const cleanup = subject.runtime.start();
    await settle();
    const options: ResumeConversationRecoveryOptions = Object.freeze({
      batchId: pending.id,
      outcomes: Object.freeze([
        Object.freeze({
          toolCallId: 'browser-call',
          status: 'result' as const,
          value: value as import('./public_api').JsonValue,
        }),
      ]),
    });

    subject.runtime.resumeConversationRecovery(options);
    await settle();

    expect(subject.requests).toHaveLength(1);
    const request = subject.requests[0];
    const result = request.input.messages.at(-1);
    expect(result).toEqual({
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'browser-call',
      content,
    });
    expect(result?.id.trim()).not.toBe('');
    expect(
      subject.snapshot.messages.some((message) => message.id === result?.id),
    ).toBe(false);
    expect(request.input).toEqual({
      threadId: subject.snapshot.threadId,
      runId: request.requestId,
      messages: [...subject.snapshot.messages, result],
      state: { count: 2 },
      tools: configuration.tools,
      context: [],
      forwardedProps: {
        hashbrown: {
          recovery: {
            version: 1,
            serverRevision: 27,
            outcomes: [{ toolCallId: 'browser-call', status: 'result' }],
          },
        },
      },
    });
    expect(request.requestId.trim()).not.toBe('');
    expect(subject.runtime.pendingConversationRecovery()).toBeUndefined();
    expect(subject.runtime.recovery().required).toBe(false);
    expect(subject.runtime.state()).toEqual({ count: 2 });
    expect(subject.runtime.getRecoveryConfiguration()).toEqual(configuration);
    expect(JSON.stringify(subject.snapshot.messages)).toBe(prefix);
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test('explicit unavailable settlement appends the reserved result and sends no browser approval', async () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const pending = subject.runtime.pendingConversationRecovery();
  if (!pending) throw new Error('Expected pending browser recovery');
  const cleanup = subject.runtime.start();
  await settle();

  subject.runtime.resumeConversationRecovery({
    batchId: pending.id,
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
    entries: [],
  });
  await settle();

  expect(subject.requests).toHaveLength(1);
  const input = subject.requests[0].input;
  expect(input.messages.slice(0, -1)).toEqual(subject.snapshot.messages);
  expect(input.messages.at(-1)).toEqual({
    id: expect.any(String),
    role: 'tool',
    toolCallId: 'browser-call',
    content: unavailableResult,
  });
  expect(input.resume).toBeUndefined();
  expect(input.forwardedProps).toEqual({
    hashbrown: {
      recovery: {
        version: 1,
        serverRevision: 27,
        outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
      },
    },
  });
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test.each([
  ['missing outcome', []],
  ['foreign outcome', [{ toolCallId: 'foreign', status: 'unavailable' }]],
  [
    'duplicate outcome',
    [
      { toolCallId: 'browser-call', status: 'unavailable' },
      { toolCallId: 'browser-call', status: 'unavailable' },
    ],
  ],
  [
    'unknown outcome status',
    [{ toolCallId: 'browser-call', status: 'cancelled' }],
  ],
  [
    'extra outcome field',
    [{ toolCallId: 'browser-call', status: 'unavailable', value: 'untrusted' }],
  ],
])(
  'rejects %s without consuming the recovery epoch',
  async (_label, outcomes) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const before = observe(subject.runtime);
    const cleanup = subject.runtime.start();
    await settle();
    const options = Object.freeze({
      batchId: before.pending?.id ?? '',
      outcomes: Object.freeze(outcomes),
    }) as ResumeConversationRecoveryOptions;

    expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();
    await settle();

    expectUnchanged(subject, before);
    cleanup();
  },
);

test.each<[string, () => unknown]>([
  ['undefined', () => undefined],
  ['function', () => () => 'effect'],
  ['symbol', () => Symbol('value')],
  ['BigInt', () => BigInt(1)],
  ['nonfinite', () => Infinity],
  ['sparse array', () => new Array(1)],
  [
    'cycle',
    () => {
      const value: Record<string, unknown> = {};
      value['self'] = value;
      return value;
    },
  ],
  ['custom prototype', () => Object.create({ inherited: true })],
  [
    'hidden property',
    () => Object.defineProperty({}, 'hidden', { value: true }),
  ],
  ['symbol property', () => ({ [Symbol('hidden')]: true })],
])('rejects strict JSON %s atomically', (_label, buildValue) => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const value: unknown = buildValue();
  const options = {
    batchId: before.pending?.id ?? '',
    outcomes: [{ toolCallId: 'browser-call', status: 'result', value }],
  } as ResumeConversationRecoveryOptions;

  expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();

  expectUnchanged(subject, before);
});

test('rejects an accessor outcome value without invoking the getter or consuming the batch', () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const getter = jest.fn(() => 'must not read');
  const value = Object.defineProperty({}, 'secret', {
    enumerable: true,
    get: getter,
  });
  const options: ResumeConversationRecoveryOptions = Object.freeze({
    batchId: before.pending?.id ?? '',
    outcomes: Object.freeze([
      Object.freeze({
        toolCallId: 'browser-call',
        status: 'result' as const,
        value,
      }),
    ]),
  });

  expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();

  expect(getter).not.toHaveBeenCalled();
  expectUnchanged(subject, before);
});

test('rejects a browser capability overlapping a protected interrupt call identity atomically', () => {
  const subject = fixture(true);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const invalid: ConversationSnapshot<{ count: number }> = {
    ...subject.snapshot,
    interrupts: [
      {
        id: 'forged-protected-request',
        reason: 'approval',
        toolCallId: 'browser-call',
      },
    ],
  };

  expect(() =>
    subject.runtime.restoreConversation(invalid, {
      expectedRevision: before.recovery.revision,
    }),
  ).toThrow();

  expectUnchanged(subject, before);
});

test.each<[string, () => unknown]>([
  ['array custom prototype', () => Object.setPrototypeOf([1], {})],
  [
    'array subclass',
    () => {
      class RecoveryArray extends Array<number> {}
      return RecoveryArray.of(1);
    },
  ],
  ['array extra property', () => Object.assign([1], { extra: true })],
  [
    'array symbol property',
    () => Object.assign([1], { [Symbol('extra')]: true }),
  ],
])(
  'rejects strict JSON %s without consuming its pending token',
  (_name, makeValue) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const before = observe(subject.runtime);
    const options = {
      batchId: before.pending?.id ?? '',
      outcomes: [
        { toolCallId: 'browser-call', status: 'result', value: makeValue() },
      ],
    } as ResumeConversationRecoveryOptions;

    expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();

    expectUnchanged(subject, before);
  },
);

test('rejects an array index accessor without invoking it', () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  const getter = jest.fn(() => 1);
  const value: number[] = [];
  Object.defineProperty(value, '0', { enumerable: true, get: getter });

  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: before.pending?.id ?? '',
      outcomes: [{ toolCallId: 'browser-call', status: 'result', value }],
    }),
  ).toThrow();

  expect(getter).not.toHaveBeenCalled();
  expectUnchanged(subject, before);
});

function nestedRecoveryValue(depth: number): import('./public_api').JsonValue {
  let value: import('./public_api').JsonValue = 'leaf';
  for (let index = 0; index < depth; index++) value = { next: value };
  return value;
}

test.each<[string, () => import('./public_api').JsonValue, string]>([
  [
    'null prototype',
    () => Object.assign(Object.create(null), { value: 1 }),
    '{"value":1}',
  ],
  [
    'shared acyclic object',
    () => {
      const value = { count: 1 };
      return { left: value, right: value };
    },
    '{"left":{"count":1},"right":{"count":1}}',
  ],
  [
    'depth 64',
    () => nestedRecoveryValue(64),
    JSON.stringify(nestedRecoveryValue(64)),
  ],
])(
  'settles strict JSON %s as exact canonical content',
  async (_name, makeValue, content) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const cleanup = subject.runtime.start();
    await settle();
    const pending = subject.runtime.pendingConversationRecovery();
    if (!pending) throw new Error('Expected pending recovery');

    subject.runtime.resumeConversationRecovery({
      batchId: pending.id,
      outcomes: [
        { toolCallId: 'browser-call', status: 'result', value: makeValue() },
      ],
    });
    await settle();

    expect(subject.requests).toHaveLength(1);
    expect(subject.requests[0].input.messages.at(-1)?.content).toBe(content);
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test('rejects depth 65 atomically', () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);

  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: before.pending?.id ?? '',
      outcomes: [
        {
          toolCallId: 'browser-call',
          status: 'result',
          value: nestedRecoveryValue(65),
        },
      ],
    }),
  ).toThrow(/depth/i);

  expectUnchanged(subject, before);
});

test.each([0, 1])(
  'checks the complete UTF-8 request at the 1 MiB boundary plus %s byte',
  async (extraByte) => {
    const baseline = fixture();
    baseline.runtime.restoreConversation(baseline.snapshot, {
      expectedRevision: baseline.runtime.recovery().revision,
    });
    const baselineCleanup = baseline.runtime.start();
    await settle();
    baseline.runtime.resumeConversationRecovery({
      batchId: baseline.runtime.pendingConversationRecovery()?.id ?? '',
      outcomes: [{ toolCallId: 'browser-call', status: 'result', value: 'a' }],
    });
    await settle();
    expect(baseline.requests).toHaveLength(1);
    const baselineBytes = new TextEncoder().encode(
      JSON.stringify(baseline.requests[0].input),
    ).byteLength;
    baselineCleanup();
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const before = observe(subject.runtime);
    const cleanup = subject.runtime.start();
    await settle();
    const bytes = 1024 * 1024 - baselineBytes + 1 + extraByte;
    const value = 'é'.repeat(Math.floor(bytes / 2)) + (bytes % 2 ? 'a' : '');
    const submit = () =>
      subject.runtime.resumeConversationRecovery({
        batchId: before.pending?.id ?? '',
        outcomes: [{ toolCallId: 'browser-call', status: 'result', value }],
      });

    if (extraByte) expect(submit).toThrow(/byte limit/i);
    else submit();
    await settle();

    if (extraByte) expectUnchanged(subject, before);
    else {
      expect(subject.requests).toHaveLength(1);
      expect(
        new TextEncoder().encode(JSON.stringify(subject.requests[0].input)),
      ).toHaveLength(1024 * 1024);
    }
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test('owns result input before later application mutation and normalizes outcomes in canonical order', async () => {
  const subject = fixture();
  const snapshot = snapshotWithCalls(subject, ['first', 'second']);
  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const cleanup = subject.runtime.start();
  await settle();
  const value = { nested: { count: 1 } };

  subject.runtime.resumeConversationRecovery({
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      { toolCallId: 'second', status: 'result', value: 'second result' },
      { toolCallId: 'first', status: 'result', value },
    ],
  });
  value.nested.count = 99;
  await settle();

  expect(subject.requests).toHaveLength(1);
  expect(subject.requests[0].input.messages.slice(-2)).toEqual([
    {
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'first',
      content: '{"nested":{"count":1}}',
    },
    {
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'second',
      content: 'second result',
    },
  ]);
  expect(subject.requests[0].input.forwardedProps).toEqual({
    hashbrown: {
      recovery: {
        version: 1,
        serverRevision: 27,
        outcomes: [
          { toolCallId: 'first', status: 'result' },
          { toolCallId: 'second', status: 'result' },
        ],
      },
    },
  });
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test('duplicate and subscriber-reentrant claims lose while the original handler stays inert before acknowledgement', async () => {
  const subject = fixture();
  let acknowledge!: () => void;
  const acknowledged = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    transport: {
      name: 'held acknowledgement',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            await acknowledged;
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
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const options: ResumeConversationRecoveryOptions = {
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      { toolCallId: 'browser-call', status: 'result', value: 'known' },
    ],
  };
  const cleanup = subject.runtime.start();
  await settle();
  const reentrant = jest.fn();
  let armed = false;
  const unsubscribe = subject.runtime.recovery.subscribe(() => {
    if (!armed) return;
    armed = false;
    expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow(
      /claimed|pending/i,
    );
    reentrant();
  });
  armed = true;

  subject.runtime.resumeConversationRecovery(options);
  expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow(
    /claimed|pending/i,
  );
  await settle();

  expect(reentrant).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(1);
  expect(subject.runtime.pendingConversationRecovery()?.id).toBe(
    options.batchId,
  );
  expect(subject.handler).not.toHaveBeenCalled();
  acknowledge();
  await settle();
  expect(requests).toHaveLength(1);
  expect(subject.handler).not.toHaveBeenCalled();
  unsubscribe();
  cleanup();
});

test('allocates fresh result and run IDs outside every canonical message and call ID', async () => {
  const subject = fixture();
  const callId = '11111111-1111-4111-8111-111111111111';
  const snapshot = snapshotWithCalls(subject, [callId]);
  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const cleanup = subject.runtime.start();
  await settle();
  const identifiers: ReturnType<typeof crypto.randomUUID>[] = [
    callId,
    '22222222-2222-4222-8222-222222222222',
    callId,
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ];
  const uuid = jest
    .spyOn(crypto, 'randomUUID')
    .mockImplementation(
      () => identifiers.shift() ?? '55555555-5555-4555-8555-555555555555',
    );

  try {
    subject.runtime.resumeConversationRecovery({
      batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
      outcomes: [{ toolCallId: callId, status: 'unavailable' }],
    });
    await settle();

    expect(subject.requests).toHaveLength(1);
    const input = subject.requests[0].input;
    const forbidden = [
      ...snapshot.messages.map((message) => message.id),
      callId,
    ];
    expect(forbidden).not.toContain(input.messages.at(-1)?.id);
    expect(forbidden).not.toContain(input.runId);
    expect(input.messages.at(-1)?.id).not.toBe(input.runId);
    expect(subject.handler).not.toHaveBeenCalled();
  } finally {
    uuid.mockRestore();
    cleanup();
  }
});

test('rejects in-place trusted tool-schema mutation before claiming a restored batch', () => {
  const schema = {
    type: 'object',
    properties: { value: { type: 'number' } },
    required: ['value'],
  };
  const subject = fixture(false, schema);
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const before = observe(subject.runtime);
  schema.properties.value.type = 'string';

  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: before.pending?.id ?? '',
      outcomes: [
        { toolCallId: 'browser-call', status: 'result', value: 'known' },
      ],
    }),
  ).toThrow(/configuration|schema/i);

  expect(subject.runtime.pendingConversationRecovery()).toBe(before.pending);
  expect(subject.runtime.recovery()).toBe(before.recovery);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

async function mixedRecoveryFixture(expiresAt?: string, debounce?: number) {
  const subject = fixture(true);
  const protectedIds = ['protected-call', 'protected-two'];
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    ...(debounce !== undefined ? { debounce } : {}),
    transport: {
      name: 'mixed canonical continuation',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            if (requests.length === 1) {
              for (const [index, toolCallId] of protectedIds.entries())
                yield {
                  type: EventType.TOOL_CALL_RESULT,
                  messageId: `protected-result-${index}`,
                  toolCallId,
                  content: 'server-settled',
                  role: 'tool',
                };
            }
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
  await settle();
  const snapshot: ConversationSnapshot<{ count: number }> = {
    ...subject.snapshot,
    messages: [
      ...subject.snapshot.messages.slice(0, 2),
      {
        id: 'original-assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'browser-call',
            type: 'function',
            function: { name: 'save', arguments: '{"value":1}' },
          },
          {
            id: 'protected-call',
            type: 'function',
            function: { name: 'charge', arguments: '{"amount":2}' },
          },
          {
            id: 'browser-two',
            type: 'function',
            function: { name: 'save', arguments: '{"value":3}' },
          },
          {
            id: 'protected-two',
            type: 'function',
            function: { name: 'charge', arguments: '{"amount":4}' },
          },
        ],
      },
    ],
    interrupts: [
      {
        id: 'protected-request',
        reason: 'approval',
        toolCallId: 'protected-call',
        ...(expiresAt ? { expiresAt } : {}),
      },
      {
        id: 'protected-two-request',
        reason: 'approval',
        toolCallId: 'protected-two',
        ...(expiresAt ? { expiresAt } : {}),
      },
    ],
    pendingBrowserRecovery: {
      protocolVersion: 1,
      serverRevision: 27,
      callIds: ['browser-call', 'browser-two'],
    },
  };
  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  return { ...subject, snapshot, requests };
}

function mixedBrowserOutcomes(): readonly BrowserRecoveryOutcome[] {
  return Object.freeze([
    Object.freeze({
      toolCallId: 'browser-two',
      status: 'unavailable' as const,
    }),
    Object.freeze({
      toolCallId: 'browser-call',
      status: 'result' as const,
      value: 'known browser result',
    }),
  ]);
}

test.each(['approved', 'declined', 'cancelled'] as const)(
  'settles complete mixed %s decisions once and omits cold authority from the next ordinary generation',
  async (decision) => {
    const subject = await mixedRecoveryFixture();
    const configuration = subject.runtime.getRecoveryConfiguration();
    const pending = subject.runtime.pendingConversationRecovery();
    if (!pending) throw new Error('Expected pending mixed recovery');
    const entries = Object.freeze(
      ['protected-two-request', 'protected-request'].map((interruptId) =>
        Object.freeze(
          decision === 'cancelled'
            ? { interruptId, status: 'cancelled' as const }
            : {
                interruptId,
                status: 'resolved' as const,
                payload: decision === 'approved',
              },
        ),
      ),
    );
    const cleanup = subject.runtime.start();
    await settle();

    subject.runtime.resumeConversationRecovery(
      Object.freeze({
        batchId: pending.id,
        outcomes: mixedBrowserOutcomes(),
        entries,
      }),
    );
    await settle();

    expect(subject.requests).toHaveLength(1);
    const input = subject.requests[0].input;
    expect(input.messages.slice(0, -2)).toEqual(subject.snapshot.messages);
    expect(input.messages.slice(-2)).toEqual([
      {
        id: expect.any(String),
        role: 'tool',
        toolCallId: 'browser-call',
        content: 'known browser result',
      },
      {
        id: expect.any(String),
        role: 'tool',
        toolCallId: 'browser-two',
        content: unavailableResult,
      },
    ]);
    expect(input.resume).toHaveLength(2);
    expect(input.resume).toEqual(expect.arrayContaining(entries));
    expect(input.tools).toEqual(configuration.tools);
    expect(input.state).toEqual({ count: 2 });
    expect(input.forwardedProps).toEqual({
      hashbrown: {
        recovery: {
          version: 1,
          serverRevision: 27,
          outcomes: [
            { toolCallId: 'browser-call', status: 'result' },
            { toolCallId: 'browser-two', status: 'unavailable' },
          ],
        },
      },
    });
    expect(subject.runtime.pendingConversationRecovery()).toBeUndefined();
    expect(subject.runtime.pendingInterrupts()).toBeUndefined();
    expect(subject.runtime.recovery().required).toBe(false);
    expect(subject.runtime.error()).toBeUndefined();
    expect(subject.handler).not.toHaveBeenCalled();

    subject.runtime.sendMessage({
      role: 'user',
      content: 'next ordinary turn',
    });
    await settle();

    expect(subject.requests).toHaveLength(2);
    expect(subject.requests[1].input.resume).toBeUndefined();
    expect(subject.requests[1].input.forwardedProps).toEqual({});
    for (const id of ['protected-call', 'protected-two']) {
      expect(
        subject.requests[1].input.messages.filter(
          (message) => message.role === 'tool' && message.toolCallId === id,
        ),
      ).toHaveLength(1);
    }
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test.each([
  ['missing entries', undefined],
  [
    'partial entries',
    [{ interruptId: 'protected-request', status: 'resolved', payload: true }],
  ],
  [
    'duplicate entries',
    [
      { interruptId: 'protected-request', status: 'resolved', payload: true },
      { interruptId: 'protected-request', status: 'resolved', payload: true },
    ],
  ],
  [
    'foreign entry',
    [
      { interruptId: 'protected-request', status: 'resolved', payload: true },
      { interruptId: 'foreign', status: 'cancelled' },
    ],
  ],
  [
    'browser approval entry',
    [
      { interruptId: 'protected-request', status: 'resolved', payload: true },
      { interruptId: 'browser-call', status: 'resolved', payload: true },
    ],
  ],
  [
    'cancelled payload',
    [
      { interruptId: 'protected-request', status: 'cancelled', payload: true },
      { interruptId: 'protected-two-request', status: 'cancelled' },
    ],
  ],
])('rejects mixed %s atomically', async (_name, entries) => {
  const subject = await mixedRecoveryFixture();
  const before = observe(subject.runtime);
  const cleanup = subject.runtime.start();
  await settle();
  const options = {
    batchId: before.pending?.id ?? '',
    outcomes: mixedBrowserOutcomes(),
    entries,
  } as ResumeConversationRecoveryOptions;

  expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();
  await settle();

  expectUnchanged(subject, before);
  cleanup();
});

test('rejects a mixed protected batch that expires after restoration without consuming browser outcomes', async () => {
  const now = Date.now();
  const subject = await mixedRecoveryFixture(
    new Date(now + 60_000).toISOString(),
  );
  const before = observe(subject.runtime);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60_001);

  try {
    expect(() =>
      subject.runtime.resumeConversationRecovery({
        batchId: before.pending?.id ?? '',
        outcomes: mixedBrowserOutcomes(),
        entries: [
          {
            interruptId: 'protected-request',
            status: 'resolved',
            payload: true,
          },
          { interruptId: 'protected-two-request', status: 'cancelled' },
        ],
      }),
    ).toThrow(/expired/i);

    expectUnchanged(subject, before);
  } finally {
    clock.mockRestore();
  }
});

test.each(['payload', 'metadata'] as const)(
  'rejects mixed response %s accessors without invoking getters',
  async (field) => {
    const subject = await mixedRecoveryFixture();
    const before = observe(subject.runtime);
    const getter = jest.fn(() => true);
    const value = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: getter,
    });
    const options: ResumeConversationRecoveryOptions = {
      batchId: before.pending?.id ?? '',
      outcomes: mixedBrowserOutcomes(),
      entries: [
        {
          interruptId: 'protected-request',
          status: 'resolved',
          [field]: value,
        },
        { interruptId: 'protected-two-request', status: 'cancelled' },
      ],
    };

    expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();

    expect(getter).not.toHaveBeenCalled();
    expectUnchanged(subject, before);
  },
);

test('owns complete mixed response JSON before application mutation', async () => {
  const subject = await mixedRecoveryFixture();
  const payload = { approved: true };
  const metadata = { source: 'explicit decision' };
  const cleanup = subject.runtime.start();
  await settle();

  subject.runtime.resumeConversationRecovery({
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: mixedBrowserOutcomes(),
    entries: [
      {
        interruptId: 'protected-request',
        status: 'resolved',
        payload,
        metadata,
      },
      { interruptId: 'protected-two-request', status: 'cancelled' },
    ],
  });
  payload.approved = false;
  metadata.source = 'changed';
  await settle();

  expect(subject.requests).toHaveLength(1);
  expect(subject.requests[0].input.resume).toEqual(
    expect.arrayContaining([
      {
        interruptId: 'protected-request',
        status: 'resolved',
        payload: { approved: true },
        metadata: { source: 'explicit decision' },
      },
      { interruptId: 'protected-two-request', status: 'cancelled' },
    ]),
  );
  expect(subject.runtime.pendingInterrupts()).toBeUndefined();
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

async function coldFailureFixture(
  phase: 'before-start' | 'after-start',
  failure: 'network' | 'malformed' | 'disconnect' | 'cancel',
) {
  const subject = fixture();
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    retries: 2,
    transport: {
      name: 'ambiguous cold continuation',
      send: async (request) => {
        requests.push(request);
        if (failure === 'network' && phase === 'before-start')
          throw new TransportError('Unknown admission before acknowledgement', {
            retryable: true,
          });
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            if (phase === 'after-start')
              yield {
                type: EventType.RUN_STARTED,
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
            if (failure === 'network')
              throw new TransportError(
                'Unknown admission after acknowledgement',
                { retryable: true },
              );
            if (failure === 'malformed')
              yield {
                type: EventType.RUN_STARTED,
                threadId: 'foreign-thread',
                runId: 'foreign-run',
              };
            if (failure === 'cancel')
              await new Promise<void>((resolve) => {
                if (request.signal.aborted) resolve();
                else
                  request.signal.addEventListener('abort', () => resolve(), {
                    once: true,
                  });
              });
          })(),
        };
      },
    },
  });
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const options: ResumeConversationRecoveryOptions = {
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      { toolCallId: 'browser-call', status: 'result', value: 'known' },
    ],
  };
  return { ...subject, requests, options };
}

test.each(['before-start', 'after-start'] as const)(
  'never automatically retries an ambiguous retryable cold send %s',
  async (phase) => {
    const subject = await coldFailureFixture(phase, 'network');
    const cleanup = subject.runtime.start();
    await settle();

    subject.runtime.resumeConversationRecovery(subject.options);
    await settle();

    expect(subject.requests).toHaveLength(1);
    expect(subject.runtime.recovery().required).toBe(true);
    expect(() =>
      subject.runtime.resumeConversationRecovery(subject.options),
    ).toThrow(/recovery|claimed|stale/i);
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test.each([
  ['before-start', 'malformed'],
  ['after-start', 'malformed'],
  ['before-start', 'disconnect'],
  ['after-start', 'disconnect'],
  ['before-start', 'cancel'],
  ['after-start', 'cancel'],
] as const)(
  'requires authoritative refresh after %s %s without replay or ordinary mutations',
  async (phase, failure) => {
    const subject = await coldFailureFixture(phase, failure);
    const cleanup = subject.runtime.start();
    await settle();

    subject.runtime.resumeConversationRecovery(subject.options);
    await settle();
    if (failure === 'cancel') {
      subject.runtime.stop();
      await settle();
    }

    expect(subject.requests).toHaveLength(1);
    expect(subject.runtime.recovery().required).toBe(true);
    const commands = [
      () => subject.runtime.resumeConversationRecovery(subject.options),
      () => subject.runtime.resume({ batchId: 'old-native', entries: [] }),
      () => subject.runtime.sendMessage({ role: 'user', content: 'blocked' }),
      () => subject.runtime.resendMessages(),
      () => subject.runtime.setMessages([]),
      () => subject.runtime.setState({ count: 99 }),
      () => subject.runtime.updateOptions({ system: 'changed' }),
      () =>
        ɵsetRequestResponseSchema(
          subject.runtime,
          s.object('changed', { answer: s.string('answer') }),
        ),
    ];
    for (const command of commands)
      expect(command).toThrow(/recovery|pending|claimed|stale/i);
    await settle();
    expect(subject.requests).toHaveLength(1);
    expect(subject.handler).not.toHaveBeenCalled();
    cleanup();
  },
);

test('a fresh authoritative recovery lookup replaces an ambiguous epoch and requires a new explicit submission', async () => {
  const subject = fixture();
  let accept = false;
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    retries: 2,
    transport: {
      name: 'refresh required',
      send: async (request) => {
        requests.push(request);
        if (!accept) throw new Error('Admission is unknown');
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
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const oldToken = subject.runtime.pendingConversationRecovery()?.id ?? '';
  const cleanup = subject.runtime.start();
  await settle();
  subject.runtime.resumeConversationRecovery({
    batchId: oldToken,
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
  });
  await settle();
  expect(requests).toHaveLength(1);
  expect(subject.runtime.recovery().required).toBe(true);
  accept = true;
  const refreshed = {
    ...subject.snapshot,
    pendingBrowserRecovery: {
      protocolVersion: 1 as const,
      serverRevision: 28,
      callIds: ['browser-call'],
    },
  };

  subject.runtime.restoreConversation(refreshed, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const newToken = subject.runtime.pendingConversationRecovery()?.id ?? '';
  await settle();

  expect(newToken).not.toBe(oldToken);
  expect(requests).toHaveLength(1);
  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: oldToken,
      outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
    }),
  ).toThrow();
  subject.runtime.resumeConversationRecovery({
    batchId: newToken,
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
  });
  await settle();
  expect(requests).toHaveLength(2);
  expect(requests[1].input.forwardedProps).toEqual({
    hashbrown: {
      recovery: {
        version: 1,
        serverRevision: 28,
        outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
      },
    },
  });
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test('a cold claim made before first startup can be stopped without dispatch and remains explicitly usable', async () => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const options: ResumeConversationRecoveryOptions = {
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      { toolCallId: 'browser-call', status: 'result', value: 'known' },
    ],
  };

  subject.runtime.resumeConversationRecovery(options);
  await settle();

  expect(subject.runtime.isLoading()).toBe(true);
  expect(() => subject.runtime.stop()).not.toThrow();
  const cleanup = subject.runtime.start();
  await settle();
  expect(subject.requests).toHaveLength(0);
  expect(subject.runtime.pendingConversationRecovery()?.id).toBe(
    options.batchId,
  );
  expect(subject.runtime.recovery().required).toBe(false);
  subject.runtime.resumeConversationRecovery(options);
  await settle();
  expect(subject.requests).toHaveLength(1);
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test('native decisions expiring after claim but before send do not dispatch or consume the pending epoch', async () => {
  const now = Date.now();
  const subject = await mixedRecoveryFixture(
    new Date(now + 60_000).toISOString(),
    30,
  );
  const before = observe(subject.runtime);
  const cleanup = subject.runtime.start();
  await settle();
  subject.runtime.resumeConversationRecovery({
    batchId: before.pending?.id ?? '',
    outcomes: mixedBrowserOutcomes(),
    entries: [
      { interruptId: 'protected-request', status: 'resolved', payload: true },
      { interruptId: 'protected-two-request', status: 'cancelled' },
    ],
  });
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60_001);

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle();

    expect(subject.requests).toHaveLength(0);
    expect(subject.runtime.pendingConversationRecovery()).toBe(before.pending);
    expect(subject.runtime.pendingInterrupts()).toBe(before.interrupts);
    expect(subject.runtime.recovery().required).toBe(true);
    expect(subject.handler).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
    cleanup();
  }
});

test('cold scheduling signal observes pending, claimed and successfully settled phases through the unchanged resume key', async () => {
  const subject = fixture();
  const scheduling = ɵgetRuntimeSchedulingState(subject.runtime);
  const phases: ReturnType<typeof scheduling>[] = [];
  const unsubscribe = scheduling.subscribe((phase) => phases.push(phase));
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const pending = subject.runtime.pendingConversationRecovery();
  const cleanup = subject.runtime.start();
  await settle();
  expect(scheduling().pending).toBe(true);
  expect(scheduling().isResuming).toBe(false);

  subject.runtime.resumeConversationRecovery({
    batchId: pending?.id ?? '',
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
  });
  const claimed = scheduling();
  await settle();

  expect(claimed.isResuming).toBe(true);
  expect(phases.some((phase) => phase.pending && phase.isResuming)).toBe(true);
  expect(scheduling().pending).toBe(false);
  expect(scheduling().isResuming).toBe(false);
  expect(scheduling().recoveryRequired).toBe(false);
  expect(scheduling().successfulResumes).toBe(1);
  expect(ɵgetRuntimeSchedulingState({ resume: subject.runtime.resume })).toBe(
    scheduling,
  );
  unsubscribe();
  cleanup();
});

test('cold scheduling signal notifies authoritative recovery-required before an error observer can resubmit', async () => {
  const subject = await coldFailureFixture('before-start', 'network');
  const scheduling = ɵgetRuntimeSchedulingState(subject.runtime);
  const phases: ReturnType<typeof scheduling>[] = [];
  const unsubscribeScheduling = scheduling.subscribe((phase) =>
    phases.push(phase),
  );
  const errors = jest.fn();
  const observedErrorPhases: ReturnType<typeof scheduling>[] = [];
  const unsubscribeError = subject.runtime.error.subscribe((error) => {
    if (!error) return;
    observedErrorPhases.push(scheduling());
    expect(() =>
      subject.runtime.resumeConversationRecovery(subject.options),
    ).toThrow();
    errors();
  });
  const cleanup = subject.runtime.start();
  await settle();

  subject.runtime.resumeConversationRecovery(subject.options);
  await settle();

  expect(errors).toHaveBeenCalledTimes(1);
  expect(observedErrorPhases.every((phase) => phase.recoveryRequired)).toBe(
    true,
  );
  expect(phases.some((phase) => phase.recoveryRequired)).toBe(true);
  expect(scheduling().pending).toBe(false);
  expect(scheduling().isResuming).toBe(false);
  expect(subject.requests).toHaveLength(1);
  expect(subject.handler).not.toHaveBeenCalled();
  unsubscribeScheduling();
  unsubscribeError();
  cleanup();
});

function acceptedRecoveryHttpResponse(
  input: TransportRequest['input'],
): Response {
  const identity = { threadId: input.threadId, runId: input.runId };
  const events: AGUIEvent[] = [
    { type: EventType.RUN_STARTED, ...identity },
    { type: EventType.RUN_FINISHED, ...identity },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

test.each([500, 409, 'network'] as const)(
  'built-in HTTP transport never replays an owned cold request after %s before acknowledgement',
  async (failure) => {
    const subject = fixture();
    const bodies: string[] = [];
    const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (failure === 'network')
        throw new TypeError('Network admission is unknown');
      return new Response('unknown admission', {
        status: failure,
        headers: { 'Retry-After': '0' },
      });
    });
    const shouldRetry = jest.fn(() => true);
    subject.runtime.updateOptions({
      retries: 2,
      transport: createHttpTransport({
        fetchImpl,
        retry: { maxRetries: 2, maxElapsedMs: 1000, delayMs: 0, shouldRetry },
      }),
    });
    await settle();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const options: ResumeConversationRecoveryOptions = {
      batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
      outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
    };
    const cleanup = subject.runtime.start();
    await settle();

    subject.runtime.resumeConversationRecovery(options);
    await settle();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(subject.runtime.recovery().required).toBe(true);
    const wire = JSON.parse(bodies[0]) as TransportRequest['input'];
    expect(wire.messages.slice(0, -1)).toEqual(subject.snapshot.messages);
    expect(wire.messages.at(-1)?.content).toBe(unavailableResult);
    expect(wire.forwardedProps).toEqual({
      hashbrown: {
        recovery: {
          version: 1,
          serverRevision: 27,
          outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
        },
      },
    });
    expect(wire.runId.trim()).not.toBe('');
    expect(JSON.stringify(wire)).not.toMatch(
      /retryPolicy|executionPolicy|checkpoint|claimId/,
    );
    expect(() => subject.runtime.resumeConversationRecovery(options)).toThrow();
    cleanup();
    const restartedCleanup = subject.runtime.start();
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(subject.handler).not.toHaveBeenCalled();
    restartedCleanup();
  },
);

test('the next ordinary HTTP generation keeps configured response retries despite retained unavailable-result history', async () => {
  const subject = fixture();
  const bodies: string[] = [];
  const shouldRetry = jest.fn(() => true);
  const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => {
    const body = String(init?.body);
    bodies.push(body);
    const input = JSON.parse(body) as TransportRequest['input'];
    if (bodies.length === 2)
      return new Response('ordinary selected retry', {
        status: 500,
        headers: { 'Retry-After': '0' },
      });
    return acceptedRecoveryHttpResponse(input);
  });
  subject.runtime.updateOptions({
    transport: createHttpTransport({
      fetchImpl,
      retry: { maxRetries: 2, maxElapsedMs: 1000, delayMs: 0, shouldRetry },
    }),
  });
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const cleanup = subject.runtime.start();
  await settle();
  subject.runtime.resumeConversationRecovery({
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
  });
  await settle();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(shouldRetry).not.toHaveBeenCalled();

  subject.runtime.sendMessage({ role: 'user', content: 'ordinary request' });
  await settle();

  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(shouldRetry).toHaveBeenCalledTimes(1);
  expect(bodies[1]).toBe(bodies[2]);
  const ordinary = JSON.parse(bodies[1]) as TransportRequest['input'];
  expect(ordinary.forwardedProps).toEqual({});
  expect(ordinary.resume).toBeUndefined();
  expect(
    ordinary.messages.some(
      (message) =>
        message.role === 'tool' && message.content === unavailableResult,
    ),
  ).toBe(true);
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test('new-thread escape ignores late old cold frames and preserves the replacement thread', async () => {
  const subject = fixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    transport: {
      name: 'late old cold frames',
      send: async (request) => {
        requests.push(request);
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            await held;
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 999 } };
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: 'late-old-message',
              role: 'assistant',
            };
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: 'late-old-message',
              delta: 'late old content',
            };
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: 'late-old-message',
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
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const oldToken = subject.runtime.pendingConversationRecovery()?.id ?? '';
  const cleanup = subject.runtime.start();
  await settle();
  subject.runtime.resumeConversationRecovery({
    batchId: oldToken,
    outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
  });
  await settle();
  expect(requests).toHaveLength(1);

  subject.runtime.updateOptions({ threadId: 'replacement-thread' });
  await settle();
  subject.runtime.setState({ count: 10 });
  const replacement = observe(subject.runtime);
  release();
  await settle();

  expect(subject.runtime.threadId()).toBe('replacement-thread');
  expect(subject.runtime.state()).toEqual({ count: 10 });
  expect(subject.runtime.messages()).toBe(replacement.messages);
  expect(subject.runtime.pendingConversationRecovery()).toBeUndefined();
  expect(subject.runtime.pendingInterrupts()).toBeUndefined();
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.runtime.error()).toBeUndefined();
  expect(requests).toHaveLength(1);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(() =>
    subject.runtime.resumeConversationRecovery({
      batchId: oldToken,
      outcomes: [{ toolCallId: 'browser-call', status: 'unavailable' }],
    }),
  ).toThrow();
  cleanup();
});

test('public recovery diagnostics discriminate unavailable browser results from unstructured assistant history', () => {
  const browser: ConversationRecoveryDiagnostic = {
    kind: 'browser-result-unavailable',
    threadId: 'thread',
    messageId: 'result',
    toolCallId: 'browser-call',
    content: unavailableResult,
  };
  const assistant: Extract<
    ConversationRecoveryDiagnostic,
    { kind: 'unstructured-assistant-history' }
  > = {
    kind: 'unstructured-assistant-history',
    threadId: 'thread',
    messageId: 'assistant',
    content: 'old text',
  };
  const callId = (
    diagnostic: ConversationRecoveryDiagnostic,
  ): string | undefined =>
    diagnostic.kind === 'browser-result-unavailable'
      ? diagnostic.toolCallId
      : undefined;

  expect(callId(browser)).toBe('browser-call');
  expect(callId(assistant)).toBeUndefined();
  // @ts-expect-error Only the unavailable browser diagnostic has a tool call identity.
  expect(assistant.toolCallId).toBeUndefined();
});

test.each(['unavailable', 'known reserved string'] as const)(
  'retains uncertainty for an explicit %s through acceptance, an ordinary turn and another restore',
  async (mode) => {
    const subject = fixture();
    subject.runtime.restoreConversation(subject.snapshot, {
      expectedRevision: subject.runtime.recovery().revision,
    });
    const cleanup = subject.runtime.start();
    await settle();
    const outcome: BrowserRecoveryOutcome =
      mode === 'unavailable'
        ? { toolCallId: 'browser-call', status: 'unavailable' }
        : {
            toolCallId: 'browser-call',
            status: 'result',
            value: unavailableResult,
          };

    subject.runtime.resumeConversationRecovery({
      batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
      outcomes: [outcome],
    });
    await settle();

    expect(subject.requests).toHaveLength(1);
    const resultId = subject.requests[0].input.messages.at(-1)?.id ?? '';
    const diagnostic: ConversationRecoveryDiagnostic = {
      kind: 'browser-result-unavailable',
      threadId: subject.snapshot.threadId,
      messageId: resultId,
      toolCallId: 'browser-call',
      content: unavailableResult,
    };
    expect(subject.runtime.recovery().diagnostics).toEqual([diagnostic]);
    expect(subject.runtime.recovery().required).toBe(false);
    expect(subject.handler).not.toHaveBeenCalled();
    subject.runtime.sendMessage({ role: 'user', content: 'next turn' });
    await settle();
    expect(subject.requests).toHaveLength(2);
    expect(subject.requests[1].input.forwardedProps).toEqual({});
    expect(subject.requests[1].input.resume).toBeUndefined();
    expect(subject.runtime.recovery().diagnostics).toEqual([diagnostic]);
    const saved: ConversationSnapshot<{ count: number }> = {
      threadId: subject.snapshot.threadId,
      configuredSystemMessageId: subject.snapshot.configuredSystemMessageId,
      messages: subject.requests[1].input.messages,
      state: { count: 2 },
    };
    const restored = fixture();

    restored.runtime.restoreConversation(saved, {
      expectedRevision: restored.runtime.recovery().revision,
    });
    const restoredCleanup = restored.runtime.start();
    await settle();

    expect(restored.runtime.recovery().diagnostics).toEqual([diagnostic]);
    expect(restored.runtime.recovery().required).toBe(false);
    expect(restored.handler).not.toHaveBeenCalled();
    expect(restored.requests).toHaveLength(0);
    expect(
      saved.messages
        .filter((message) => message.role === 'tool')
        .map((message) => Object.keys(message).sort()),
    ).toEqual([['content', 'id', 'role', 'toolCallId']]);
    restoredCleanup();
    cleanup();
  },
);

test.each([
  `${unavailableResult} `,
  ` ${unavailableResult}`,
  unavailableResult.replace('"unknown"', '"none"'),
  '<img src=x onerror="effect()">',
])('keeps a known near-marker result ordinary: %s', async (content) => {
  const subject = fixture();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const cleanup = subject.runtime.start();
  await settle();

  subject.runtime.resumeConversationRecovery({
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      { toolCallId: 'browser-call', status: 'result', value: content },
    ],
  });
  await settle();

  expect(subject.runtime.recovery().diagnostics).toBeUndefined();
  expect(subject.requests[0].input.messages.at(-1)?.content).toBe(content);
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test('merges unavailable browser and unstructured assistant diagnostics in canonical history order', async () => {
  const subject = fixture();
  subject.runtime.updateOptions({
    responseSchema: s.object('answer', { answer: s.string('answer') }),
  });
  await settle();
  const snapshot: ConversationSnapshot<{ count: number }> = {
    threadId: subject.snapshot.threadId,
    configuredSystemMessageId: 'original-system',
    state: { count: 2 },
    messages: [
      ...subject.snapshot.messages.slice(0, 2),
      {
        id: 'historical-before',
        role: 'assistant',
        content: '<em>historical invalid</em>',
      },
      subject.snapshot.messages[2],
      {
        id: 'historical-browser-result',
        role: 'tool',
        toolCallId: 'browser-call',
        content: unavailableResult,
      },
      { id: 'historical-after', role: 'assistant', content: 'old answer' },
    ],
  };

  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
    structuredHistory: 'preserve-diagnostics',
  });

  expect(subject.runtime.recovery().diagnostics).toEqual([
    {
      kind: 'unstructured-assistant-history',
      threadId: snapshot.threadId,
      messageId: 'historical-before',
      content: '<em>historical invalid</em>',
    },
    {
      kind: 'browser-result-unavailable',
      threadId: snapshot.threadId,
      messageId: 'historical-browser-result',
      toolCallId: 'browser-call',
      content: unavailableResult,
    },
    {
      kind: 'unstructured-assistant-history',
      threadId: snapshot.threadId,
      messageId: 'historical-after',
      content: 'old answer',
    },
  ]);
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test('does not infer unavailable browser diagnostics from assistant text or protected tool results', () => {
  const subject = fixture();
  const snapshot: ConversationSnapshot<{ count: number }> = {
    threadId: subject.snapshot.threadId,
    configuredSystemMessageId: 'original-system',
    state: { count: 2 },
    messages: [
      ...subject.snapshot.messages.slice(0, 2),
      { id: 'marker-assistant', role: 'assistant', content: unavailableResult },
      {
        id: 'protected-announcement',
        role: 'assistant',
        toolCalls: [
          {
            id: 'protected-call',
            type: 'function',
            function: { name: 'charge', arguments: '{}' },
          },
        ],
      },
      {
        id: 'protected-result',
        role: 'tool',
        toolCallId: 'protected-call',
        content: unavailableResult,
      },
    ],
  };

  subject.runtime.restoreConversation(snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });

  expect(subject.runtime.recovery().diagnostics).toBeUndefined();
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.handler).not.toHaveBeenCalled();
  expect(subject.requests).toHaveLength(0);
});

test('an accepted cold continuation can publish a fresh native interrupt and resume it through the ordinary warm command', async () => {
  const subject = fixture();
  const requests: TransportRequest[] = [];
  subject.runtime.updateOptions({
    transport: {
      name: 'fresh native interrupt after cold acceptance',
      send: async (request) => {
        requests.push(request);
        const first = requests.length === 1;
        return {
          events: (async function* (): AsyncIterable<AGUIEvent> {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            if (first) {
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: 'fresh-native',
                toolCallName: 'charge',
                parentMessageId: 'fresh-native-announcement',
              };
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: 'fresh-native',
                delta: '{"amount":3}',
              };
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: 'fresh-native',
              };
              yield {
                type: EventType.RUN_FINISHED,
                threadId: request.input.threadId,
                runId: request.input.runId,
                outcome: {
                  type: 'interrupt',
                  interrupts: [
                    {
                      id: 'fresh-native-approval',
                      reason: 'approval',
                      toolCallId: 'fresh-native',
                    },
                  ],
                },
              };
            } else {
              yield {
                type: EventType.TOOL_CALL_RESULT,
                messageId: 'fresh-native-result',
                toolCallId: 'fresh-native',
                content: 'approved',
                role: 'tool',
              };
              yield {
                type: EventType.RUN_FINISHED,
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
            }
          })(),
        };
      },
    },
  });
  await settle();
  subject.runtime.restoreConversation(subject.snapshot, {
    expectedRevision: subject.runtime.recovery().revision,
  });
  const cleanup = subject.runtime.start();
  await settle();

  subject.runtime.resumeConversationRecovery({
    batchId: subject.runtime.pendingConversationRecovery()?.id ?? '',
    outcomes: [
      {
        toolCallId: 'browser-call',
        status: 'result',
        value: 'known original browser result',
      },
    ],
  });
  await settle();

  const fresh = subject.runtime.pendingInterrupts();
  expect(fresh?.interrupts).toEqual([
    {
      id: 'fresh-native-approval',
      reason: 'approval',
      toolCallId: 'fresh-native',
    },
  ]);
  expect(subject.runtime.pendingConversationRecovery()).toBeUndefined();
  expect(subject.runtime.isResuming()).toBe(false);
  expect(subject.runtime.recovery().required).toBe(false);
  expect(ɵgetRuntimeSchedulingState(subject.runtime)().successfulResumes).toBe(
    1,
  );
  expect(subject.handler).not.toHaveBeenCalled();
  subject.runtime.resume({
    batchId: fresh?.id ?? '',
    entries: [
      {
        interruptId: 'fresh-native-approval',
        status: 'resolved',
        payload: true,
      },
    ],
  });
  await settle();
  expect(requests).toHaveLength(2);
  expect(requests[1].input.resume).toEqual([
    { interruptId: 'fresh-native-approval', status: 'resolved', payload: true },
  ]);
  expect(requests[1].input.forwardedProps).toEqual({});
  expect(
    requests[1].input.messages.some(
      (message) =>
        message.role === 'tool' &&
        message.toolCallId === 'browser-call' &&
        message.content === 'known original browser result',
    ),
  ).toBe(true);
  expect(subject.runtime.pendingInterrupts()).toBeUndefined();
  expect(subject.runtime.recovery().required).toBe(false);
  expect(subject.handler).not.toHaveBeenCalled();
  cleanup();
});

test.each(['before-start', 'after-start'] as const)(
  'same-thread cleanup and remount after a dispatched cold request %s require a fresh authoritative read',
  async (phase) => {
    const subject = await coldFailureFixture(phase, 'cancel');
    const cleanup = subject.runtime.start();
    await settle();
    subject.runtime.resumeConversationRecovery(subject.options);
    await settle();
    expect(subject.requests).toHaveLength(1);

    cleanup();
    await settle();
    const remountedCleanup = subject.runtime.start();
    await settle();

    expect(subject.runtime.recovery().required).toBe(true);
    expect(ɵgetRuntimeSchedulingState(subject.runtime)().recoveryRequired).toBe(
      true,
    );
    expect(subject.runtime.isResuming()).toBe(false);
    expect(subject.requests).toHaveLength(1);
    expect(() =>
      subject.runtime.resumeConversationRecovery(subject.options),
    ).toThrow();
    expect(() =>
      subject.runtime.sendMessage({
        role: 'user',
        content: 'blocked after ambiguous cleanup',
      }),
    ).toThrow();
    expect(() => subject.runtime.setState({ count: 99 })).toThrow();
    expect(subject.handler).not.toHaveBeenCalled();
    remountedCleanup();
  },
);
