import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runTimeoutProtocol,
  validatePlatformTimeoutProof,
} from './managed-timeout.mjs';

const record = (human = ['seed'], providers = ['seed-provider']) => ({
  canonical: { admissions: 0, threadPresent: true },
  state: {
    messageSha256s: human,
    humanContentHashes: human,
    checkpointRecords: [],
    writeRecords: [],
    providerIds: providers,
    caps: providers.map(() => 4096),
  },
});
const lease = {
  ownerSha256: 'owner',
  expiresAt: '2026-01-01T00:00:30Z',
  databaseNow: '2026-01-01T00:00:01Z',
};
function fixture({
  observed = true,
  proof = true,
  fast = false,
  surviving = false,
  mutate = false,
  nonzero = false,
} = {}) {
  const calls = [];
  let snapshots = 0;
  const winner = record(
    ['seed', 'fault', 'followup'],
    ['seed-provider', 'winner-provider'],
  );
  const io = {
    deployment: { id: 'fault', origin: 'https://fault.example' },
    inputHash: (input) => input,
    request: async (kind) => {
      calls.push(kind);
      return kind === 'fault'
        ? {
            requestId: 'req',
            startedAtMs: 1,
            endedAtMs: 1001,
            completed: fast,
            clientAborted: false,
          }
        : kind === 'conflict'
          ? { status: 409, retryAfter: '1' }
          : {
              snapshot: snapshots++
                ? {
                    ...winner,
                    canonical: {
                      admissions: nonzero ? 1 : 0,
                      threadPresent: true,
                    },
                  }
                : record(),
            };
    },
    observePending: async () =>
      observed ? { lease, snapshot: record(['seed', 'fault']) } : null,
    snapshot: async () =>
      mutate
        ? record(['mutated'])
        : snapshots > 1
          ? winner
          : record(['seed', 'fault']),
    lease: async () => (surviving ? lease : null),
    clock: async () => {
      calls.push('clock');
      return calls.includes('conflict')
        ? '2026-01-01T00:00:02Z'
        : '2026-01-01T00:00:01Z';
    },
    waitForExpiry: async () => {
      calls.push('expiry');
    },
    waitQuiescent: async () => {
      calls.push('75s');
      return 75000;
    },
  };
  const control = {
    signal: new AbortController().signal,
    deadlineMs: Date.now() + 1000000,
    dispatch: async (request, operation) => {
      calls.push('reserve:' + request.kind);
      return operation({
        signal: new AbortController().signal,
        deadlineMs: Date.now() + 55000,
        ordinal: calls.length,
      });
    },
  };
  const platformProof = async () =>
    proof
      ? {
          source: 'owned-deployment-request-logs',
          deploymentId: 'fault',
          origin: 'https://fault.example',
          requestId: 'req',
          code: 'FUNCTION_INVOCATION_TIMEOUT',
          timestampMs: 1000,
        }
      : null;
  return { io, control, platformProof, calls };
}

test('client cancellation cannot establish a platform timeout', () => {
  const request = {
    requestId: 'req',
    startedAtMs: 1,
    endedAtMs: 1001,
    clientAborted: true,
  };

  const result = validatePlatformTimeoutProof(
    { source: 'client-abort' },
    request,
    { id: 'fault', origin: 'https://fault.example' },
  );

  assert.equal(result, false);
});

for (const [name, options] of [
  ['missing platform proof', { proof: false }],
  ['no observed in-flight owner', { observed: false }],
  ['naturally fast completion', { fast: true }],
]) {
  test(
    name + ' is inconclusive and consumes the fault reservation',
    async () => {
      const f = fixture(options);

      const result = await runTimeoutProtocol(f);

      assert.equal(result.classification, 'inconclusive');
      assert(f.calls.includes('reserve:fault'));
      assert(!f.calls.includes('conflict'));
    },
  );
}

test('immediate release is classified as graceful timeout cleanup', async () => {
  const f = fixture();

  const result = await runTimeoutProtocol(f);

  assert.equal(result.classification, 'graceful-timeout-cleanup');
  assert(!f.calls.includes('conflict'));
  assert(f.calls.includes('75s'));
});

test('surviving lease conflicts before expiry and succeeds only after natural expiry', async () => {
  const f = fixture({ surviving: true });

  const result = await runTimeoutProtocol(f);

  assert.equal(result.classification, 'orphan-lease-recovered');
  assert(f.calls.indexOf('conflict') < f.calls.indexOf('expiry'));
  assert(f.calls.indexOf('expiry') < f.calls.lastIndexOf('normal'));
});

for (const options of [{ mutate: true }, { nonzero: true }]) {
  test(
    'mutation or nonzero first EOF snapshot fails without polling into success ' +
      JSON.stringify(options),
    async () => {
      const f = fixture(options);

      await assert.rejects(runTimeoutProtocol(f));

      assert(!f.calls.includes('75s') || options.mutate);
    },
  );
}

