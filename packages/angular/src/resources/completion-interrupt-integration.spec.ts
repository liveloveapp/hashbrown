import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type Chat,
  type PendingInterruptBatch,
  type ResumeOptions,
  s,
  type Transport,
  type TransportRequest,
  ɵgetRuntimeSchedulingState,
} from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import {
  completionResource,
  type CompletionResourceOptions,
} from './completion-resource.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import { uiCompletionResource } from './ui-completion-resource.fn';

const schema = s.object('result', { answer: s.string('answer') });
const families = [
  {
    name: 'text',
    create: (
      options: CompletionResourceOptions<string> & { tools?: Chat.AnyTool[] },
    ) => completionResource(options),
  },
  {
    name: 'structured',
    create: (
      options: CompletionResourceOptions<string> & { tools?: Chat.AnyTool[] },
    ) =>
      structuredCompletionResource({
        ...options,
        schema,
        debounce: 0,
        retries: 0,
      }),
  },
  {
    name: 'UI',
    create: (
      options: CompletionResourceOptions<string> & { tools?: Chat.AnyTool[] },
    ) =>
      uiCompletionResource({
        ...options,
        components: [],
        debounce: 0,
        retries: 0,
      }),
  },
];
/** Creates an input-driven completion using a real runtime. */
function setup(
  family: (typeof families)[number],
  control = controlledTransport(),
  tools: Chat.AnyTool[] = [],
) {
  const input = signal('A');
  const threadId = signal<string | undefined>('original');
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    family.create({
      input,
      threadId,
      system: 'test',
      tools,
      transport: control.transport,
    }),
  );
  TestBed.tick();
  return {
    control,
    scheduling: () => ɵgetRuntimeSchedulingState(resource)(),
    batch: () => resource.pendingInterrupts(),
    resuming: () => resource.isResuming(),
    error: () => resource.error(),
    output: () => resource.value(),
    change: (next: string) => {
      input.set(next);
      TestBed.tick();
    },
    thread: (next: string) => {
      threadId.set(next);
      TestBed.tick();
    },
    resume: () =>
      resource.resume({
        batchId: requireBatch(resource.pendingInterrupts()).id,
        entries,
      }),
    stop: () => resource.stop(),
    reload: () => resource.reload(),
    release: async (boundary: ReturnType<typeof gate>) => {
      boundary.release();
      await Promise.resolve();
      TestBed.tick();
    },
    flush: async () => {
      await Promise.resolve();
      TestBed.tick();
    },
    wait: async (assert: () => void) =>
      vi.waitFor(() => {
        TestBed.tick();
        assert();
      }),
    cleanup: () => TestBed.resetTestingModule(),
  };
}

/** Holds a transport boundary until the test releases it. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Controls every run against the real runtime. */
function controlledTransport() {
  const requests: TransportRequest[] = [];
  const runs = Array.from({ length: 8 }, () => ({
    start: gate(),
    finish: gate(),
    interrupt: false,
    fail: false,
    tool: false,
    failBeforeStart: false,
    expiresAt: undefined as string | undefined,
  }));
  runs[0].interrupt = true;
  runs[0].start.release();
  runs[0].finish.release();
  const transport: Transport = {
    name: 'completion-interrupt-test',
    send: async (request) => {
      const run = runs[requests.length];
      requests.push(request);
      if (run.failBeforeStart) throw new Error('follow-up failed before start');
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          await run.start.promise;
          yield { type: EventType.RUN_STARTED, ...identity };
          await run.finish.promise;
          if (run.fail) {
            yield { type: EventType.RUN_ERROR, message: 'resumed failure' };
            return;
          }
          if (run.tool) {
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: 'save-call',
              toolCallName: 'save',
              parentMessageId: 'tool-assistant',
            };
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'save-call',
              delta: '{}',
            };
            yield { type: EventType.TOOL_CALL_END, toolCallId: 'save-call' };
          }
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            ...(run.interrupt
              ? {
                  outcome: {
                    type: 'interrupt' as const,
                    interrupts: [
                      {
                        id: 'approve',
                        reason: 'approval',
                        ...(run.expiresAt ? { expiresAt: run.expiresAt } : {}),
                      },
                    ],
                  },
                }
              : {}),
          };
        })(),
      };
    },
  };
  return { requests, runs, transport };
}
const entries: ResumeOptions['entries'] = [
  { interruptId: 'approve', status: 'resolved', payload: true },
];

/** Requires a pending batch without hiding a missing facade projection. */
function requireBatch(batch: PendingInterruptBatch | undefined) {
  if (!batch) throw new Error('Expected a pending batch');
  return batch;
}

