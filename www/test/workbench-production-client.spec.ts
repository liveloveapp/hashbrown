import { expect, test, vi } from 'vitest';
import { createChatRuntime } from '@hashbrownai/core';
import { EventType } from '@ag-ui/core';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createProductionClient } from '../examples/quickstart/runtime/workbench-production-client';
import { createWorkbenchTransport } from '../examples/quickstart/runtime/workbench-transport';
import { PRODUCTION_INITIAL_STATE } from '../examples/quickstart/runtime/workbench-production';

test('stale recovery cannot replace a changed SDK revision', async () => {
  let revision = 0;
  let respond!: (value: Response) => void;
  const restore = vi.fn();
  const client = createProductionClient(
    createWorkbenchStore('workflow'),
    () => ({
      revision,
      busy: false,
      restore,
      pending: undefined,
      resume: vi.fn(),
    }),
    () => true,
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  client.select('thread-1');

  const pending = client.read();
  revision++;
  respond(
    Response.json({
      configuration: 'recording-plan-v1',
      disposition: 'idle',
      snapshot: { threadId: 'thread-1', messages: [] },
      application: { revision: 0, plan: null },
    }),
  );
  await pending;

  expect(restore).not.toHaveBeenCalled();
});

test('playback prevents network operations and selection', async () => {
  const store = createWorkbenchStore('workflow');
  const request = vi.fn();
  const client = createProductionClient(
    store,
    () => ({
      revision: 0,
      busy: false,
      restore: vi.fn(),
      pending: undefined,
      resume: vi.fn(),
    }),
    () => true,
    request,
  );
  store.record('form', { action: 'seed playback' });
  store.load(store.getSnapshot().events);

  client.select('thread-1');
  await client.create();
  await client.read();

  expect(request).not.toHaveBeenCalled();
  expect(client.state().threadId).toBe('');
});

test('production observations retain exact SDK message IDs and one native pending batch', () => {
  const store = createWorkbenchStore('workflow');
  const state = {
    threadId: 'durable-1',
    disposition: 'paused' as const,
    application: { revision: 0, plan: null },
    busy: false,
    operation: 'Recovery read',
    error: '',
  };
  const batch = {
    id: 'fresh-local-batch',
    interrupts: [
      {
        id: 'server-interrupt',
        reason: 'approval',
        metadata: { grant: 'opaque' },
      },
    ],
  };

  store.recordProduction(state);
  store.recordWorkflow({
    state: state.application,
    messages: [
      { id: 'server-message', role: 'assistant', content: 'Review this plan.' },
    ],
    pendingInterrupts: batch,
    isLoading: false,
    isResuming: false,
  });

  expect(store.getSnapshot().frame?.workflow?.pendingInterrupts).toEqual(batch);
  expect(store.getSnapshot().frame?.messages).toEqual([
    { id: 'server-message', role: 'assistant', content: 'Review this plan.' },
  ]);
  expect(store.getSnapshot().frame?.production?.application?.revision).toBe(0);
  expect(store.getSnapshot().application.revision).toBe(0);
});

test('approval uses current native batch once and echoes the opaque grant without a user turn', async () => {
  const store = createWorkbenchStore('workflow');
  const resume = vi.fn();
  const batch = {
    id: 'fresh-local-batch',
    interrupts: [
      {
        id: 'server-interrupt',
        reason: 'approval',
        metadata: { grant: 'opaque' },
      },
    ],
  };
  const client = createProductionClient(
    store,
    () => ({
      revision: 0,
      busy: false,
      pending: batch,
      restore: vi.fn(),
      resume,
    }),
    () => true,
    vi.fn().mockResolvedValue(
      Response.json({
        configuration: 'recording-plan-v1',
        disposition: 'paused',
        snapshot: { threadId: 'durable-1', messages: [] },
        application: { revision: 0, plan: null },
      }),
    ),
  );
  client.select('durable-1');
  await client.read();
  client.ran();
  store.recordWorkflow({
    state: null,
    messages: [],
    pendingInterrupts: batch,
    isLoading: false,
    isResuming: false,
  });
  client.observe();

  client.approve(true);
  client.approve(true);

  expect(resume).toHaveBeenCalledExactlyOnceWith({
    batchId: batch.id,
    entries: [
      {
        interruptId: 'server-interrupt',
        status: 'resolved',
        payload: 'once',
        metadata: { grant: 'opaque' },
      },
    ],
  });
  expect(
    store.getSnapshot().events.filter((event) => event.kind === 'user'),
  ).toHaveLength(0);
});

test('recorded production frames cannot authorize application writes or resume', () => {
  const store = createWorkbenchStore('workflow');
  const state = {
    threadId: 'durable-1',
    disposition: 'paused' as const,
    application: {
      revision: 1,
      plan: { title: 'Recorded plan', steps: ['One', 'Two'] },
    },
    busy: false,
    operation: 'Application read',
    error: '',
  };
  store.recordProduction(state);
  store.load(store.getSnapshot().events);

  const accepted = store.recordProduction({
    ...state,
    application: { revision: 2, plan: state.application.plan },
  });

  expect(accepted).toBe(false);
  expect(store.getSnapshot().frame?.production?.application?.revision).toBe(1);
  expect(store.beginResume('recorded-batch')).toBe(false);
});

test('explicit recovery restores with the captured revision and never resumes or runs', async () => {
  const store = createWorkbenchStore('workflow');
  const restore = vi.fn();
  const resume = vi.fn();
  const recovery = {
    configuration: 'recording-plan-v1',
    disposition: 'paused',
    snapshot: {
      threadId: 'durable-1',
      messages: [],
      interrupts: [{ id: 'interrupt-1', reason: 'approval' }],
    },
    application: { revision: 0, plan: null },
  };
  const request = vi.fn().mockResolvedValue(Response.json(recovery));
  const client = createProductionClient(
    store,
    () => ({ revision: 7, busy: false, restore, resume }),
    () => true,
    request,
  );
  client.select('durable-1');

  await client.read();

  expect(restore).toHaveBeenCalledExactlyOnceWith(recovery.snapshot, {
    expectedRevision: 7,
  });
  expect(resume).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/api/production/threads/durable-1/recovery',
  );
  expect(client.state().disposition).toBe('paused');
});

