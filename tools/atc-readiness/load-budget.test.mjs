import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  statSync,
  symlinkSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  initializeLoadBudgetFromReceipts as initialize,
  readLoadBudget as read,
  reserveLoadRequest as reserve,
} from './load-budget.mjs';
const source = 'load-74123b1a-91a1-49f0-80d2-7c3934458d22.json';
const next = 'load-00000000-0000-4000-8000-000000000001.json';
function fixture(t) {
  const stage = mkdtempSync(join(tmpdir(), 'atc-budget-'));
  chmodSync(stage, 0o700);
  t.after(() => rmSync(stage, { recursive: true, force: true }));
  return stage;
}
function receipt(stage, count, name = source) {
  writeFileSync(
    join(stage, name),
    JSON.stringify({
      schedule: {
        attempts: Array.from({ length: count }, (_, index) => ({
          index,
          status: 'passed',
          result: { text: 'PRIVATE_MODEL_TEXT' },
        })),
      },
    }),
    { mode: 0o600 },
  );
}

test('seeds 29 receipt attempts once, excluding the preserved interruption alias', (t) => {
  const stage = fixture(t);
  receipt(stage, 29);
  receipt(stage, 29, 'load-first-attempt-at-interruption.json');

  const first = initialize(stage);
  const second = initialize(stage);

  assert.equal(first.limit, 120);
  assert.equal(first.attempts.length, 29);
  assert.deepEqual(second, first);
  assert.deepEqual(first.attempts[0], { key: source + ':0', ordinal: 1 });
  assert.equal(statSync(join(stage, 'load-budget.json')).mode & 0o777, 0o600);
  assert(
    !readFileSync(join(stage, 'load-budget.json'), 'utf8').includes(
      'PRIVATE_MODEL_TEXT',
    ),
  );
});

test('durable reservations reach 120 and reject attempt 121 across reinitialization', (t) => {
  const stage = fixture(t);
  receipt(stage, 29);
  initialize(stage);

  for (let index = 0; index < 91; index++) reserve(stage, next + ':' + index);
  const reused = initialize(stage);

  assert.equal(reused.attempts.length, 120);
  assert.equal(read(stage).attempts.at(-1).ordinal, 120);
  assert.throws(() => reserve(stage, next + ':91'), /exhausted/);
  assert.equal(read(stage).attempts.length, 120);
});

test('duplicate keys cannot consume or reset reservations', (t) => {
  const stage = fixture(t);
  initialize(stage);
  reserve(stage, next + ':0');

  assert.throws(() => reserve(stage, next + ':0'), /duplicate/);
  assert.equal(initialize(stage).attempts.length, 1);
});

test('unparseable receipts fail closed without exposing their contents', (t) => {
  const stage = fixture(t);
  writeFileSync(join(stage, source), '{PRIVATE_MODEL_TEXT', { mode: 0o600 });

  assert.throws(
    () => initialize(stage),
    (error) =>
      /uncertain/.test(error.message) &&
      !error.message.includes('PRIVATE_MODEL_TEXT'),
  );
  assert(!existsSync(join(stage, 'load-budget.json')));
});

test('malformed receipt attempts fail closed', (t) => {
  const stage = fixture(t);
  writeFileSync(
    join(stage, source),
    JSON.stringify({ schedule: { attempts: [{ index: 5 }] } }),
    { mode: 0o600 },
  );

  assert.throws(() => initialize(stage), /uncertain/);
});

test('existing invalid ledger is preserved and never reset', (t) => {
  const stage = fixture(t);
  writeFileSync(join(stage, 'load-budget.json'), '{PRIVATE_MODEL_TEXT', {
    mode: 0o600,
  });

  assert.throws(() => initialize(stage), /invalid/);
  assert.equal(
    readFileSync(join(stage, 'load-budget.json'), 'utf8'),
    '{PRIVATE_MODEL_TEXT',
  );
});