test.each(families)(
  '$name completion keeps A checkpoint and sends only latest C after full resume success',
  async (family) => {
    const h = setup(family);
    await h.wait(() => expect(h.batch()).toBeDefined());
    const batch = h.batch();

    h.change('B');
    h.change('C');
    expect(h.batch()).toBe(batch);
    expect(h.control.requests).toHaveLength(1);
    expect(h.output()).toBeNull();
    expect(h.error()).toBeUndefined();
    expect(() => h.reload()).toThrow(/interrupt/i);
    h.resume();
    await h.wait(() => expect(h.control.requests).toHaveLength(2));
    expect(h.resuming()).toBe(true);
    expect(h.control.requests[1].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'A' }),
      ]),
    );
    expect(h.control.requests[1].input.resume).toEqual(entries);
    await h.release(h.control.runs[1].start);
    await h.wait(() => expect(h.batch()).toBeUndefined());
    expect(h.resuming()).toBe(true);
    expect(h.control.requests).toHaveLength(2);
    await h.release(h.control.runs[1].finish);
    await h.wait(() => expect(h.control.requests).toHaveLength(3));

    expect(h.control.requests[2].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'C' }),
      ]),
    );
    expect(h.control.requests[2].input.resume).toBeUndefined();
    expect(h.scheduling().successfulResumes).toBe(1);
    h.cleanup();
  },
);

test.each(families)(
  '$name completion does not regenerate A after A to B to A while paused',
  async (family) => {
    const h = setup(family);
    await h.wait(() => expect(h.batch()).toBeDefined());

    h.change('B');
    h.change('A');
    h.resume();
    await h.release(h.control.runs[1].start);
    await h.release(h.control.runs[1].finish);
    await h.wait(() => expect(h.resuming()).toBe(false));
    await h.flush();

    expect(h.control.requests).toHaveLength(2);
    h.cleanup();
  },
);

test.each(families)(
  '$name completion retains latest input across repeated interruption and pre-start stop',
  async (family) => {
    const h = setup(family);
    await h.wait(() => expect(h.batch()).toBeDefined());
    const original = h.batch();

    h.change('B');
    h.resume();
    await h.wait(() => expect(h.control.requests).toHaveLength(2));
    h.stop();
    await h.wait(() => expect(h.resuming()).toBe(false));
    expect(h.batch()).toBe(original);
    expect(h.control.requests).toHaveLength(2);
    h.control.runs[2].interrupt = true;
    h.resume();
    await h.release(h.control.runs[2].start);
    await h.release(h.control.runs[2].finish);
    await h.wait(() => expect(h.batch()?.id).not.toBe(original?.id));
    h.change('C');
    h.resume();
    await h.release(h.control.runs[3].start);
    await h.release(h.control.runs[3].finish);
    await h.wait(() => expect(h.control.requests).toHaveLength(5));

    expect(h.control.requests[4].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'C' }),
      ]),
    );
    h.cleanup();
  },
);

for (const terminal of ['failure', 'stop'] as const) {
  test.each(families)(
    `$name completion prevents deferred sends after acknowledged ${terminal} and hands off unchanged latest input once`,
    async (family) => {
      const h = setup(family);
      await h.wait(() => expect(h.batch()).toBeDefined());
      h.change('C');
      h.control.runs[1].fail = terminal === 'failure';
      h.resume();
      await h.release(h.control.runs[1].start);
      await h.wait(() => expect(h.batch()).toBeUndefined());

      if (terminal === 'failure') await h.release(h.control.runs[1].finish);
      else h.stop();
      await h.wait(() => expect(h.resuming()).toBe(false));
      await h.flush();
      expect(h.control.requests).toHaveLength(2);
      expect(() => h.reload()).toThrow(/new thread/i);
      h.thread('fresh');
      await h.wait(() => expect(h.control.requests).toHaveLength(3));
      await h.flush();

      expect(h.control.requests[2].input.threadId).toBe('fresh');
      expect(h.control.requests[2].input.resume).toBeUndefined();
      expect(h.control.requests[2].input.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'C' }),
        ]),
      );
      expect(h.control.requests).toHaveLength(3);
      h.cleanup();
    },
  );
}

test.each(families)(
  '$name completion retains an expired batch without submitting deferred input',
  async (family) => {
    const control = controlledTransport();
    control.runs[0].expiresAt = '2000-01-01T00:00:00Z';
    const h = setup(family, control);
    await h.wait(() => expect(h.batch()).toBeDefined());
    const batch = h.batch();

    h.change('C');
    expect(() => h.resume()).toThrow(/expir/i);
    await h.flush();

    expect(h.batch()).toBe(batch);
    expect(control.requests).toHaveLength(1);
    h.cleanup();
  },
);

