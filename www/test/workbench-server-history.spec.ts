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

test('cancels pending work without disposal, rejects stale responses and allows reactivation', async () => {
  const s = setup();
  s.fetcher
    .mockResolvedValueOnce(Response.json(s.session))
    .mockResolvedValueOnce(
      Response.json({ id: 'light', version: 2, messages: [] }),
    );
  await s.controller.startSession();
  await s.controller.load();
  s.observation.messages = [
    { id: 'unsaved', role: 'user', content: 'Keep this text' },
  ];
  let respond: ((response: Response) => void) | undefined;
  let signal: AbortSignal | null | undefined;
  s.fetcher.mockImplementationOnce((_url, init) => {
    signal = init?.signal;
    return new Promise((resolve) => {
      respond = resolve;
    });
  });
  const pending = s.controller.load();
  expect(s.controller.state().busy).toBe(true);

  s.controller.cancelPending();
  const cancelled = s.controller.state();
  respond?.(Response.json({ id: 'light', version: 99, messages: [] }));
  await pending;

  expect(signal?.aborted).toBe(true);
  expect(s.controller.state()).toEqual(cancelled);
  expect(s.controller.state().busy).toBe(false);
  expect(s.controller.state().version).toBe(2);
  expect(s.observation.messages[0]).toMatchObject({
    content: 'Keep this text',
  });
  expect(s.replace).toHaveBeenCalledTimes(1);
  s.fetcher.mockResolvedValueOnce(
    Response.json({ id: 'light', version: 3, messages: [] }),
  );
  await s.controller.load();
  expect(s.controller.state().version).toBe(3);
  expect(s.replace).toHaveBeenCalledTimes(2);
});

test('cancelled async SDK replacement cannot publish a later rejection', async () => {
  const s = setup();
  s.fetcher
    .mockResolvedValueOnce(Response.json(s.session))
    .mockResolvedValueOnce(
      Response.json({ id: 'light', version: 0, messages: [] }),
    );
  let rejectReplacement: ((error: Error) => void) | undefined;
  s.replace.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectReplacement = reject;
      }),
  );
  await s.controller.startSession();
  const loading = s.controller.load();
  await vi.waitFor(() => expect(s.replace).toHaveBeenCalledTimes(1));

  s.controller.cancelPending();
  const cancelled = s.controller.state();
  rejectReplacement?.(new Error('Late setter rejection'));
  await loading;

  expect(s.controller.state()).toEqual(cancelled);
  expect(s.controller.state().busy).toBe(false);
  expect(s.controller.state().error).toBeNull();
});

test('session results cannot commit after a subscriber disposes at request completion', async () => {
  const s = setup();
  s.fetcher.mockResolvedValueOnce(
    Response.json({
      access: 'anonymous',
      threads: null,
      foreignThreadId: null,
    }),
  );
  await s.controller.initialize();
  s.fetcher.mockResolvedValueOnce(Response.json(s.session));
  s.controller.subscribe(() => {
    if (!s.controller.state().busy) s.controller.dispose();
  });

  await s.controller.startSession();

  expect(s.controller.state().access).toBe('anonymous');
});

test('save results cannot commit after completion subscribers cancel or supersede the request', async () => {
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
    Response.json({
      id: 'light',
      version: 1,
      messages: [
        { role: 'user', content: 'Lighthouse' },
        { role: 'assistant', content: 'Outline then record.' },
      ],
    }),
  );
  s.controller.subscribe(() => {
    if (!s.controller.state().busy) s.controller.cancelPending();
  });

  await s.controller.save();

  expect(s.controller.state().version).toBe(0);
  expect(s.controller.state().snapshot?.messages).toEqual([]);
  expect(s.observation.messages).toHaveLength(2);
});

test('cancellation at replacement admission prevents the actual SDK setter side effect', async () => {
  for (const stop of ['cancel', 'dispose'] as const) {
    const s = setup();
    s.fetcher
      .mockResolvedValueOnce(Response.json(s.session))
      .mockResolvedValueOnce(
        Response.json({ id: 'light', version: 0, messages: [] }),
      );
    await s.controller.startSession();
    let requestEnded = false;
    s.controller.subscribe(() => {
      const state = s.controller.state();
      if (!state.busy) requestEnded = true;
      else if (requestEnded) {
        if (stop === 'cancel') s.controller.cancelPending();
        else s.controller.dispose();
      }
    });

    await s.controller.load();

    expect(s.replace).not.toHaveBeenCalled();
    expect(s.controller.state().threadId).toBeNull();
  }
});
