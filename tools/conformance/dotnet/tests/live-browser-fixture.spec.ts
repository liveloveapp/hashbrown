import {
  readLiveCoordinator,
  withSafeLiveCase,
} from '../harness/live-browser-fixture';

test('live browser coordinator accepts only a loopback origin and opaque capability', () => {
  const valid = {
    HASHBROWN_LIVE_COORDINATOR: 'http://127.0.0.1:49213',
    HASHBROWN_LIVE_CAPABILITY: 'a'.repeat(64),
  };

  const coordinator = readLiveCoordinator(valid);

  expect(coordinator).toEqual({
    origin: valid.HASHBROWN_LIVE_COORDINATOR,
    capability: valid.HASHBROWN_LIVE_CAPABILITY,
  });
  for (const origin of [
    'https://remote.invalid',
    'http://127.0.0.1:49213/secret',
    'http://user:secret@127.0.0.1:49213',
    'http://localhost:49213',
  ]) {
    expect(() =>
      readLiveCoordinator({ ...valid, HASHBROWN_LIVE_COORDINATOR: origin }),
    ).toThrow('LIVE_COORDINATOR_INVALID');
  }
});

test('case guard removes assertion messages, stacks and causes before Playwright can persist them', async () => {
  const annotations: Array<{ type: string; description: string }> = [];
  const raw = new Error('secret-canary', { cause: new Error('nested-secret') });
  let caught: unknown;

  try {
    await withSafeLiveCase(
      async () => {
        throw raw;
      },
      (annotation) => annotations.push(annotation),
    );
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).name).toBe('');
  expect((caught as Error).message).toBe('');
  expect((caught as Error).stack).toBe('');
  expect((caught as Error).cause).toBeUndefined();
  expect(JSON.stringify(caught)).not.toMatch(/secret|canary/);
  expect(annotations).toEqual([
    { type: 'live-failure', description: 'LIVE_ASSERTION_FAILED' },
  ]);
});

test('case deadline aborts and drains its owned callback before throwing a blank error', async () => {
  const events: string[] = [];

  await expect(
    withSafeLiveCase(
      async (signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              events.push('aborted');
              resolve();
            },
            { once: true },
          ),
        );
        events.push('drained');
      },
      () => undefined,
      5,
    ),
  ).rejects.toMatchObject({ name: '', message: '', stack: '' });

  expect(events).toEqual(['aborted', 'drained']);
});

test('native completion barrier ignores old idle UI and dispatched wire until the fresh native iterator completes', async () => {
  const { waitForLiveNativeCompletion } =
    await import('../harness/live-browser-fixture');
  const wire = {
    method: 'POST',
    path: '/v1/responses',
    status: 200,
    authentication: 'bearer',
    maxOutputTokens: 384,
    store: false,
  };
  const old = {
    calls: 1,
    httpCalls: 1,
    cancelledCalls: 1,
    inputTokens: 0,
    outputTokens: 0,
    stage: 'completed',
    wire: [wire],
  };
  const streaming = {
    ...old,
    calls: 2,
    httpCalls: 2,
    stage: 'streaming',
    wire: [wire, wire],
  };
  const completed = {
    ...streaming,
    stage: 'completed',
    inputTokens: 10,
    outputTokens: 3,
  };
  let streamingRead!: () => void;
  let heldRead!: () => void;
  let release!: () => void;
  const observedStreaming = new Promise<void>((done) => {
    streamingRead = done;
  });
  const held = new Promise<void>((done) => {
    heldRead = done;
  });
  const gate = new Promise<void>((done) => {
    release = done;
  });
  let reads = 0;
  const fixture = {
    stats: async () => {
      if (reads++ === 0) return old;
      if (reads === 2) {
        streamingRead();
        return streaming;
      }
      heldRead();
      await gate;
      return completed;
    },
  };
  const completion = waitForLiveNativeCompletion(fixture, 2);

  try {
    expect(
      await Promise.race([
        completion.then(() => 'completed'),
        observedStreaming.then(() => 'streaming'),
      ]),
    ).toBe('streaming');
    expect(
      await Promise.race([
        completion.then(() => 'completed'),
        held.then(() => 'held'),
      ]),
    ).toBe('held');
    release();
    const actual = await completion;

    expect(actual).toMatchObject({
      calls: 2,
      httpCalls: 2,
      stage: 'completed',
      outputTokens: 3,
    });
  } finally {
    release();
    await completion;
  }
});

test('native completion assertion passes its deadline to the actual metadata request', async () => {
  const { waitForLiveNativeCompletion } =
    await import('../harness/live-browser-fixture');
  let observed: AbortSignal | undefined;
  const stats = {
    calls: 1,
    httpCalls: 1,
    cancelledCalls: 0,
    inputTokens: 1,
    outputTokens: 1,
    stage: 'completed',
    wire: [
      {
        method: 'POST',
        path: '/v1/responses',
        status: 200,
        authentication: 'bearer',
        maxOutputTokens: 384,
        store: false,
      },
    ],
  };

  await waitForLiveNativeCompletion(
    {
      stats: async (signal?: AbortSignal) => {
        observed = signal;
        return stats;
      },
    },
    1,
  );

  expect(observed).toBeInstanceOf(AbortSignal);
  expect(observed?.aborted).toBe(false);
});