test('busy recovery is observable but never restores or permits new sends', async () => {
  const store = createWorkbenchStore('workflow');
  const restore = vi.fn();
  const request = vi.fn().mockResolvedValue(
    Response.json({
      configuration: 'recording-plan-v1',
      disposition: 'busy',
      snapshot: { threadId: 'durable-1', messages: [] },
      application: { revision: 0, plan: null },
    }),
  );
  const client = createProductionClient(
    store,
    () => ({ revision: 0, busy: false, restore, resume: vi.fn() }),
    () => true,
    request,
  );
  client.select('durable-1');

  await client.read();

  expect(restore).not.toHaveBeenCalled();
  expect(client.sendable()).toBe(false);
  expect(client.state().disposition).toBe('busy');
});

test('disposed recovery responses cannot restore conversation state', async () => {
  let respond!: (value: Response) => void;
  const restore = vi.fn();
  const client = createProductionClient(
    createWorkbenchStore('workflow'),
    () => ({ revision: 0, busy: false, restore, resume: vi.fn() }),
    () => true,
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  client.select('durable-1');

  const read = client.read();
  client.dispose();
  respond(
    Response.json({
      configuration: 'recording-plan-v1',
      disposition: 'idle',
      snapshot: { threadId: 'durable-1', messages: [] },
      application: { revision: 0, plan: null },
    }),
  );
  await read;

  expect(restore).not.toHaveBeenCalled();
});

test('receipt reads cannot attach a selected thread or authorize sending', async () => {
  const restore = vi.fn();
  const request = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      Response.json({
        configuration: 'recording-plan-v1',
        disposition: 'idle',
        snapshot: {
          threadId: url.includes('thread-b') ? 'thread-b' : 'thread-a',
          messages: [],
        },
        application: { revision: 0, plan: null },
      }),
    ),
  );
  const client = createProductionClient(
    createWorkbenchStore('workflow'),
    () => ({ revision: 0, busy: false, restore, resume: vi.fn() }),
    () => true,
    request,
  );
  client.select('thread-a');
  await client.read();
  expect(client.sendable()).toBe(true);

  client.select('thread-b');
  await client.read(true);

  expect(client.sendable()).toBe(false);
  expect(restore).toHaveBeenCalledTimes(1);
});

test('receipt reads for another selection cannot approve the old SDK batch', async () => {
  const store = createWorkbenchStore('workflow');
  const resume = vi.fn();
  const pending = {
    id: 'batch-a',
    interrupts: [{ id: 'interrupt-a', reason: 'approval' }],
  };
  const request = vi.fn().mockResolvedValue(
    Response.json({
      configuration: 'recording-plan-v1',
      disposition: 'paused',
      snapshot: { threadId: 'thread-b', messages: [] },
      application: { revision: 0, plan: null },
    }),
  );
  const client = createProductionClient(
    store,
    () => ({ revision: 0, busy: false, restore: vi.fn(), pending, resume }),
    () => true,
    request,
  );
  client.select('thread-b');
  store.recordWorkflow({
    state: null,
    messages: [],
    pendingInterrupts: pending,
    isLoading: false,
    isResuming: false,
  });

  await client.read(true);
  client.approve(true);

  expect(resume).not.toHaveBeenCalled();
});

