import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type ConversationRestoreOptions,
  type PendingInterruptBatch,
  type ResumeOptions,
  s,
  type Transport,
  type TransportRequest,
} from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { chatResource } from './chat-resource.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import { uiChatResource } from './ui-chat-resource.fn';

/** Requires an actionable batch without hiding missing facade state. */
function requireBatch(
  batch: PendingInterruptBatch | undefined,
): PendingInterruptBatch {
  if (!batch) throw new Error('Expected a pending batch');
  return batch;
}

const schema = s.object('result', { answer: s.string('answer') });
const families = [
  { name: 'text', create: chatResource },
  {
    name: 'structured',
    create: (options: Omit<Parameters<typeof chatResource>[0], 'messages'>) =>
      structuredChatResource({ ...options, schema }),
  },
  {
    name: 'UI',
    create: (options: Omit<Parameters<typeof chatResource>[0], 'messages'>) =>
      uiChatResource({ ...options, components: [] }),
  },
];

/** Holds one transport boundary until explicitly released by a test. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Creates a real runtime transport with controllable resume boundaries. */
function controlledTransport(fail = false) {
  const requests: TransportRequest[] = [];
  const started = gate();
  const terminal = gate();
  const transport: Transport = {
    name: 'interrupt-test',
    send: async (request) => {
      requests.push(request);
      const index = requests.length;
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          if (index === 2) await started.promise;
          yield { type: EventType.RUN_STARTED, ...identity };
          if (index === 2) await terminal.promise;
          if (index === 2 && fail) {
            yield { type: EventType.RUN_ERROR, message: 'resumed failure' };
            return;
          }
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            ...(index === 1
              ? {
                  outcome: {
                    type: 'interrupt' as const,
                    interrupts: [
                      {
                        id: 'approve',
                        reason: 'approval',
                        subagentRunId: 'waiting-child',
                      },
                      { id: 'address', reason: 'input' },
                    ],
                  },
                }
              : {}),
          };
        })(),
      };
    },
  };
  return { transport, requests, started, terminal };
}

const entries: ResumeOptions['entries'] = [
  { interruptId: 'address', status: 'cancelled' },
  { interruptId: 'approve', status: 'resolved', payload: true },
];
test.each(families)(
  '$name chat exposes the entire claimed batch through resumed settlement',
  async (family) => {
    const control = controlledTransport();
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const chat = TestBed.runInInjectionContext(() =>
      family.create({
        system: 'test',
        transport: control.transport,
        debounce: 0,
      }),
    );
    TestBed.tick();

    chat.sendMessage({ role: 'user', content: 'go' });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    await vi.waitFor(() => expect(chat.isLoading()).toBe(false));

    expect(chat).toHaveProperty('pendingInterrupts');
    const batch = requireBatch(chat.pendingInterrupts());
    expect(chat.subagents()).toEqual([
      expect.objectContaining({
        subagentRunId: 'waiting-child',
        status: 'awaiting',
      }),
    ]);
    expect(batch.interrupts.map((item) => item.id)).toEqual([
      'approve',
      'address',
    ]);
    expect(chat.isResuming()).toBe(false);
    expect(chat.lastAssistantMessage()).toBeUndefined();
    expect(chat.status()).toBe('idle');
    expect((chat.hasValue as () => boolean)()).toBe(false);
    expect(chat.value()).toEqual([
      expect.objectContaining({ role: 'user', content: 'go' }),
    ]);
    expect(() => chat.reload()).toThrow(/interrupt/i);
    expect(() =>
      chat.sendMessage({ role: 'user', content: 'blocked' }),
    ).toThrow(/interrupt/i);
    expect(() => chat.setMessages([])).toThrow(/interrupt/i);
    expect(() => chat.resume({ batchId: batch.id, entries: [] })).toThrow();
    chat.resume({ batchId: batch.id, entries });
    expect(chat.pendingInterrupts()).toBe(batch);
    expect(chat.isResuming()).toBe(true);
    expect(() => chat.reload()).toThrow(/interrupt/i);
    if ('resendMessages' in chat) {
      expect(() => chat.resendMessages()).toThrow(/interrupt/i);
    }
    expect(() => chat.resume({ batchId: batch.id, entries })).toThrow(
      /claimed/i,
    );
    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
    expect(control.requests[1].input.resume).toEqual(entries);
    control.started.release();
    await vi.waitFor(() => expect(chat.pendingInterrupts()).toBeUndefined());
    expect(chat.isResuming()).toBe(true);
    expect(() => chat.resume({ batchId: batch.id, entries })).toThrow();
    control.terminal.release();
    await vi.waitFor(() => expect(chat.isResuming()).toBe(false));
    expect(chat.error()).toBeUndefined();
    TestBed.resetTestingModule();
  },
);

