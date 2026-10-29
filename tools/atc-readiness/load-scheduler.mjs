import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** Run the approved closed-loop ramp on absolute stage boundaries with bounded owned requests. */
export async function runLoadSchedule({
  run,
  now = () => performance.now(),
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  stageDurationMs = 300000,
  minStartGapMs = 20000,
  maxAttempts = 120,
  requestTimeoutMs = 55000,
  phaseTimeoutMs = 1200000,
  signal,
  onUpdate = () => undefined,
  beforeDispatch = () => undefined,
  sanitizeError = () => 'request failed',
}) {
  for (const value of [
    stageDurationMs,
    minStartGapMs,
    maxAttempts,
    requestTimeoutMs,
    phaseTimeoutMs,
  ])
    assert(Number.isFinite(value) && value > 0);
  assert(typeof run === 'function');
  assert(Number.isInteger(maxAttempts) && maxAttempts <= 120);
  const started = now(),
    end = started + 3 * stageDurationMs,
    deadline = started + phaseTimeoutMs;
  const stopController = new AbortController(),
    phaseTimerController = new AbortController();
  const attempts = [],
    concurrency = [];
  let active = 0,
    reason = null,
    reservationError;
  const stop = (why) => {
    if (!reason) {
      reason = why;
      stopController.abort(new Error(why));
    }
  };
  const externalAbort = () => stop('external-abort');
  signal?.addEventListener('abort', externalAbort, { once: true });
  if (signal?.aborted) externalAbort();
  const phaseTimer = sleep(phaseTimeoutMs, phaseTimerController.signal).then(
    () => stop('phase-deadline'),
    () => undefined,
  );
  const report = () => {
    try {
      onUpdate({
        attempts: attempts.map((a) => ({ ...a })),
        concurrency: concurrency.map((e) => ({ ...e })),
        reason,
      });
    } catch {
      stop('evidence-write-failure');
    }
  };
  async function worker(worker, activationMs) {
    let nextStart = started + activationMs;
    while (!reason) {
      try {
        const target = Math.min(nextStart, end);
        while (now() < target)
          await sleep(
            Math.max(1, Math.ceil(target - now())),
            stopController.signal,
          );
      } catch {
        break;
      }
      if (reason || now() >= end) break;
      if (now() >= deadline) {
        stop('phase-deadline');
        break;
      }
      if (attempts.length >= maxAttempts) {
        stop('request-limit');
        break;
      }
      const dispatch = now(),
        row = {
          index: attempts.length,
          worker,
          level:
            dispatch < started + stageDurationMs
              ? 1
              : dispatch < started + 2 * stageDurationMs
                ? 2
                : 4,
          startedMs: dispatch - started,
          status: 'running',
        };
      try {
        beforeDispatch({ index: row.index, worker, level: row.level });
      } catch (error) {
        reservationError = sanitizeError(error);
        stop('request-reservation-failure');
        report();
        break;
      }
      let actualDispatch = dispatch;
      const onDispatch = (timestamp) => {
        assert(
          Number.isFinite(timestamp) &&
            timestamp >= dispatch &&
            timestamp <= now(),
          'invalid HTTP dispatch clock',
        );
        assert.equal(
          row.httpDispatchMs,
          undefined,
          'HTTP dispatch reported twice',
        );
        if (timestamp >= end) throw new Error('dispatch-window-closed');
        actualDispatch = timestamp;
        row.httpDispatchMs = timestamp - started;
        row.level =
          timestamp < started + stageDurationMs
            ? 1
            : timestamp < started + 2 * stageDurationMs
              ? 2
              : 4;
      };
      attempts.push(row);
      active++;
      concurrency.push({ atMs: dispatch - started, active });
      const requestController = new AbortController(),
        timerController = new AbortController();
      const requestSignal = AbortSignal.any([
        stopController.signal,
        requestController.signal,
      ]);
      const timeoutMs = Math.min(requestTimeoutMs, deadline - dispatch);
      let abortListener;
      const aborted = new Promise((_, reject) => {
        abortListener = () =>
          reject(requestSignal.reason ?? new Error('request aborted'));
        requestSignal.addEventListener('abort', abortListener, { once: true });
        if (requestSignal.aborted) abortListener();
      });
      const timeout = sleep(timeoutMs, timerController.signal).then(() => {
        const error = new Error(
          timeoutMs < requestTimeoutMs ? 'phase-deadline' : 'request-timeout',
        );
        requestController.abort(error);
        throw error;
      });
      try {
        report();
        row.result = await Promise.race([
          Promise.resolve().then(() =>
            run({
              index: row.index,
              worker,
              level: row.level,
              startedMs: row.startedMs,
              scheduleStartedAt: started,
              deadlineMs: dispatch + timeoutMs,
              signal: requestSignal,
              onDispatch,
            }),
          ),
          timeout,
          aborted,
        ]);
        if (requestSignal.aborted) throw requestSignal.reason;
        row.status = 'passed';
      } catch (error) {
        row.status = 'failed';
        row.error = sanitizeError(error);
        stop(
          reason ??
            (error?.message === 'request-timeout'
              ? 'request-timeout'
              : error?.message === 'phase-deadline'
                ? 'phase-deadline'
                : error?.message === 'dispatch-window-closed'
                  ? 'dispatch-window-closed'
                  : 'request-failure'),
        );
      } finally {
        timerController.abort();
        requestSignal.removeEventListener('abort', abortListener);
        row.finishedMs = now() - started;
        active--;
        concurrency.push({ atMs: now() - started, active });
        report();
      }
      nextStart = Math.max(actualDispatch + minStartGapMs, now());
    }
  }
  try {
    await Promise.all([
      worker(0, 0),
      worker(1, stageDurationMs),
      worker(2, 2 * stageDurationMs),
      worker(3, 2 * stageDurationMs),
    ]);
  } finally {
    phaseTimerController.abort();
    signal?.removeEventListener('abort', externalAbort);
  }
  await phaseTimer;
  return {
    status: reason
      ? [
          'request-limit',
          'phase-deadline',
          'external-abort',
          'request-reservation-failure',
          'dispatch-window-closed',
        ].includes(reason)
        ? 'incomplete'
        : 'failed'
      : 'passed',
    reason,
    reservationError,
    scheduledDurationMs: 3 * stageDurationMs,
    elapsedMs: now() - started,
    attempts,
    concurrency,
  };
}
