import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRecoveryQualifier } from '../harness/live-recovery-qualifier-process';

test('timed-out qualification drains the actual owned ESM child and its native-like descendant group', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recovery-qualifier-owner-'));
  const entry = join(root, 'fixture.mjs');
  const pidPath = join(root, 'descendant.pid');
  await writeFile(
    entry,
    `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.argv[2], String(child.pid));
setInterval(() => {}, 1000);
`,
  );

  try {
    await expect(
      runRecoveryQualifier(entry, [pidPath], {}, 700),
    ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
    const pid = Number(await readFile(pidPath, 'utf8'));

    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the invocation abort drains qualification children instead of granting a new local timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recovery-qualifier-abort-'));
  const entry = join(root, 'fixture.mjs');
  const pidPath = join(root, 'descendant.pid');
  const controller = new AbortController();
  await writeFile(
    entry,
    `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.argv[2], String(child.pid));
setInterval(() => {}, 1000);
`,
  );
  const timer = setTimeout(() => controller.abort(), 700);

  try {
    await expect(
      runRecoveryQualifier(entry, [pidPath], {}, 900_000, controller.signal),
    ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
    const pid = Number(await readFile(pidPath, 'utf8'));

    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    clearTimeout(timer);
    await rm(root, { recursive: true, force: true });
  }
});
