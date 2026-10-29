/** Managed timeout qualification. Importing this module performs no IO or hosted requests. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  sha256,
  stableStringify,
  createRedactor,
  hashTree,
} from './common.mjs';
import { assertCommittedPrefix } from './runtime-recovery.mjs';
import { withRolloutRun, verifyTimeoutVariant } from './rollout-controls.mjs';
import { createManagedTimeoutIO, timeoutBound } from './managed-timeout-io.mjs';

/** Accept only exact owned request/deployment log evidence, never client cancellation. */
export function validatePlatformTimeoutProof(proof, request, deployment) {
  return Boolean(
    proof &&
    !request.clientAborted &&
    request.requestId &&
    proof.source === 'owned-deployment-request-logs' &&
    proof.deploymentId === deployment.id &&
    proof.origin === deployment.origin &&
    proof.requestId === request.requestId &&
    proof.code === 'FUNCTION_INVOCATION_TIMEOUT' &&
    Number.isFinite(proof.timestampMs) &&
    proof.timestampMs >= request.startedAtMs &&
    proof.timestampMs <= request.endedAtMs,
  );
}

/** Execute one timeout attempt under caller-owned durable request and spend controls. */
export async function runTimeoutProtocol({
  control,
  io,
  platformProof,
  receipt = {},
}) {
  const threadId = io.threadId ?? 'readiness-timeout-' + randomUUID();
  receipt.attempts ??= [];
  const dispatch = (kind, operation) => {
    const id = randomUUID();
    return control.dispatch(
      { phase: 'timeout', id, threadId, kind },
      async (bounds) => {
        const attempt = {
          id,
          ordinal: bounds.ordinal,
          kind,
          terminalUsage: null,
          providerUsage: null,
        };
        receipt.attempts.push(attempt);
        const result = await operation(bounds);
        const request = result.request ?? result;
        for (const key of [
          'runId',
          'status',
          'requestId',
          'terminalUsage',
          'terminalModel',
          'terminalProviderResponseId',
        ]) {
          if (request[key] !== undefined) attempt[key] = request[key];
        }
        attempt.providerUsage = request.snapshot?.state.providerUsage ?? null;
        attempt.outcome = result.outcome;
        return result;
      },
    );
  };
  const normal = async (input) =>
    dispatch('normal', async (bounds) => {
      const result = await io.request('normal', { ...bounds, threadId, input });
      assert.equal(
        result.snapshot.canonical.admissions,
        0,
        'first post-EOF admissions must be zero',
      );
      assert(result.snapshot.canonical.threadPresent);
      assert(result.snapshot.state.caps.every((cap) => cap === 4096));
      return { outcome: 'passed', ...result };
    });
  receipt.threadId = threadId;
  const seed = await normal('seed');
  receipt.seed = seed.snapshot;
  assert.equal(seed.snapshot.state.humanContentHashes.length, 1);
  assert.equal(seed.snapshot.state.providerIds.length, 1);
  let observed;
  const fault = await dispatch('fault', async (bounds) => {
    let settled = false;
    const pending = io
      .request('fault', { ...bounds, threadId, input: 'fault' })
      .finally(() => {
        settled = true;
      });
    // Attach immediately: early HTTP failure must not become an unhandled rejection.
    pending.catch(() => undefined);
    observed = await io.observePending({
      ...bounds,
      threadId,
      settled: () => settled,
      baseline: seed.snapshot,
    });
    receipt.observedOwner = observed ?? null;
    const request = await pending;
    receipt.faultRequest = request;
    const proof = await timeoutBound(
      (signal) =>
        platformProof({
          ...bounds,
          signal,
          deployment: io.deployment,
          request,
        }),
      bounds,
    );
    receipt.platformProof = proof
      ? Object.fromEntries(
          [
            'source',
            'deploymentId',
            'origin',
            'requestId',
            'code',
            'timestampMs',
          ].map((key) => [key, proof[key]]),
        )
      : null;
    const qualified =
      !request.completed &&
      observed &&
      validatePlatformTimeoutProof(proof, request, io.deployment);
    return {
      outcome: qualified ? 'expected-failure' : 'inconclusive',
      request,
      qualified,
    };
  });
  if (!fault.qualified) {
    receipt.classification = 'inconclusive';
    return receipt;
  }
  assertCommittedPrefix(seed.snapshot, observed.snapshot);
  assert.deepEqual(
    observed.snapshot.state.providerIds,
    seed.snapshot.state.providerIds,
  );
  receipt.observedOwner = observed;
  const bounds = {
    signal: control.signal,
    deadlineMs: control.deadlineMs,
    threadId,
  };
  const retained = await io.lease(bounds);
  if (retained) {
    assert.equal(
      retained.ownerSha256,
      observed.lease.ownerSha256,
      'unexpected owner changed',
    );
    assert(
      Date.parse(retained.databaseNow) < Date.parse(retained.expiresAt),
      'lease expired before conflict could be observed',
    );
    const conflict = await dispatch('conflict', async (requestBounds) => {
      const before = await io.clock({ ...bounds, ...requestBounds });
      const response = await io.request('conflict', {
        ...bounds,
        ...requestBounds,
        input: 'followup',
      });
      const after = await io.clock({ ...bounds, ...requestBounds });
      assert.equal(response.status, 409);
      assert.equal(response.retryAfter, '1');
      assert(
        Date.parse(before) < Date.parse(retained.expiresAt) &&
          Date.parse(after) < Date.parse(retained.expiresAt),
        'conflict must finish wholly before DB expiry',
      );
      return { outcome: 'expected-failure', before, after };
    });
    receipt.conflict = conflict;
    await io.waitForExpiry({ ...bounds, lease: retained });
    receipt.classification = 'orphan-lease-recovered';
  } else receipt.classification = 'graceful-timeout-cleanup';
  const beforeSuccessor = await io.snapshot(bounds);
  assertCommittedPrefix(observed.snapshot, beforeSuccessor);
  assert.deepEqual(
    beforeSuccessor.state.providerIds,
    seed.snapshot.state.providerIds,
    'fault provider response unexpectedly persisted',
  );
  const winner = await normal('followup');
  assertCommittedPrefix(seed.snapshot, winner.snapshot);
  assertCommittedPrefix(beforeSuccessor, winner.snapshot);
  assert.deepEqual(winner.snapshot.state.humanContentHashes, [
    ...beforeSuccessor.state.humanContentHashes,
    io.inputHash('followup'),
  ]);
  assert.deepEqual(
    winner.snapshot.state.providerIds.slice(
      0,
      seed.snapshot.state.providerIds.length,
    ),
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
  const elapsed = await io.waitQuiescent(bounds);
  assert(elapsed >= 75000);
  receipt.after75Seconds = await io.snapshot(bounds);
  assert.deepEqual(
    receipt.after75Seconds,
    winner.snapshot,
    'full canonical/physical history changed after 75 seconds',
  );
  receipt.qualified = true;
  return receipt;
}

async function verifyCompleteOutputCopy(normalRoot, faultRoot) {
  async function entries(root, path = root) {
    const info = await lstat(path);
    assert(
      !info.isSymbolicLink() &&
        (info.isDirectory() || (info.isFile() && info.nlink === 1)),
      'unsupported output entry',
    );
    const name = relative(root, path);
    const row = {
      name,
      mode: info.mode & 0o7777,
      directory: info.isDirectory(),
    };
    if (info.isFile()) row.bytes = await readFile(path);
    return [
      row,
      ...(info.isDirectory()
        ? (
            await Promise.all(
              (await readdir(path))
                .sort()
                .map((child) => entries(root, join(path, child))),
            )
          ).flat()
        : []),
    ];
  }
  const normal = await entries(normalRoot);
  const fault = await entries(faultRoot);
  assert.equal(fault.length, normal.length);
  for (const [index, row] of normal.entries()) {
    const other = fault[index];
    assert.deepEqual(
      { ...row, bytes: undefined },
      { ...other, bytes: undefined },
      'full output path/mode mismatch',
    );
    if (!row.bytes) continue;
    const expectedBytes =
      row.name === 'functions/api/run.func/.vc-config.json'
        ? Buffer.from(
            row.bytes
              .toString('utf8')
              .replace(/("maxDuration"\s*:\s*)60\b/g, '$11'),
          )
        : row.bytes;
    assert(
      expectedBytes.equals(other.bytes),
      'full output differs outside timeout config',
    );
  }
}

/** Validate independently reviewed fault provenance and the strict raw-tree variant before opening a pool. */
export async function preflightManagedTimeout(options, expected) {
  assert(
    expected.fault && options.faultManifest,
    'separate expected fault provenance required',
  );
  assert.equal(
    stableStringify(options.faultManifest),
    stableStringify(expected.fault),
    'fault candidate differs from independent expected',
  );
  const fault = expected.fault;
  assert.equal(fault.sourceCommit, expected.sourceCommit);
  assert.deepEqual(fault.project, expected.project);
  assert.equal(typeof fault.deployment.id, 'string');
  assert(fault.deployment.id.length > 0);
  assert.equal(fault.deployment.target, 'preview');
  assert.equal(fault.deployment.readyState, 'READY');
  const url = new URL(fault.deployment.origin);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, fault.deployment.origin);
  assert(!url.username && !url.password);
  assert(
    expected.deployments.every(
      (deployment) =>
        deployment.id !== fault.deployment.id &&
        deployment.origin !== fault.deployment.origin,
    ),
  );
  assert.equal(
    sha256(await readFile(options.schemaPath)),
    expected.schemaSha256,
  );
  await verifyCompleteOutputCopy(
    options.outputTreePath,
    options.faultOutputTreePath,
  );
  const variant = await verifyTimeoutVariant(
    options.functionTreePath,
    options.faultFunctionTreePath,
  );
  for (const key of Object.keys(variant))
    assert.equal(variant[key], fault[key], 'fault raw-tree digest mismatch');
  assert.equal(variant.normalTreeSha256, expected.functionTreeSha256);
  assert.equal(
    sha256(await readFile(options.faultArtifactPath)),
    expected.artifactSha256,
    'fault runtime artifact differs',
  );
  assert.equal(fault.artifactSha256, expected.artifactSha256);
  assert.equal(
    await hashTree(options.faultOutputTreePath),
    fault.outputTreeSha256,
    'fault full output tree differs',
  );
  return variant;
}