test.each(families)(
  '$name completion supersedes an ordinary loading run immediately',
  async (family) => {
    const control = controlledTransport();
    control.runs[0].interrupt = false;
    control.runs[0].finish = gate();
    const h = setup(family, control);
    await h.wait(() => expect(control.requests).toHaveLength(1));

    h.change('B');
    await h.wait(() => expect(control.requests).toHaveLength(2));

    expect(control.requests[1].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'B' }),
      ]),
    );
    h.cleanup();
  },
);

for (const outcome of [
  'success',
  'tool-stop',
  'follow-up-stop',
  'follow-up-failure',
] as const) {
  test.each(families.filter((family) => family.name !== 'text'))(
    `$name completion holds latest input through tools and follow-ups with ${outcome}`,
    async (family) => {
      const control = controlledTransport();
      const tool = gate();
      const handler = vi.fn(async () => {
        await tool.promise;
        return 'saved';
      });
      const h = setup(family, control, [
        {
          name: 'save',
          description: 'save',
          schema: s.object('args', {}),
          handler,
        },
      ]);
      control.runs[1].tool = true;
      control.runs[2].failBeforeStart = outcome === 'follow-up-failure';
      await h.wait(() => expect(h.batch()).toBeDefined());
      h.change('B');
      h.resume();
      await h.release(control.runs[1].start);
      await h.release(control.runs[1].finish);
      await h.wait(() => expect(handler).toHaveBeenCalledTimes(1));

      h.change('C');
      expect(h.resuming()).toBe(true);
      expect(control.requests).toHaveLength(2);
      if (outcome === 'tool-stop') {
        h.stop();
        await h.release(tool);
      } else {
        await h.release(tool);
        await h.wait(() => expect(control.requests).toHaveLength(3));
        expect(control.requests[2].input.resume).toBeUndefined();
        expect(control.requests[2].input.messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'A' }),
            expect.objectContaining({
              role: 'tool',
              toolCallId: 'save-call',
              content: 'saved',
            }),
          ]),
        );
        if (outcome !== 'follow-up-failure') {
          expect(h.resuming()).toBe(true);
          await h.release(control.runs[2].start);
          if (outcome === 'follow-up-stop') h.stop();
          else await h.release(control.runs[2].finish);
        }
      }
      await h.wait(() => expect(h.resuming()).toBe(false));
      await h.flush();

      if (outcome === 'success') {
        await h.wait(() => expect(control.requests).toHaveLength(4));
        expect(control.requests[3].input.messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'C' }),
          ]),
        );
      } else {
        expect(control.requests).toHaveLength(outcome === 'tool-stop' ? 2 : 3);
        expect(() => h.reload()).toThrow(/new thread/i);
      }
      h.cleanup();
    },
  );
}

test.each(families)(
  '$name completion submits the same latest input once on a new thread and ignores retired callbacks',
  async (family) => {
    const h = setup(family);
    await h.wait(() => expect(h.batch()).toBeDefined());
    h.resume();
    await h.wait(() => expect(h.control.requests).toHaveLength(2));

    h.thread('fresh');
    await h.wait(() => expect(h.control.requests).toHaveLength(3));
    await h.release(h.control.runs[1].start);
    await h.release(h.control.runs[1].finish);
    await h.flush();

    expect(h.control.requests[2].input.threadId).toBe('fresh');
    expect(h.control.requests[2].input.resume).toBeUndefined();
    expect(h.control.requests[2].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'A' }),
      ]),
    );
    expect(h.control.requests).toHaveLength(3);
    expect(h.batch()).toBeUndefined();
    h.cleanup();
  },
);

test.each(families)(
  '$name completion preserves a generated thread during unrelated signal updates and replaces it on explicit clearing',
  async (family) => {
    const control = controlledTransport();
    const system = signal('test');
    const threadId = signal<string | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const resource = TestBed.runInInjectionContext(() =>
      family.create({
        input: signal('A'),
        system,
        threadId,
        transport: control.transport,
      }),
    );
    TestBed.tick();
    await vi.waitFor(() => expect(resource.pendingInterrupts()).toBeDefined());
    const batch = resource.pendingInterrupts();

    system.set('updated');
    TestBed.tick();
    expect(resource.pendingInterrupts()).toBe(batch);
    threadId.set(control.requests[0].input.threadId);
    TestBed.tick();
    expect(resource.pendingInterrupts()).toBe(batch);
    threadId.set(undefined);
    TestBed.tick();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(control.requests).toHaveLength(2);
    });

    expect(control.requests[1].input.threadId).not.toBe(
      control.requests[0].input.threadId,
    );
    expect(control.requests[1].input.resume).toBeUndefined();
    TestBed.resetTestingModule();
  },
);
