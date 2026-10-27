import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchServerHistory } from '../examples/quickstart/runtime/workbench-server-history';
import { observeHistory } from '../examples/quickstart/runtime/workbench-history-client';

function setup() {
  const store = createWorkbenchStore('history');
  const observation = {
    messages: [] as unknown[],
    isLoading: false,
    finishReason: undefined as string | undefined,
    pendingInterrupts: null as unknown,
  };
  observeHistory(store, observation);
  const replace = vi.fn();
  const fetcher = vi.fn<typeof fetch>();
  const controller = createWorkbenchServerHistory({
    store,
    lesson: 'server-threads',
    observation: () => observation,
    active: () => true,
    replace,
    fetch: fetcher,
  });
  const session = {
    access: 'local-demo',
    threads: {
      'server-threads': { Lighthouse: 'light', Harbor: 'harbor' },
      'public-endpoint': {
        Lighthouse: 'public-light',
        Harbor: 'public-harbor',
      },
    },
    foreignThreadId: 'foreign',
  };
  return { store, observation, replace, fetcher, controller, session };
}

test('loads empty server snapshots with real SDK identity and captures safe operations', async () => {
  const s = setup();
  s.fetcher
    .mockResolvedValueOnce(Response.json(s.session))
    .mockResolvedValueOnce(
      Response.json({ id: 'light', version: 0, messages: [] }),
    );

  await s.controller.startSession();
  await s.controller.load();

  expect(s.replace).toHaveBeenCalledWith('light', []);
  expect(s.controller.sendable()).toBe(true);
  expect(s.controller.state().version).toBe(0);
  expect(
    s.store.getSnapshot().frame?.history?.app.server?.operations,
  ).toHaveLength(2);
  expect(JSON.stringify(s.controller.state())).not.toContain('cookie');
});

test('preserves local text and server version on real HTTP conflict and blocks replay operations', async () => {
  const s = setup();
  s.fetcher
    .mockResolvedValueOnce(Response.json(s.session))
    .mockResolvedValueOnce(
      Response.json({ id: 'light', version: 0, messages: [] }),
    );
  await s.controller.startSession();
  await s.controller.load();
  const user = s.store.send('Lighthouse');
  s.observation.messages = [user];
  s.observation.isLoading = true;
  observeHistory(s.store, s.observation);
  s.observation.messages = [
    user,
    {
      id: 'a',
      role: 'assistant',
      content: 'Outline then record.',
      toolCalls: [],
    },
  ];
  s.observation.isLoading = false;
  s.observation.finishReason = 'stop';
  observeHistory(s.store, s.observation);
  s.fetcher.mockResolvedValueOnce(
    Response.json(
      { error: 'Conversation changed; reload before saving' },
      { status: 409 },
    ),
  );

  await s.controller.save();

  expect(s.controller.state().version).toBe(0);
  expect(s.controller.state().snapshot?.messages).toEqual([]);
  expect(s.observation.messages).toHaveLength(2);
  expect(s.controller.state().error).toContain('reload');
  s.store.seek(0);
  const calls = s.fetcher.mock.calls.length;
  await s.controller.load();
  expect(s.fetcher).toHaveBeenCalledTimes(calls);
});

test('disposal discards pending responses and active SDK guards block storage writes', async () => {
  const s = setup();
  let respond: ((response: Response) => void) | undefined;
  s.fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const pending = s.controller.startSession();

  s.controller.dispose();
  respond?.(Response.json(s.session));
  await pending;

  expect(s.controller.state().access).toBe('unknown');
  expect(s.replace).not.toHaveBeenCalled();
  const guarded = setup();
  guarded.observation.pendingInterrupts = { batch: [] };
  await guarded.controller.startSession();
  expect(guarded.fetcher).not.toHaveBeenCalled();
});

test('captures chat HTTP responses during the actual loading lifecycle without settling SDK state', () => {
  const s = setup();
  s.store.send('Plan');

  s.controller.captureResponse(
    Response.json({ error: 'denied' }, { status: 401 }),
    'chat',
  );

  expect(s.store.getSnapshot().status).toBe('loading');
  expect(
    s.store.getSnapshot().frame?.history?.app.server?.operations[0].status,
  ).toBe(401);
});

test('failed switch load preserves loaded identity and version while disabling send for the selected slot', async () => {
  const s = setup();
  s.fetcher
    .mockResolvedValueOnce(Response.json(s.session))
    .mockResolvedValueOnce(
      Response.json({ id: 'light', version: 3, messages: [] }),
    );
  await s.controller.startSession();
  await s.controller.load();
  s.controller.select('Harbor');
  s.fetcher.mockResolvedValueOnce(
    Response.json({ error: 'Storage is unavailable' }, { status: 503 }),
  );

  await s.controller.load();

  expect(s.controller.state().threadId).toBe('light');
  expect(s.controller.state().version).toBe(3);
  expect(s.controller.sendable()).toBe(false);
  expect(s.replace).toHaveBeenCalledTimes(1);
  expect(s.controller.state().error).toContain('Storage');
});
