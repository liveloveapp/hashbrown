/** Disposable compute restart qualification. Imports perform no IO or provider mutation. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, open, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sha256, createRedactor } from './common.mjs';
import { assertCommittedPrefix } from './runtime-recovery.mjs';
import { storageContext } from './storage.mjs';
import { withRolloutRun } from './rollout-controls.mjs';
import { createManagedTimeoutIO, timeoutBound } from './managed-timeout-io.mjs';

/** Create an authenticated, single-mutation Neon boundary; persist must durably sync each receipt. */
export function createNeonRestart({
  token,
  expected,
  persist,
  prior,
  fetch: transport = globalThis.fetch,
}) {
  assert(
    typeof token === 'string' && token.trim(),
    'Neon management auth missing; SQL credentials are insufficient',
  );
  const owned = expected?.ownership;
  assert(
    expected?.projectId &&
      expected.branchId &&
      expected.endpointId &&
      expected.hostname &&
      expected.role &&
      expected.database &&
      owned?.runId &&
      owned.purpose === 'atc-readiness' &&
      owned.data === 'empty-synthetic-only' &&
      owned.production === false &&
      owned.shared === false &&
      Array.isArray(owned.consumers) &&
      owned.consumers.length === 2 &&
      new Set(owned.consumers).size === 2 &&
      owned.consumers.every((id) => typeof id === 'string' && id),
    'compute ownership requires independently verified disposable synthetic consumers',
  );
  assert.equal(
    typeof persist,
    'function',
    'durable operation journal required',
  );
  const root =
    'https://console.neon.tech/api/v2/projects/' +
    encodeURIComponent(expected.projectId);
  const endpoint =
    root + '/endpoints/' + encodeURIComponent(expected.endpointId);
  let inspected = false;
  let attempted = Boolean(prior);
  const api = (url, method, bounds) =>
    timeoutBound(async (signal) => {
      const response = await transport(url, {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        redirect: 'error',
        signal,
      });
      assert(
        response.ok,
        'Neon management API failed; mutation must not be retried',
      );
      return timeoutBound(() => response.json(), { ...bounds, signal });
    }, bounds);
  const inspect = async (bounds) => {
    const { endpoint: value } = await api(endpoint, 'GET', bounds);
    assert(
      value &&
        value.id === expected.endpointId &&
        value.project_id === expected.projectId &&
        value.branch_id === expected.branchId &&
        value.host === expected.hostname,
      'Neon endpoint identity mismatch',
    );
    assert.equal(value.current_state, 'active', 'Neon compute is not active');
    inspected = true;
    return {
      endpointId: value.id,
      branchId: value.branch_id,
      projectId: value.project_id,
      state: value.current_state,
    };
  };
  return {
    inspect,
    restart: async (bounds) => {
      assert(
        !attempted,
        'single restart only; uncertain prior mutation must be inspected, never repeated',
      );
      assert(inspected, 'provider identity inspection required');
      await timeoutBound(() => undefined, bounds);
      attempted = true;
      const intent = {
        state: 'mutation-intent',
        endpointId: expected.endpointId,
        projectId: expected.projectId,
        branchId: expected.branchId,
        atMs: Date.now(),
      };
      await timeoutBound(() => persist(intent), bounds);
      const result = await api(endpoint + '/restart', 'POST', bounds);
      const operationIds = result.operations?.map((operation) => operation.id);
      assert(
        operationIds?.length &&
          operationIds.every((id) => typeof id === 'string' && id),
        'restart operation IDs missing; mutation uncertain',
      );
      const receipt = {
        ...intent,
        state: 'submitted',
        operationIds,
        submittedAtMs: Date.now(),
      };
      await timeoutBound(() => persist(receipt), bounds);
      return receipt;
    },
    wait: async (receipt, bounds) => {
      assert(receipt.operationIds?.length, 'saved operation IDs required');
      const operations = [];
      for (const id of receipt.operationIds) {
        for (;;) {
          const { operation } = await api(
            root + '/operations/' + encodeURIComponent(id),
            'GET',
            bounds,
          );
          assert(operation?.id === id, 'provider operation identity mismatch');
          assert(
            !['failed', 'error', 'cancelled', 'skipped'].includes(
              operation.status,
            ),
            'provider restart failed',
          );
          if (operation.status === 'finished') {
            operations.push({ id, status: operation.status });
            break;
          }
          assert(
            ['running', 'scheduling', 'scheduled'].includes(operation.status),
            'unknown provider operation state',
          );
          await timeoutBound(
            (signal) => delay(250, undefined, { signal }),
            bounds,
          );
        }
      }
      const terminal = {
        ...receipt,
        state: 'finished',
        operations,
        completedAtMs: Date.now(),
        endpoint: await inspect(bounds),
      };
      await timeoutBound(() => persist(terminal), bounds);
      return terminal;
    },
  };
}