test('stale ledger cannot omit newly preserved attempts', (t) => {
  const stage = fixture(t);
  initialize(stage);
  receipt(stage, 1);

  assert.throws(() => read(stage), /stale/);
  assert.throws(() => reserve(stage, next + ':0'), /stale/);
  assert.throws(() => initialize(stage), /stale/);
});

test('an existing lock blocks all access and is never removed by another caller', (t) => {
  const stage = fixture(t);
  initialize(stage);
  writeFileSync(join(stage, 'load-budget.lock'), '', { mode: 0o600 });

  for (const operation of [
    () => initialize(stage),
    () => read(stage),
    () => reserve(stage, next + ':0'),
  ])
    assert.throws(operation, /locked/);
  assert(existsSync(join(stage, 'load-budget.lock')));
});

test('unsafe stage and ledger permissions fail closed', (t) => {
  const stage = fixture(t);
  initialize(stage);
  chmodSync(stage, 0o755);

  assert.throws(() => read(stage), /private/);
  chmodSync(stage, 0o700);
  chmodSync(join(stage, 'load-budget.json'), 0o644);
  assert.throws(() => reserve(stage, next + ':0'), /private/);
});

test('receipt permissions and symlinks fail closed', (t) => {
  const stage = fixture(t);
  receipt(stage, 1);
  chmodSync(join(stage, source), 0o644);

  assert.throws(() => initialize(stage), /private/);
  rmSync(join(stage, source));
  writeFileSync(join(stage, 'target.json'), '{}', { mode: 0o600 });
  symlinkSync(join(stage, 'target.json'), join(stage, source));
  assert.throws(() => initialize(stage), /private/);
});

test('symlinked stage and ledger are rejected', (t) => {
  const stage = fixture(t);
  const alias = join(stage, 'alias');
  symlinkSync(stage, alias);

  assert.throws(() => initialize(alias), /private/);
  writeFileSync(join(stage, 'target.json'), '{}', { mode: 0o600 });
  symlinkSync(join(stage, 'target.json'), join(stage, 'load-budget.json'));
  assert.throws(() => initialize(stage), /private/);
});

test('invalid keys and ledger ordinals fail without leaking arbitrary values', (t) => {
  const stage = fixture(t);
  initialize(stage);

  assert.throws(
    () => reserve(stage, 'PRIVATE_MODEL_TEXT'),
    (error) => !error.message.includes('PRIVATE_MODEL_TEXT'),
  );
  writeFileSync(
    join(stage, 'load-budget.json'),
    JSON.stringify({
      limit: 120,
      attempts: [{ key: next + ':0', ordinal: 2 }],
    }),
  );
  assert.throws(() => read(stage), /invalid/);
});

test('missing ledger cannot be implicitly created by read or reserve', (t) => {
  const stage = fixture(t);

  assert.throws(() => read(stage), /invalid/);
  assert.throws(() => reserve(stage, next + ':0'), /invalid/);
  assert(!existsSync(join(stage, 'load-budget.json')));
});

test('separate processes cannot reserve beyond the final available attempt', async (t) => {
  const stage = fixture(t);
  receipt(stage, 119);
  initialize(stage);
  const moduleUrl = new URL('./load-budget.mjs', import.meta.url).href;
  const script = `import {reserveLoadRequest} from ${JSON.stringify(moduleUrl)};
    try { reserveLoadRequest(process.argv[1], process.argv[2]); process.stdout.write('reserved'); }
    catch { process.stdout.write('blocked'); }`;
  const run = (index) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--input-type=module',
        '--eval',
        script,
        stage,
        next + ':' + index,
      ]);
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(output) : reject(Error('offline child failed')),
      );
    });

  const results = await Promise.all([run(0), run(1)]);

  assert.deepEqual(results.sort(), ['blocked', 'reserved']);
  assert.equal(read(stage).attempts.length, 120);
});