test.each(families)(
  '$name chat preserves undefined thread options during unrelated updates and retires on explicit thread clearing',
  async (family) => {
    const control = controlledTransport();
    const system = signal('test');
    const threadId = signal<string | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const chat = TestBed.runInInjectionContext(() =>
      family.create({ system, threadId, transport: control.transport }),
    );
    TestBed.tick();

    chat.sendMessage({ role: 'user', content: 'go' });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    await vi.waitFor(() => expect(chat.isLoading()).toBe(false));

    expect(chat).toHaveProperty('pendingInterrupts');
    const batch = requireBatch(chat.pendingInterrupts());
    system.set('updated');
    TestBed.tick();
    expect(chat.pendingInterrupts()).toBe(batch);
    threadId.set(control.requests[0].input.threadId);
    TestBed.tick();
    expect(chat.pendingInterrupts()).toBe(batch);
    threadId.set(undefined);
    TestBed.tick();
    expect(chat.pendingInterrupts()).toBeUndefined();
    expect(() => chat.resume({ batchId: batch.id, entries })).toThrow();
    TestBed.resetTestingModule();
  },
);

test.each(families)(
  '$name chat rejects recovery reload without assistant output and permits a fresh thread',
  async (family) => {
    const control = controlledTransport(true);
    const threadId = signal('original');
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const chat = TestBed.runInInjectionContext(() =>
      family.create({ system: 'test', threadId, transport: control.transport }),
    );
    TestBed.tick();
    chat.sendMessage({ role: 'user', content: 'go' });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    await vi.waitFor(() => expect(chat.isLoading()).toBe(false));
    expect(chat).toHaveProperty('pendingInterrupts');
    chat.resume({
      batchId: requireBatch(chat.pendingInterrupts()).id,
      entries,
    });
    control.started.release();
    control.terminal.release();
    await vi.waitFor(() => expect(chat.error()).toBeDefined());

    expect(() => chat.reload()).toThrow(/new thread/i);
    expect(() => chat.setMessages([])).toThrow(/new thread/i);
    expect(() =>
      chat.sendMessage({ role: 'user', content: 'blocked' }),
    ).toThrow(/new thread/i);
    threadId.set('fresh');
    TestBed.tick();
    chat.sendMessage({ role: 'user', content: 'recovered' });
    await vi.waitFor(() => expect(control.requests).toHaveLength(3));
    expect(control.requests[2].input.threadId).toBe('fresh');
    expect(control.requests[2].input.resume).toBeUndefined();
    TestBed.resetTestingModule();
  },
);

test.each(families)(
  '$name chat restores canonical history without sending',
  async (family) => {
    const control = controlledTransport();
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const chat = TestBed.runInInjectionContext(() =>
      family.create({
        system: 'test',
        transport: control.transport,
        debounce: 0,
      }),
    );
    chat.sendMessage({ role: 'user', content: 'go' });
    await vi.waitFor(() => {
      TestBed.tick();
      expect(chat.pendingInterrupts()).toBeDefined();
    });
    const input = control.requests[0].input;
    expect(chat.getRecoveryConfiguration().system).toBe('test');
    const batch = requireBatch(chat.pendingInterrupts());

    chat.restoreConversation(
      {
        threadId: input.threadId,
        messages: input.messages,
        configuredSystemMessageId: input.messages[0].id,
      },
      { expectedRevision: chat.recovery().revision },
    );
    TestBed.tick();

    expect(chat.pendingInterrupts()).toBeUndefined();
    expect(chat.recovery().required).toBe(false);
    expect(control.requests).toHaveLength(1);
    expect(() => chat.resume({ batchId: batch.id, entries })).toThrow();
    TestBed.resetTestingModule();
  },
);

