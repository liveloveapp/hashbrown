import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runBaseline, writeNotRunHealth } from './pydantic-weekly.mjs';

const metadata = async () => ({
  commit: 'a'.repeat(40),
  pins: {
    python: '3.12.12',
    uv: '0.11.3',
    'pydantic-ai-slim': '2.64.0',
    'ag-ui-protocol': '1.0.0',
    starlette: '1.10.0',
    uvicorn: '0.54.0',
  },
  hashes: { lock: 'b'.repeat(64), source: 'c'.repeat(64) },
});

for (const failure of [
  { exitCode: 9 },
  { timedOut: true },
  { error: 'secret-marker' },
]) {
  test(`Python weekly preserves ${JSON.stringify(failure)} and attempts every stage independently`, async () => {
    const output = await mkdtemp(join(tmpdir(), 'pydantic-health-'));
    const calls = [];

    try {
      const result = await runBaseline({
        output,
        metadataLoader: metadata,
        runner: async (command) => {
          calls.push(command);
          return calls.length === 1 ? failure : { exitCode: 0 };
        },
      });
      const raw = await readFile(join(output, 'health.json'), 'utf8');
      const health = JSON.parse(raw);

      assert.equal(result.exitCode, 1);
      assert.equal(calls.length, 3);
      assert.deepEqual(
        calls.map(({ timeoutMs }) => timeoutMs),
        [900000, 600000, 900000],
      );
      assert.ok(
        calls.every(
          ({ file, args }) =>
            file === 'npx' &&
            args.includes('pydantic-ai-conformance') &&
            args.includes('--skip-nx-cache'),
        ),
      );
      assert.equal(
        health.stages[0].status,
        failure.exitCode ? 'failed' : 'infrastructure-error',
      );
      assert.equal(health.stages[1].status, 'passed');
      assert.equal(health.stages[2].status, 'passed');
      assert.equal(health.candidate.status, 'deduplicated');
      assert.deepEqual(health.candidate.pins, health.baseline.pins);
      assert.ok(!raw.includes('secret-marker'));
      assert.ok(
        !(await readFile(join(output, 'health.md'), 'utf8')).includes(
          'secret-marker',
        ),
      );
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
}

test('Python weekly success records pins and hashes without rewriting qualification', async () => {
  const output = await mkdtemp(join(tmpdir(), 'pydantic-health-'));

  try {
    const result = await runBaseline({
      output,
      metadataLoader: metadata,
      runner: async () => ({ exitCode: 0 }),
    });
    const health = JSON.parse(
      await readFile(join(output, 'health.json'), 'utf8'),
    );

    assert.equal(result.exitCode, 0);
    assert.equal(health.status, 'passed');
    assert.deepEqual(health.baseline, await metadata());
    assert.ok(
      (await readdir(output)).some((name) => name.startsWith('attempt-')),
    );
    assert.equal(health.qualification, 'unchanged');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('setup or metadata failure always emits sanitized not-run artifacts', async () => {
  const output = await mkdtemp(join(tmpdir(), 'pydantic-health-'));

  try {
    const result = await runBaseline({
      output,
      metadataLoader: async () => {
        throw new Error('secret-marker');
      },
      runner: async () => {
        assert.fail('must not run');
      },
    });
    const raw = await readFile(join(output, 'health.json'), 'utf8');
    const health = JSON.parse(raw);

    assert.equal(result.exitCode, 1);
    assert.equal(health.status, 'infrastructure-error');
    assert.ok(health.stages.every(({ status }) => status === 'not-run'));
    assert.equal(health.candidate.status, 'not-run');
    assert.ok(!raw.includes('secret-marker'));
    assert.equal((await writeNotRunHealth({ output })).exitCode, 1);
    assert.ok(
      (await readFile(join(output, 'health.md'), 'utf8')).includes(
        'infrastructure-error',
      ),
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('Python workflow fallback CLI writes sanitized artifacts without installed frameworks', async () => {
  const output = await mkdtemp(join(tmpdir(), 'pydantic-fallback-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        'tools/conformance/agent-frameworks/program/pydantic-weekly.mjs',
        '--not-run',
        '--output',
        output,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    const health = JSON.parse(
      await readFile(join(output, 'health.json'), 'utf8'),
    );

    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.equal(health.status, 'infrastructure-error');
    assert.equal(health.baseline, null);
    assert.ok(health.stages.every(({ status }) => status === 'not-run'));
    assert.ok(
      (await readFile(join(output, 'health.md'), 'utf8')).includes(
        'infrastructure-error',
      ),
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