function activeProof(proof, owner, io, runId, startedAtMs) {
  return (
    proof?.source === 'owned-deployment-request-logs' &&
    proof.deploymentId === io.deployment.id &&
    proof.threadId === io.threadId &&
    proof.runId === runId &&
    proof.ownerSha256 === owner.lease.ownerSha256 &&
    typeof proof.providerRequestId === 'string' &&
    proof.providerRequestId.length > 0 &&
    Number.isFinite(proof.timestampMs) &&
    proof.timestampMs >= startedAtMs &&
    proof.timestampMs <= Date.now()
  );
}

/** Execute one restart after durable input plus exact active-owner/provider evidence; no assertion flags accepted. */
export async function runRestartProtocol({
  control,
  io,
  provider,
  activeProvider,
  receipt = {},
}) {
  receipt.classification = 'reconnect-only';
  receipt.qualified = false;
  receipt.assertions = {
    preExpiryConflict: 'untested',
    staleWriteExclusion: 'untested',
    physicalFailover: 'untested',
  };
  receipt.attempts = [];
  const threadId = io.threadId ?? 'readiness-restart-' + randomUUID();
  receipt.threadId = threadId;
  const dispatch = (kind, operation) => {
    const id = randomUUID();
    return control.dispatch(
      { phase: 'restart', id, kind, threadId },
      async (bounds) => {
        const attempt = {
          id,
          ordinal: bounds.ordinal,
          kind,
          threadId,
          runId: randomUUID(),
          terminalUsage: null,
          terminalModel: null,
          terminalProviderResponseId: null,
          providerUsage: null,
        };
        receipt.attempts.push(attempt);
        const onRequestObserved = (request) => {
          for (const key of [
            'runId',
            'status',
            'requestId',
            'providerRequestId',
            'terminalUsage',
            'terminalModel',
            'terminalProviderResponseId',
            'retryAfter',
            'throttled',
          ]) {
            if (request[key] !== undefined) attempt[key] = request[key];
          }
          if (request.snapshot?.state.providerUsage !== undefined)
            attempt.providerUsage = request.snapshot.state.providerUsage;
        };
        try {
          const result = await operation({
            ...bounds,
            runId: attempt.runId,
            onRequestObserved,
          });
          onRequestObserved(result.request ?? result);
          attempt.outcome = result.outcome;
          return result;
        } catch (error) {
          attempt.outcome = 'failed';
          throw error;
        }
      },
    );
  };
  const normal = async (input) =>
    dispatch('normal', async (bounds) => {
      const result = await io.request('normal', { ...bounds, threadId, input });
      bounds.onRequestObserved(result);
      assert.equal(
        result.snapshot.canonical.admissions,
        0,
        'first post-EOF admissions must be zero',
      );
      assert(result.snapshot.state.caps.every((cap) => cap === 4096));
      return { ...result, outcome: 'passed' };
    });
  await provider.inspect(control);
  const seed = await normal('seed');
  receipt.seed = seed.snapshot;
  assert.equal(
    seed.snapshot.state.humanContentHashes.length,
    1,
    'seed must commit exactly one input',
  );
  assert.equal(
    seed.snapshot.state.providerIds.length,
    1,
    'seed must commit exactly one provider response',
  );
  let owner;
  const interrupted = await dispatch('normal', async (bounds) => {
    const runId = bounds.runId;
    const startedAtMs = Date.now();
    let settled = false;
    const pending = io
      .request('fault', { ...bounds, threadId, runId, input: 'fault' })
      .then((request) => {
        bounds.onRequestObserved(request);
        receipt.interruptedRequest = request;
        return request;
      })
      .finally(() => {
        settled = true;
      });
    pending.catch(() => undefined);
    owner = await io.observePending({
      ...bounds,
      threadId,
      baseline: seed.snapshot,
      settled: () => settled,
    });
    if (owner && !settled) {
      assertCommittedPrefix(seed.snapshot, owner.snapshot);
      assert.deepEqual(
        owner.snapshot.state.providerIds,
        seed.snapshot.state.providerIds,
        'owner response already committed before restart',
      );
      const proof = await timeoutBound(
        (signal) =>
          activeProvider({
            ...bounds,
            signal,
            deployment: io.deployment,
            threadId,
            runId,
            owner: owner.lease,
          }),
        bounds,
      );
      const current = await io.lease(bounds);
      if (
        activeProof(proof, owner, io, runId, startedAtMs) &&
        !seed.snapshot.state.providerIds.includes(proof.providerRequestId) &&
        !settled &&
        current?.ownerSha256 === owner.lease.ownerSha256 &&
        Date.parse(current.databaseNow) < Date.parse(current.expiresAt)
      ) {
        receipt.activeProvider = Object.fromEntries(
          [
            'source',
            'deploymentId',
            'threadId',
            'runId',
            'ownerSha256',
            'providerRequestId',
            'timestampMs',
          ].map((key) => [key, proof[key]]),
        );
        bounds.onRequestObserved({
          providerRequestId: proof.providerRequestId,
          ...(proof.requestId ? { requestId: proof.requestId } : {}),
        });
        receipt.observedOwner = owner;
        receipt.operation = await provider.restart(bounds);
        receipt.providerTerminal = await provider.wait(
          receipt.operation,
          control,
        );
        receipt.freshDatabaseClock = await io.clock(control);
        assert(
          Number.isFinite(Date.parse(receipt.freshDatabaseClock)),
          'fresh DB clock query failed',
        );
      }
    }
    const request = await pending;
    assert(
      !request.throttled && request.status !== 429,
      'unexpected provider throttle',
    );
    assert(
      [undefined, 200, 500, 502, 503, 504].includes(request.status),
      'unexpected restart HTTP response',
    );
    receipt.interruptedRequest = request;
    return {
      outcome:
        receipt.operation &&
        !request.completed &&
        request.transportFailure &&
        !request.clientAborted
          ? 'expected-failure'
          : 'inconclusive',
      request,
    };
  });
  if (interrupted.outcome !== 'expected-failure') return receipt;
  receipt.classification = 'compute-restart-recovery';
  const bounds = { ...control, threadId };
  const retained = await io.lease(bounds);
  if (retained) {
    assert.equal(
      retained.ownerSha256,
      owner.lease.ownerSha256,
      'unexpected owner after restart',
    );
    if (Date.parse(retained.databaseNow) < Date.parse(retained.expiresAt)) {
      receipt.conflict = await dispatch('conflict', async (requestBounds) => {
        const before = await io.clock(requestBounds);
        const response = await io.request('conflict', {
          ...requestBounds,
          threadId,
          input: 'followup',
        });
        requestBounds.onRequestObserved(response);
        const after = await io.clock(requestBounds);
        assert.equal(response.status, 409);
        assert.equal(response.retryAfter, '1');
        assert(
          Date.parse(before) < Date.parse(retained.expiresAt) &&
            Date.parse(after) < Date.parse(retained.expiresAt),
          'conflict must finish before DB expiry',
        );
        return {
          outcome: 'expected-failure',
          request: response,
          before,
          after,
        };
      });
      receipt.assertions.preExpiryConflict = 'passed';
    }
    await io.waitForExpiry({ ...bounds, lease: retained });
    const databaseNow = await io.clock(bounds);
    assert(
      Date.parse(databaseNow) >= Date.parse(retained.expiresAt),
      'DB-clock expiry must be proven before successor',
    );
    receipt.recoveryAdmissionGate = {
      reason: 'database-clock-expiry',
      databaseNow,
      expiresAt: retained.expiresAt,
      ownerSha256: retained.ownerSha256,
    };
  } else receipt.recoveryAdmissionGate = { reason: 'observed-release' };
  const before = await io.snapshot(bounds);
  assert(
    before.canonical.admissions === 0 ||
      (before.canonical.admissions === 1 &&
        receipt.recoveryAdmissionGate.reason === 'database-clock-expiry'),
    'successor requires DB-clock expiry or observed release',
  );
  assertCommittedPrefix(owner.snapshot, before);
  assert.deepEqual(
    before.state.providerIds,
    seed.snapshot.state.providerIds,
    'interrupted provider response persisted',
  );
  const winner = await normal('followup');
  assertCommittedPrefix(before, winner.snapshot);
  assert.deepEqual(winner.snapshot.state.humanContentHashes, [
    ...before.state.humanContentHashes,
    io.inputHash('followup'),
  ]);
  assert.deepEqual(
    winner.snapshot.state.providerIds.slice(0, -1),
    seed.snapshot.state.providerIds,
  );
  assert.equal(
    winner.snapshot.state.providerIds.length,
    seed.snapshot.state.providerIds.length + 1,
  );
  assert.equal(
    new Set(winner.snapshot.state.providerIds).size,
    winner.snapshot.state.providerIds.length,
  );
  receipt.immediate = winner.snapshot;
  assert((await io.waitQuiescent(bounds)) >= 75000);
  receipt.after75Seconds = await io.snapshot(bounds);
  assert.deepEqual(
    receipt.after75Seconds,
    receipt.immediate,
    'canonical/physical state changed after 75 seconds',
  );
  receipt.qualified = true;
  return receipt;
}

