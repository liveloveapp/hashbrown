import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoadSchedule } from './load-scheduler.mjs';

function simulatedClock() {
  let time = 0;
  const timers = new Set();
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const item = {
        at: time + ms,
        finish: () => {
          timers.delete(item);
          signal?.removeEventListener('abort', abort);
          resolve();
        },
      };
      const abort = () => {
        timers.delete(item);
        reject(signal.reason);
      };
      timers.add(item);
      signal?.addEventListener('abort', abort, { once: true });
    });
  async function finish(promise) {
    let result,
      failure,
      done = false;
    promise.then(
      (v) => {
        result = v;
        done = true;
      },
      (e) => {
        failure = e;
        done = true;
      },
    );
    for (let steps = 0; !done && steps < 10000; steps++) {
      for (let i = 0; i < 30; i++) await Promise.resolve();
      if (done) break;
      const next = [...timers].sort((a, b) => a.at - b.at)[0];
      assert(next, 'simulation deadlocked');
      time = next.at;
      for (const timer of [...timers]) if (timer.at <= time) timer.finish();
    }
    assert(done, 'simulation exceeded step bound');
    if (failure) throw failure;
    return result;
  }
  return { now: () => time, sleep, finish };
}

test('uses absolute levels while requests cross both stage boundaries', async () => {
  const clock = simulatedClock();
  const starts = [];
  const run = async ({ worker, startedMs }) => {
    starts.push({ worker, startedMs });
    await clock.sleep(55);
    return { ok: true };
  };

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run,
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 100,
      phaseTimeoutMs: 1200,
    }),
  );

  assert.equal(result.status, 'passed');
  assert.deepEqual(
    [0, 1, 2, 3].map(
      (worker) => starts.find((s) => s.worker === worker).startedMs,
    ),
    [0, 300, 600, 600],
  );
  assert(starts.every((s) => s.startedMs < 900));
  assert.equal(result.scheduledDurationMs, 900);
  assert(result.attempts.some((a) => a.startedMs < 300 && a.finishedMs > 300));
  assert(result.attempts.some((a) => a.startedMs < 600 && a.finishedMs > 600));
  for (const event of result.concurrency)
    assert(event.active <= (event.atMs < 300 ? 1 : event.atMs < 600 ? 2 : 4));
});

test('keeps a minimum start gap independently for each virtual user', async () => {
  const clock = simulatedClock();

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run: async () => ({}),
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 100,
      phaseTimeoutMs: 1200,
    }),
  );

  for (const worker of [0, 1, 2, 3]) {
    const rows = result.attempts.filter((a) => a.worker === worker);
    for (let i = 1; i < rows.length; i++)
      assert(rows[i].startedMs - rows[i - 1].startedMs >= 20);
  }
  assert.equal(result.status, 'passed');
});

test('request budget exhaustion cannot be called a completed sustained run', async () => {
  const clock = simulatedClock();

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run: async () => ({}),
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 100,
      phaseTimeoutMs: 1200,
      maxAttempts: 3,
    }),
  );

  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'request-limit');
  assert.equal(result.attempts.length, 3);
});

test('first failed request stops all later scheduling', async () => {
  const clock = simulatedClock();
  let calls = 0;

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run: async () => {
        calls++;
        throw Error('controlled failure');
      },
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 100,
      phaseTimeoutMs: 1200,
    }),
  );

  assert.equal(result.status, 'failed');
  assert.equal(calls, 1);
  assert.equal(result.attempts[0].status, 'failed');
});

test('a nonsettling request cannot outlast its dispatch deadline', async () => {
  const clock = simulatedClock();
  let requestSignal;

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run: ({ signal }) => {
        requestSignal = signal;
        return new Promise(() => undefined);
      },
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 55,
      phaseTimeoutMs: 1200,
    }),
  );

  assert.equal(result.status, 'failed');
  assert.equal(clock.now(), 55);
  assert(requestSignal.aborted);
  assert.equal(result.reason, 'request-timeout');
});

test('evidence write failure stops scheduling and cannot become a pass', async () => {
  const clock = simulatedClock();

  const result = await clock.finish(
    runLoadSchedule({
      ...clock,
      run: async () => ({}),
      onUpdate: () => {
        throw Error('disk failure');
      },
      stageDurationMs: 300,
      minStartGapMs: 20,
      requestTimeoutMs: 100,
      phaseTimeoutMs: 1200,
    }),
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'evidence-write-failure');
  assert.equal(result.attempts.length, 1);
});
