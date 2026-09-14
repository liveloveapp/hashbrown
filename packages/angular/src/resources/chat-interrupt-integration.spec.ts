import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
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
                      { id: 'approve', reason: 'approval' },
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