test.each(families)(
  '$name chat forwards public diagnostic recovery options',
  (family) => {
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const control = controlledTransport();
    const resource = TestBed.runInInjectionContext(() =>
      family.create({ system: '', transport: control.transport }),
    );
    const options: ConversationRestoreOptions = {
      expectedRevision: resource.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    };

    resource.restoreConversation(
      {
        threadId: 'cold',
        messages: [
          {
            id: 'invalid',
            role: 'assistant',
            content: '<b>ordinary historical text</b>',
          },
        ],
      },
      options,
    );
    TestBed.tick();

    expect(control.requests).toHaveLength(0);
    expect(resource.recovery().diagnostics?.[0].content).toBe(
      family.name === 'text' ? undefined : '<b>ordinary historical text</b>',
    );
  },
);

test.each(
  families.flatMap((family) =>
    ['complete', 'failed'].map((status) => ({ ...family, status })),
  ),
)(
  '$name chat subscribes to frozen native subagents ($status)',
  async (family) => {
    const terminal = gate();
    const transport: Transport = {
      name: 'subagents',
      send: async (request) => ({
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          const identity = {
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.SUBAGENT_STARTED,
            subagentRunId: 'child',
            name: 'Research',
          };
          await terminal.promise;
          yield family.status === 'failed'
            ? {
                type: EventType.SUBAGENT_ERROR,
                subagentRunId: 'child',
                message: 'child failed',
              }
            : {
                type: EventType.SUBAGENT_FINISHED,
                subagentRunId: 'child',
                result: { found: true },
              };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      }),
    };
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const threadId = signal('original');
    const chat = TestBed.runInInjectionContext(() =>
      family.create({ system: '', threadId, transport, debounce: 0 }),
    );
    TestBed.tick();

    try {
      expect(chat.subagents()).toEqual([]);
      chat.sendMessage({ role: 'user', content: 'go' });
      await vi.waitFor(() =>
        expect(chat.subagents()[0]?.status).toBe('running'),
      );
      expect(Object.isFrozen(chat.subagents())).toBe(true);
      const running = chat.subagents()[0];
      terminal.release();
      await vi.waitFor(() => expect(chat.isLoading()).toBe(false));

      expect(chat.subagents()[0]).toMatchObject({
        status: family.status,
        ...(family.status === 'failed'
          ? { error: { message: 'child failed' } }
          : { result: { found: true } }),
      });
      expect(running.status).toBe('running');
      threadId.set('fresh');
      TestBed.tick();
      expect(chat.subagents()).toEqual([]);
    } finally {
      terminal.release();
      TestBed.resetTestingModule();
    }
  },
);

test.each(families)(
  '$name chat restores native owners as unknown and retains explicit waits',
  (family) => {
    const control = controlledTransport();
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const chat = TestBed.runInInjectionContext(() =>
      family.create({ system: '', transport: control.transport }),
    );
    const messages = [
      {
        id: 'assistant',
        role: 'assistant' as const,
        subagentRunId: '',
        toolCalls: [
          {
            id: 'call',
            type: 'function' as const,
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool' as const,
        toolCallId: 'call',
        content: 'found',
        subagentRunId: 'executor',
      },
    ];

    try {
      chat.restoreConversation(
        { threadId: 'restored', messages },
        { expectedRevision: chat.recovery().revision },
      );
      TestBed.tick();

      expect(chat.subagents()).toEqual([
        { subagentRunId: '', status: 'unknown', interruptIds: [] },
        { subagentRunId: 'executor', status: 'unknown', interruptIds: [] },
      ]);
      const call = chat.value().find((message) => message.role === 'assistant');
      expect(call).toMatchObject({
        subagentRunId: '',
        serverToolCalls: [
          expect.objectContaining({
            subagentRunId: '',
            resultSubagentRunId: 'executor',
            result: { status: 'fulfilled', value: 'found' },
          }),
        ],
      });
      chat.restoreConversation(
        {
          threadId: 'waiting',
          messages,
          interrupts: [
            { id: 'approval', reason: 'approval', subagentRunId: '' },
          ],
        },
        { expectedRevision: chat.recovery().revision },
      );
      TestBed.tick();
      expect(chat.subagents()[0]).toMatchObject({
        subagentRunId: '',
        status: 'awaiting',
        interruptIds: ['approval'],
      });
      expect(control.requests).toHaveLength(0);
    } finally {
      TestBed.resetTestingModule();
    }
  },
);
