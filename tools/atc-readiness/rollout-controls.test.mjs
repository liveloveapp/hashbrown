import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  linkSync,
  symlinkSync,
  mkdirSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256, hashTree } from './common.mjs';
import {
  initializeRolloutLedger,
  readRolloutLedger,
  withRolloutRun,
  transformTimeoutConfig,
  verifyTimeoutVariant,
} from './rollout-controls.mjs';

function fixture(t, capUsd = 100) {
  const stage = mkdtempSync(join(tmpdir(), 'rollout-'));
  chmodSync(stage, 0o700);
  t.after(() => rmSync(stage, { recursive: true, force: true }));
  const prior = {};
  for (const [name, count, limit] of [
    ['load', 99, 120],
    ['recovery', 10, 16],
  ]) {
    const path = join(stage, name + '.json');
    const bytes = JSON.stringify({
      limit,
      attempts: Array.from({ length: count }, (_, index) => ({
        ordinal: index + 1,
        label: String(index),
      })),
    });
    writeFileSync(path, bytes, { mode: 0o600 });
    prior[name] = { path, count, sha256: sha256(bytes) };
  }
  const adapterPath = join(stage, 'usage-adapter.mjs');
  writeFileSync(adapterPath, 'reviewed adapter source', { mode: 0o600 });
  const adapterSha256 = sha256(readFileSync(adapterPath));
  const reviewPath = join(stage, 'adapter-review.json');
  const reviewBytes = JSON.stringify({
    source: 'provider-usage',
    scope: 'owned-project',
    adapterSha256,
  });
  writeFileSync(reviewPath, reviewBytes, { mode: 0o600 });
  const expected = {
    source: 'human-approved-design',
    stagingDirectory: realpathSync(stage),
    capUsd,
    runtimeSource: 'a2f92a4f02ab1dfc38051a44e509afb439634793',
    prior,
    spend: {
      adapterPath,
      source: 'provider-usage',
      scope: 'owned-project',
      adapterSha256,
      review: { path: reviewPath, sha256: sha256(reviewBytes) },
      maxAgeMs: 1000,
      reserveUsd: 1,
      maxUpstreamRetries: 2,
      costPerAttemptUsd: 1 / 3,
    },
  };
  let time = 10000;
  const observationSource = {
    source: expected.spend.source,
    scope: expected.spend.scope,
    adapterSha256,
    read: async () => ({
      source: expected.spend.source,
      scope: expected.spend.scope,
      observedAtMs: time,
      spendUsd: 0,
    }),
  };
  const options = {
    runId: randomUUID(),
    observationSource,
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    cleanup: async () => undefined,
  };
  const request = (
    phase = 'timeout',
    kind = 'normal',
    threadId = 'thread',
  ) => ({ phase, kind, threadId, id: randomUUID() });
  return {
    stage,
    expected,
    options,
    request,
    advance: (ms) => {
      time += ms;
    },
  };
}

const pass = async () => ({ outcome: 'passed' });

test('requires explicit positive spend approval and independently expected bindings', (t) => {
  const f = fixture(t);

  assert.throws(
    () =>
      initializeRolloutLedger(
        f.stage,
        { ...f.expected, capUsd: 0 },
        f.expected,
      ),
    /approval|spend/,
  );
  assert.throws(
    () => initializeRolloutLedger(f.stage, f.expected),
    /expected|approval/,
  );
  assert.throws(
    () =>
      initializeRolloutLedger(
        f.stage,
        { ...f.expected, source: 'copied' },
        f.expected,
      ),
    /approval/,
  );
});

test('initializes once, preserves old ledgers, and validates actual prior bytes/counts', (t) => {
  const f = fixture(t);
  const original = readFileSync(f.expected.prior.load.path);

  const ledger = initializeRolloutLedger(f.stage, f.expected, f.expected);

  assert.equal(ledger.limit, 16);
  assert.deepEqual(readFileSync(f.expected.prior.load.path), original);
  assert.throws(
    () => initializeRolloutLedger(f.stage, f.expected, f.expected),
    /exists|initialized/,
  );
  writeFileSync(f.expected.prior.load.path, '{}');
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /prior/);
});

test('rejects count mismatch even when a caller supplies the actual digest', (t) => {
  const f = fixture(t);
  const path = f.expected.prior.recovery.path;
  const bytes = JSON.stringify({ limit: 16, attempts: [] });
  writeFileSync(path, bytes);
  f.expected.prior.recovery.sha256 = sha256(bytes);

  assert.throws(
    () => initializeRolloutLedger(f.stage, f.expected, f.expected),
    /prior/,
  );
});