test('a native busy-to-idle transition settles controls without inventing a finish reason', () => {
  const store = createWorkbenchStore('workflow');
  let busy = true;
  const client = createProductionClient(
    store,
    () => ({ revision: 0, busy, restore: vi.fn(), resume: vi.fn() }),
    () => true,
  );
  store.send('Ask for the plan.');
  client.ran();

  client.observe();
  busy = false;
  client.observe();

  expect(store.getSnapshot().status).toBe('complete');
  expect(client.mutable()).toBe(true);
  expect(client.sendable()).toBe(false);
  expect(store.getSnapshot().frame?.workflow?.finishReason).toBeUndefined();
});

test('native completion with a pending batch preserves the observed pause', () => {
  const store = createWorkbenchStore('workflow');
  let busy = false;
  const pending = {
    id: 'batch-1',
    interrupts: [{ id: 'interrupt-1', reason: 'approval' }],
  };
  const client = createProductionClient(
    store,
    () => ({ revision: 0, busy, pending, restore: vi.fn(), resume: vi.fn() }),
    () => true,
  );
  client.mount();
  store.send('Ask for the plan.');
  busy = true;
  client.observe();

  busy = false;
  store.recordWorkflow({
    state: null,
    messages: store.getSnapshot().frame?.messages ?? [],
    pendingInterrupts: pending,
    isLoading: false,
    isResuming: false,
  });
  client.observe();

  expect(store.getSnapshot().status).toBe('paused');
  expect(store.getSnapshot().frame?.workflow?.pendingInterrupts).toEqual(
    pending,
  );
});

test('fast native resume after cold restore captures real terminal events and unlocks receipt reads', async () => {
  const store = createWorkbenchStore('workflow');
  const transport = createWorkbenchTransport(
    store,
    {
      name: 'native-fast-resume-fixture',
      async send(request) {
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            yield {
              type: EventType.RUN_FINISHED,
              ...identity,
              outcome: { type: 'success' as const },
            };
          })(),
        };
      },
    },
    '/api/production/run',
  );
  const runtime = createChatRuntime({
    system: '',
    state: PRODUCTION_INITIAL_STATE,
    transport,
    debounce: 0,
  });
  const cleanup = runtime.start();
  const client = createProductionClient(
    store,
    () => ({
      revision: runtime.recovery().revision,
      busy: runtime.isLoading() || runtime.isResuming(),
      pending: runtime.pendingInterrupts(),
      restore: (snapshot, options) =>
        runtime.restoreConversation(snapshot, options),
      resume: (options) => runtime.resume(options),
    }),
    () => true,
    vi.fn().mockResolvedValue(
      Response.json({
        configuration: 'recording-plan-v1',
        disposition: 'paused',
        snapshot: {
          threadId: 'cold-thread',
          messages: [
            { id: 'original-user', role: 'user', content: 'Plan the demo.' },
          ],
          interrupts: [
            {
              id: 'native-approval',
              reason: 'approval',
              metadata: { grant: 'opaque' },
            },
          ],
        },
        application: { revision: 0, plan: null },
      }),
    ),
  );
  client.select('cold-thread');
  await client.read();
  store.recordWorkflow({
    state: runtime.state(),
    messages: runtime.messages(),
    pendingInterrupts: runtime.pendingInterrupts(),
    isLoading: false,
    isResuming: false,
  });

  client.approve(true);
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!runtime.isLoading() && !runtime.isResuming()) break;
  }
  // One final framework observation models React batching away the transient busy render.
  store.recordWorkflow({
    state: runtime.state(),
    messages: runtime.messages(),
    pendingInterrupts: runtime.pendingInterrupts(),
    isLoading: runtime.isLoading(),
    isResuming: runtime.isResuming(),
  });
  client.observe();

  expect(store.getSnapshot().turn).toBe(0);
  expect(
    store.getSnapshot().events.some((event) => event.kind === 'request'),
  ).toBe(true);
  expect(
    store
      .getSnapshot()
      .events.some(
        (event) =>
          event.kind === 'event' &&
          (event.payload as { type: string }).type === 'RUN_FINISHED',
      ),
  ).toBe(true);
  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(store.getSnapshot().status).toBe('complete');
  expect(client.mutable()).toBe(true);
  cleanup();
});
