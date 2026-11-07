import { spawn } from 'node:child_process';
import { publicChildEnvironment } from './live-configuration';

/** Runs only an explicitly selected ESM qualifier, retaining bounded result bytes and draining its entire owned process group. */
export async function runRecoveryQualifier(
  entry: string,
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  timeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 900_000)
    throw new Error('RECOVERY_SELECTION_INVALID');
  signal?.throwIfAborted();
  const child = spawn(process.execPath, [entry, ...args], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: publicChildEnvironment(environment),
  });
  const chunks: Buffer[] = [];
  let length = 0;
  let failed = false;
  const kill = () => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* Owned group already exited. */
    }
  };
  const abort = () => {
    failed = true;
    kill();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => {
    failed = true;
    kill();
  }, timeoutMs);
  timer.unref();
  child.stdout.on('data', (chunk: Buffer) => {
    length += chunk.length;
    if (length > 32 * 1024 * 1024) {
      failed = true;
      kill();
    } else chunks.push(Buffer.from(chunk));
  });
  child.stderr.on('data', () => {
    /* Discard raw qualifier output; never persist stack traces, bodies or environments. */
  });
  let code: number | null = null;
  await new Promise<void>((done) => {
    child.once('error', () => {
      failed = true;
      done();
    });
    child.once('close', (value) => {
      code = value;
      done();
    });
  });
  clearTimeout(timer);
  signal?.removeEventListener('abort', abort);
  kill();
  if (process.platform !== 'win32' && child.pid) {
    const end = Date.now() + 1000;
    let alive = true;
    while (alive && Date.now() < end) {
      try {
        process.kill(-child.pid, 0);
      } catch {
        alive = false;
        break;
      }
      await new Promise<void>((done) => setTimeout(done, 20));
    }
    if (alive) failed = true;
  }
  if (failed || signal?.aborted || code !== 0)
    throw new Error('RECOVERY_SELECTION_INVALID');
  return Buffer.concat(chunks).toString('utf8');
}