test('rejects missing, malformed, public, symlink and hardlink ledgers', (t) => {
  const f = fixture(t);
  const file = join(f.stage, 'rollout-budget.json');

  assert.throws(() => readRolloutLedger(f.stage, f.expected), /ledger|ENOENT/);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const original = readFileSync(file);
  writeFileSync(file, '{');
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /ledger/);
  writeFileSync(file, original);
  chmodSync(file, 0o644);
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /private/);
  chmodSync(file, 0o600);
  linkSync(file, join(f.stage, 'linked'));
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /private/);
  rmSync(join(f.stage, 'linked'));
  rmSync(file);
  symlinkSync(f.expected.prior.load.path, file);
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /private/);
});

test('fresh named scope and reviewed adapter are required before dispatch', async (t) => {
  for (const observation of [
    null,
    {
      source: 'other',
      scope: 'owned-project',
      observedAtMs: 10000,
      spendUsd: 0,
    },
    {
      source: 'provider-usage',
      scope: 'other',
      observedAtMs: 10000,
      spendUsd: 0,
    },
    {
      source: 'provider-usage',
      scope: 'owned-project',
      observedAtMs: 1,
      spendUsd: 0,
    },
  ]) {
    const f = fixture(t);
    initializeRolloutLedger(f.stage, f.expected, f.expected);
    f.options.observationSource.read = async () => observation;
    let called = false;

    await assert.rejects(
      withRolloutRun(f.stage, f.expected, f.options, (control) =>
        control.dispatch(f.request(), async () => {
          called = true;
          return pass();
        }),
      ),
      /observation|spend/,
    );

    assert.equal(called, false);
    assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 0);
  }
});

test('conservative outstanding reserves block overspend without clearing failed attempts', async (t) => {
  const f = fixture(t, 2);
  initializeRolloutLedger(f.stage, f.expected, f.expected);

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request(), pass);
    await control.dispatch(f.request(), async () => ({
      outcome: 'inconclusive',
    }));
    await assert.rejects(control.dispatch(f.request(), pass), /spend/);
  });

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 2);
});

test('reserves ordinal before dispatch, rejects duplicates and concurrent runs', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const request = f.request();

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await assert.rejects(
      withRolloutRun(
        f.stage,
        f.expected,
        { ...f.options, runId: randomUUID() },
        async () => undefined,
      ),
      /locked/,
    );
    await control.dispatch(request, async () => {
      const ledger = JSON.parse(
        readFileSync(join(f.stage, 'rollout-budget.json')),
      );
      assert.equal(ledger.attempts[0].ordinal, 1);
      assert.equal(ledger.attempts[0].id, request.id);
      return pass();
    });
    await assert.rejects(control.dispatch(request, pass), /duplicate/);
  });

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 1);
});

test('fixed aggregate and phase caps exhaust at 6/6/4 without resetting', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);

  for (const [phase, count] of [
    ['timeout', 6],
    ['restart', 6],
    ['rollback', 4],
  ]) {
    await withRolloutRun(
      f.stage,
      f.expected,
      { ...f.options, runId: randomUUID() },
      async (control) => {
        for (let index = 0; index < count; index++)
          await control.dispatch(f.request(phase), pass);
        await assert.rejects(
          control.dispatch(f.request(phase), pass),
          /cap|exhausted/,
        );
        await assert.rejects(
          control.dispatch(f.request(phase), pass),
          /stopped/,
        );
      },
    );
  }

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 16);
});

test('only two durable timeout fault attempts, including inconclusive and failed', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request('timeout', 'fault'), async () => ({
      outcome: 'inconclusive',
    }));
    await control.dispatch(f.request('timeout', 'fault'), async () => ({
      outcome: 'expected-failure',
    }));
    await assert.rejects(
      control.dispatch(f.request('timeout', 'fault'), pass),
      /fault/,
    );
  });

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 2);
});

test('paces a thread, allows one explicit conflict exception per phase and stops on failure', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const starts = [];
  const record = async () => {
    starts.push(f.options.now());
    return pass();
  };

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request(), record);
    await control.dispatch(f.request(), record);
    await control.dispatch(f.request('timeout', 'conflict'), record);
    await assert.rejects(
      control.dispatch(f.request(), async () => {
        throw Error('unexpected');
      }),
      /unexpected/,
    );
    await assert.rejects(control.dispatch(f.request(), pass), /stopped/);
  });

  assert.deepEqual(starts, [10000, 30000, 30000]);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 4);
});

test('phase deadline blocks dispatch and cleanup always runs', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  let closed = false;
  f.options.cleanup = async () => {
    closed = true;
  };

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request(), pass);
    f.advance(1200000);
    await assert.rejects(control.dispatch(f.request(), pass), /deadline/);
  });

  assert.equal(closed, true);
});

