import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonRestart, runRestartProtocol } from './compute-restart.mjs';

const identity = {
  projectId: 'p',
  branchId: 'b',
  endpointId: 'e',
  role: 'synthetic',
  database: 'synthetic',
  hostname: 'e.example',
  ownership: {
    runId: 'owned-run',
    purpose: 'atc-readiness',
    consumers: ['d1', 'd2'],
    data: 'empty-synthetic-only',
    production: false,
    shared: false,
  },
};
const bounds = () => ({
  signal: new AbortController().signal,
  deadlineMs: Date.now() + 10000,
});
function fixture(change = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET' });
    return Response.json(
      url.endsWith('/restart')
        ? { operations: [{ id: 'op' }] }
        : url.endsWith('/operations/op')
          ? { operation: { id: 'op', status: 'finished' } }
          : {
              endpoint: {
                id: 'e',
                project_id: 'p',
                branch_id: 'b',
                host: 'e.example',
                current_state: 'active',
                ...change,
              },
            },
    );
  };
  const journal = [];
  const provider = createNeonRestart({
    token: 'private-management-token',
    expected: identity,
    fetch,
    persist: async (row) => journal.push(structuredClone(row)),
  });
  return { provider, calls, journal };
}

test('supported restart persists intent before one mutation and saves operation ID', async () => {
  const f = fixture();

  await f.provider.inspect(bounds());
  const result = await f.provider.restart(bounds());
  await f.provider.wait(result, bounds());

  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(f.journal[0].state, 'mutation-intent');
  assert.deepEqual(f.journal[1].operationIds, ['op']);
  await assert.rejects(
    f.provider.restart(bounds()),
    /single restart|uncertain/,
  );
});

for (const change of [
  { id: 'wrong' },
  { project_id: 'wrong' },
  { branch_id: 'wrong' },
  { host: 'wrong' },
]) {
  test(
    'provider identity mismatch prevents restart ' + JSON.stringify(change),
    async () => {
      const f = fixture(change);

      await assert.rejects(f.provider.inspect(bounds()), /identity/);

      assert.equal(f.calls.filter((call) => call.method === 'POST').length, 0);
    },
  );
}

for (const change of [
  { production: true },
  { shared: true },
  { data: 'clone' },
  { consumers: ['unrelated'] },
]) {
  test(
    'shared or non-owned compute is rejected ' + JSON.stringify(change),
    () => {
      const expected = {
        ...identity,
        ownership: { ...identity.ownership, ...change },
      };

      assert.throws(
        () =>
          createNeonRestart({
            token: 'token',
            expected,
            persist: () => undefined,
          }),
        /ownership/,
      );
    },
  );
}

test('missing management auth cannot use SQL credentials as authorization', () => {
  assert.throws(
    () => createNeonRestart({ expected: identity, persist: () => undefined }),
    /management auth/,
  );
});

test('uncertain previous intent blocks further provider mutations', async () => {
  const f = fixture();
  const provider = createNeonRestart({
    token: 'token',
    expected: identity,
    prior: { state: 'mutation-intent' },
    fetch: async () => {
      throw Error('must not call');
    },
    persist: () => undefined,
  });

  await assert.rejects(provider.restart(bounds()), /uncertain|single restart/);

  assert.equal(f.calls.length, 0);
});

test('expired total deadline prevents provider IO', async () => {
  const f = fixture();

  await assert.rejects(
    f.provider.inspect({ ...bounds(), deadlineMs: Date.now() - 1 }),
    /deadline/,
  );

  assert.equal(f.calls.length, 0);
});

test('restart without proven active provider identity remains reconnect-only and does not mutate', async () => {
  const calls = [];
  const control = { ...bounds(), dispatch: async (_, fn) => fn(bounds()) };
  const seed = {
    canonical: { admissions: 0 },
    state: {
      humanContentHashes: ['seed'],
      providerIds: ['seed'],
      caps: [4096],
    },
  };
  const io = {
    request: async () => ({ snapshot: seed }),
    observePending: async () => null,
  };
  const provider = {
    inspect: async () => calls.push('inspect'),
    restart: async () => calls.push('restart'),
  };

  const result = await runRestartProtocol({
    io,
    control,
    provider,
    activeProvider: async () => null,
  });

  assert.equal(result.classification, 'reconnect-only');
  assert(!calls.includes('restart'));
  assert.equal(result.assertions.staleWriteExclusion, 'untested');
});