/** Verify exact DSN endpoint/role/database and genuinely empty user storage before seeding. */
export async function verifyDisposableDatabase(context, compute, control) {
  const database = new URL(context.secrets.databaseUrl);
  assert.equal(
    database.hostname.replace('-pooler.', '.'),
    compute.hostname,
    'disposable DB endpoint mismatch',
  );
  assert.equal(
    decodeURIComponent(database.username),
    compute.role,
    'disposable DB role mismatch',
  );
  assert.equal(
    decodeURIComponent(database.pathname.slice(1)),
    compute.database,
    'disposable DB name mismatch',
  );
  const query = (sql) =>
    timeoutBound(() => context.database.query(sql), control);
  const current = (
    await query('select current_database() as database,current_user as role')
  ).rows[0];
  assert.equal(
    current.database,
    compute.database,
    'actual disposable DB mismatch',
  );
  assert.equal(current.role, compute.role, 'actual disposable role mismatch');
  const tables = await query(
    "select schemaname,tablename from pg_tables where schemaname !~ '^pg_' and schemaname <> 'information_schema'",
  );
  for (const { schemaname, tablename } of tables.rows) {
    assert(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaname) &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename),
      'unsupported disposable schema/table identity',
    );
    const row = (
      await query(
        'select count(*) as count from "' +
          schemaname +
          '"."' +
          tablename +
          '"',
      )
    ).rows[0];
    assert.equal(
      Number(row.count),
      0,
      'disposable database must be empty before scenario',
    );
  }
}

