/** Real HTTP/Postgres boundary for managed timeout qualification; no IO on import. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { storageContext } from './storage.mjs';
import {
  canonicalStorageSummary,
  resolveRuntimeDependency,
  readSseStream,
  sha256,
  stableStringify,
  createRedactor,
} from './common.mjs';
import {
  assertCommittedPrefix,
  messageRecordHashes,
  physicalHistoryRecords,
  ownerInputCommitObserved,
} from './runtime-recovery.mjs';

// Retain actual numeric provider counters (including nested token details), never manufacture zeros.
function numericUsage(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(numericUsage);
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, numericUsage(item)])
      .filter(([, item]) => item !== null),
  );
}

/** Bound every HTTP drain, storage read and wait to the enclosing reviewed control. */
export async function timeoutBound(operation, { signal, deadlineMs }) {
  signal?.throwIfAborted();
  const remaining = deadlineMs - Date.now();
  assert(remaining > 0, 'timeout control deadline exhausted');
  const boundedSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(remaining),
  ]);
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(Error('timeout control cancelled/deadline exhausted'));
    boundedSignal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(boundedSignal)),
      cancelled,
    ]);
  } finally {
    boundedSignal.removeEventListener('abort', abort);
  }
}

/** Open guarded actual storage and managed HTTP clients, closing partial initialization on failure. */
export async function createManagedTimeoutIO(
  options,
  expected,
  control,
  dependencies = {},
) {
  let context, saver, threads;
  const controllers = new Set();
  const threadId = 'readiness-managed-timeout-' + randomUUID();
  const history = [];
  const modelFragments = [];
  const inputs = Object.fromEntries(
    ['seed', 'fault', 'followup'].map((kind) => [
      kind,
      {
        id: randomUUID(),
        role: 'user',
        content: `readiness ${randomUUID()}: ${kind === 'fault' ? 'Explain aircraft altimetry in about 250 words.' : 'Define aircraft callsign in one short sentence.'} Use prose only.`,
      },
    ]),
  );
  let cookie;
  let redact = createRedactor();
  const close = async () => {
    for (const controller of controllers) controller.abort();
    const failures = [];
    // Teardown must still run after phase expiry/abort. Each resource gets a fresh
    // five-second grace; one stalled close cannot prevent attempting later closes.
    // The enclosing rollout control still rejects an expired phase.
    for (const resource of [saver, threads, context?.database]) {
      if (!resource) continue;
      try {
        await timeoutBound(
          () => (resource.end ? resource.end() : resource.close()),
          { deadlineMs: Date.now() + 5000 },
        );
      } catch {
        failures.push('owned resource close failed');
      }
    }
    assert.equal(
      context?.databaseErrors?.length ?? 0,
      0,
      'database idle error observed',
    );
    assert.equal(failures.length, 0, failures.join('; '));
  };
  try {
    const schema = JSON.parse(await readFile(options.schemaPath, 'utf8'));
    const compileSchema =
      dependencies.compileSchema ??
      ((value) => {
        const Ajv = createRequire(
          resolveRuntimeDependency(options.runtimeRoot, 'ajv'),
        )('ajv');
        return new Ajv({ strict: false }).compile(value);
      });
    const validate = compileSchema(schema);
    // Assign inside the promise so a deadline cannot lose ownership of a late-created pool.
    const opening = Promise.resolve()
      .then(() =>
        (dependencies.openContext ?? storageContext)(options, expected),
      )
      .then(async (opened) => {
        context = opened;
        if (control.signal.aborted || Date.now() >= control.deadlineMs) {
          await opened.database.end();
          throw Error('storage initialization exceeded timeout control');
        }
        return opened;
      });
    context = await timeoutBound(() => opening, control);
    redact = context.redact;
    saver = context.storage.postgresCheckpointer({
      pool: context.database,
      tablePrefix: 'atc',
    });
    threads = context.storage.createPostgresThreadsStore({
      pool: context.database,
      tablePrefix: 'atc',
    });
    const query = (sql, values, bounds) =>
      timeoutBound(() => context.database.query(sql, values), bounds);
    const snapshot = async (bounds) => {
      const canonical = await timeoutBound(
        () =>
          canonicalStorageSummary({
            pool: context.database,
            saver,
            threadStore: threads,
            threadId,
            tablePrefix: 'atc',
          }),
        bounds,
      );
      const tuple = await timeoutBound(
        () =>
          saver.getTuple({
            configurable: { thread_id: threadId, checkpoint_ns: '' },
          }),
        bounds,
      );
      const checkpoints = await query(
        'select thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,type,checkpoint,metadata from atc_checkpoints where thread_id=$1',
        [threadId],
        bounds,
      );
      const writes = await query(
        'select thread_id,checkpoint_ns,checkpoint_id,task_id,idx,channel,type,value from atc_writes where thread_id=$1',
        [threadId],
        bounds,
      );
      const messages = tuple?.checkpoint.channel_values.messages ?? [];
      const ai = messages.filter((message) => message.type === 'ai');
      return {
        canonical,
        state: {
          messageSha256s: messageRecordHashes(messages),
          ...physicalHistoryRecords(checkpoints.rows, writes.rows),
          humanContentHashes: messages
            .filter((message) => message.type === 'human')
            .map((message) => sha256(stableStringify(message.content))),
          providerIds: ai
            .map((message) => message.response_metadata?.id)
            .filter(Boolean),
          providerUsage: ai.map((message) => ({
            responseId: message.response_metadata?.id ?? null,
            model:
              message.response_metadata?.model_name ??
              message.response_metadata?.model ??
              null,
            usage: numericUsage(
              message.usage_metadata ?? message.response_metadata?.usage,
            ),
          })),
          caps: ai.map(
            (message) => message.response_metadata?.max_output_tokens,
          ),
        },
      };
    };
    const lease = async (bounds) => {
      const result = await query(
        'select owner_token,expires_at,clock_timestamp() as now from atc_run_admissions where thread_id=$1',
        [threadId],
        bounds,
      );
      const row = result.rows[0];
      return row
        ? {
            ownerSha256: sha256(row.owner_token),
            expiresAt: new Date(row.expires_at).toISOString(),
            databaseNow: new Date(row.now).toISOString(),
          }
        : null;
    };
    const clock = async (bounds) =>
      new Date(
        (await query('select clock_timestamp() as now', [], bounds)).rows[0]
          .now,
      ).toISOString();
    const request = async (kind, bounds) => {
      const controller = new AbortController();
      controllers.add(controller);
      const signal = AbortSignal.any([bounds.signal, controller.signal]);
      const runId = bounds.runId ?? randomUUID();
      const origin =
        kind === 'fault'
          ? expected.fault.deployment.origin
          : context.manifest.deployments[0].origin;
      const body = {
        threadId,
        runId,
        messages: [...history, inputs[bounds.input]],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { hashbrown: { responseSchema: schema } },
      };
      const result = {
        runId,
        ordinal: bounds.ordinal ?? null,
        terminalUsage: null,
        startedAtMs: Date.now(),
        completed: false,
        clientAborted: false,
      };
      let readingTransport = true;
      try {
        const response = await timeoutBound(
          (boundedSignal) =>
            fetch(origin + '/api/run', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(cookie ? { cookie } : {}),
              },
              body: JSON.stringify(body),
              redirect: 'error',
              signal: boundedSignal,
            }),
          { ...bounds, signal },
        );
        result.status = response.status;
        result.requestId = response.headers.get('x-vercel-id');
        result.platformErrorCode = response.headers.get('x-vercel-error');
        result.retryAfter = response.headers.get('retry-after');
        result.throttled = response.status === 429;
        if (kind === 'conflict') {
          await timeoutBound(() => response.body?.cancel(), bounds);
          return result;
        }
        if (!cookie) {
          cookie = response.headers
            .getSetCookie()
            .find((value) => value.startsWith('atc_visitor='))
            ?.split(';')[0];
          assert(cookie, 'signed visitor cookie required');
          redact = createRedactor([
            ...Object.values(context.secrets),
            cookie,
            ...Object.values(inputs).map((input) => input.content),
          ]);
        }
        if (!response.ok) {
          // Retain an error body digest, never model or cookie text. Bound bytes and cancel remainder.
          const reader = response.body?.getReader();
          const bytes = [];
          let count = 0;
          try {
            while (reader && count < 8192) {
              const chunk = await timeoutBound(() => reader.read(), bounds);
              if (chunk.done) break;
              bytes.push(Buffer.from(chunk.value).subarray(0, 8192 - count));
              count += chunk.value.length;
            }
          } finally {
            await timeoutBound(() => reader?.cancel(), bounds);
          }
          const errorBytes = Buffer.concat(bytes);
          result.throttled ||=
            /rate_limit_exceeded|insufficient_quota|too_many_requests|throttl(?:ed|ing)|overloaded_error/i.test(
              (result.platformErrorCode ?? '') +
                '\n' +
                errorBytes.toString('utf8'),
            );
          result.errorBodySha256 = sha256(errorBytes);
          result.errorBodyTruncated = count >= 8192;
          return result;
        }
        const events = [];
        await readSseStream(response, {
          signal,
          timeoutMs: Math.max(1, bounds.deadlineMs - Date.now()),
          threadId,
          runId,
          redact,
          onEvent: (event) => {
            events.push(event);
            if (event.type === 'RUN_FINISHED') {
              result.terminalUsage = numericUsage(
                event.usage ?? event.usageMetadata ?? event.usage_metadata,
              );
              result.terminalModel = event.model ?? null;
              result.terminalProviderResponseId =
                event.responseId ?? event.providerResponseId ?? null;
            }
            if (event.type === 'TEXT_MESSAGE_CONTENT' && event.delta) {
              modelFragments.push(event.delta);
              redact = createRedactor([
                ...Object.values(context.secrets),
                cookie,
                ...modelFragments,
                modelFragments.join(''),
                ...Object.values(inputs).map((input) => input.content),
              ]);
            }
          },
        });
        // This starts with the exact admissions snapshot. No clock or post-EOF poll precedes it.
        readingTransport = false;
        result.snapshot = await snapshot(bounds);
        assert.equal(
          result.snapshot.canonical.admissions,
          0,
          'first post-EOF admissions must be zero',
        );
        const text = events
          .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
          .map((event) => event.delta ?? '')
          .join('');
        redact = createRedactor([
          ...Object.values(context.secrets),
          cookie,
          text,
          ...modelFragments,
          ...Object.values(inputs).map((input) => input.content),
        ]);
        assert(validate(JSON.parse(text)), 'output must match pinned schema');
        const id = events.find(
          (event) => event.type === 'TEXT_MESSAGE_START',
        )?.messageId;
        assert(id);
        history.push(inputs[bounds.input], {
          id,
          role: 'assistant',
          content: text,
        });
        redact = createRedactor([
          ...Object.values(context.secrets),
          cookie,
          text,
          ...modelFragments,
          ...Object.values(inputs).map((input) => input.content),
        ]);
        result.completed = true;
        return result;
      } catch (error) {
        result.clientAborted =
          signal.aborted || Date.now() >= bounds.deadlineMs;
        if (
          kind !== 'fault' ||
          !readingTransport ||
          (!['TypeError', 'AbortError', 'TimeoutError'].includes(error.name) &&
            !/SSE (incomplete frame at EOF|missing terminal|aborted|timeout)$|timeout control cancelled/.test(
              error.message,
            ))
        )
          throw error;
        result.transportFailure = error.name;
        return result;
      } finally {
        result.endedAtMs = Date.now();
        controller.abort();
        controllers.delete(controller);
      }
    };
    return {
      threadId,
      deployment: expected.fault.deployment,
      request,
      snapshot,
      lease,
      clock,
      close,
      get redact() {
        return redact;
      },
      inputHash: (kind) => sha256(stableStringify(inputs[kind].content)),
      observePending: async (bounds) => {
        while (!bounds.settled()) {
          const owner = await lease(bounds);
          if (bounds.settled()) return null;
          if (
            owner &&
            Date.parse(owner.databaseNow) < Date.parse(owner.expiresAt)
          ) {
            const current = await snapshot(bounds);
            assertCommittedPrefix(bounds.baseline, current);
            if (bounds.settled()) return null;
            if (
              ownerInputCommitObserved(
                bounds.baseline.state,
                current.state,
                sha256(stableStringify(inputs.fault.content)),
              )
            ) {
              history.push(inputs.fault);
              return { lease: owner, snapshot: current };
            }
          }
          await timeoutBound(
            (signal) => delay(25, undefined, { signal }),
            bounds,
          );
        }
        return null;
      },
      waitForExpiry: async (bounds) => {
        while (
          Date.parse(await clock(bounds)) < Date.parse(bounds.lease.expiresAt)
        )
          await timeoutBound(
            (signal) => delay(100, undefined, { signal }),
            bounds,
          );
      },
      waitQuiescent: async (bounds) => {
        const start = performance.now();
        await timeoutBound(
          (signal) => delay(75000, undefined, { signal }),
          bounds,
        );
        return performance.now() - start;
      },
    };
  } catch (error) {
    try {
      await close();
    } catch {
      throw Object.assign(
        Error('owned resource close failed during initialization'),
        { cleanupFailed: true },
      );
    }
    throw Error(redact(error).message);
  }
}