test('pure timeout transformer preserves input and only changes supported 60 to 1', () => {
  const normal = {
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    supportsResponseStreaming: true,
    supportsCancellation: true,
    maxDuration: 60,
  };

  const fault = transformTimeoutConfig(normal);

  assert.deepEqual(fault, { ...normal, maxDuration: 1 });
  assert.equal(normal.maxDuration, 60);
  assert.throws(
    () => transformTimeoutConfig({ ...normal, maxDuration: 1 }),
    /60/,
  );
});

test('complete timeout tree verification rejects additional bytes, modes, paths and links', async (t) => {
  const f = fixture(t);
  const normal = join(f.stage, 'normal');
  const fault = join(f.stage, 'fault');
  mkdirSync(join(normal, 'api', 'run.func'), { recursive: true });
  const config = {
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    supportsResponseStreaming: true,
    supportsCancellation: true,
    maxDuration: 60,
  };
  const relative = 'api/run.func/.vc-config.json';
  writeFileSync(join(normal, relative), JSON.stringify(config));
  writeFileSync(join(normal, 'index.html'), 'normal');
  cpSync(normal, fault, { recursive: true });
  writeFileSync(
    join(fault, relative),
    JSON.stringify(transformTimeoutConfig(config)),
  );

  const result = await verifyTimeoutVariant(normal, fault);

  assert.notEqual(result.normalTreeSha256, result.faultTreeSha256);
  writeFileSync(join(fault, 'index.html'), 'different');
  await assert.rejects(verifyTimeoutVariant(normal, fault), /tree/);
  writeFileSync(join(fault, 'index.html'), 'normal');
  chmodSync(join(fault, 'index.html'), 0o777);
  await assert.rejects(verifyTimeoutVariant(normal, fault), /tree/);
  chmodSync(join(fault, 'index.html'), 0o644);
  symlinkSync('index.html', join(fault, 'link'));
  await assert.rejects(verifyTimeoutVariant(normal, fault), /link|tree/);
});

test('binds actual reviewed adapter bytes and rejects altered source before observations', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  writeFileSync(f.expected.spend.adapterPath, 'changed');

  await assert.rejects(
    withRolloutRun(f.stage, f.expected, f.options, async () => undefined),
    /adapter/,
  );
});

test('request deadline aborts owned operation, keeps reservation and stops future runs', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  let aborted = false;
  const run = withRolloutRun(f.stage, f.expected, f.options, (control) =>
    control.dispatch(
      f.request(),
      ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              resolve({ outcome: 'passed' });
            },
            { once: true },
          );
          entered();
        }),
    ),
  );
  await ready;

  t.mock.timers.tick(55000);

  await assert.rejects(run, /deadline/);
  assert.equal(aborted, true);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 1);
  await assert.rejects(
    withRolloutRun(
      f.stage,
      f.expected,
      { ...f.options, runId: randomUUID() },
      (control) => control.dispatch(f.request(), pass),
    ),
    /stopped/,
  );
});

test('unavailable usage observation is bounded by phase deadline without a reservation', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  f.options.observationSource.read = async () => {
    entered();
    return new Promise(() => undefined);
  };
  const run = withRolloutRun(f.stage, f.expected, f.options, (control) =>
    control.dispatch(f.request(), pass),
  );
  await ready;

  t.mock.timers.tick(1200000);

  await assert.rejects(run, /deadline/);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 0);
});

test('cleanup failure retains exclusive ownership instead of reopening uncertain resources', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  f.options.cleanup = async () => {
    throw Error('cleanup failed');
  };

  await assert.rejects(
    withRolloutRun(f.stage, f.expected, f.options, async () => undefined),
    /cleanup failed/,
  );

  assert.throws(() => readRolloutLedger(f.stage, f.expected), /locked/);
});

test('a captured dispatcher cannot schedule after its run closes', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  let dispatch;

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    dispatch = control.dispatch;
  });

  await assert.rejects(dispatch(f.request(), pass), /stopped/);
});

test('rejects wrong owner before creating a run lock', (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const uid = process.getuid();
  const mock = t.mock.method(process, 'getuid', () => uid + 1);

  try {
    assert.throws(() => readRolloutLedger(f.stage, f.expected), /private/);
  } finally {
    mock.mock.restore();
  }
});

test('mid-write failure leaves an invalid ledger and never dispatches or resets', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const originalWrite = fs.writeFileSync;
  const mock = t.mock.method(fs, 'writeFileSync', (fd, data, ...rest) => {
    if (typeof fd === 'number' && String(data).includes('"ordinal":1')) {
      originalWrite(fd, '{');
      throw Error('simulated mid-write failure');
    }
    return originalWrite(fd, data, ...rest);
  });
  syncBuiltinESMExports();
  let dispatched = false;

  try {
    await assert.rejects(
      withRolloutRun(f.stage, f.expected, f.options, (control) =>
        control.dispatch(f.request(), async () => {
          dispatched = true;
          return pass();
        }),
      ),
      /mid-write/,
    );
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }

  assert.equal(dispatched, false);
  assert.throws(() => readRolloutLedger(f.stage, f.expected), /ledger/);
  assert.throws(
    () => initializeRolloutLedger(f.stage, f.expected, f.expected),
    /exists/,
  );
});

