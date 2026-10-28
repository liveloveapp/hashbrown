import type { ChildProcess } from 'node:child_process';
import { type LiveNativeStats, nativeStats } from './live-browser-fixture';

/** Drains every local-only resource after acquisition or use fails, retaining all failures. */
export async function withLocalNativeApprovalResources<T>(
  operation: (own: (cleanup: () => Promise<void>) => void) => Promise<T>,
): Promise<T> {
  const cleanups: Array<() => Promise<void>> = [];
  const outcome = await operation((cleanup) => cleanups.unshift(cleanup)).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const failures: unknown[] = 'error' in outcome ? [outcome.error] : [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if ('error' in outcome && failures.length === 1) throw outcome.error;
  if (failures.length)
    throw new AggregateError(failures, 'LOCAL_NATIVE_CLEANUP_FAILED');
  if ('value' in outcome) return outcome.value;
  throw new Error('LOCAL_NATIVE_RESULT_MISSING');
}

/** Links the caller phase deadline and an independent finite body-read timeout. */
export async function localNativeApprovalStats(
  url: string,
  signal?: AbortSignal,
): Promise<LiveNativeStats> {
  const response = await fetch(`${url}/__test/live-stats`, {
    signal: AbortSignal.any([
      AbortSignal.timeout(5_000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok) throw new Error('LIVE_STATS_FAILED');
  return nativeStats(await response.json());
}

/** Rejects bounded local startup on a spawn error or early exit without exposing process output. */
export async function waitForLocalNativeApprovalServer(
  worker: ChildProcess,
  verifyLoaded?: (output: string) => void,
): Promise<string> {
  const outputStream = worker.stdout;
  if (!outputStream) throw new Error('LOCAL_NATIVE_STDOUT_UNAVAILABLE');
  worker.stderr?.resume();
  let output = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onData: (chunk: Buffer) => void = () => undefined;
  let onExit: () => void = () => undefined;
  let onError: () => void = () => undefined;
  try {
    return await new Promise<string>((accept, reject) => {
      onData = (chunk) => {
        output = (output + chunk.toString('utf8')).slice(-8_192);
        const match = output.match(
          /Local native approval browser URL: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) {
          try {
            verifyLoaded?.(output);
            accept(match[1]);
          } catch (error) {
            reject(error);
          }
        }
      };
      onExit = () => reject(new Error('LOCAL_NATIVE_EARLY_EXIT'));
      onError = () => reject(new Error('LOCAL_NATIVE_SPAWN_FAILED'));
      timer = setTimeout(
        () => reject(new Error('LOCAL_NATIVE_STARTUP_TIMEOUT')),
        15_000,
      );
      outputStream.on('data', onData);
      worker.once('exit', onExit);
      worker.once('error', onError);
    });
  } finally {
    clearTimeout(timer);
    outputStream.removeListener('data', onData);
    worker.removeListener('exit', onExit);
    worker.removeListener('error', onError);
    outputStream.resume();
  }
}
