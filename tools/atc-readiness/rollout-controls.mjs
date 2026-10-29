/** Import-safe, offline controls. Expected approval and adapter review are independent operator inputs. */
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { hashTree, sha256, stableStringify } from './common.mjs';

const SOURCE = 'a2f92a4f02ab1dfc38051a44e509afb439634793';
const CAPS = Object.freeze({ timeout: 6, restart: 6, rollback: 4 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const FILE = 'rollout-budget.json';
const fail = (reason) => {
  throw new Error('Rollout ' + reason);
};
const same = (a, b) => stableStringify(a) === stableStringify(b);
const positive = (n) => Number.isFinite(n) && n > 0;
const keys = (value, names) =>
  value &&
  typeof value === 'object' &&
  Object.keys(value).sort().join(',') === names.split(',').sort().join(',');

function privateStat(info, directory = false) {
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (info.mode & 0o7777) !== (directory ? 0o700 : 0o600) ||
    info.uid !== process.getuid() ||
    (!directory && info.nlink !== 1)
  )
    fail('private file/directory required');
}

function privateOpen(path, flags) {
  const before = lstatSync(path);
  privateStat(before);
  const fd = openSync(path, flags | constants.O_NOFOLLOW);
  try {
    const after = fstatSync(fd);
    privateStat(after);
    if (before.dev !== after.dev || before.ino !== after.ino)
      fail('private file changed');
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function bytes(path) {
  const fd = privateOpen(path, constants.O_RDONLY);
  try {
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

function syncDirectory(stage) {
  const fd = openSync(stage, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    privateStat(fstatSync(fd), true);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function lock(stage) {
  privateStat(lstatSync(stage), true);
  const path = join(stage, 'rollout-budget.lock');
  let fd;
  try {
    fd = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch {
    fail('locked or lock unavailable');
  }
  try {
    privateStat(fstatSync(fd));
    fsyncSync(fd);
    syncDirectory(stage);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return (retain = false) => {
    closeSync(fd);
    if (!retain) {
      unlinkSync(path);
      syncDirectory(stage);
    }
  };
}

function parse(raw, reason) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(reason);
  }
}

function validateExpected(expected) {
  if (
    !keys(expected, 'source,capUsd,runtimeSource,prior,spend') ||
    typeof expected.source !== 'string' ||
    !expected.source.trim() ||
    !positive(expected.capUsd) ||
    expected.runtimeSource !== SOURCE
  )
    fail('approval expected identity/spend invalid');
  if (!keys(expected.prior, 'load,recovery')) fail('prior bindings invalid');
  for (const [name, count, limit] of [
    ['load', 99, 120],
    ['recovery', 10, 16],
  ]) {
    const binding = expected.prior[name];
    if (
      !keys(binding, 'path,sha256,count') ||
      typeof binding.path !== 'string' ||
      !HASH.test(binding.sha256) ||
      binding.count !== count
    )
      fail('prior binding invalid');
    const actual = bytes(binding.path);
    if (sha256(actual) !== binding.sha256) fail('prior digest mismatch');
    const prior = parse(actual, 'prior ledger malformed');
    if (
      prior.limit !== limit ||
      !Array.isArray(prior.attempts) ||
      prior.attempts.length !== count ||
      prior.attempts.some((row, i) => row?.ordinal !== i + 1)
    )
      fail('prior count/ordinal mismatch');
  }
  const spend = expected.spend;
  if (
    !keys(
      spend,
      'source,scope,adapterPath,adapterSha256,review,maxAgeMs,reserveUsd,maxUpstreamRetries,costPerAttemptUsd',
    ) ||
    !spend.source ||
    !spend.scope ||
    !HASH.test(spend.adapterSha256) ||
    !positive(spend.maxAgeMs) ||
    spend.maxAgeMs > 60000 ||
    !positive(spend.reserveUsd) ||
    !positive(spend.costPerAttemptUsd) ||
    !Number.isSafeInteger(spend.maxUpstreamRetries) ||
    spend.maxUpstreamRetries < 0 ||
    spend.reserveUsd <
      spend.costPerAttemptUsd * (spend.maxUpstreamRetries + 1) ||
    !keys(spend.review, 'path,sha256') ||
    !HASH.test(spend.review.sha256)
  )
    fail('spend reserve/adapter review invalid');
  if (
    typeof spend.adapterPath !== 'string' ||
    sha256(bytes(spend.adapterPath)) !== spend.adapterSha256
  )
    fail('spend adapter actual source mismatch');
  const reviewBytes = bytes(spend.review.path);
  if (
    sha256(reviewBytes) !== spend.review.sha256 ||
    !same(parse(reviewBytes, 'spend adapter review malformed'), {
      source: spend.source,
      scope: spend.scope,
      adapterSha256: spend.adapterSha256,
    })
  )
    fail('spend adapter review identity mismatch');
}

function validateLedger(ledger, stage, expected) {
  if (
    !keys(ledger, 'version,stage,approval,limit,phaseCaps,attempts,phases') ||
    ledger.version !== 1 ||
    ledger.stage !== realpathSync(stage) ||
    !same(ledger.approval, expected) ||
    ledger.limit !== 16 ||
    !same(ledger.phaseCaps, CAPS) ||
    !Array.isArray(ledger.attempts) ||
    ledger.attempts.length > 16 ||
    !keys(ledger.phases, 'timeout,restart,rollback')
  )
    fail('ledger invalid or wrong binding');
  const seen = new Set();
  for (const [i, row] of ledger.attempts.entries()) {
    if (
      !keys(
        row,
        'ordinal,id,runId,phase,kind,threadId,startedAtMs,reserveUsd,observation',
      ) ||
      row.ordinal !== i + 1 ||
      !UUID.test(row.id) ||
      !UUID.test(row.runId) ||
      seen.has(row.id) ||
      !Object.hasOwn(CAPS, row.phase) ||
      !['normal', 'fault', 'conflict'].includes(row.kind) ||
      (row.kind === 'fault' && row.phase !== 'timeout') ||
      typeof row.threadId !== 'string' ||
      !row.threadId ||
      !Number.isFinite(row.startedAtMs) ||
      row.reserveUsd !== expected.spend.reserveUsd
    )
      fail('ledger invalid attempt');
    validateObservation(row.observation, expected.spend, row.startedAtMs);
    seen.add(row.id);
  }
  for (const phase of Object.keys(CAPS)) {
    const rows = ledger.attempts.filter((row) => row.phase === phase);
    const state = ledger.phases[phase];
    if (
      !keys(state, 'startedAtMs,stopped') ||
      !(state.startedAtMs === null || Number.isFinite(state.startedAtMs)) ||
      !(state.stopped === null || typeof state.stopped === 'string') ||
      rows.length > CAPS[phase] ||
      rows.filter((row) => row.kind === 'conflict').length > 1 ||
      (rows.length &&
        (state.startedAtMs === null ||
          rows.some(
            (row) =>
              row.startedAtMs < state.startedAtMs ||
              row.startedAtMs >= state.startedAtMs + 1200000,
          )))
    )
      fail('ledger invalid phase');
  }
  if (ledger.attempts.filter((row) => row.kind === 'fault').length > 2)
    fail('ledger invalid fault cap');
  return ledger;
}

function load(stage, expected) {
  validateExpected(expected);
  return validateLedger(
    parse(bytes(join(stage, FILE)), 'ledger malformed'),
    stage,
    expected,
  );
}

function save(stage, ledger, initial = false) {
  const file = join(stage, FILE);
  const fd = initial
    ? openSync(
        file,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      )
    : privateOpen(file, constants.O_WRONLY);
  try {
    privateStat(fstatSync(fd));
    // Intentionally not atomic replacement: any partial write invalidates the sole ledger and blocks reuse.
    if (!initial) ftruncateSync(fd, 0);
    writeFileSync(fd, JSON.stringify(ledger) + '\n');
    fsyncSync(fd);
    syncDirectory(stage);
  } finally {
    closeSync(fd);
  }
}

/**
 * Initialize the separate fixed aggregate ledger exactly once in an existing private directory.
 * @param {string} stage - Owned mode0700 stage.
 * @param {object} approval - Explicit human approved positive USD ceiling and provenance.
 * @param {object} expected - Independently reviewed approval, raw prior receipts and adapter-review bindings.
 * @returns {object} Durable ledger; existing historical ledgers are read only.
 */
export function initializeRolloutLedger(stage, approval, expected) {
  const unlock = lock(stage);
  try {
    validateExpected(expected);
    if (!same(approval, expected)) fail('approval mismatch');
    const ledger = {
      version: 1,
      stage: realpathSync(stage),
      approval: structuredClone(approval),
      limit: 16,
      phaseCaps: CAPS,
      attempts: [],
      phases: Object.fromEntries(
        Object.keys(CAPS).map((phase) => [
          phase,
          { startedAtMs: null, stopped: null },
        ]),
      ),
    };
    save(stage, ledger, true);
    return ledger;
  } finally {
    unlock();
  }
}

/** Read a validated ledger without creating, resetting or repairing it. */
export function readRolloutLedger(stage, expected) {
  const unlock = lock(stage);
  try {
    return load(stage, expected);
  } finally {
    unlock();
  }
}

function validateObservation(value, spend, now) {
  if (
    !keys(value, 'source,scope,observedAtMs,spendUsd') ||
    value.source !== spend.source ||
    value.scope !== spend.scope ||
    !Number.isFinite(value.observedAtMs) ||
    value.observedAtMs > now ||
    now - value.observedAtMs > spend.maxAgeMs ||
    !Number.isFinite(value.spendUsd) ||
    value.spendUsd < 0
  )
    fail('spend observation unavailable, stale or wrong scope');
}

function bounded(operation, durationMs, signal) {
  let timer;
  let listener;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Rollout deadline exhausted')),
      Math.max(1, durationMs),
    );
    listener = () => reject(signal.reason ?? new Error('Rollout stopped'));
    signal?.addEventListener('abort', listener, { once: true });
    if (signal?.aborted) listener();
  });
  return Promise.race([Promise.resolve().then(operation), deadline]).finally(
    () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', listener);
    },
  );
}

/**
 * Hold exclusive ownership for a bounded scenario, durably reserving before each operation.
 * No real usage adapter is provided or authorized here. Its independent source/review digest must
 * be pinned in expected; arbitrary booleans and copied manifest hashes are never accepted as review.
 * All reservations remain outstanding conservatively, including successful/failed/inconclusive ones.
 * @param {string} stage - Private ledger directory.
 * @param {object} expected - Independent approval and source evidence (same as initialization).
 * @param {object} options - UUID runId, reviewed observationSource, cleanup; optional test clock/sleep.
 * @param {Function} execute - Receives dispatch(request, operation); operation receives signal/deadlineMs/ordinal.
 * @returns {Promise<unknown>} Scenario result after owned-resource cleanup.
 */
export async function withRolloutRun(stage, expected, options, execute) {
  const unlock = lock(stage);
  const now = options?.now ?? Date.now;
  const sleep =
    options?.sleep ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const runController = new AbortController();
  const runDeadline = now() + 1200000;
  const pending = new Set();
  let busy = false;
  let stopped = false;
  let activeController;
  let retainLock = false;
  const cleanupOwned = async () => {
    try {
      await bounded(
        () => options?.cleanup?.(),
        Math.min(55000, runDeadline - now()),
      );
    } catch (error) {
      retainLock = true;
      throw error;
    } finally {
      unlock(retainLock);
    }
  };
  try {
    load(stage, expected);
    const source = options?.observationSource;
    if (
      !UUID.test(options?.runId) ||
      typeof options?.cleanup !== 'function' ||
      typeof execute !== 'function' ||
      typeof source?.read !== 'function' ||
      source.source !== expected.spend.source ||
      source.scope !== expected.spend.scope ||
      source.adapterSha256 !== expected.spend.adapterSha256
    )
      fail('spend adapter/run identity invalid');
    const dispatchOne = async (request, operation) => {
      if (busy) fail('concurrent request forbidden');
      if (stopped) fail('run stopped');
      busy = true;
      let reserved = false;
      let ledger;
      try {
        ledger = load(stage, expected);
        if (
          !keys(request, 'phase,id,kind,threadId') ||
          !Object.hasOwn(CAPS, request.phase) ||
          !UUID.test(request.id) ||
          !['normal', 'fault', 'conflict'].includes(request.kind) ||
          (request.kind === 'fault' && request.phase !== 'timeout') ||
          typeof request.threadId !== 'string' ||
          !request.threadId ||
          typeof operation !== 'function'
        )
          fail('request identity invalid');
        const rows = ledger.attempts.filter(
          (row) => row.phase === request.phase,
        );
        const state = ledger.phases[request.phase];
        if (state.stopped) fail('phase stopped');
        if (ledger.attempts.some((row) => row.id === request.id))
          fail('duplicate reservation id');
        if (ledger.attempts.length >= 16 || rows.length >= CAPS[request.phase])
          fail('request cap exhausted');
        if (
          request.kind === 'fault' &&
          ledger.attempts.filter((row) => row.kind === 'fault').length >= 2
        )
          fail('timeout fault cap exhausted');
        if (
          request.kind === 'conflict' &&
          (!rows.length || rows.some((row) => row.kind === 'conflict'))
        )
          fail('conflict exception unavailable');
        const phaseStart = state.startedAtMs ?? now();
        const deadline = Math.min(phaseStart + 1200000, runDeadline);
        const prior = ledger.attempts
          .filter((row) => row.threadId === request.threadId)
          .at(-1);
        if (prior && request.kind !== 'conflict') {
          const target = prior.startedAtMs + 20000;
          if (target >= deadline) fail('phase deadline exhausted by pacing');
          while (now() < target) {
            await bounded(
              () =>
                sleep(
                  Math.max(1, Math.ceil(target - now())),
                  runController.signal,
                ),
              deadline - now(),
              runController.signal,
            );
          }
        }
        if (stopped) fail('run stopped');
        if (now() < phaseStart || now() >= deadline)
          fail('phase deadline exhausted');
        const observation = await bounded(
          () => source.read({ signal: runController.signal }),
          Math.min(55000, deadline - now()),
          runController.signal,
        );
        validateObservation(observation, expected.spend, now());
        if (stopped) fail('run stopped');
        if (now() >= deadline) fail('phase deadline exhausted');
        const outstanding = ledger.attempts.reduce(
          (sum, row) => sum + row.reserveUsd,
          0,
        );
        if (
          observation.spendUsd + outstanding + expected.spend.reserveUsd >
          expected.capUsd
        )
          fail('spend ceiling exhausted');
        const startedAtMs = now();
        const row = {
          ordinal: ledger.attempts.length + 1,
          id: request.id,
          runId: options.runId,
          phase: request.phase,
          kind: request.kind,
          threadId: request.threadId,
          startedAtMs,
          reserveUsd: expected.spend.reserveUsd,
          observation: structuredClone(observation),
        };
        ledger = {
          ...ledger,
          attempts: [...ledger.attempts, row],
          phases: {
            ...ledger.phases,
            [request.phase]: { ...state, startedAtMs: phaseStart },
          },
        };
        save(stage, ledger);
        reserved = true;
        activeController = new AbortController();
        const signal = AbortSignal.any([
          activeController.signal,
          runController.signal,
        ]);
        const duration = Math.min(55000, deadline - now());
        const result = await bounded(
          () =>
            operation({
              signal,
              deadlineMs: startedAtMs + duration,
              ordinal: row.ordinal,
            }),
          duration,
          signal,
        );
        if (now() >= deadline || now() - startedAtMs >= 55000)
          fail('request/phase deadline');
        if (
          !result ||
          result.throttled ||
          !['passed', 'inconclusive', 'expected-failure'].includes(
            result.outcome,
          )
        )
          fail('unexpected failure/throttle');
        return result;
      } catch (error) {
        if (reserved) {
          stopped = true;
          activeController?.abort(error);
          save(stage, {
            ...ledger,
            phases: {
              ...ledger.phases,
              [request.phase]: {
                ...ledger.phases[request.phase],
                stopped: 'unexpected-failure/throttle/deadline',
              },
            },
          });
        }
        throw error;
      } finally {
        busy = false;
      }
    };
    const dispatch = (request, operation) => {
      const promise = dispatchOne(request, operation);
      pending.add(promise);
      promise.then(
        () => pending.delete(promise),
        () => pending.delete(promise),
      );
      return promise;
    };
    const result = await bounded(
      () => execute(Object.freeze({ dispatch })),
      runDeadline - now(),
      runController.signal,
    );
    if (pending.size) fail('unawaited request; run stopped');
    return result;
  } finally {
    stopped = true;
    runController.abort(new Error('run closed'));
    activeController?.abort(new Error('run closed'));
    await Promise.allSettled([...pending]);
    await cleanupOwned();
  }
}

/** Produce the immutable fault config from a supported normal 60-second function config. */
export function transformTimeoutConfig(config) {
  if (
    !config ||
    config.maxDuration !== 60 ||
    typeof config.runtime !== 'string' ||
    !config.runtime.startsWith('nodejs') ||
    typeof config.handler !== 'string' ||
    !config.handler ||
    config.supportsResponseStreaming !== true ||
    config.supportsCancellation !== true
  )
    fail(
      'timeout config requires supported normal 60-second streaming/cancellation runtime',
    );
  return { ...structuredClone(config), maxDuration: 1 };
}

async function tree(root) {
  const entries = [];
  async function walk(path) {
    const info = await lstat(path);
    const name = relative(root, path).split('\\').join('/');
    if (
      info.isSymbolicLink() ||
      (!info.isFile() && !info.isDirectory()) ||
      (info.isFile() && info.nlink !== 1)
    )
      fail('tree link/unsupported entry');
    const mode = info.mode & 0o7777;
    if (info.isDirectory()) {
      entries.push({ name, type: 'directory', mode });
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child));
    } else
      entries.push({ name, type: 'file', mode, content: await readFile(path) });
  }
  await walk(root);
  return entries;
}

/**
 * Verify complete path/type/mode/content equality except the single literal maxDuration 60 to 1.
 * @returns {Promise<object>} Raw actual normal/fault complete-tree and config SHA256 digests.
 */
export async function verifyTimeoutVariant(normalRoot, faultRoot) {
  const [normal, fault] = await Promise.all([
    tree(normalRoot),
    tree(faultRoot),
  ]);
  const configPath = 'api/run.func/.vc-config.json';
  if (normal.length !== fault.length) fail('timeout tree path mismatch');
  let normalConfig;
  let faultConfig;
  for (const [i, entry] of normal.entries()) {
    const other = fault[i];
    if (
      !same({ ...entry, content: undefined }, { ...other, content: undefined })
    )
      fail('timeout tree path/type/mode mismatch');
    if (entry.type !== 'file') continue;
    if (entry.name !== configPath) {
      if (!entry.content.equals(other.content))
        fail('timeout tree extra content change');
      continue;
    }
    const text = entry.content.toString('utf8');
    const transformed = transformTimeoutConfig(
      parse(text, 'timeout config malformed'),
    );
    if (!same(parse(other.content, 'timeout config malformed'), transformed))
      fail('timeout tree config mismatch');
    const pattern = /("maxDuration"\s*:\s*)60\b/g;
    if (
      [...text.matchAll(pattern)].length !== 1 ||
      !Buffer.from(text.replace(pattern, '$11')).equals(other.content)
    )
      fail('timeout tree config changed beyond maxDuration');
    normalConfig = sha256(entry.content);
    faultConfig = sha256(other.content);
  }
  if (!normalConfig) fail('timeout tree config missing');
  const [normalTreeSha256, faultTreeSha256] = await Promise.all([
    hashTree(normalRoot),
    hashTree(faultRoot),
  ]);
  return {
    normalTreeSha256,
    faultTreeSha256,
    normalConfigSha256: normalConfig,
    faultConfigSha256: faultConfig,
  };
}
