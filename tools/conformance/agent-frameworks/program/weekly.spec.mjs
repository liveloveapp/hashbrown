import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadInventory } from './inventory.mjs';
import { runBaseline, runProcess } from './weekly.mjs';

for (const failure of [
  { exitCode: 1 },
  { timedOut: true },
  { error: 'secret-token-must-not-leak' },
]) {
  test(`weekly retains failure ${JSON.stringify(failure)} and still executes all stages`, async () => {
    const output = await mkdtemp(join(tmpdir(), 'weekly-test-'));
    const calls = [];
    const runner = async (command) => {
      calls.push(command);
      return calls.length === 1 ? failure : { exitCode: 0 };
    };

    try {
      const result = await runBaseline({ output, runner });
      const health = JSON.parse(
        await readFile(join(output, 'health.json'), 'utf8'),
      );
      const markdown = await readFile(join(output, 'health.md'), 'utf8');

      assert.equal(result.exitCode, 1);
      assert.equal(calls.length, 3);
      assert.equal(health.status, 'failed');
      assert.equal(
        health.stages[0].status,
        failure.exitCode ? 'failed' : 'infrastructure-error',
      );
      assert.equal(health.stages[1].status, 'passed');
      assert.equal(health.stages[2].status, 'passed');
      assert.equal(health.candidate.status, 'not-run');
      assert.ok(!JSON.stringify(health).includes('secret-token'));
      assert.ok(!markdown.includes('secret-token'));
      assert.ok(markdown.includes('not-run'));
      assert.ok(
        calls.every(
          (command) =>
            command.file === 'npx' && command.args.includes('--skip-nx-cache'),
        ),
      );
      assert.deepEqual(
        calls.map((command) => command.timeoutMs),
        [900000, 600000, 900000],
      );
      assert.deepEqual(calls[1].args, [
        'nx',
        'test',
        'core',
        '--testFile=agent-framework-display.conformance.spec.ts',
        '--runInBand',
        '--passWithNoTests=false',
        '--skip-nx-cache',
      ]);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
}

test('passing attempt contains exact seven native pins and current runtime, independent of qualification health', async () => {
  const output = await mkdtemp(join(tmpdir(), 'weekly-test-'));
  const inventory = await loadInventory();

  try {
    const result = await runBaseline({
      output,
      runner: async () => ({ exitCode: 0 }),
    });
    const health = JSON.parse(
      await readFile(join(output, 'health.json'), 'utf8'),
    );

    assert.equal(result.exitCode, 0);
    assert.equal(health.status, 'passed');
    assert.equal(health.profiles.length, 7);
    assert.deepEqual(
      health.profiles,
      inventory.profiles
        .filter((profile) => profile.status === 'legacy-qualified')
        .map(({ id, versions }) => ({ id, versions })),
    );
    assert.equal(
      health.commit,
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    );
    assert.equal(health.runtime.node, process.version);
    assert.equal(inventory.runHealth.status, 'not-run');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('real process adapter preserves nonzero exits', async () => {
  const command = {
    file: process.execPath,
    args: ['-e', 'process.exit(7)'],
    timeoutMs: 1000,
  };

  const result = await runProcess(command);

  assert.equal(result.exitCode, 7);
});

test('real process adapter distinguishes timeout and spawn failure', async () => {
  const slow = {
    file: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 10000)'],
    timeoutMs: 20,
  };

  const timeout = await runProcess(slow);
  const missing = await runProcess({
    file: '/no/such/framework-command',
    args: [],
    timeoutMs: 1000,
  });

  assert.equal(timeout.timedOut, true);
  assert.ok(missing.error);
});

test('CLI rejects unrecognized options without executing a baseline', () => {
  const cli = 'tools/conformance/agent-frameworks/program/weekly.mjs';

  const result = spawnSync(process.execPath, [cli, '--candidate=latest'], {
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});

test('inventory infrastructure failure still writes failed health without executing unverified pins', async () => {
  const output = await mkdtemp(join(tmpdir(), 'weekly-test-'));
  const calls = [];

  try {
    const result = await runBaseline({
      output,
      inventoryLoader: async () => {
        throw new Error('secret-untrusted-inventory');
      },
      runner: async (command) => {
        calls.push(command);
        return { exitCode: 0 };
      },
    });
    const health = JSON.parse(
      await readFile(join(output, 'health.json'), 'utf8'),
    );
    const markdown = await readFile(join(output, 'health.md'), 'utf8');

    assert.equal(result.exitCode, 1);
    assert.deepEqual(calls, []);
    assert.equal(health.status, 'infrastructure-error');
    assert.equal(health.profiles.length, 0);
    assert.equal(health.stages.length, 3);
    assert.ok(health.stages.every((stage) => stage.status === 'not-run'));
    assert.equal(health.candidate.status, 'not-run');
    assert.ok(!markdown.includes('secret-untrusted'));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('workflow preflight fallback CLI writes infrastructure health and exits nonzero', async () => {
  const output = await mkdtemp(join(tmpdir(), 'weekly-test-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'tools/conformance/agent-frameworks/program/weekly.mjs',
        '--not-run',
        '--output',
        output,
      ],
      { encoding: 'utf8' },
    );
    const health = JSON.parse(
      await readFile(join(output, 'health.json'), 'utf8'),
    );
    const workflow = await readFile(
      '.github/workflows/framework-compatibility.yml',
      'utf8',
    );

    assert.equal(result.status, 1);
    assert.equal(health.status, 'infrastructure-error');
    assert.ok(health.stages.every((stage) => stage.status === 'not-run'));
    assert.equal(health.candidate.status, 'not-run');
    assert.equal(health.runtime.node, process.version);
    assert.equal(health.profiles.length, 0);
    assert.match(workflow, /if: always\(\)/);
    assert.match(workflow, /weekly.mjs --not-run/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