test('fault provenance is rejected before opening database or HTTP', async () => {
  const { runManagedTimeout } = await import('./managed-timeout.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const stage = await mkdtemp('/private/tmp/timeout-preflight-');
  let proofCalls = 0;

  try {
    const result = await runManagedTimeout(
      { stagingDirectory: stage },
      {},
      {
        runId: '12345678-1234-4234-8234-123456789abc',
        platformProof: async () => {
          proofCalls++;
        },
      },
    );

    assert.equal(result.qualified, false);
    assert.equal(result.classification, 'failed');
    assert.equal(proofCalls, 0);
    assert.match(
      await readFile(
        stage + '/managed-timeout-12345678-1234-4234-8234-123456789abc.json',
        'utf8',
      ),
      /separate expected fault provenance required/,
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test('partial receipts retain progress after cancellation', async () => {
  const f = fixture();
  const receipt = {};
  f.io.waitQuiescent = async () => {
    throw Error('cancelled');
  };

  await assert.rejects(runTimeoutProtocol({ ...f, receipt }), /cancelled/);

  assert.equal(receipt.classification, 'graceful-timeout-cleanup');
  assert(receipt.immediate);
  assert.notEqual(receipt.qualified, true);
});

test('invalid or unrelated structured log proof is rejected', () => {
  const request = {
    requestId: 'req',
    startedAtMs: 1,
    endedAtMs: 1001,
    clientAborted: false,
  };
  const deployment = { id: 'fault', origin: 'https://fault.example' };
  const good = {
    source: 'owned-deployment-request-logs',
    deploymentId: 'fault',
    origin: deployment.origin,
    requestId: 'req',
    code: 'FUNCTION_INVOCATION_TIMEOUT',
    timestampMs: 1000,
  };

  const results = [
    { ...good, deploymentId: 'unowned' },
    { ...good, requestId: 'other' },
    { ...good, timestampMs: 1002 },
    { ...good, code: 'CLIENT_ABORT' },
  ].map((proof) => validatePlatformTimeoutProof(proof, request, deployment));

  assert.deepEqual(results, [false, false, false, false]);
});

test('real HTTP stream adapter takes first EOF query as admissions and closes partial resources', async () => {
  const { createManagedTimeoutIO } = await import('./managed-timeout-io.mjs');
  const { createServer } = await import('node:http');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { once } = await import('node:events');
  const stage = await mkdtemp('/private/tmp/timeout-http-');
  await writeFile(stage + '/schema.json', '{}');
  const queries = [];
  const closed = [];
  const server = createServer(async (request, response) => {
    let bytes = '';
    for await (const chunk of request) bytes += chunk;
    const body = JSON.parse(bytes);
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'set-cookie': 'atc_visitor=signed-secret; HttpOnly',
      'x-vercel-id': 'controlled-local-request',
    });
    for (const event of [
      { type: 'TEXT_MESSAGE_START', messageId: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', delta: '{"text":"local fixture"}' },
      { type: 'RUN_FINISHED', runId: body.runId, threadId: body.threadId },
    ])
      response.write('data: ' + JSON.stringify(event) + '\n\n');
    queries.push('EOF');
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const saver = {
    getTuple: async () => ({
      checkpoint: { channel_values: { messages: [] } },
    }),
    listNamespaces: async () => [],
    close: async () => closed.push('saver'),
  };
  const context = {
    manifest: { deployments: [{ origin }] },
    secrets: { cookieSecret: 'secret' },
    redact: (value) => value,
    databaseErrors: [],
    database: {
      query: async (sql) => {
        queries.push(sql);
        return { rows: sql.includes('count(*)') ? [{ count: 0 }] : [] };
      },
      end: async () => closed.push('pool'),
    },
    storage: {
      postgresCheckpointer: () => saver,
      createPostgresThreadsStore: () => ({
        getThread: async () => ({}),
        close: async () => closed.push('threads'),
      }),
    },
  };
  const bounds = {
    signal: new AbortController().signal,
    deadlineMs: Date.now() + 5000,
  };
  let io;

  try {
    io = await createManagedTimeoutIO(
      { schemaPath: stage + '/schema.json' },
      { fault: { deployment: { origin } } },
      bounds,
      { openContext: async () => context, compileSchema: () => () => true },
    );
    const result = await io.request('normal', { ...bounds, input: 'seed' });

    assert.equal(result.completed, true);
    assert.equal(result.terminalUsage, null);
    assert.deepEqual(result.snapshot.state.providerUsage, []);
    assert.match(result.runId, /^[0-9a-f-]{36}$/);
    assert.match(
      queries[queries.indexOf('EOF') + 1],
      /SELECT count\(\*\).*atc_run_admissions/,
    );
    assert(
      !JSON.stringify(
        io.redact({ nested: { cookie: 'atc_visitor=signed-secret' } }),
      ).includes('signed-secret'),
    );
  } finally {
    if (io) await io.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(stage, { recursive: true, force: true });
  }
  assert.deepEqual(closed, ['saver', 'threads', 'pool']);
});

test('preflight binds raw fault output and rejects edits outside the one timeout setting', async () => {
  const { preflightManagedTimeout } = await import('./managed-timeout.mjs');
  const { verifyTimeoutVariant } = await import('./rollout-controls.mjs');
  const { hashTree, sha256 } = await import('./common.mjs');
  const { mkdtemp, mkdir, writeFile, rm, cp } =
    await import('node:fs/promises');
  const stage = await mkdtemp('/private/tmp/timeout-variant-');
  const normal = stage + '/normal';
  const fault = stage + '/fault';
  await mkdir(normal + '/functions/api/run.func', { recursive: true });
  await writeFile(
    normal + '/functions/api/run.func/.vc-config.json',
    '{"runtime":"nodejs24.x","handler":"index.mjs","supportsResponseStreaming":true,"supportsCancellation":true,"maxDuration":60}',
  );
  await writeFile(normal + '/config.json', '{}');
  await cp(normal, fault, { recursive: true });
  await writeFile(
    fault + '/functions/api/run.func/.vc-config.json',
    '{"runtime":"nodejs24.x","handler":"index.mjs","supportsResponseStreaming":true,"supportsCancellation":true,"maxDuration":1}',
  );
  await writeFile(stage + '/schema.json', '{}');
  await writeFile(stage + '/artifact.mjs', 'unchanged runtime');
  const project = {
    id: 'project',
    ownerId: 'team',
    name: 'atc',
    owner: 'hashbrown',
  };
  const expected = {
    sourceCommit: 'a'.repeat(40),
    project,
    schemaSha256: sha256('{}'),
    artifactSha256: sha256('unchanged runtime'),
    functionTreeSha256: await hashTree(normal + '/functions'),
    deployments: [
      { id: 'normal1', origin: 'https://normal1.example' },
      { id: 'normal2', origin: 'https://normal2.example' },
    ],
  };
  expected.fault = {
    sourceCommit: expected.sourceCommit,
    project,
    deployment: {
      id: 'fault',
      origin: 'https://fault.example',
      target: 'preview',
      readyState: 'READY',
    },
    ...(await verifyTimeoutVariant(
      normal + '/functions',
      fault + '/functions',
    )),
    outputTreeSha256: await hashTree(fault),
    artifactSha256: expected.artifactSha256,
  };
  const options = {
    schemaPath: stage + '/schema.json',
    outputTreePath: normal,
    faultOutputTreePath: fault,
    functionTreePath: normal + '/functions',
    faultFunctionTreePath: fault + '/functions',
    faultArtifactPath: stage + '/artifact.mjs',
    faultManifest: structuredClone(expected.fault),
  };

  try {
    await preflightManagedTimeout(options, expected);
    await writeFile(fault + '/config.json', '{"changed":true}');
    expected.fault.outputTreeSha256 = await hashTree(fault);
    options.faultManifest = structuredClone(expected.fault);

    await assert.rejects(
      preflightManagedTimeout(options, expected),
      /full output differs outside timeout config/,
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test('control cancellation bounds an otherwise stalled operation', async () => {
  const { timeoutBound } = await import('./managed-timeout-io.mjs');
  const controller = new AbortController();
  const pending = timeoutBound(() => new Promise(() => undefined), {
    signal: controller.signal,
    deadlineMs: Date.now() + 1000,
  });

  controller.abort();

  await assert.rejects(pending, /cancelled/);
});

test('cleanup failure is surfaced after partially initialized storage', async () => {
  const { createManagedTimeoutIO } = await import('./managed-timeout-io.mjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const stage = await mkdtemp('/private/tmp/timeout-cleanup-');
  await writeFile(stage + '/schema.json', '{}');
  let closed = false;
  const context = {
    database: {
      end: async () => {
        closed = true;
        throw Error('close failed');
      },
    },
    storage: {
      postgresCheckpointer: () => {
        throw Error('init failed');
      },
    },
    databaseErrors: [],
    redact: (value) => value,
  };

  try {
    await assert.rejects(
      createManagedTimeoutIO(
        { schemaPath: stage + '/schema.json' },
        {},
        { signal: new AbortController().signal, deadlineMs: Date.now() + 1000 },
        { compileSchema: () => () => true, openContext: async () => context },
      ),
      /owned resource close failed/,
    );

    assert.equal(closed, true);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});
