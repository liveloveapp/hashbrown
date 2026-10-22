export async function sleep(timeout: number, abortSignal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }

    const settle = () => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', settle);
      resolve();
    };
    const timeoutId = setTimeout(settle, timeout);
    abortSignal?.addEventListener('abort', settle, { once: true });
  });
}

/**
 * Re-yields a provider stream mapper's events and returns the mapper's return
 * value, stopping as soon as `signal` has aborted after any yielded event.
 * Use it as `const result = yield* forwardMapped(mapper, signal)` where a
 * `for await` loop would lose the return value. Stopping early closes the
 * mapper, so its cleanup runs.
 *
 * @param events - The mapper's generator.
 * @param signal - Run cancellation signal.
 * @returns The mapper's return value, or `undefined` when the run aborted.
 *
 * @internal
 */
export async function* forwardMapped<T, R>(
  events: AsyncGenerator<T, R>,
  signal?: AbortSignal,
): AsyncGenerator<T, R | undefined> {
  try {
    for (;;) {
      const next = await events.next();
      if (next.done) return next.value;
      yield next.value;
      if (signal?.aborted) return undefined;
    }
  } finally {
    await events.return(undefined as R);
  }
}
