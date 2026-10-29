/**
 * CLI: node runtime-recovery.mjs kill|suspend CONTEXT.json INDEPENDENT_EXPECTED.json
 * Context: common.loadReadinessContext options plus schemaPath. Expected adds schemaSha256.
 * Run storage.mjs first, then kill, then suspend; no overlapping invocations. All receipts are private.
 * Kill protocol is implemented from the approved in-repository design: committed seed, actual
 * generated ingress/input commit, owned SIGKILL, managed 409 wholly before DB expiry, managed
 * successor after natural default-30-second expiry, full state immediately and >=75s later.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, open, unlink, lstat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  canonicalStorageSummary,
  resolveRuntimeDependency,
  readSseStream,
  sha256,
  stableStringify,
} from './common.mjs';
import { storageContext } from './storage.mjs';
import {
  startWorker,
  bounded,
  assertReadinessPoolHealthy,
} from './owner-worker.mjs';
import { createProviderProxy } from './provider-proxy.mjs';
const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Reserve before dispatch; a private durable ledger prevents independent CLI invocations resetting sixteen attempts. */
export async function reserveRecoveryRequest(stage, label) {
  const file = join(stage, 'recovery-budget.json'),
    lock = join(stage, 'recovery-budget.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch {
    throw Error(
      'recovery budget locked; refuse concurrent or uncertain execution',
    );
  }
  try {
    let ledger = { limit: 16, attempts: [] };
    try {
      const info = await lstat(file);
      assert(
        info.isFile() &&
          !info.isSymbolicLink() &&
          (info.mode & 0o777) === 0o600,
      );
      ledger = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw Error('recovery budget ledger invalid');
    }
    assert.equal(ledger.limit, 16);
    assert(Array.isArray(ledger.attempts));
    if (ledger.attempts.length >= 16)
      throw Error('recovery request budget exhausted');
    ledger.attempts.push({
      ordinal: ledger.attempts.length + 1,
      label,
      at: new Date().toISOString(),
    });
    const output = await open(file, 'w', 0o600);
    try {
      await output.writeFile(JSON.stringify(ledger, null, 2) + '\n');
      await output.sync();
    } finally {
      await output.close();
    }
    return ledger.attempts.length;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
/** Hash every field of every committed message, including assistant content and metadata. */
export function messageRecordHashes(messages) {
  return messages.map((message) => sha256(stableStringify(message)));
}
/**
 * Hash immutable checkpoint columns separately from physical pending-write rows.
 * Published 0.15.7 saver buildTuple omits idx; the database write primary key is
 * (thread_id, checkpoint_ns, checkpoint_id, task_id, idx), so decoded tuples
 * cannot identify retained writes reliably. Preserve every raw column, including BYTEA.
 */
export function physicalHistoryRecords(checkpoints, writes) {
  const records = (rows, columns) =>
    rows
      .map((row) => ({
        keySha256: sha256(
          stableStringify(columns.map((column) => row[column])),
        ),
        sha256: sha256(stableStringify(row)),
      }))
      .sort((a, b) => a.keySha256.localeCompare(b.keySha256));
  return {
    checkpointRecords: records(checkpoints, [
      'thread_id',
      'checkpoint_ns',
      'checkpoint_id',
    ]),
    writeRecords: records(writes, [
      'thread_id',
      'checkpoint_ns',
      'checkpoint_id',
      'task_id',
      'idx',
    ]),
  };
}
/** Require full ordered messages and unchanged records at every previously committed physical key. */
export function assertCommittedPrefix(prefix, successor) {
  assert.deepEqual(
    successor.state.messageSha256s.slice(0, prefix.state.messageSha256s.length),
    prefix.state.messageSha256s,
    'complete committed message prefix changed',
  );
  for (const [field, label] of [
    ['checkpointRecords', 'checkpoint'],
    ['writeRecords', 'write'],
  ]) {
    const current = new Map(
      successor.state[field].map((record) => [record.keySha256, record.sha256]),
    );
    assert.equal(
      current.size,
      successor.state[field].length,
      'duplicate physical ' + label + ' key',
    );
    for (const record of prefix.state[field])
      assert.equal(
        current.get(record.keySha256),
        record.sha256,
        'prior full ' + label + ' changed or disappeared',
      );
  }
}
/** Complete and validate held upstream bytes before waiting natural expiry and dispatching takeover. */
export async function dispatchAfterRecoveryGates({
  providerCompletion,
  waitForExpiry,
  dispatch,
}) {
  await providerCompletion;
  await waitForExpiry();
  return dispatch();
}
/** Run one approved generated-runtime recovery case; no network is performed on module import. */
export async function runRuntimeRecovery(mode, options, expected) {
  assert(['kill', 'suspend'].includes(mode));
  // Check schema and independent provenance before the common guard can open a pool.
  const schemaBytes = await readFile(options.schemaPath);
  assert.equal(sha256(schemaBytes), expected.schemaSha256);
  const schema = JSON.parse(schemaBytes);
  const context = await storageContext(options, expected),
    { storage, database: pool } = context;
  const saver = storage.postgresCheckpointer({ pool, tablePrefix: 'atc' }),
    threads = storage.createPostgresThreadsStore({ pool, tablePrefix: 'atc' });
  let validate;
  const threadId = 'readiness-' + mode + '-' + randomUUID(),
    marker = 'readiness-' + randomUUID();
  const evidence = {
    mode,
    startedAt: new Date().toISOString(),
    threadId,
    marker,
    version: context.manifest.version,
    artifactSha256: context.manifest.artifactSha256,
    sourceCommit: context.manifest.sourceCommit,
    deployments: context.manifest.deployments,
    attempts: [],
    checks: {},
  };
  const receiptPath = join(
    options.stagingDirectory,
    'runtime-' + mode + '-' + threadId + '.json',
  );
  const save = () =>
    writeFile(
      receiptPath,
      JSON.stringify(context.redact(evidence), null, 2) + '\n',
      { mode: 0o600 },
    );
  let worker,
    proxy,
    cookie,
    stopped = false;
  let failure;
  const origin = context.manifest.deployments[0].origin;
  const body = (messages) => ({
    threadId,
    runId: randomUUID(),
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: { hashbrown: { responseSchema: schema } },
  });
  const clock = async () =>
    new Date(
      (await pool.query('select clock_timestamp() AS now')).rows[0].now,
    ).toISOString();
  const lease = async () => {
    const { rows } = await pool.query(
      'select owner_token,expires_at,clock_timestamp() AS now from atc_run_admissions where thread_id=$1',
      [threadId],
    );
    return rows[0]
      ? {
          ownerSha256: sha256(rows[0].owner_token),
          expiresAt: new Date(rows[0].expires_at).toISOString(),
          databaseNow: new Date(rows[0].now).toISOString(),
        }
      : null;
  };
  const summary = () =>
    canonicalStorageSummary({
      pool,
      saver,
      threadStore: threads,
      threadId,
      tablePrefix: 'atc',
    });
  const contentState = async () => {
    const tuple = await saver.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: '' },
    });
    const checkpoints = await pool.query(
      'select thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,type,checkpoint,metadata from atc_checkpoints where thread_id=$1',
      [threadId],
    );
    const writes = await pool.query(
      'select thread_id,checkpoint_ns,checkpoint_id,task_id,idx,channel,type,value from atc_writes where thread_id=$1',
      [threadId],
    );
    const messages = tuple?.checkpoint.channel_values.messages ?? [];
    const human = messages.filter((m) => m.type === 'human'),
      ai = messages.filter((m) => m.type === 'ai');
    return {
      messageSha256s: messageRecordHashes(messages),
      ...physicalHistoryRecords(checkpoints.rows, writes.rows),
      humanContentHashes: human.map((m) => sha256(stableStringify(m.content))),
      providerIds: ai.map((m) => m.response_metadata?.id).filter(Boolean),
      caps: ai.map((m) => m.response_metadata?.max_output_tokens),
      messageCount: messages.length,
    };
  };
  async function managed(input, label, conflict = false) {
    assertReadinessPoolHealthy(pool);
    const ordinal = await reserveRecoveryRequest(
      options.stagingDirectory,
      mode + ':' + label,
    );
    const attempt = { ordinal, label, runId: input.runId };
    evidence.attempts.push(attempt);
    await save();
    attempt.dispatchMonotonicMs = performance.now();
    const response = await fetch(origin + '/api/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(conflict ? 15000 : 65000),
    });
    attempt.status = response.status;
    attempt.retryAfter = response.headers.get('retry-after');
    if (conflict) {
      assert.equal(response.status, 409);
      assert.equal(attempt.retryAfter, '1');
      await bounded(response.text(), 15000, 'conflict body');
      return attempt;
    }
    assert.equal(response.status, 200);
    if (!cookie) {
      cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith('atc_visitor='))
        ?.split(';')[0];
      assert(cookie, 'signed visitor cookie required');
    }
    const events = [];
    await readSseStream(response, {
      timeoutMs: 65000,
      runId: input.runId,
      threadId,
      onEvent: (e) => events.push(e),
      redact: context.redact,
    });
    attempt.eofMonotonicMs = performance.now();
    // First post-EOF query is the exact admission count, no clock/polling/read can precede it.
    const canonical = await summary();
    assert.equal(
      canonical.admissions,
      0,
      'first post-EOF admissions must be zero',
    );
    assert(canonical.threadPresent);
    const output = events
      .filter((e) => e.type === 'TEXT_MESSAGE_CONTENT')
      .map((e) => e.delta ?? '')
      .join('');
    assert(
      validate(JSON.parse(output)),
      'managed output must match pinned schema',
    );
    const assistantId = events.find(
      (e) => e.type === 'TEXT_MESSAGE_START',
    )?.messageId;
    assert(assistantId);
    attempt.canonical = canonical;
    attempt.outputSha256 = sha256(output);
    attempt.validSchema = true;
    return {
      canonical,
      assistant: { id: assistantId, role: 'assistant', content: output },
    };
  }
  try {
    const Ajv = createRequire(
      resolveRuntimeDependency(options.runtimeRoot, 'ajv'),
    )('ajv');
    validate = new Ajv({ strict: false }).compile(schema);
    assert(context.secrets.OPENAI_API_KEY, 'provider credential required');
    proxy = await createProviderProxy({
      apiKey: context.secrets.OPENAI_API_KEY,
      upstreamBase: context.secrets.OPENAI_BASE_URL,
      schema,
    });
    worker = await startWorker(
      new URL('./runtime-owner.mjs', import.meta.url),
      {
        artifactPath: options.artifactPath,
        secrets: context.secrets,
        proxyUrl: proxy.baseUrl,
      },
    );
    const seedUser = {
      id: randomUUID(),
      role: 'user',
      content: `${marker}: Define aircraft callsign in one short sentence using prose only.`,
    };
    const seed = await managed(body([seedUser]), 'seed');
    const seedHistory = [seedUser, seed.assistant];
    evidence.seedCanonical = seed.canonical;
    evidence.baseline = await contentState();
    assert.equal(evidence.baseline.humanContentHashes.length, 1);
    assert.equal(evidence.baseline.providerIds.length, 1);
    assert(evidence.baseline.caps.every((c) => c === 4096));
    const user = {
      id: randomUUID(),
      role: 'user',
      content: `${marker}: Explain aircraft altimeters in about 250 words using prose only.`,
    };
    const ownerInput = body([...seedHistory, user]);
    const ordinal = await reserveRecoveryRequest(
      options.stagingDirectory,
      mode + ':owned-ingress',
    );
    evidence.attempts.push({
      ordinal,
      label: 'owned-ingress',
      runId: ownerInput.runId,
    });
    worker.child.send({ op: 'run', input: ownerInput, cookie });
    await proxy.waitCaptured();
    evidence.beforeFailureCanonical = await summary();
    evidence.beforeFailure = await contentState();
    assertCommittedPrefix(
      { state: evidence.baseline, canonical: evidence.seedCanonical },
      {
        state: evidence.beforeFailure,
        canonical: evidence.beforeFailureCanonical,
      },
    );
    assert.deepEqual(evidence.beforeFailure.humanContentHashes, [
      ...evidence.baseline.humanContentHashes,
      sha256(stableStringify(user.content)),
    ]);
    assert.deepEqual(
      evidence.beforeFailure.providerIds,
      evidence.baseline.providerIds,
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='100ms'");
      const row = await client.query(
        'select thread_id from atc_run_admissions where thread_id=$1 FOR UPDATE NOWAIT',
        [threadId],
      );
      assert.equal(row.rowCount, 1);
    } finally {
      try {
        await bounded(
          client.query('ROLLBACK'),
          4000,
          'admission unlock rollback',
        );
      } finally {
        client.release(true);
      }
    }
    evidence.checks.inputCommittedAndAdmissionUnlocked = true;
    if (mode === 'kill') {
      const exited = new Promise((resolve) =>
        worker.child.once('exit', (code, signal) => resolve({ code, signal })),
      );
      worker.child.kill('SIGKILL');
      evidence.ownerExit = await bounded(exited, 5000, 'owned kill');
      assert.equal(evidence.ownerExit.signal, 'SIGKILL');
    } else {
      assert(worker.child.kill('SIGSTOP'));
      stopped = true;
      const result = await exec(
        'ps',
        ['-o', 'stat=', '-p', String(worker.child.pid)],
        { timeout: 5000 },
      );
      assert(result.stdout.includes('T'));
      evidence.stoppedProcessState = result.stdout.trim();
    }
    evidence.oldLease = await lease();
    assert(evidence.oldLease);
    const remaining =
      Date.parse(evidence.oldLease.expiresAt) -
      Date.parse(evidence.oldLease.databaseNow);
    assert(
      remaining > 2000 && remaining <= 31000,
      'default 30 second runtime lease expected',
    );
    let forwardError;
    const forwarded =
      mode === 'suspend'
        ? proxy.forward().catch((error) => {
            forwardError = error;
          })
        : Promise.resolve();
    const followup = {
      id: randomUUID(),
      role: 'user',
      content: `${marker}: Briefly explain indicated airspeed in one sentence using prose only.`,
    };
    const successorInput = body([...seedHistory, user, followup]);
    const before = await clock();
    const conflict = await managed(
      successorInput,
      'before-expiry-conflict',
      true,
    );
    const after = await clock();
    evidence.conflict = {
      ...conflict,
      databaseBefore: before,
      databaseAfter: after,
    };
    assert(
      Date.parse(before) < Date.parse(evidence.oldLease.expiresAt) &&
        Date.parse(after) < Date.parse(evidence.oldLease.expiresAt),
      'conflict must finish wholly before DB expiry',
    );
    const providerCompletion = (async () => {
      if (mode !== 'suspend') return;
      await forwarded;
      assert(!forwardError, 'actual provider completion failed');
      const provider = proxy.receipt();
      assert(provider);
      assert(
        validate(JSON.parse(provider.outputText)),
        'real delayed provider output must match pinned schema',
      );
      const providerEvidence = { ...provider };
      delete providerEvidence.outputText;
      evidence.staleProvider = providerEvidence;
      evidence.providerBytesHeldConfirmedMonotonicMs = performance.now();
    })();
    const winner = await dispatchAfterRecoveryGates({
      providerCompletion,
      waitForExpiry: async () => {
        const deadline = Date.now() + 45000;
        while (
          Date.parse(await clock()) < Date.parse(evidence.oldLease.expiresAt)
        ) {
          assert(Date.now() < deadline);
          await sleep(250);
        }
        evidence.successorDispatchDatabaseTime = await clock();
        assert(
          Date.parse(evidence.successorDispatchDatabaseTime) >=
            Date.parse(evidence.oldLease.expiresAt),
        );
      },
      dispatch: async () => {
        evidence.successorDispatchMonotonicMs = performance.now();
        if (mode === 'suspend')
          assert(
            evidence.staleProvider.completedMonotonicMs <=
              evidence.providerBytesHeldConfirmedMonotonicMs &&
              evidence.providerBytesHeldConfirmedMonotonicMs <=
                evidence.successorDispatchMonotonicMs,
            'actual completed provider bytes must be held before successor dispatch',
          );
        return managed(successorInput, 'after-expiry-successor');
      },
    });
    evidence.winnerCanonical = winner.canonical;
    evidence.winner = await contentState();
    assertCommittedPrefix(
      { state: evidence.baseline, canonical: evidence.seedCanonical },
      { state: evidence.winner, canonical: evidence.winnerCanonical },
    );
    assertCommittedPrefix(
      {
        state: evidence.beforeFailure,
        canonical: evidence.beforeFailureCanonical,
      },
      { state: evidence.winner, canonical: evidence.winnerCanonical },
    );
    assert.deepEqual(evidence.winner.humanContentHashes, [
      ...evidence.beforeFailure.humanContentHashes,
      sha256(stableStringify(followup.content)),
    ]);
    assert.equal(
      evidence.winner.providerIds.length,
      evidence.baseline.providerIds.length + 1,
    );
    assert.deepEqual(
      evidence.winner.providerIds.slice(
        0,
        evidence.baseline.providerIds.length,
      ),
      evidence.baseline.providerIds,
    );
    assert.equal(
      new Set(evidence.winner.providerIds).size,
      evidence.winner.providerIds.length,
    );
    assert(evidence.winner.caps.every((c) => c === 4096));
    if (mode === 'suspend') {
      assert(
        !evidence.winner.providerIds.includes(
          evidence.staleProvider.responseId,
        ),
      );
      await proxy.release();
      evidence.providerBytesReleasedMonotonicMs = performance.now();
      assert(worker.child.kill('SIGCONT'));
      evidence.ownerResumedMonotonicMs = performance.now();
      const completedSuccessor = evidence.attempts.find(
        (attempt) => attempt.label === 'after-expiry-successor',
      );
      assert(
        evidence.staleProvider.completedMonotonicMs <=
          completedSuccessor.dispatchMonotonicMs &&
          completedSuccessor.eofMonotonicMs <=
            evidence.providerBytesReleasedMonotonicMs &&
          evidence.providerBytesReleasedMonotonicMs <=
            evidence.ownerResumedMonotonicMs,
        'provider completion, successor EOF, delayed delivery and resume must retain approved order',
      );
      stopped = false;
      const terminal = await worker.wait((m) => m.event === 'terminal', 25000);
      evidence.ownerTerminal = terminal;
      evidence.ownerObservations = worker.events.filter((e) =>
        [
          'admission-abort',
          'provider-abort',
          'provider-completed-bytes-consumed',
          'provider-consumption-end',
        ].includes(e.event),
      );
      assert(
        terminal.admissionLossObserved,
        'admission abort/fencing required',
      );
      assert(
        terminal.recognizedTerminal && !terminal.unexplainedTerminal,
        'bounded terminal must be recognized admission loss',
      );
      evidence.operationAttribution =
        'Generic admission observer establishes ownership cancellation; it does not prove which checkpoint or write attempted a commit. Previously streamed owner bytes are permitted.';
    }
    evidence.immediate = await summary();
    assert.equal(evidence.immediate.admissions, 0);
    assert.deepEqual(evidence.immediate, evidence.winnerCanonical);
    assert.deepEqual(await contentState(), evidence.winner);
    await save();
    const quiescentAt = Date.now();
    await sleep(75000);
    evidence.quiescentElapsedMs = Date.now() - quiescentAt;
    assert(evidence.quiescentElapsedMs >= 75000);
    evidence.after75Seconds = await summary();
    assert.deepEqual(evidence.after75Seconds, evidence.immediate);
    assert.deepEqual(await contentState(), evidence.winner);
    evidence.checks = {
      ...evidence.checks,
      managed409WhollyBeforeNaturalExpiry: true,
      managedSuccessorAfterNaturalExpiry: true,
      committedPrefixPreserved: true,
      completeMessageAndCheckpointWritePrefixPreserved: true,
      ...(mode === 'suspend'
        ? { completedProviderBytesHeldBeforeSuccessor: true }
        : {}),
      latestFollowupExactlyOnce: true,
      pinnedSchema: true,
      cap4096: true,
      canonicalUnchangedAfter75Seconds: true,
      noAdmissionLeak: true,
    };
    evidence.safe = true;
    evidence.finishedAt = new Date().toISOString();
  } catch (error) {
    evidence.safe = false;
    evidence.error = {
      name: error.name,
      message: context.redact(error).message,
    };
    throw Error('runtime recovery failed; inspect private sanitized receipt');
  } finally {
    const errors = [];
    if (worker)
      await worker
        .close()
        .catch(() => errors.push('owned worker termination failed'));
    if (proxy)
      await proxy.close().catch(() => errors.push('proxy cleanup failed'));
    await bounded(saver.close(), 5000, 'saver close').catch(() =>
      errors.push('saver cleanup failed'),
    );
    await bounded(threads.close(), 5000, 'threads close').catch(() =>
      errors.push('threads cleanup failed'),
    );
    await bounded(pool.end(), 5000, 'pool close').catch(() =>
      errors.push('pool cleanup failed'),
    );
    if (context.databaseErrors.length)
      errors.push('database idle client error observed');
    evidence.databaseErrors = [...context.databaseErrors];
    evidence.cleanup = {
      ownedWorkerExited:
        !worker ||
        worker.child.exitCode !== null ||
        worker.child.signalCode !== null,
      proxyClosed: true,
      wasStopped: stopped,
      errors,
    };
    if (errors.length) evidence.safe = false;
    await save();
    if (errors.length) failure ??= Error('runtime cleanup failed');
  }
  if (failure) throw failure;
  return evidence;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runRuntimeRecovery(
      process.argv[2],
      JSON.parse(readFileSync(process.argv[3], 'utf8')),
      JSON.parse(readFileSync(process.argv[4], 'utf8')),
    );
  } catch {
    console.error(
      'readiness runtime failed; inspect private sanitized receipt',
    );
    process.exitCode = 1;
  }
}