/** Run guarded storage/HTTP and one supported restart using a privately supplied management token, never env fallback. */
export async function runComputeRestart(options, expected, adapters) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      adapters.runId,
    ),
    'run UUID required',
  );
  const stage = await lstat(options.stagingDirectory);
  assert(
    stage.isDirectory() &&
      !stage.isSymbolicLink() &&
      (stage.mode & 0o777) === 0o700 &&
      stage.uid === process.getuid() &&
      (await realpath(options.stagingDirectory)) === options.stagingDirectory,
    'private staging directory required',
  );
  const receipt = { phase: 'restart', qualified: false, status: 'incomplete' };
  let io;
  let openingContext;
  let redact = createRedactor([adapters.managementToken]);
  const journalPath = join(options.stagingDirectory, 'restart-operation.jsonl');
  try {
    assert(
      typeof adapters.managementToken === 'string' &&
        adapters.managementToken.trim(),
      'Neon management auth missing',
    );
    assert.equal(
      typeof adapters.activeProvider,
      'function',
      'reviewed active provider log adapter required',
    );
    assert.equal(
      expected.sourceCommit,
      'a2f92a4f02ab1dfc38051a44e509afb439634793',
      'frozen source required',
    );
    const proof = JSON.parse(
      await readFile(options.computeOwnershipPath, 'utf8'),
    );
    assert.equal(
      sha256(await readFile(options.computeOwnershipPath)),
      expected.computeOwnershipSha256,
      'independent compute ownership receipt mismatch',
    );
    assert.deepEqual(
      proof,
      expected.compute,
      'compute ownership identity mismatch',
    );
    assert.deepEqual(
      [...proof.ownership.consumers].sort(),
      expected.deployments.map((d) => d.id).sort(),
    );
    assert.equal(proof.ownership.runId, adapters.runId);
    // Exclusive create is a durable inter-process fence; any prior file blocks repeat mutation.
    const journal = await open(journalPath, 'wx', 0o600);
    await journal.sync();
    await journal.close();
    const directory = await open(options.stagingDirectory, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    const persist = async (row) => {
      const handle = await open(journalPath, 'a');
      try {
        await handle.writeFile(JSON.stringify(row) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
    };
    const provider = createNeonRestart({
      token: adapters.managementToken,
      expected: proof,
      persist,
    });
    await withRolloutRun(
      options.stagingDirectory,
      adapters.expectedBudget,
      {
        phase: 'restart',
        runId: adapters.runId,
        observationSource: adapters.observationSource,
        cleanup: async () => {
          if (io) await io.close();
          else if (openingContext)
            await timeoutBound(() => openingContext.database.end(), {
              deadlineMs: Date.now() + 5000,
            });
          receipt.closed = true;
        },
      },
      async (control) => {
        const normalExpected = {
          ...expected,
          fault: { deployment: expected.deployments[0] },
        };
        assert.equal(
          proof.databaseSha256,
          expected.databaseSha256,
          'disposable DB identity mismatch',
        );
        io = await createManagedTimeoutIO(options, normalExpected, control, {
          openContext: async (contextOptions, contextExpected) => {
            openingContext = await storageContext(
              contextOptions,
              contextExpected,
            );
            const secretRedactor = redact;
            redact = (value) => secretRedactor(openingContext.redact(value));
            await verifyDisposableDatabase(openingContext, proof, control);
            return openingContext;
          },
        });
        const secretRedactor = redact;
        redact = (value) => secretRedactor(io.redact(secretRedactor(value)));
        await runRestartProtocol({
          control,
          io,
          provider,
          activeProvider: adapters.activeProvider,
          receipt,
        });
      },
    );
    receipt.status = receipt.qualified ? 'qualified' : 'inconclusive';
  } catch (error) {
    receipt.status = 'failed';
    receipt.qualified = false;
    receipt.error = error.message;
  }
  const sanitized = redact(receipt);
  await writeFile(
    join(
      options.stagingDirectory,
      'compute-restart-' + adapters.runId + '.json',
    ),
    JSON.stringify(sanitized, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return sanitized;
}
