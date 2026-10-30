import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
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
            status: fast ? 200 : 504,
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

const nativeLogRequestId = '6nx2j-1793315776487-85549e553123';
const regionalRequestId = 'pdx1::iad1::' + nativeLogRequestId;
const normalizedProof = {
  source: 'owned-deployment-request-logs',
  deploymentId: 'fault',
  origin: 'https://fault.example',
  requestId: regionalRequestId,
  timestampMs: 1793315776487,
  normalizedClassification: 'platform-invocation-duration-exceeded',
  rawErrorCode: null,
  rawHeaderRequestId: regionalRequestId,
  nativeLogRequestId,
  responseStatusCode: 200,
  timeoutSeconds: 1,
  platformMessageSha256:
    'aea360dd5096ef9c4511698bb6ceb6b4ab6158cd2a2da3e488d6c9f2a57030e5',
  normalizationRule:
    'vercel-regional-header-native-id-epoch-and-exact-one-second-runtime-log-v1',
};
const normalizedRequest = {
  requestId: regionalRequestId,
  startedAtMs: 1793315776000,
  endedAtMs: 1793315778000,
  clientAborted: false,
  status: 200,
};

for (const status of [200, 504]) {
  test(
    'accepts distinct normalized runtime log evidence for status ' + status,
    () => {
      const proof = { ...normalizedProof, responseStatusCode: status };
      const request = { ...normalizedRequest, status };
      const deployment = { id: 'fault', origin: normalizedProof.origin };

      const accepted = validatePlatformTimeoutProof(proof, request, deployment);

      assert.equal(accepted, true);
    },
  );
}

for (const [name, changes, requestChanges = {}] of [
  [
    'native ID mismatch',
    { nativeLogRequestId: 'other-1793315776487-85549e553123' },
  ],
  ['embedded epoch mismatch', { timestampMs: 1793315776488 }],
  [
    'invalid regional prefix',
    {
      requestId: 'fake::' + nativeLogRequestId,
      rawHeaderRequestId: 'fake::' + nativeLogRequestId,
    },
    { requestId: 'fake::' + nativeLogRequestId },
  ],
  [
    'trailing header newline',
    {
      requestId: regionalRequestId + '\n',
      rawHeaderRequestId: regionalRequestId + '\n',
    },
    { requestId: regionalRequestId + '\n' },
  ],
  [
    'trailing native ID bytes',
    { nativeLogRequestId: nativeLogRequestId + '-extra' },
  ],
  ['raw header mismatch', { rawHeaderRequestId: 'pdx1::iad1::other' }],
  ['wrong message digest', { platformMessageSha256: 'a'.repeat(64) }],
  ['wrong rule', { normalizationRule: 'inferred-timeout' }],
  ['wrong duration', { timeoutSeconds: 2 }],
  ['wrong status', { responseStatusCode: 500 }],
  ['status mismatch', { responseStatusCode: 504 }],
  ['missing status', {}, { status: undefined }],
  ['invented raw code', { code: 'FUNCTION_INVOCATION_TIMEOUT' }],
  ['invented raw error code', { rawErrorCode: 'FUNCTION_INVOCATION_TIMEOUT' }],
  ['missing raw error absence', { rawErrorCode: undefined }],
  ['wrong classification', { normalizedClassification: 'client-abort' }],
  ['wrong deployment', { deploymentId: 'unowned' }],
  ['wrong origin', { origin: 'https://other.example' }],
  ['outside request window', {}, { startedAtMs: 1793315776488 }],
  ['client abort', {}, { clientAborted: true }],
]) {
  test('rejects normalized timeout evidence with ' + name, () => {
    const proof = { ...normalizedProof, ...changes };
    const request = { ...normalizedRequest, ...requestChanges };
    const deployment = { id: 'fault', origin: normalizedProof.origin };

    const accepted = validatePlatformTimeoutProof(proof, request, deployment);

    assert.equal(accepted, false);
  });
}

test('normalized proof receipts retain original evidence without inventing raw codes', async () => {
  const f = fixture();
  const originalRequest = f.io.request;
  f.io.request = async (kind, options) =>
    kind === 'fault'
      ? { ...normalizedRequest, completed: false }
      : originalRequest(kind, options);
  f.platformProof = async () => ({
    ...normalizedProof,
    privateLogBody: 'not retained',
  });

  const result = await runTimeoutProtocol(f);

  assert.equal(result.classification, 'graceful-timeout-cleanup');
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.platformProof)),
    normalizedProof,
  );
  assert.equal(Object.hasOwn(result.platformProof, 'code'), false);
  assert(f.calls.includes('75s'));
});

