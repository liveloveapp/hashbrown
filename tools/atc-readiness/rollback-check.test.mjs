import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRollbackPlan,
  runRollbackProtocol,
  createVercelAlias,
} from './rollback-check.mjs';

const b4 = {
  id: 'b4',
  target: 'preview',
  readyState: 'READY',
  backend: 'b4',
  sourceCommit: 'a2f92a4f02ab1dfc38051a44e509afb439634793',
  artifactSha256: 'a'.repeat(64),
  outputTreeSha256: 'b'.repeat(64),
  functionTreeSha256: 'c'.repeat(64),
  lockSha256: 'd'.repeat(64),
  projectId: 'p',
  ownerId: 't',
};
const openai = {
  ...b4,
  id: 'openai',
  backend: 'openai',
  artifactSha256: 'e'.repeat(64),
  outputTreeSha256: 'f'.repeat(64),
  functionTreeSha256: '1'.repeat(64),
};
const plan = {
  alias: 'readiness-owned.vercel.app',
  aliasId: 'alias',
  projectId: 'p',
  ownerId: 't',
  initialDeploymentId: 'b4',
  createdForRun: 'run',
  runId: 'run',
  productionAliases: ['atc.hashbrown.dev'],
  b4,
  openai,
};
const bounds = () => ({
  signal: new AbortController().signal,
  deadlineMs: Date.now() + 10000,
});

for (const change of [
  { initialDeploymentId: null },
  { alias: 'atc.hashbrown.dev' },
  { alias: 'example.com' },
  { createdForRun: 'someone-else' },
  { openai: { ...openai, backend: 'b4' } },
  { openai: { ...openai, artifactSha256: b4.artifactSha256 } },
]) {
  test('unsafe rollback plan rejected ' + JSON.stringify(change), () => {
    assert.throws(
      () => validateRollbackPlan({ ...plan, ...change }),
      /rollback/i,
    );
  });
}

function fixture({ writes = false, restoreFailure = false } = {}) {
  let mapping = 'b4';
  let reservations = 0;
  let wrote = false;
  const calls = [];
  const alias = {
    inspect: async () => ({
      aliasId: plan.aliasId,
      alias: plan.alias,
      projectId: plan.projectId,
      ownerId: plan.ownerId,
      deploymentId: mapping,
    }),
    assign: async (id) => {
      calls.push('assign:' + id);
      if (restoreFailure && calls.length > 3 && id === 'b4')
        throw Error('restore failed');
      mapping = id;
    },
    remove: async () => calls.push('remove'),
  };
  const io = {
    waitQuiescent: async () => 75000,
    snapshot: async () => ({ writes: wrote ? ['new'] : [] }),
    request: async ({ backend, threadId }) => {
      calls.push('request:' + backend);
      if (writes && backend === 'openai') wrote = true;
      return {
        outcome: 'passed',
        status: 200,
        deploymentId: mapping,
        backend,
        threadId,
        outputSha256: 'actual-output-hash',
        markerSha256: 'actual-marker-hash',
      };
    },
    close: async () => calls.push('close'),
  };
  const control = {
    ...bounds(),
    dispatch: async (_, fn) => {
      reservations++;
      return fn(bounds());
    },
  };
  return { alias, io, control, plan, calls, reservations: () => reservations };
}

test('preview rollback restores initial mapping before deleting owned alias', async () => {
  const f = fixture();

  const result = await runRollbackProtocol(f);

  assert.equal(result.qualified, true);
  assert.equal(f.reservations(), 2);
  assert(f.calls.indexOf('assign:b4', 1) < f.calls.indexOf('remove'));
  assert.equal(
    result.limitations.existingConversations,
    'B4 threads cannot transparently continue as durable B4 threads on direct OpenAI',
  );
});

test('OpenAI state writes fail rehearsal while still restoring alias', async () => {
  const f = fixture({ writes: true });

  await assert.rejects(runRollbackProtocol(f), /state write/);

  assert(f.calls.includes('remove'));
});

test('failed restoration prevents alias deletion and qualification', async () => {
  const f = fixture({ restoreFailure: true });

  await assert.rejects(runRollbackProtocol(f), /restore failed/);

  assert(!f.calls.includes('remove'));
});

