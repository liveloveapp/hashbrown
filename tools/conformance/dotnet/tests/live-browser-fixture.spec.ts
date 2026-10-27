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

test('actual stats HTTP parser preserves pending wire status through acquiring and streaming until native completion', async () => {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  const { publicChildEnvironment } =
    await import('../harness/live-configuration');
  const wire = {
    method: 'POST',
    path: '/v1/responses',
    status: 200,
    authentication: 'bearer',
    maxOutputTokens: 384,
    store: false,
  };
  const base = {
    calls: 2,
    httpCalls: 2,
    cancelledCalls: 1,
    inputTokens: 0,
    outputTokens: 0,
    stage: 'acquiring',
    wire: [wire, { ...wire, status: 0 }],
  };
  let acquired!: () => void;
  let streaming!: () => void;
  let held!: () => void;
  let release!: () => void;
  const acquiringRead = new Promise<void>((done) => {
    acquired = done;
  });
  const streamingRead = new Promise<void>((done) => {
    streaming = done;
  });
  const heldRead = new Promise<void>((done) => {
    held = done;
  });
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const invalidStatuses = [1, 99, 600, 601, -1];
  let reads = 0;
  let stops = 0;
  let origin = '';
  const server = createServer(async (request, response) => {
    request.resume();
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/fixture') {
      response.end(JSON.stringify({ id: 'a'.repeat(32), url: origin }));
      return;
    }
    if (request.method === 'DELETE') {
      stops++;
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url !== '/__test/live-stats') {
      response.writeHead(404);
      response.end();
      return;
    }
    reads++;
    if (reads === 1) {
      acquired();
      response.end(JSON.stringify(base));
      return;
    }
    if (reads === 2) {
      streaming();
      response.end(
        JSON.stringify({ ...base, stage: 'streaming', wire: [wire, wire] }),
      );
      return;
    }
    if (reads === 3) {
      held();
      await gate;
      response.end(
        JSON.stringify({
          ...base,
          stage: 'completed',
          inputTokens: 10,
          outputTokens: 3,
          wire: [wire, wire],
        }),
      );
      return;
    }
    response.end(
      JSON.stringify({
        ...base,
        wire: [wire, { ...wire, status: invalidStatuses[reads - 4] }],
      }),
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const modulePath = resolve(
    'tools/conformance/dotnet/harness/live-browser-fixture.ts',
  );
  const script = `const {withLiveBrowserFixture,waitForLiveNativeCompletion}=require(${JSON.stringify(modulePath)});withLiveBrowserFixture('angular-openai-key','cancellation-recovery',AbortSignal.timeout(10000),async fixture=>{const stats=await waitForLiveNativeCompletion(fixture,2);let rejected=0;for(let i=0;i<5;i++){try{await fixture.stats();}catch(error){if(error.message==='LIVE_STATS_INVALID')rejected++;else throw error;}}process.stdout.write(JSON.stringify({stage:stats.stage,calls:stats.calls,statuses:stats.wire.map(row=>row.status),outputTokens:stats.outputTokens,rejected}));}).catch(()=>{process.stderr.write('SYNTHETIC_STATS_FAILED');process.exitCode=1;});`;
  const child = promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '-e', script],
    {
      cwd: resolve('.'),
      timeout: 15_000,
      env: {
        ...publicChildEnvironment(process.env),
        HASHBROWN_LIVE_COORDINATOR: origin,
        HASHBROWN_LIVE_CAPABILITY: 'b'.repeat(64),
      },
    },
  ).then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  );

  try {
    expect(
      await Promise.race([
        child.then(() => 'exited'),
        acquiringRead.then(() => 'acquiring'),
      ]),
    ).toBe('acquiring');
    expect(
      await Promise.race([
        child.then(() => 'exited'),
        streamingRead.then(() => 'streaming'),
      ]),
    ).toBe('streaming');
    expect(
      await Promise.race([
        child.then(() => 'exited'),
        heldRead.then(() => 'held'),
      ]),
    ).toBe('held');
    release();
    const outcome = await child;
    if (outcome.error) throw outcome.error;
    if (!outcome.result) throw new Error('SYNTHETIC_STATS_FAILED');

    expect(JSON.parse(outcome.result.stdout)).toEqual({
      stage: 'completed',
      calls: 2,
      statuses: [200, 200],
      outputTokens: 3,
      rejected: 5,
    });
    expect(stops).toBe(1);
    const { createLiveQualificationLedger } =
      await import('../harness/live-qualification');
    const ledger = createLiveQualificationLedger();
    expect(
      ledger.recordFixture(
        'angular-openai-key',
        'cancellation-recovery',
        { ...base, stage: 'completed' },
        { server: 0, protected: 0 },
      ),
    ).toBe(false);
    expect(ledger.snapshot().completedFixtures).toBe(0);
  } finally {
    release();
    await child;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}, 20_000);

test('native parser retains only complete bounded proof and explicit per-call usage facts', async () => {
  const { nativeStats } = await import('../harness/live-browser-fixture');
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const { stats } = nativeApprovalUnitEvidence();

  const parsed = nativeStats({
    ...stats,
    requestId: 'PRIVATE_CANARY',
    arguments: 'PRIVATE_CANARY',
  });

  expect(parsed).toMatchObject({
    nativeApprovalStage: 'followup',
    nativeApprovalPublications: 3,
    usageCompleteCalls: 3,
    usageIncompleteCalls: 0,
  });
  expect(JSON.stringify(parsed)).not.toContain('PRIVATE_CANARY');
  for (const mutation of [
    { usageCompleteCalls: undefined },
    { usageIncompleteCalls: undefined },
    { usageCompleteCalls: -1 },
    { usageCompleteCalls: 2 },
    { usageIncompleteCalls: 1 },
    { nativeApprovalPublications: 4 },
    { nativeApprovalBindingMatched: 'yes' },
  ])
    expect(() => nativeStats({ ...stats, ...mutation })).toThrow();
});

test('native completion waits for the fresh later-user phase rather than an old completed answer', async () => {
  const { nativeStats, waitForLiveApprovalPhase } =
    await import('../harness/live-browser-fixture');
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const { stats } = nativeApprovalUnitEvidence();
  const old = nativeStats({
    ...stats,
    calls: 2,
    httpCalls: 2,
    usageCompleteCalls: 2,
    wire: stats.wire.slice(0, 2),
    nativeApprovalStage: 'approved',
    nativeApprovalModelPhase: 2,
    nativeApprovalWirePhase: 2,
    nativeApprovalPublications: 2,
  });
  const fresh = nativeStats(stats);
  const fixture = {
    stats: jest
      .fn()
      .mockResolvedValueOnce(old)
      .mockResolvedValueOnce(old)
      .mockResolvedValue(fresh),
  };

  const completed = await waitForLiveApprovalPhase(fixture, 3);

  expect(completed.calls).toBe(3);
  expect(fixture.stats).toHaveBeenCalledTimes(3);
  for (const mutation of [
    { calls: 4 },
    { stage: 'failed' },
    { nativeApprovalStage: 'invalid' },
    { calls: 5 },
    { usageCompleteCalls: 2, usageIncompleteCalls: 1 },
  ])
    await expect(
      waitForLiveApprovalPhase(
        { stats: async () => ({ ...fresh, ...mutation }) as typeof fresh },
        3,
      ),
    ).rejects.toThrow();
});