test('normalized log evidence without an observed owner stays inconclusive', async () => {
  const f = fixture({ observed: false });
  const originalRequest = f.io.request;
  f.io.request = async (kind, options) =>
    kind === 'fault'
      ? { ...normalizedRequest, completed: false }
      : originalRequest(kind, options);
  f.platformProof = async () => normalizedProof;

  const result = await runTimeoutProtocol(f);

  assert.equal(result.classification, 'inconclusive');
  assert(!f.calls.includes('75s'));
});

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
  const stage = await realpath(
    await mkdtemp(join(tmpdir(), 'timeout-preflight-')),
  );
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
  const stage = await realpath(await mkdtemp(join(tmpdir(), 'timeout-http-')));
  await writeFile(stage + '/schema.json', '{}');
  const queries = [];
  const closed = [];
  let nextStatus = 200;
  let errorBody = '';
  const server = createServer(async (request, response) => {
    let bytes = '';
    for await (const chunk of request) bytes += chunk;
    const body = JSON.parse(bytes);
    if (nextStatus !== 200) {
      response.writeHead(nextStatus, { 'x-vercel-id': 'controlled-failure' });
      response.end(errorBody);
      return;
    }
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
    nextStatus = 429;
    const throttled = await io.request('fault', { ...bounds, input: 'fault' });
    assert.equal(throttled.throttled, true);
    nextStatus = 503;
    errorBody = JSON.stringify({ error: { code: 'rate_limit_exceeded' } });
    const providerThrottled = await io.request('fault', {
      ...bounds,
      input: 'fault',
    });
    assert.equal(providerThrottled.throttled, true);
    nextStatus = 504;
    errorBody = 'FUNCTION_INVOCATION_TIMEOUT';
    const timeoutResponse = await io.request('fault', {
      ...bounds,
      input: 'fault',
    });
    assert.equal(timeoutResponse.throttled, false);
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
  const stage = await realpath(
    await mkdtemp(join(tmpdir(), 'timeout-variant-')),
  );
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
    functionTreeSha256: await hashTree(normal + '/functions/api/run.func'),
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
    functionTreeSha256: await hashTree(fault + '/functions/api/run.func'),
    outputTreeSha256: await hashTree(fault),
    artifactSha256: expected.artifactSha256,
  };
  const options = {
    schemaPath: stage + '/schema.json',
    outputTreePath: normal,
    faultOutputTreePath: fault,
    functionTreePath: normal + '/functions/api/run.func',
    faultFunctionTreePath: fault + '/functions/api/run.func',
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
  const stage = await realpath(
    await mkdtemp(join(tmpdir(), 'timeout-cleanup-')),
  );
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

test('conflict receipt retains actual HTTP run/request correlation and retry header', async () => {
  const f = fixture({ surviving: true });
  const original = f.io.request;
  f.io.request = async (kind, bounds) => ({
    ...(await original(kind, bounds)),
    ...(kind === 'conflict'
      ? { runId: 'actual-conflict-run', requestId: 'actual-http-request' }
      : {}),
  });

  const result = await runTimeoutProtocol(f);

  assert.equal(result.conflict.request.runId, 'actual-conflict-run');
  assert.equal(result.conflict.request.requestId, 'actual-http-request');
  assert.equal(result.conflict.request.status, 409);
  assert.equal(result.conflict.request.retryAfter, '1');
  const attempt = result.attempts.find((entry) => entry.kind === 'conflict');
  assert.equal(attempt.runId, 'actual-conflict-run');
  assert.equal(attempt.requestId, 'actual-http-request');
  assert.equal(attempt.status, 409);
  assert.equal(attempt.retryAfter, '1');
});

test('fault HTTP 429 durably stops the reviewed timeout phase', async () => {
  const { initializeRolloutLedger, readRolloutLedger, withRolloutRun } =
    await import('./rollout-controls.mjs');
  const { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } =
    await import('node:fs');
  const { randomUUID } = await import('node:crypto');
  const { sha256 } = await import('./common.mjs');
  const stage = realpathSync(mkdtempSync(join(tmpdir(), 'timeout-throttle-')));
  const prior = {};
  for (const [name, count, limit] of [
    ['load', 99, 120],
    ['recovery', 10, 16],
  ]) {
    const path = stage + '/' + name + '.json';
    const bytes = JSON.stringify({
      limit,
      attempts: Array.from({ length: count }, (_, index) => ({
        ordinal: index + 1,
        label: String(index),
      })),
    });
    writeFileSync(path, bytes, { mode: 0o600 });
    prior[name] = { path, count, sha256: sha256(bytes) };
  }
  const adapterPath = stage + '/usage-adapter.mjs';
  writeFileSync(adapterPath, 'controlled offline fixture', { mode: 0o600 });
  const adapterSha256 = sha256(readFileSync(adapterPath));
  const reviewPath = stage + '/adapter-review.json';
  const reviewBytes = JSON.stringify({
    source: 'provider-usage',
    scope: 'owned-project',
    adapterSha256,
  });
  writeFileSync(reviewPath, reviewBytes, { mode: 0o600 });
  const expected = {
    source: 'human-approved-design',
    stagingDirectory: realpathSync(stage),
    capUsd: 10,
    runtimeSource: 'a2f92a4f02ab1dfc38051a44e509afb439634793',
    prior,
    spend: {
      adapterPath,
      adapterSha256,
      source: 'provider-usage',
      scope: 'owned-project',
      review: { path: reviewPath, sha256: sha256(reviewBytes) },
      maxAgeMs: 1000,
      reserveUsd: 1,
      maxUpstreamRetries: 2,
      costPerAttemptUsd: 1 / 3,
    },
  };
  let time = Date.now();
  const options = {
    phase: 'timeout',
    runId: randomUUID(),
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    cleanup: async () => undefined,
    observationSource: {
      source: expected.spend.source,
      scope: expected.spend.scope,
      adapterSha256,
      read: async () => ({
        source: expected.spend.source,
        scope: expected.spend.scope,
        observedAtMs: time,
        spendUsd: 0,
      }),
    },
  };
  initializeRolloutLedger(stage, expected, expected);
  const f = fixture();
  const original = f.io.request;
  f.io.request = async (kind, bounds) =>
    kind === 'fault'
      ? { status: 429, requestId: 'throttled-http', completed: false }
      : original(kind, bounds);
  let error;

  try {
    await withRolloutRun(stage, expected, options, async (control) =>
      runTimeoutProtocol({ ...f, control }),
    ).catch((caught) => {
      error = caught;
    });

    assert(error, 'HTTP 429 must reject qualification');
    const ledger = readRolloutLedger(stage, expected);
    assert.equal(ledger.attempts.length, 2);
    assert.equal(
      ledger.phases.timeout.stopped,
      'unexpected-failure/throttle/deadline',
    );
    await assert.rejects(
      withRolloutRun(
        stage,
        expected,
        { ...options, runId: randomUUID() },
        async () => undefined,
      ),
      /phase stopped/,
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('unplanned fault HTTP failures stop before querying timeout proof', async () => {
  const f = fixture();
  const original = f.io.request;
  let proofCalls = 0;
  f.io.request = async (kind, bounds) =>
    kind === 'fault'
      ? { status: 500, completed: false }
      : original(kind, bounds);
  f.platformProof = async () => {
    proofCalls++;
    return null;
  };

  await assert.rejects(runTimeoutProtocol(f), /unexpected fault HTTP response/);

  assert.equal(proofCalls, 0);
});

for (const failClose of [false, true]) {
  test(
    'actual IO attempts every cleanup after phase expiry/abort; failure=' +
      failClose,
    async () => {
      const { createManagedTimeoutIO } =
        await import('./managed-timeout-io.mjs');
      const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
      const { setTimeout: delay } = await import('node:timers/promises');
      const stage = await realpath(
        await mkdtemp(join(tmpdir(), 'timeout-expired-cleanup-')),
      );
      await writeFile(stage + '/schema.json', '{}');
      const closed = [];
      const controller = new AbortController();
      const control = {
        signal: controller.signal,
        deadlineMs: Date.now() + 100,
      };
      const context = {
        secrets: {},
        redact: (value) => value,
        databaseErrors: [],
        database: {
          end: async () => {
            closed.push('pool');
          },
        },
        storage: {
          postgresCheckpointer: () => ({
            close: async () => {
              closed.push('saver');
              if (failClose) throw Error('controlled saver cleanup failure');
            },
          }),
          createPostgresThreadsStore: () => ({
            close: async () => {
              closed.push('threads');
            },
          }),
        },
      };
      const io = await createManagedTimeoutIO(
        { schemaPath: stage + '/schema.json' },
        { fault: { deployment: {} } },
        control,
        { compileSchema: () => () => true, openContext: async () => context },
      );
      await delay(110);
      controller.abort();

      try {
        if (failClose)
          await assert.rejects(io.close(), /owned resource close failed/);
        else await io.close();

        assert.deepEqual(closed, ['saver', 'threads', 'pool']);
        assert(control.deadlineMs < Date.now());
        assert.equal(control.signal.aborted, true);
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    },
  );
}

test('managed tiny-delta SSE keeps request/hash/provider metadata and sanitizes diagnostics', async () => {
  const { createManagedTimeoutIO } = await import('./managed-timeout-io.mjs');
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { createRedactor } = await import('./common.mjs');
  const stage = await realpath(
    await mkdtemp(join(tmpdir(), 'managed-tiny-deltas-')),
  );
  await writeFile(stage + '/schema.json', '{}');
  const credential = 'complete-managed-credential-46a';
  const cookie = 'atc_visitor=signed-managed-cookie-46a';
  const rawModel = '{"text":"46a private model phrase"}';
  let body;
  let truncate = false;
  const server = createServer(async (request, response) => {
    let bytes = '';
    for await (const chunk of request) bytes += chunk;
    body = JSON.parse(bytes);
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'x-vercel-id': 'iad1::46a-managed-request',
      'set-cookie': cookie + '; HttpOnly',
    });
    for (const event of [
      { type: 'RUN_STARTED', runId: body.runId, threadId: body.threadId },
      { type: 'TEXT_MESSAGE_START', messageId: 'message-46a' },
      ...[...rawModel].map((delta) => ({
        type: 'TEXT_MESSAGE_CONTENT',
        delta,
      })),
      ...(!truncate
        ? [
            {
              type: 'RUN_FINISHED',
              runId: body.runId,
              threadId: body.threadId,
              model: 'gpt-5.4-mini',
              responseId: 'resp_46a',
            },
          ]
        : []),
    ])
      response.write('data: ' + JSON.stringify(event) + '\n\n');
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const context = {
    manifest: { deployments: [{ origin }] },
    secrets: { managedCredential: credential },
    redact: createRedactor([credential]),
    databaseErrors: [],
    database: {
      query: async (sql) => ({
        rows: sql.includes('count(*)') ? [{ count: 0 }] : [],
      }),
      end: async () => undefined,
    },
    storage: {
      postgresCheckpointer: () => ({
        listNamespaces: async () => [],
        getTuple: async () => ({
          checkpoint: { channel_values: { messages: [] } },
        }),
        close: async () => undefined,
      }),
      createPostgresThreadsStore: () => ({
        getThread: async () => ({}),
        close: async () => undefined,
      }),
    },
  };
  const control = {
    signal: new AbortController().signal,
    deadlineMs: Date.now() + 5000,
  };
  let io;
  try {
    io = await createManagedTimeoutIO(
      { schemaPath: stage + '/schema.json' },
      { fault: { deployment: { origin } } },
      control,
      { openContext: async () => context, compileSchema: () => () => true },
    );
    const runId = '46a12345-1234-4234-8234-123456789abc';
    const request = await io.request('normal', {
      ...control,
      runId,
      input: 'seed',
    });

    const result = io.redact({
      ...request,
      errorBodySha256: 'a'.repeat(64),
      error: new Error(
        rawModel +
          ' ' +
          body.messages[0].content +
          ' ' +
          cookie +
          ' ' +
          credential,
      ),
      rawCredentials: { credential, cookie },
      responseBody: rawModel,
    });

    assert.equal(result.runId, runId);
    assert.equal(result.requestId, 'iad1::46a-managed-request');
    assert.equal(result.terminalModel, 'gpt-5.4-mini');
    assert.equal(result.terminalProviderResponseId, 'resp_46a');
    assert.equal(result.errorBodySha256, 'a'.repeat(64));
    assert.deepEqual(result.snapshot, request.snapshot);
    for (const value of [
      rawModel,
      body.messages[0].content,
      cookie,
      credential,
    ])
      assert(!JSON.stringify(result).includes(value));
    assert.equal(result.responseBody, '[REDACTED]');
    assert(
      !Object.hasOwn(request, 'body') &&
        !Object.hasOwn(request, 'text') &&
        !Object.hasOwn(request, 'responseBody'),
    );
    truncate = true;
    const incomplete = await io.request('fault', {
      ...control,
      input: 'fault',
      runId: '46a12345-1234-4234-8234-123456789abd',
    });
    assert.equal(incomplete.completed, false);
    assert.equal(incomplete.transportFailure, 'Error');
  } finally {
    if (io) await io.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(stage, { recursive: true, force: true });
  }
});
