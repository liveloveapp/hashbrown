import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProcess } from './weekly.mjs';

const alive = (pid) => {
  try {
    const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return Boolean(state) && !state.startsWith('Z');
  } catch {
    return false;
  }
};

for (const nx of [false, true]) {
  test(`timeout cleans an owned detached SIGTERM-ignoring descendant before returning (${nx ? 'real Nx' : 'direct'})`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'framework-process-'));
    const script = join(folder, 'worker.cjs');
    const pidFile = join(folder, 'pid');
    const parentFile = join(folder, 'parent-pid');
    const sentinel = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { detached: true, stdio: 'ignore' },
    );
    const source = `
      const { spawn } = require('node:child_process');
      const { writeFileSync } = require('node:fs');
      if (process.argv[2] === '--worker') {
        process.on('SIGTERM', () => {});
        writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
        setInterval(() => {}, 1000);
      } else {
        writeFileSync(${JSON.stringify(parentFile)}, String(process.pid));
        spawn(process.execPath, [__filename, '--worker'], { detached: true, stdio: 'ignore' }).unref();
        setInterval(() => {}, 1000);
      }
    `;
    await writeFile(script, source);
    const command = nx
      ? {
          file: 'npx',
          args: [
            'nx',
            'agent-framework-harness-test',
            'conformance',
            `--command=node ${script}`,
            '--usePty=false',
            '--skip-nx-cache',
          ],
          timeoutMs: 5000,
        }
      : { file: process.execPath, args: [script], timeoutMs: 1000 };
    let pid;

    try {
      const result = await runProcess(command);
      pid = Number(await readFile(pidFile, 'utf8'));

      assert.equal(result.timedOut, true);
      assert.ok(
        pid > 0,
        'worker handshake must confirm that the detached descendant started',
      );
      assert.equal(
        alive(sentinel.pid),
        true,
        'cleanup must leave unrelated sibling processes alive',
      );
      assert.equal(
        alive(pid),
        false,
        'runProcess returned while its detached descendant remained alive',
      );
    } finally {
      if (!pid) pid = Number(await readFile(pidFile, 'utf8').catch(() => '0'));
      if (pid > 0 && alive(pid)) process.kill(-pid, 'SIGKILL');
      const parent = Number(
        await readFile(parentFile, 'utf8').catch(() => '0'),
      );
      if (parent > 0 && alive(parent)) process.kill(parent, 'SIGKILL');
      if (alive(sentinel.pid)) process.kill(-sentinel.pid, 'SIGKILL');
      await rm(folder, { recursive: true, force: true });
    }
  });
}
