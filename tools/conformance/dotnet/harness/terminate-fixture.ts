import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

/**
 * Disposes a test-owned process immediately. Tests that exercise graceful
 * shutdown or recovery initiate that lifecycle explicitly before cleanup.
 */
export async function terminateFixture(child: ChildProcess): Promise<void> {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}