test('unexpected throttle consumes its reservation and stops scheduling', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await assert.rejects(
      control.dispatch(f.request(), async () => ({
        outcome: 'passed',
        throttled: true,
      })),
      /throttle/,
    );
    await assert.rejects(control.dispatch(f.request(), pass), /stopped/);
  });

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 1);
});

test('tree digest uses the shared raw complete-tree hashing contract', async (t) => {
  const f = fixture(t);
  const normal = join(f.stage, 'normal');
  const fault = join(f.stage, 'fault');
  mkdirSync(join(normal, 'api', 'run.func'), { recursive: true });
  const config = {
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    supportsResponseStreaming: true,
    supportsCancellation: true,
    maxDuration: 60,
  };
  writeFileSync(
    join(normal, 'api/run.func/.vc-config.json'),
    JSON.stringify(config),
  );
  cpSync(normal, fault, { recursive: true });
  writeFileSync(
    join(fault, 'api/run.func/.vc-config.json'),
    JSON.stringify(transformTimeoutConfig(config)),
  );

  const actual = await verifyTimeoutVariant(normal, fault);

  assert.equal(actual.normalTreeSha256, await hashTree(normal));
  assert.equal(actual.faultTreeSha256, await hashTree(fault));
});

test('pacing that cannot fit before phase deadline blocks instead of dispatching early', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  let extraDispatched = false;

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request(), pass);
    f.advance(1185000);
    await control.dispatch(
      f.request('timeout', 'normal', 'near-deadline'),
      pass,
    );
    await assert.rejects(
      control.dispatch(
        f.request('timeout', 'normal', 'near-deadline'),
        async () => {
          extraDispatched = true;
          return pass();
        },
      ),
      /deadline/,
    );
  });

  assert.equal(extraDispatched, false);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 2);
});

test('catching a stale observation cannot reopen scheduling within the same run', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  const freshRead = f.options.observationSource.read;
  f.options.observationSource.read = async () => ({
    source: f.expected.spend.source,
    scope: f.expected.spend.scope,
    observedAtMs: 1,
    spendUsd: 0,
  });
  let dispatched = false;

  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await assert.rejects(control.dispatch(f.request(), pass), /stale/);
    f.options.observationSource.read = freshRead;
    await assert.rejects(
      control.dispatch(f.request(), async () => {
        dispatched = true;
        return pass();
      }),
      /stopped/,
    );
  });

  assert.equal(dispatched, false);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 0);
});

test('approved canonical staging directory prevents a fresh path resetting the aggregate envelope', (t) => {
  const f = fixture(t);
  const other = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);

  assert.throws(
    () => initializeRolloutLedger(other.stage, f.expected, f.expected),
    /staging/,
  );
  assert.equal(fs.existsSync(join(other.stage, 'rollout-budget.json')), false);
});

test('conflict exception and thread pacing remain consumed across separate runs', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  await withRolloutRun(f.stage, f.expected, f.options, async (control) => {
    await control.dispatch(f.request(), pass);
    await control.dispatch(f.request('timeout', 'conflict'), pass);
  });
  const starts = [];

  await withRolloutRun(
    f.stage,
    f.expected,
    { ...f.options, runId: randomUUID() },
    async (control) => {
      await control.dispatch(f.request(), async () => {
        starts.push(f.options.now());
        return pass();
      });
      await assert.rejects(
        control.dispatch(f.request('timeout', 'conflict'), pass),
        /conflict/,
      );
    },
  );

  assert.deepEqual(starts, [30000]);
  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 3);
});

test('phase deadline and two-fault ceiling remain durable across separate runs', async (t) => {
  const f = fixture(t);
  initializeRolloutLedger(f.stage, f.expected, f.expected);
  for (let index = 0; index < 2; index++) {
    await withRolloutRun(
      f.stage,
      f.expected,
      { ...f.options, runId: randomUUID() },
      (control) =>
        control.dispatch(f.request('timeout', 'fault'), async () => ({
          outcome: 'inconclusive',
        })),
    );
  }

  await assert.rejects(
    withRolloutRun(
      f.stage,
      f.expected,
      { ...f.options, runId: randomUUID() },
      (control) => control.dispatch(f.request('timeout', 'fault'), pass),
    ),
    /fault/,
  );
  f.advance(1200000);
  await assert.rejects(
    withRolloutRun(
      f.stage,
      f.expected,
      { ...f.options, runId: randomUUID() },
      (control) => control.dispatch(f.request(), pass),
    ),
    /deadline/,
  );

  assert.equal(readRolloutLedger(f.stage, f.expected).attempts.length, 2);
});