/** Run through reviewed caller spend/log adapters; always return a sanitized, truthful partial receipt. */
export async function runManagedTimeout(options, expected, adapters) {
  assert.equal(
    typeof adapters?.platformProof,
    'function',
    'reviewed exact-request platform logs adapter required',
  );
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
      (stage.mode & 0o777) === 0o700,
    'private staging directory required',
  );
  const receipt = {
    status: 'incomplete',
    phase: 'timeout',
    qualified: false,
    classification: 'incomplete',
    cleanup: { errors: [] },
  };
  let io;
  let redact = createRedactor();
  const cleanup = async () => {
    if (receipt.cleanup.errors.length)
      throw Error('initialization cleanup failed');
    if (io) await io.close();
    receipt.cleanup.closed = true;
  };
  try {
    await preflightManagedTimeout(options, expected);
    await withRolloutRun(
      options.stagingDirectory,
      adapters.expectedBudget,
      {
        runId: adapters.runId,
        phase: 'timeout',
        observationSource: adapters.observationSource,
        cleanup: async () => {
          try {
            await cleanup();
          } catch {
            receipt.cleanup.errors.push('owned HTTP/storage cleanup failed');
            throw Error('timeout cleanup failed');
          }
        },
      },
      async (control) => {
        try {
          io = await createManagedTimeoutIO(options, expected, control);
        } catch (error) {
          if (error.cleanupFailed)
            receipt.cleanup.errors.push(
              'partial initialization cleanup failed',
            );
          throw error;
        }
        redact = (value) => io.redact(value);
        await runTimeoutProtocol({
          control,
          io,
          platformProof: adapters.platformProof,
          receipt,
        });
      },
    );
    receipt.status = receipt.qualified ? 'qualified' : 'inconclusive';
  } catch (error) {
    receipt.status = 'failed';
    receipt.qualified = false;
    receipt.error = redact(error).message;
    receipt.classification =
      receipt.classification === 'incomplete'
        ? 'failed'
        : receipt.classification;
  }
  const sanitized = redact(receipt);
  await writeFile(
    join(
      options.stagingDirectory,
      'managed-timeout-' + adapters.runId + '.json',
    ),
    JSON.stringify(sanitized, null, 2) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return sanitized;
}