test('Vercel adapter checks exact alias/project/team and bounds expired reads', async () => {
  const calls = [];
  const adapter = createVercelAlias({
    token: 'token',
    plan,
    persist: async () => undefined,
    fetch: async (url) => {
      calls.push(url);
      return Response.json({
        uid: 'other',
        alias: plan.alias,
        projectId: 'p',
        teamId: 't',
        deploymentId: 'b4',
      });
    },
  });

  await assert.rejects(adapter.inspect(bounds()), /alias identity/);
  await assert.rejects(
    adapter.inspect({ ...bounds(), deadlineMs: Date.now() - 1 }),
    /deadline/,
  );

  assert.equal(calls.length, 1);
});

test('artifact verification supports real filesystem routing and binds normal handler bytes', async () => {
  const { verifyRollbackArtifacts } = await import('./rollback-check.mjs');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { hashTree, sha256 } = await import('./common.mjs');
  const stage = await mkdtemp('/private/tmp/rollback-artifacts-');
  const actualPlan = structuredClone(plan);
  const paths = {};
  try {
    for (const backend of ['b4', 'openai']) {
      const root = stage + '/' + backend;
      const functionTreePath = root + '/functions/api/run.func';
      await mkdir(functionTreePath, { recursive: true });
      const handler = backend === 'b4' ? 'atc.mjs' : 'index.mjs';
      const artifactPath = functionTreePath + '/' + handler;
      await writeFile(artifactPath, backend + ' independent compiled artifact');
      await writeFile(
        functionTreePath + '/.vc-config.json',
        JSON.stringify({
          runtime: 'nodejs24.x',
          handler,
          maxDuration: 60,
          supportsResponseStreaming: true,
        }),
      );
      await writeFile(
        root + '/config.json',
        JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }),
      );
      await writeFile(root + '/package-lock.json', 'exact lock');
      const candidate = {
        ...actualPlan[backend],
        artifactSha256: sha256(
          await import('node:fs/promises').then((fs) =>
            fs.readFile(artifactPath),
          ),
        ),
        functionTreeSha256: await hashTree(functionTreePath),
        outputTreeSha256: await hashTree(root),
        lockSha256: sha256('exact lock'),
      };
      const verification = JSON.stringify({
        sourceCommit: candidate.sourceCommit,
        backend,
        artifactSha256: candidate.artifactSha256,
        functionTreeSha256: candidate.functionTreeSha256,
        outputTreeSha256: candidate.outputTreeSha256,
        lockSha256: candidate.lockSha256,
      });
      const verificationPath = stage + '/' + backend + '-verification.json';
      await writeFile(verificationPath, verification);
      actualPlan[backend] = {
        ...candidate,
        verificationSha256: sha256(verification),
      };
      paths[backend] = {
        runtimeRoot: root,
        outputTreePath: root,
        functionTreePath,
        artifactPath,
        verificationPath,
      };
    }

    await verifyRollbackArtifacts(paths, actualPlan);
    await writeFile(paths.openai.artifactPath, 'unexpected edit');

    await assert.rejects(
      verifyRollbackArtifacts(paths, actualPlan),
      /tree mismatch|artifact mismatch/,
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test('rollback waits for unchanged full B4 state for at least 75 seconds', async () => {
  const f = fixture();
  f.io.waitQuiescent = async () => 74999;

  await assert.rejects(runRollbackProtocol(f), /75 seconds/);

  assert(f.calls.includes('remove'));
});

test('real rollback SSE adapter validates fresh marker and first EOF admission query', async () => {
  const { createRollbackIO } = await import('./rollback-check.mjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { sha256 } = await import('./common.mjs');
  const stage = await mkdtemp('/private/tmp/rollback-http-');
  await writeFile(stage + '/schema.json', '{}');
  const calls = [];
  const closed = [];
  let sentBody;
  let includeMarker = true;
  const context = {
    secrets: {},
    redact: (value) => value,
    databaseErrors: [],
    database: {
      query: async (sql) => {
        calls.push(sql);
        return { rows: sql.includes('count(*)') ? [{ count: 0 }] : [] };
      },
      end: async () => closed.push('pool'),
    },
    storage: {
      postgresCheckpointer: () => ({
        listNamespaces: async () => [],
        getTuple: async () => undefined,
        close: async () => closed.push('saver'),
      }),
      createPostgresThreadsStore: () => ({
        getThread: async () => undefined,
        close: async () => closed.push('threads'),
      }),
    },
  };
  const dependencies = {
    openContext: async () => context,
    Ajv: class {
      compile() {
        return (value) => typeof value.text === 'string';
      }
    },
    routeProof: async ({ requestId, runId, threadId }) => ({
      source: 'owned-deployment-request-logs',
      deploymentId: 'openai',
      alias: plan.alias,
      requestId,
      runId,
      threadId,
    }),
    fetch: async (_url, options) => {
      assert.equal(options.headers.cookie, undefined);
      sentBody = JSON.parse(options.body);
      const text = JSON.stringify({
        text: includeMarker ? sentBody.messages[0].content : 'wrong marker',
      });
      const events = [
        {
          type: 'RUN_STARTED',
          runId: sentBody.runId,
          threadId: sentBody.threadId,
        },
        { type: 'TEXT_MESSAGE_CONTENT', delta: text },
        {
          type: 'RUN_FINISHED',
          runId: sentBody.runId,
          threadId: sentBody.threadId,
        },
      ];
      calls.push('EOF');
      return new Response(
        events
          .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
          .join(''),
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-vercel-id': 'actual-local-request',
          },
        },
      );
    },
  };
  let io;
  try {
    io = await createRollbackIO(
      { schemaPath: stage + '/schema.json' },
      { schemaSha256: sha256('{}') },
      plan,
      bounds(),
      dependencies,
    );
    const request = {
      ...bounds(),
      threadId: 'fresh-openai',
      backend: 'openai',
      deployment: openai,
    };

    const result = await io.request(request);

    assert.equal(result.status, 200);
    assert.equal(result.deploymentId, 'openai');
    assert.equal(result.requestId, 'actual-local-request');
    assert.match(
      calls[calls.indexOf('EOF') + 1],
      /SELECT count\(\*\).*atc_run_admissions/,
    );
    assert(result.outputSha256 && result.markerSha256);
    includeMarker = false;
    const partial = {};
    await assert.rejects(
      io.request({
        ...request,
        runId: 'native-failed-run',
        threadId: 'different-visitor',
        onRequestObserved: (value) => Object.assign(partial, value),
      }),
      /marker mismatch/,
    );
    assert.equal(partial.runId, 'native-failed-run');
    assert.equal(partial.requestId, 'actual-local-request');
    assert.equal(partial.status, 200);
  } finally {
    if (io) await io.close();
    await rm(stage, { recursive: true, force: true });
  }
  assert.deepEqual(closed, ['saver', 'threads', 'pool']);
});

test('Vercel API restores then removes exactly the owned alias and verifies absence', async () => {
  let mapping = 'openai';
  let removed = false;
  const calls = [];
  const rows = [];
  const alias = createVercelAlias({
    token: 'private-token',
    plan,
    persist: async (row) => rows.push(row),
    fetch: async (url, options) => {
      assert.equal(new URL(url).hostname, 'api.vercel.com');
      assert.equal(new URL(url).searchParams.get('teamId'), 't');
      calls.push(options.method + ' ' + new URL(url).pathname);
      if (options.method === 'POST') {
        assert.equal(JSON.parse(options.body).alias, plan.alias);
        mapping = 'b4';
        return Response.json({ uid: 'alias' });
      }
      if (options.method === 'DELETE') {
        removed = true;
        return Response.json({ status: 'SUCCESS' });
      }
      if (removed) return new Response('', { status: 404 });
      return Response.json({
        uid: 'alias',
        alias: plan.alias,
        projectId: 'p',
        teamId: 't',
        deploymentId: mapping,
      });
    },
  });

  await alias.assign('b4', bounds());
  await alias.remove(bounds());

  assert.equal(removed, true);
  assert(calls.includes('DELETE /v2/aliases/alias'));
  assert.deepEqual(
    rows.map((row) => row.action),
    ['assign-intent', 'assign-verified', 'delete-intent', 'removed'],
  );
});

test('outer resource cleanup shares one alias restoration promise with protocol finally', async () => {
  const f = fixture();
  let finalize;

  await runRollbackProtocol({
    ...f,
    registerCleanup: (cleanup) => {
      finalize = cleanup;
    },
  });
  assert.equal(typeof finalize, 'function');
  await Promise.all([finalize(), finalize()]);

  assert.equal(f.calls.filter((call) => call === 'remove').length, 1);
  assert.equal(f.calls.filter((call) => call.startsWith('assign:')).length, 3);
});

test('rollback attempts retain per-visitor reservation identities and unknown usage', async () => {
  const f = fixture();
  const reserved = [];
  f.control.dispatch = async (request, operation) => {
    reserved.push(request);
    return operation({ ...bounds(), ordinal: reserved.length });
  };

  const result = await runRollbackProtocol(f);

  assert.deepEqual(
    result.attempts.map((attempt) => attempt.id),
    reserved.map((request) => request.id),
  );
  assert.deepEqual(
    result.threadIds,
    reserved.map((request) => request.threadId),
  );
  assert(result.attempts.every((attempt) => attempt.terminalUsage === null));
});

test('rollback request failure preserves generated native ID and observed HTTP identity', async () => {
  const f = fixture();
  const receipt = {};
  let nativeRunId;
  f.io.request = async (control) => {
    nativeRunId = control.runId;
    control.onRequestObserved?.({
      runId: control.runId,
      requestId: 'observed-rollback-request',
      status: 200,
    });
    throw Error('route proof unavailable');
  };

  await assert.rejects(
    runRollbackProtocol({ ...f, receipt }),
    /route proof unavailable/,
  );

  assert.match(nativeRunId, /^[a-f0-9-]{36}$/);
  assert.equal(receipt.attempts[0].runId, nativeRunId);
  assert.equal(receipt.attempts[0].requestId, 'observed-rollback-request');
  assert.equal(receipt.attempts[0].terminalUsage, null);
});

test('protocol registers safe alias cleanup before its initial inspection fails', async () => {
  const f = fixture();
  const receipt = {};
  let inspections = 0;
  let registered = false;
  const inspect = f.alias.inspect;
  f.alias.inspect = async (control) => {
    assert.equal(registered, true);
    inspections++;
    if (inspections === 1) throw Error('initial alias read failed');
    assert.equal(control.signal.aborted, false);
    assert(control.deadlineMs > Date.now());
    return inspect(control);
  };

  await assert.rejects(
    runRollbackProtocol({
      ...f,
      receipt,
      registerCleanup: () => {
        registered = true;
      },
    }),
    /initial alias read failed/,
  );

  assert(inspections >= 2);
  assert.equal(receipt.aliasRemoved, true);
  assert(f.calls.includes('remove'));
});

for (const identityChange of [
  { aliasId: 'foreign' },
  { projectId: 'foreign' },
  { ownerId: 'foreign' },
  { alias: 'foreign.vercel.app' },
  { deploymentId: 'unrelated' },
]) {
  test(
    'cleanup never mutates an alias whose current identity differs ' +
      JSON.stringify(identityChange),
    async () => {
      const f = fixture();
      const receipt = {};
      const inspect = f.alias.inspect;
      f.alias.inspect = async (control) => ({
        ...(await inspect(control)),
        ...identityChange,
      });

      await assert.rejects(
        runRollbackProtocol({ ...f, receipt }),
        /alias identity|unexpected deployment/,
      );

      assert(
        !f.calls.some(
          (call) => call.startsWith('assign:') || call === 'remove',
        ),
      );
      assert.notEqual(receipt.aliasRemoved, true);
      assert(receipt.aliasCleanupError);
    },
  );
}

async function wrapperFixture({ failAt, loseOwnership = false } = {}) {
  const { mkdtemp } = await import('node:fs/promises');
  const stage = await mkdtemp('/private/tmp/rollback-early-cleanup-');
  const runId = '12345678-1234-4234-8234-123456789abc';
  const actualPlan = { ...plan, runId, createdForRun: runId };
  const calls = [];
  let inspections = 0;
  const alias = {
    inspect: async (control) => {
      calls.push('inspect');
      inspections++;
      assert.equal(control.signal.aborted, false);
      assert(control.deadlineMs > Date.now());
      return {
        aliasId: loseOwnership ? 'foreign' : actualPlan.aliasId,
        alias: actualPlan.alias,
        projectId: actualPlan.projectId,
        ownerId: actualPlan.ownerId,
        deploymentId: actualPlan.initialDeploymentId,
      };
    },
    assign: async () => calls.push('assign'),
    remove: async () => calls.push('remove'),
    verifyDeployment: async (_, control) => {
      calls.push('verify-deployment');
      if (failAt === 'deployment') throw Error('deployment read failed');
      if (failAt === 'deadline') {
        assert(control.deadlineMs <= Date.now());
        throw Error('phase deadline exhausted');
      }
      return {};
    },
  };
  const context = { stagingDirectory: stage, artifacts: {} };
  const expected = {
    ...b4,
    deployments: [{ id: b4.id }],
    rollback: actualPlan,
  };
  const adapters = {
    runId,
    vercelToken: 'offline-fixture-token',
    routeProof: async () => null,
    expectedBudget: {},
    observationSource: {},
  };
  const io = {
    redact: (value) => value,
    close: async () => calls.push('close'),
    request: async () => {
      throw Error('owned request failed');
    },
    snapshot: async () => ({}),
    waitQuiescent: async () => 75000,
  };
  const dependencies = {
    createAlias: () => {
      calls.push('create-alias');
      return alias;
    },
    verifyArtifacts: async () => {
      calls.push('verify-artifacts');
      if (failAt === 'artifacts') throw Error('artifact verification failed');
    },
    createIO: async () => {
      calls.push('open-io');
      if (failAt === 'initialize') throw Error('storage initialization failed');
      return io;
    },
    withRun: async (_, __, options, execute) => {
      const control = {
        ...bounds(),
        dispatch: async (_, operation) => operation(bounds()),
      };
      if (failAt === 'deadline') control.deadlineMs = Date.now() - 1;
      try {
        return await execute(control);
      } finally {
        await options.cleanup();
      }
    },
  };
  return {
    stage,
    context,
    expected,
    adapters,
    dependencies,
    calls,
    inspections: () => inspections,
  };
}

for (const failAt of ['artifacts', 'deployment', 'initialize', 'deadline']) {
  test(
    'precreated owned alias is cleaned after early failure at ' + failAt,
    async () => {
      const { runRollbackCheck } = await import('./rollback-check.mjs');
      const { rm } = await import('node:fs/promises');
      const f = await wrapperFixture({ failAt });
      try {
        const receipt = await runRollbackCheck(
          f.context,
          f.expected,
          f.adapters,
          f.dependencies,
        );

        assert.equal(receipt.status, 'failed');
        assert.equal(receipt.qualified, false);
        assert(f.inspections() >= 2);
        assert.equal(receipt.aliasRemoved, true);
        assert.equal(receipt.closed, true);
        assert.deepEqual(receipt.cleanupErrors, []);
        assert(f.calls.includes('remove'));
      } finally {
        await rm(f.stage, { recursive: true, force: true });
      }
    },
  );
}

test('lost alias ownership fails cleanup but still closes initialized IO', async () => {
  const { runRollbackCheck } = await import('./rollback-check.mjs');
  const { rm } = await import('node:fs/promises');
  const f = await wrapperFixture({ loseOwnership: true });
  try {
    const receipt = await runRollbackCheck(
      f.context,
      f.expected,
      f.adapters,
      f.dependencies,
    );

    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.qualified, false);
    assert.notEqual(receipt.closed, true);
    assert(
      receipt.cleanupErrors.includes('owned alias restoration/removal failed'),
    );
    assert(f.calls.includes('close'));
    assert(!f.calls.includes('assign') && !f.calls.includes('remove'));
  } finally {
    await rm(f.stage, { recursive: true, force: true });
  }
});
