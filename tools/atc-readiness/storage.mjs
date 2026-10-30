/** CLI: node storage.mjs CONTEXT.json INDEPENDENT_EXPECTED.json. Five cases, sequentially; retains all synthetic audit rows. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  loadReadinessContext,
  resolveRuntimeDependency,
  canonicalStorageSummary,
} from './common.mjs';
import {
  startWorker,
  bounded,
  createReadinessPool,
  readinessPoolErrors,
  assertReadinessPoolHealthy,
} from './owner-worker.mjs';
/** Validate independent evidence before any database pool can be created. */
export async function storageContext(options, expected) {
  let storage;
  const context = await loadReadinessContext({
    ...options,
    expected,
    openDatabase: async (databaseUrl) => {
      storage = await import(
        pathToFileURL(
          resolveRuntimeDependency(
            options.runtimeRoot,
            '@b4run/postgres-storage/node',
          ),
        ).href
      );
      return createReadinessPool(storage, databaseUrl, 5);
    },
  });
  return {
    ...context,
    storage,
    databaseErrors: readinessPoolErrors(context.database),
  };
}
/** Execute the five approved six-second storage protocols against the explicitly bound database. */
export async function runStorage(options, expected) {
  const context = await storageContext(options, expected),
    { storage, database: raw } = context;
  const prefix = 'atcfence_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const threads = storage.createPostgresThreadsStore({
    pool: raw,
    tablePrefix: prefix,
  });
  const duration = 6000,
    interval = 1000;
  const workers = new Set();
  const admissions = new Set();
  const evidence = {
    startedAt: new Date().toISOString(),
    b4Version: context.manifest.version,
    tablePrefix: prefix,
    topology:
      'Owned Node worker processes using published Postgres APIs against dedicated hosted ATC preview database',
    cases: [],
  };
  const save = () =>
    writeFileSync(
      join(options.stagingDirectory, 'storage-failure-' + prefix + '.json'),
      JSON.stringify(context.redact(evidence), null, 2) + '\n',
      { mode: 0o600 },
    );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reader = storage.postgresCheckpointer({
    pool: raw,
    tablePrefix: prefix,
  });
  function admission(d = duration, i = interval) {
    const a = storage.createPostgresRunAdmission({
      pool: raw,
      tablePrefix: prefix,
      leaseDurationMs: d,
      heartbeatIntervalMs: i,
    });
    admissions.add(a);
    return a;
  }
  async function lease(threadId) {
    const { rows } = await raw.query(
      `SELECT owner_token,expires_at,clock_timestamp() AS now FROM ${prefix}_run_admissions WHERE thread_id=$1`,
      [threadId],
    );
    const r = rows[0];
    return r
      ? {
          ownerSha256: createHash('sha256').update(r.owner_token).digest('hex'),
          expiresAt: new Date(r.expires_at).toISOString(),
          databaseNow: new Date(r.now).toISOString(),
        }
      : null;
  }
  async function put(a, threadId, id, value) {
    const saver = storage.postgresCheckpointer({
      pool: a.pool,
      tablePrefix: prefix,
      assumeMigrated: true,
    });
    await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: '' } },
      {
        v: 4,
        id,
        ts: new Date().toISOString(),
        channel_values: { value },
        channel_versions: { value: 1 },
        versions_seen: {},
      },
      { source: 'loop', step: 1, parents: {} },
      { value: 1 },
    );
  }
  async function canonical(threadId) {
    return canonicalStorageSummary({
      pool: raw,
      saver: reader,
      threadStore: threads,
      threadId,
      tablePrefix: prefix,
    });
  }
  async function checkpoint(threadId) {
    const t = await reader.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: '' },
    });
    return t
      ? { id: t.checkpoint.id, value: t.checkpoint.channel_values.value }
      : null;
  }
  async function spawnOwner(d = duration, i = interval) {
    const worker = await startWorker(
      new URL('./owner-worker.mjs', import.meta.url),
      {
        runtimeRoot: options.runtimeRoot,
        databaseUrl: context.secrets.databaseUrl,
        prefix,
        duration: d,
        interval: i,
      },
    );
    workers.add(worker);
    return {
      ...worker,
      async close() {
        if (worker.child.exitCode !== null || worker.child.signalCode !== null)
          return;
        const result = await worker.command('close');
        assert(result.ok);
        await worker.close();
      },
    };
  }
  async function acquireEventually(a, threadId, limit = 15000) {
    const started = Date.now();
    let conflicts = 0;
    while (!(await a.tryAcquire(threadId))) {
      conflicts++;
      assert(Date.now() - started < limit, 'Takeover timed out');
      await sleep(150);
    }
    return { conflicts, elapsedMs: Date.now() - started };
  }
  function record(row) {
    assertReadinessPoolHealthy(raw);
    assert(
      ![...workers].some((worker) =>
        worker.events.some((event) => event.event === 'database-idle-error'),
      ),
      'owned worker database idle client error observed',
    );
    evidence.cases.push(row);
    save();
  }
  let failure;
  try {
    await reader.ready();
    await threads.ready();
    await raw.query(
      `CREATE TABLE ${prefix}_effects(thread_id text NOT NULL,value text NOT NULL)`,
    );
    // Renewal over natural expiry, then graceful release.
    {
      const threadId = 'renew-' + randomUUID();
      const w = await spawnOwner();
      const b = admission();
      assert((await w.command('acquire', { threadId })).result);
      const initial = await lease(threadId);
      await sleep(duration + 1000);
      const renewed = await lease(threadId);
      assert.equal(renewed.ownerSha256, initial.ownerSha256);
      assert(new Date(renewed.expiresAt) > new Date(initial.expiresAt));
      assert.equal(await b.tryAcquire(threadId), false);
      assert(
        (
          await w.command('put', {
            threadId,
            checkpointId: '0001-renewed',
            value: 'renewed-owner',
          })
        ).ok,
      );
      await w.command('release');
      assert(await b.tryAcquire(threadId));
      await put(b, threadId, '0002-successor', 'successor');
      assert.equal((await checkpoint(threadId)).value, 'successor');
      await w.close();
      await b.close();
      record({
        kind: 'natural-heartbeat-renewal',
        threadId,
        initial,
        renewed,
        successorAcquiredAfterRelease: true,
        safe: true,
      });
    }
    // Abrupt owner death: no release or finally, natural lease expiry.
    {
      const threadId = 'killed-' + randomUUID();
      const w = await spawnOwner();
      const b = admission();
      assert((await w.command('acquire', { threadId })).result);
      assert(
        (
          await w.command('put', {
            threadId,
            checkpointId: '0001-before-kill',
            value: 'old-owner',
          })
        ).ok,
      );
      const before = await lease(threadId);
      const exited = once(w.child, 'exit');
      w.child.kill('SIGKILL');
      const [, signal] = await bounded(exited, 5000, 'owned kill');
      assert.equal(signal, 'SIGKILL');
      const finalLease = await lease(threadId);
      assert(finalLease);
      assert.equal(await b.tryAcquire(threadId), false);
      const takeover = await acquireEventually(b, threadId);
      const after = await lease(threadId);
      assert.notEqual(after.ownerSha256, before.ownerSha256);
      assert(new Date(after.databaseNow) >= new Date(finalLease.expiresAt));
      await put(b, threadId, '0002-after-kill', 'successor');
      assert.deepEqual(await checkpoint(threadId), {
        id: '0002-after-kill',
        value: 'successor',
      });
      await b.close();
      record({
        kind: 'sigkill-natural-expiry-takeover',
        threadId,
        signal,
        before,
        finalLease,
        after,
        takeover,
        safe: true,
      });
    }
    // Stop/resume a real process beyond natural expiry.
    {
      const threadId = 'paused-' + randomUUID();
      const w = await spawnOwner();
      const b = admission();
      assert((await w.command('acquire', { threadId })).result);
      assert(
        (
          await w.command('put', {
            threadId,
            checkpointId: '0001-before-stop',
            value: 'old-owner',
          })
        ).ok,
      );
      w.child.kill('SIGSTOP');
      const before = await lease(threadId);
      assert.equal(await b.tryAcquire(threadId), false);
      const takeover = await acquireEventually(b, threadId);
      await put(b, threadId, '0002-after-stop', 'successor');
      const winner = await lease(threadId);
      const winnerCanonical = await canonical(threadId);
      const stalePromise = w.command('put', {
        threadId,
        checkpointId: '9999-stale',
        value: 'stale-overwrite',
      });
      w.child.kill('SIGCONT');
      const stale = await stalePromise;
      assert.equal(stale.ok, false);
      assert.equal(stale.afterAborted, true);
      assert.deepEqual(await canonical(threadId), winnerCanonical);
      assert.deepEqual(await checkpoint(threadId), {
        id: '0002-after-stop',
        value: 'successor',
      });
      await w.close();
      assert.deepEqual(await canonical(threadId), winnerCanonical);
      assert.equal((await lease(threadId)).ownerSha256, winner.ownerSha256);
      await put(b, threadId, '0003-after-old-close', 'successor-still-owned');
      await b.close();
      record({
        kind: 'sigstop-expiry-takeover-sigcont-stale-write',
        threadId,
        before,
        winner,
        takeover,
        stale,
        safe: true,
      });
    }
    // Force expiry only on an isolated row; old owner remains locally active until DB fence.
    {
      const threadId = 'fence-' + randomUUID();
      const a = admission(600000, 200000),
        b = admission();
      assert(await a.tryAcquire(threadId));
      await put(a, threadId, '0001-old', 'old-owner');
      const before = await lease(threadId);
      await raw.query(
        `UPDATE ${prefix}_run_admissions SET expires_at=clock_timestamp()-interval '1 second' WHERE thread_id=$1`,
        [threadId],
      );
      assert.equal(a.signal.aborted, false);
      assert(await b.tryAcquire(threadId));
      await put(b, threadId, '0002-winner', 'successor');
      const winner = await lease(threadId);
      assert.equal(a.signal.aborted, false);
      const winnerCanonical = await canonical(threadId);
      await assert.rejects(put(a, threadId, '9999-stale', 'stale-overwrite'));
      assert.equal(a.signal.aborted, true);
      await a.close();
      assert.deepEqual(await canonical(threadId), winnerCanonical);
      assert.equal((await lease(threadId)).ownerSha256, winner.ownerSha256);
      assert.deepEqual(await checkpoint(threadId), {
        id: '0002-winner',
        value: 'successor',
      });
      await b.close();
      record({
        kind: 'injected-expiry-active-owner-db-fence',
        threadId,
        before,
        winner,
        oldSignalActiveBeforeWrite: true,
        oldSignalAbortedAfterFence: true,
        staleReleasePreservesSuccessor: true,
        safe: true,
      });
    }
    // A transaction holding admission row lock must fail late COMMIT and unblock successor.
    {
      const threadId = 'commit-' + randomUUID();
      const w = await spawnOwner(duration, 4000),
        b = admission();
      assert((await w.command('acquire', { threadId })).result);
      assert(
        (await w.command('begin', { threadId, value: 'must-rollback' })).ok,
      );
      w.child.kill('SIGSTOP');
      let successorSettled = false;
      const acquiring = b.tryAcquire(threadId).finally(() => {
        successorSettled = true;
      });
      acquiring.catch(() => {
        /* Awaited below after owner resumes. */
      });
      await sleep(250);
      assert.equal(successorSettled, false);
      await sleep(duration + 500);
      assert.equal(
        successorSettled,
        false,
        'Successor must still be blocked immediately before resume',
      );
      const blockers = await raw.query(
        "SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE query LIKE $1 AND wait_event_type='Lock'",
        ['%' + prefix + '_run_admissions%'],
      );
      assert(
        blockers.rows.some((r) => r.blockers.length > 0),
        'Database must report a real admission lock blocker',
      );
      const committing = w.command('commit');
      w.child.kill('SIGCONT');
      const commit = await committing;
      assert.equal(commit.ok, false);
      assert.match(
        commit.error,
        /run admission (lease expired|ownership lost)/,
      );
      assert.equal(await acquiring, true);
      const { rows } = await raw.query(
        `SELECT value FROM ${prefix}_effects WHERE thread_id=$1`,
        [threadId],
      );
      assert.deepEqual(rows, []);
      await put(b, threadId, '0002-after-rollback', 'successor');
      const winner = await lease(threadId);
      const winnerCanonical = await canonical(threadId);
      await w.close();
      assert.deepEqual(await canonical(threadId), winnerCanonical);
      assert.equal((await lease(threadId)).ownerSha256, winner.ownerSha256);
      await b.close();
      record({
        kind: 'late-commit-rolls-back-and-unblocks-successor',
        threadId,
        commit,
        databaseBlockers: blockers.rows,
        successorWaitedThroughExpiryForTransaction: true,
        effectsRolledBack: true,
        safe: true,
      });
    }
    evidence.quiescentStartedAt = new Date().toISOString();
    evidence.immediate = [];
    for (const row of evidence.cases) {
      const summary = await canonicalStorageSummary({
        pool: raw,
        saver: reader,
        threadStore: threads,
        threadId: row.threadId,
        tablePrefix: prefix,
      });
      assert.equal(summary.admissions, 0);
      evidence.immediate.push(summary);
    }
    const quiescentAt = Date.now();
    await sleep(75000);
    evidence.quiescentElapsedMs = Date.now() - quiescentAt;
    assert(evidence.quiescentElapsedMs >= 75000);
    evidence.after75Seconds = [];
    for (const row of evidence.cases)
      evidence.after75Seconds.push(
        await canonicalStorageSummary({
          pool: raw,
          saver: reader,
          threadStore: threads,
          threadId: row.threadId,
          tablePrefix: prefix,
        }),
      );
    assert.deepEqual(evidence.after75Seconds, evidence.immediate);
    evidence.safe = true;
    evidence.finishedAt = new Date().toISOString();
    save();
  } catch (error) {
    evidence.safe = false;
    evidence.error = context.redact(error).message;
    failure = error;
  } finally {
    const errors = [];
    for (const worker of workers)
      await worker
        .close()
        .catch(() => errors.push('owned worker cleanup failed'));
    for (const a of admissions)
      await bounded(a.close(), 5000, 'admission close').catch(() =>
        errors.push('admission cleanup failed'),
      );
    await bounded(reader.close(), 5000, 'reader close').catch(() =>
      errors.push('reader cleanup failed'),
    );
    await bounded(threads.close(), 5000, 'threads close').catch(() =>
      errors.push('thread cleanup failed'),
    );
    await bounded(raw.end(), 5000, 'pool close').catch(() =>
      errors.push('pool cleanup failed'),
    );
    if (context.databaseErrors.length)
      errors.push('database idle client error observed');
    if (
      [...workers].some((worker) =>
        worker.events.some((event) => event.event === 'database-idle-error'),
      )
    )
      errors.push('owned worker database idle client error observed');
    evidence.databaseErrors = [...context.databaseErrors];
    evidence.cleanup = {
      ownedWorkersTerminated: [...workers].every(
        (w) => w.child.exitCode !== null || w.child.signalCode !== null,
      ),
      errors,
    };
    save();
    if (errors.length || !evidence.cleanup.ownedWorkersTerminated) {
      evidence.safe = false;
      save();
      failure ??= Error('storage cleanup failed');
    }
  }
  if (failure) throw failure;
  return evidence;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runStorage(
      JSON.parse(readFileSync(process.argv[2], 'utf8')),
      JSON.parse(readFileSync(process.argv[3], 'utf8')),
    );
  } catch {
    console.error(
      'readiness storage failed; inspect private sanitized receipt',
    );
    process.exitCode = 1;
  }
}
