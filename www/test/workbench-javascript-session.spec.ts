import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchJavaScriptSession } from '../examples/quickstart/runtime/workbench-javascript-session';

test('runs explicitly once and records actual host observations without changing the plan', async () => {
  const store = createWorkbenchStore('text');
  const execute = vi.fn(async (_code: string, signal: AbortSignal) => {
    const plan = await session.readPlan({ revision: 0 }, signal);
    return plan.plan.steps.length * 15;
  });
  const session: ReturnType<typeof createWorkbenchJavaScriptSession> =
    createWorkbenchJavaScriptSession({
      store,
      active: () => true,
      execute,
    });
  const application = store.getSnapshot().application;

  const pending = session.run(
    'readPlan({ revision: 0 }).then(p => p.stepCount * 15)',
  );
  await session.run('42');
  await pending;

  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().frame?.javascript).toMatchObject({
    status: 'complete',
    outcome: 30,
    calls: [{ name: 'readPlan', args: { revision: 0 } }],
  });
  expect(store.getSnapshot().application).toEqual(application);
});

test('stop aborts the actual signal, captures cancellation, and ignores late results and host calls', async () => {
  const store = createWorkbenchStore('text');
  let resolve!: (value: unknown) => void;
  let signal!: AbortSignal;
  const execute = vi.fn((_code: string, abort: AbortSignal) => {
    signal = abort;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const session = createWorkbenchJavaScriptSession({
    store,
    active: () => true,
    execute,
  });

  const pending = session.run('42');
  session.stop();
  const count = store.getSnapshot().events.length;
  resolve(42);
  await pending;

  expect(signal.aborted).toBe(true);
  expect(store.getSnapshot().frame?.javascript?.status).toBe('cancelled');
  expect(store.getSnapshot().events).toHaveLength(count);
  await expect(session.readPlan({ revision: 0 }, signal)).rejects.toThrow();
});

test('replay, inactive sessions, and oversized scripts perform no execution or writes', async () => {
  const store = createWorkbenchStore('text');
  const execute = vi.fn(async () => 42);
  let active = true;
  const session = createWorkbenchJavaScriptSession({
    store,
    active: () => active,
    execute,
  });
  await session.run('42');
  store.seek(0);
  const count = store.getSnapshot().events.length;

  await session.run('42');
  store.live();
  active = false;
  await session.run('42');
  active = true;
  await session.run('x'.repeat(12_001));

  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().events).toHaveLength(count);
});

test('captures rejected host arguments as an actual error and permits recovery', async () => {
  const store = createWorkbenchStore('text');
  const execute = vi.fn(
    async (_code: string, signal: AbortSignal): Promise<unknown> =>
      session.readPlan({ revision: -1 }, signal),
  );
  const session: ReturnType<typeof createWorkbenchJavaScriptSession> =
    createWorkbenchJavaScriptSession({
      store,
      active: () => true,
      execute,
    });

  await session.run('readPlan({revision:-1})');

  expect(store.getSnapshot().status).toBe('error');
  expect(store.getSnapshot().frame?.javascript?.calls[0]?.error).toBeTruthy();
  execute.mockImplementation(async () => 20);
  await session.run('20');
  expect(store.getSnapshot().frame?.javascript).toMatchObject({
    status: 'complete',
    outcome: 20,
    calls: [],
  });
});

test('preserves actual native error objects and rejects an old host signal after recovery', async () => {
  const store = createWorkbenchStore('text');
  let previous!: AbortSignal;
  const execute = vi.fn(
    async (_code: string, signal: AbortSignal): Promise<unknown> => {
      previous = signal;
      return {
        error: { name: 'ReferenceError', message: 'document is not defined' },
      };
    },
  );
  const session: ReturnType<typeof createWorkbenchJavaScriptSession> =
    createWorkbenchJavaScriptSession({
      store,
      active: () => true,
      execute,
    });

  await session.run('document.title');

  expect(store.getSnapshot().frame?.javascript).toMatchObject({
    status: 'error',
    outcome: { error: { name: 'ReferenceError' } },
  });
  expect(previous.aborted).toBe(true);
  execute.mockImplementation(async () => {
    await expect(session.readPlan({ revision: 0 }, previous)).rejects.toThrow();
    return { result: 20 };
  });
  await session.run('20');
  expect(store.getSnapshot().frame?.javascript).toMatchObject({
    status: 'complete',
    calls: [],
    outcome: { result: 20 },
  });
});

test('disposal aborts pending work and blocks later runs even after execution resolves', async () => {
  const store = createWorkbenchStore('text');
  let resolve!: (value: unknown) => void;
  const execute = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const session = createWorkbenchJavaScriptSession({
    store,
    active: () => true,
    execute,
  });
  const pending = session.run('42');

  session.dispose();
  const count = store.getSnapshot().events.length;
  resolve(42);
  await pending;
  await session.run('43');

  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().events).toHaveLength(count);
  expect(store.getSnapshot().status).toBe('cancelled');
});
