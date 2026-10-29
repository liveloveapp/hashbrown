import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { terminateFixture } from '../harness/terminate-fixture';

test('disposes an isolated fixture without waiting for graceful server shutdown', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (!child.stdout) throw new Error('Missing fixture stdout');
  await once(child.stdout, 'data');

  try {
    await terminateFixture(child);

    expect(child.signalCode).toBe('SIGKILL');
  } finally {
    if (child.signalCode === null && child.exitCode === null)
      child.kill('SIGKILL');
  }
});

test('disposing an already exited fixture is a no-op', async () => {
  const child = spawn(process.execPath, ['-e', '']);
  await once(child, 'exit');

  await terminateFixture(child);

  expect(child.exitCode).toBe(0);
});
