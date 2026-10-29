import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  canonicalStorageSummary,
  loadReadinessContext,
  readSseStream,
  resolveRuntimeDependency,
  sha256,
} from './common.mjs';
import { runLoadSchedule } from './load-scheduler.mjs';
import { createReadinessPool, readinessPoolErrors } from './owner-worker.mjs';

/** Execute one fresh real-model request; its first post-EOF DB operation is the admission snapshot. */
export async function runLoadRequest(args, dependencies) {
  const {
    origins,
    schema,
    validate,
    saver,
    snapshot,
    seenProviderIds,
    redact,
    fetchImpl = fetch,
  } = dependencies;
  const threadId = 'readiness-load-' + randomUUID(),
    runId = randomUUID(),
    marker = 'LOAD' + randomUUID().replaceAll('-', '').toUpperCase();
  const origin = origins[args.index % 2];
  const input = {
    threadId,
    runId,
    messages: [
      {
        id: randomUUID(),
        role: 'user',
        content:
          'In one short aviation sentence explain a callsign. Begin the sentence with reference marker ' +
          marker +
          '.',
      },
    ],
    tools: [],
    state: {},
    context: [],
    forwardedProps: { hashbrown: { responseSchema: schema } },
  };
  const receipt = {
    threadId,
    runId,
    markerSha256: sha256(marker),
    deploymentIndex: args.index % 2,
    runtimeErrors: [],
    providerThrottled: false,
  };
  const deadline = new AbortController(),
    remaining = Math.min(55000, args.deadlineMs - performance.now());
  assert(remaining > 0, 'load dispatch deadline already elapsed');
  const timer = setTimeout(
    () => deadline.abort(new Error('load dispatch deadline exceeded')),
    remaining,
  );
  const signal = AbortSignal.any([args.signal, deadline.signal]);
  let firstByte,
    firstContent,
    output = '';
  const dispatched = performance.now();
  try {
    const response = await fetchImpl(origin + '/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      redirect: 'error',
      signal,
    });
    receipt.status = response.status;
    receipt.retryAfter = response.headers.get('retry-after');
    receipt.providerThrottled = response.status === 429;
    receipt.cookieEstablished = response.headers
      .getSetCookie()
      .some((c) => c.startsWith('atc_visitor='));
    const stream = await readSseStream(response, {
      signal,
      timeoutMs: Math.max(1, args.deadlineMs - performance.now()),
      runId,
      threadId,
      redact,
      onChunk: () => {
        firstByte ??= performance.now() - dispatched;
      },
      onErrorEvent: (event) => {
        receipt.runtimeErrors.push(redact(event));
        receipt.providerThrottled ||= /rate.?limit|throttl|429/i.test(
          JSON.stringify(event),
        );
      },
      onEvent: (event) => {
        if (event.type === 'RUN_FINISHED') receipt.terminal = redact(event);
        if (event.type === 'TOOL_CALL_START')
          throw Error('unexpected tool call in load request');
        if (event.type === 'TEXT_MESSAGE_CONTENT') {
          firstContent ??= performance.now() - dispatched;
          assert.equal(typeof event.delta, 'string');
          output += event.delta;
        }
      },
    });
    const eof = performance.now();
    receipt.eofAtScheduleMs =
      args.scheduleStartedAt === undefined
        ? null
        : eof - args.scheduleStartedAt;
    receipt.totalMs = eof - dispatched;
    receipt.firstByteMs = firstByte ?? null;
    receipt.firstContentMs = firstContent ?? null;
    // No clock/database query or checkpoint lookup precedes this exact first post-EOF operation.
    receipt.canonical = await snapshot(threadId);
    receipt.firstPostEofAdmissions = receipt.canonical.admissions;
    assert.equal(
      receipt.firstPostEofAdmissions,
      0,
      'first post-EOF admission query must be zero without polling',
    );
    assert(receipt.canonical.threadPresent, 'canonical thread must exist');
    assert.equal(stream.terminal.type, 'RUN_FINISHED');
    assert.notEqual(stream.terminal.outcome?.type, 'cancelled');
    assert(
      receipt.cookieEstablished,
      'signed visitor cookie must be established',
    );
    assert(firstByte !== undefined && firstContent !== undefined);
    assert(validate(JSON.parse(output)), 'pinned structured schema must match');
    assert(
      output.includes(marker),
      'response correlation marker must match this thread',
    );
    assert(
      (output.match(/LOAD[A-F0-9]{32}/g) ?? []).every(
        (value) => value === marker,
      ),
      'foreign correlation marker in response',
    );
    const tuple = await saver.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: '' },
    });
    const messages = tuple?.checkpoint.channel_values.messages ?? [];
    const human = messages.filter((m) => m.type === 'human'),
      ai = messages.filter((m) => m.type === 'ai');
    assert.equal(human.length, 1);
    assert.equal(ai.length, 1);
    const textContent = (value) => {
      if (typeof value === 'string') return value;
      assert(
        Array.isArray(value) &&
          value.every(
            (part) => part.type === 'text' && typeof part.text === 'string',
          ),
        'canonical text content is unsupported',
      );
      return value.map((part) => part.text).join('');
    };
    const humanText = textContent(human[0].content),
      aiText = textContent(ai[0].content);
    for (const text of [humanText, aiText])
      assert(
        (text.match(/LOAD[A-F0-9]{32}/g) ?? []).every(
          (value) => value === marker,
        ),
        'foreign correlation marker in canonical content',
      );
    assert.equal(
      humanText,
      input.messages[0].content,
      'canonical human input must match',
    );
    assert.deepEqual(
      JSON.parse(aiText),
      JSON.parse(output),
      'canonical response must match validated stream',
    );
    assert.equal(ai[0].response_metadata?.max_output_tokens, 4096);
    const providerId = ai[0].response_metadata?.id;
    assert(typeof providerId === 'string' && providerId);
    assert(
      !seenProviderIds.has(providerId),
      'canonical provider response cannot be shared across fresh threads',
    );
    seenProviderIds.add(providerId);
    receipt.providerId = providerId;
    receipt.outputSha256 = sha256(output);
    receipt.pinnedCap = 4096;
    const usage = ai[0].usage_metadata ?? ai[0].response_metadata?.usage;
    signal.throwIfAborted();
    receipt.usage = usage
      ? Object.fromEntries(
          Object.entries(usage).filter(
            ([, value]) => typeof value === 'number' && Number.isFinite(value),
          ),
        )
      : null;
    return receipt;
  } catch (error) {
    const failure = new Error(
      'load request failed: ' + String(redact(error)?.message ?? redact(error)),
    );
    failure.receipt = receipt;
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

/** Count actual response EOF completions in a schedule window, excluding subsequent DB verification. */
export function completionCountInWindow(attempts, lower, upper) {
  return attempts.filter(
    (a) =>
      a.status === 'passed' &&
      Number.isFinite(a.result?.eofAtScheduleMs) &&
      a.result.eofAtScheduleMs >= lower &&
      a.result.eofAtScheduleMs < upper,
  ).length;
}

function percentile(values, p) {
  const sorted = values
    .filter((v) => typeof v === 'number')
    .sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
}

/** Run the fixed approved load envelope after validating independent deployment/source evidence. */
export async function runLoad(options, expected) {
  const schemaBytes = readFileSync(options.schemaPath);
  assert.equal(sha256(schemaBytes), expected.schemaSha256);
  const schema = JSON.parse(schemaBytes);
  const require = createRequire(
      resolveRuntimeDependency(options.runtimeRoot, 'ajv'),
    ),
    Ajv = require('ajv');
  const validate = new Ajv({ strict: false }).compile(schema);
  const manifestSha256 = sha256(readFileSync(options.manifestPath));
  let storage;
  const phaseAbort = new AbortController();
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
      return createReadinessPool(storage, databaseUrl, 8, () =>
        phaseAbort.abort(new Error('database-idle-error')),
      );
    },
  });
  const pool = context.database;
  let saver, threads, dependencies;
  const started = performance.now(),
    phaseDeadline = started + 1200000,
    owned = new Set();
  const evidence = {
    startedAt: new Date().toISOString(),
    version: context.manifest.version,
    sourceCommit: context.manifest.sourceCommit,
    manifestSha256,
    limits: {
      levels: [1, 2, 4],
      stageDurationMs: 300000,
      minStartGapMs: 20000,
      maxAttempts: 120,
      requestTimeoutMs: 55000,
      phaseTimeoutMs: 1200000,
    },
    deployments: context.manifest.deployments,
    failedRequests: [],
    status: 'running',
  };
  const file = join(options.stagingDirectory, 'load-' + randomUUID() + '.json');
  const save = () =>
    writeFileSync(
      file,
      JSON.stringify(context.redact(evidence), null, 2) + '\n',
      { mode: 0o600 },
    );
  const snapshot = (threadId) =>
    canonicalStorageSummary({
      pool,
      saver,
      threadStore: threads,
      threadId,
      tablePrefix: 'atc',
    });

  async function bounded(promise, milliseconds) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error('load phase deadline exceeded')),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const run = (args) => {
    const promise = runLoadRequest(args, dependencies).catch((error) => {
      evidence.failedRequests.push({
        index: args.index,
        error: context.redact(error),
        receipt: error.receipt,
      });
      save();
      throw error;
    });
    owned.add(promise);
    promise.then(
      () => owned.delete(promise),
      () => owned.delete(promise),
    );
    return promise;
  };
  try {
    saver = storage.postgresCheckpointer({
      pool,
      tablePrefix: 'atc',
      assumeMigrated: true,
    });
    threads = storage.createPostgresThreadsStore({
      pool,
      tablePrefix: 'atc',
      assumeMigrated: true,
    });
    dependencies = {
      origins: context.manifest.deployments.map((d) => d.origin),
      schema,
      validate,
      saver,
      snapshot,
      seenProviderIds: new Set(),
      redact: context.redact,
    };
    save();
    evidence.schedule = await runLoadSchedule({
      run,
      signal: phaseAbort.signal,
      sanitizeError: (error) => context.redact(error),
      onUpdate: (state) => {
        evidence.schedule = state;
        save();
      },
    });
    evidence.status = evidence.schedule.status;
    const completed = evidence.schedule.attempts.filter(
      (a) => a.status === 'passed',
    );
    evidence.metrics = [1, 2, 4].map((level) => {
      const attempts = evidence.schedule.attempts.filter(
          (a) => a.level === level,
        ),
        passed = attempts.filter((a) => a.status === 'passed'),
        values = passed.map((a) => a.result.totalMs);
      const lower = level === 1 ? 0 : level === 2 ? 300000 : 600000;
      const completedDuringLevel = completionCountInWindow(
        completed,
        lower,
        lower + 300000,
      );
      return {
        level,
        attempted: attempts.length,
        finished: passed.length,
        failed: attempts.length - passed.length,
        startsPerSecond: attempts.length / 300,
        completedDuringLevel,
        completionsPerScheduledSecond: completedDuringLevel / 300,
        completionMs: {
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          max: percentile(values, 1),
        },
        firstByteMs: {
          p50: percentile(
            passed.map((a) => a.result.firstByteMs),
            0.5,
          ),
          p95: percentile(
            passed.map((a) => a.result.firstByteMs),
            0.95,
          ),
        },
        firstContentMs: {
          p50: percentile(
            passed.map((a) => a.result.firstContentMs),
            0.5,
          ),
          p95: percentile(
            passed.map((a) => a.result.firstContentMs),
            0.95,
          ),
        },
      };
    });
    save();
    if (evidence.status !== 'passed')
      throw Error('scheduled load did not complete successfully');
    assert(completed.length > 0);
    assert(
      performance.now() + 75000 < phaseDeadline,
      'remaining phase budget cannot accommodate the required settled snapshot',
    );
    await delay(75000);
    for (const attempt of completed) {
      const after = await bounded(
        snapshot(attempt.result.threadId),
        Math.max(1, phaseDeadline - performance.now()),
      );
      assert.deepEqual(
        after,
        attempt.result.canonical,
        'canonical state changed after settled interval',
      );
      attempt.result.settledCanonical = after;
    }
    evidence.settledAfterMs = performance.now() - started;
    assert(evidence.settledAfterMs <= 1200000);
    evidence.status = 'passed';
    evidence.finishedAt = new Date().toISOString();
    save();
  } catch (error) {
    evidence.status =
      evidence.status === 'incomplete' ? 'incomplete' : 'failed';
    evidence.error = context.redact(error);
    save();
  } finally {
    const errors = [];
    try {
      await bounded(Promise.allSettled([...owned]), 15000);
    } catch {
      errors.push('owned request drain deadline exceeded');
    }
    for (const close of [
      () => saver?.close(),
      () => threads?.close(),
      () => pool.end(),
    ]) {
      try {
        await bounded(close(), 20000);
      } catch {
        errors.push('owned pool/store close failed');
      }
    }
    evidence.databaseErrors = readinessPoolErrors(pool);
    if (evidence.databaseErrors.length)
      errors.push('owned database emitted idle-client errors');
    evidence.cleanup = { ownedRequestsSettled: owned.size === 0, errors };
    if (errors.length || owned.size) evidence.status = 'failed';
    save();
  }
  return {
    status: evidence.status,
    receiptPath: file,
    attempted: evidence.schedule?.attempts?.length ?? 0,
    completed:
      evidence.schedule?.attempts?.filter((a) => a.status === 'passed')
        .length ?? 0,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await runLoad(
      JSON.parse(readFileSync(process.argv[2], 'utf8')),
      JSON.parse(readFileSync(process.argv[3], 'utf8')),
    );
    console.log(JSON.stringify(result));
    if (result.status !== 'passed') process.exitCode = 1;
  } catch {
    console.error(
      'Load initialization/execution failed; inspect private sanitized receipts',
    );
    process.exitCode = 1;
  }
}