function protocolFixture({
  surviving = true,
  expiredOwner = false,
  incomplete = true,
  mutate = false,
} = {}) {
  const calls = [];
  const record = (humans, providers = ['seed-provider']) => ({
    canonical: { admissions: 0, threadPresent: true },
    state: {
      messageSha256s: humans,
      humanContentHashes: humans,
      providerIds: providers,
      caps: providers.map(() => 4096),
      checkpointRecords: [],
      writeRecords: [],
    },
  });
  const seed = record(['seed']);
  const owner = record(['seed', 'fault']);
  const winner = record(
    ['seed', 'fault', 'followup'],
    ['seed-provider', 'winner-provider'],
  );
  const lease = {
    ownerSha256: 'owner',
    databaseNow: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + (expiredOwner ? -1000 : 30000),
    ).toISOString(),
  };
  let finish;
  let completed = false;
  let requests = 0;
  const io = {
    deployment: { id: 'd1' },
    threadId: 'owned-thread',
    inputHash: (kind) => kind,
    request: async (kind) => {
      calls.push(kind);
      if (kind === 'fault')
        return new Promise((resolve) => {
          finish = () => {
            completed = true;
            resolve({
              status: 503,
              completed: !incomplete,
              transportFailure: incomplete ? 'TypeError' : undefined,
              clientAborted: false,
            });
          };
        });
      if (kind === 'conflict') return { status: 409, retryAfter: '1' };
      return { status: 200, snapshot: requests++ ? winner : seed };
    },
    observePending: async () => ({ lease, snapshot: owner }),
    lease: async () => (expiredOwner || surviving ? lease : null),
    clock: async () => {
      calls.push('clock');
      return new Date().toISOString();
    },
    snapshot: async () => (requests > 1 ? (mutate ? seed : winner) : owner),
    waitForExpiry: async () => calls.push('expiry'),
    waitQuiescent: async () => {
      calls.push('75s');
      return 75000;
    },
  };
  const provider = {
    inspect: async () => calls.push('inspect'),
    restart: async () => {
      calls.push('restart');
      finish();
      return { operationIds: ['op'] };
    },
    wait: async () => {
      calls.push('terminal');
      return { state: 'finished' };
    },
  };
  const control = {
    ...bounds(),
    dispatch: async (request, operation) => {
      calls.push('reserve:' + request.kind);
      return operation({ ...bounds(), ordinal: calls.length });
    },
  };
  const activeProvider = async ({ runId }) => {
    if (expiredOwner)
      setImmediate(() => {
        if (!completed) finish();
      });
    return {
      source: 'owned-deployment-request-logs',
      deploymentId: 'd1',
      threadId: 'owned-thread',
      runId,
      ownerSha256: 'owner',
      providerRequestId: 'real-provider-request',
      timestampMs: Date.now(),
    };
  };
  return { io, provider, control, activeProvider, calls };
}

test('proven restart records terminal provider and fresh database recovery before successor', async () => {
  const f = protocolFixture();

  const result = await runRestartProtocol(f);

  assert.equal(result.qualified, true);
  assert.equal(result.assertions.staleWriteExclusion, 'untested');
  assert.equal(result.assertions.preExpiryConflict, 'passed');
  assert(f.calls.indexOf('terminal') < f.calls.indexOf('clock'));
  assert(f.calls.indexOf('expiry') < f.calls.lastIndexOf('normal'));
  assert(f.calls.includes('75s'));
});

test('expired active owner cannot authorize provider mutation', async () => {
  const f = protocolFixture({ expiredOwner: true });

  const result = await runRestartProtocol(f);

  assert.equal(result.classification, 'reconnect-only');
  assert(!f.calls.includes('restart'));
});

test('75-second canonical mutation fails restart qualification', async () => {
  const f = protocolFixture({ mutate: true });

  await assert.rejects(runRestartProtocol(f), /state changed/);

  assert(f.calls.includes('75s'));
});

test('provider uncertain POST is not repeated even after network loss', async () => {
  let posts = 0;
  const provider = createNeonRestart({
    token: 'token',
    expected: identity,
    persist: async () => undefined,
    fetch: async (_url, options) => {
      if (options.method === 'POST') {
        posts++;
        throw Error('network lost');
      }
      return Response.json({
        endpoint: {
          id: 'e',
          project_id: 'p',
          branch_id: 'b',
          host: 'e.example',
          current_state: 'active',
        },
      });
    },
  });
  await provider.inspect(bounds());

  await assert.rejects(provider.restart(bounds()), /network lost/);
  await assert.rejects(provider.restart(bounds()), /uncertain/);

  assert.equal(posts, 1);
});

test('disposable database verification rejects nonempty tables and wrong roles before dispatch', async () => {
  const { verifyDisposableDatabase } = await import('./compute-restart.mjs');
  const context = (role = 'synthetic', count = 0) => ({
    secrets: {
      databaseUrl:
        'postgres://synthetic:private@e.example/synthetic?sslmode=verify-full',
    },
    database: {
      query: async (sql) => ({
        rows: sql.includes('current_database')
          ? [{ database: 'synthetic', role }]
          : sql.includes('pg_tables')
            ? [{ schemaname: 'public', tablename: 'atc_threads' }]
            : [{ count }],
      }),
    },
  });

  await verifyDisposableDatabase(context(), identity, bounds());
  await assert.rejects(
    verifyDisposableDatabase(context('shared-role'), identity, bounds()),
    /role/,
  );
  await assert.rejects(
    verifyDisposableDatabase(context('synthetic', 1), identity, bounds()),
    /empty/,
  );
});

test('missing management auth leaves durable restart fence uncreated', async () => {
  const { runComputeRestart } = await import('./compute-restart.mjs');
  const { mkdtemp, readdir, rm } = await import('node:fs/promises');
  const stage = await mkdtemp('/private/tmp/restart-noauth-');
  try {
    const result = await runComputeRestart(
      { stagingDirectory: stage },
      {},
      { runId: '12345678-1234-4234-8234-123456789abc' },
    );

    assert.equal(result.qualified, false);
    assert.match(result.error, /management auth/);
    assert(!(await readdir(stage)).includes('restart-operation.jsonl'));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test('restart attempts expose actual reservation and native request correlation', async () => {
  const f = protocolFixture();
  const original = f.control.dispatch;
  const reserved = [];
  f.control.dispatch = async (request, operation) => {
    reserved.push(request);
    return original(request, operation);
  };

  const result = await runRestartProtocol(f);

  assert.deepEqual(
    result.attempts.map((attempt) => attempt.id),
    reserved.map((request) => request.id),
  );
  assert(
    result.attempts.every((attempt) => attempt.threadId === 'owned-thread'),
  );
});
