/**
 * Races a transport operation against request cancellation while owning the
 * operation's eventual settlement.
 *
 * @internal
 */
export function raceTransportOperationWithAbort<T>(
  operation: () => T | PromiseLike<T>,
  signal: AbortSignal,
  createAbortError: () => unknown,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (complete: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener('abort', handleAbort);
      complete();
    };
    const handleAbort = () => {
      settle(() => reject(createAbortError()));
    };

    signal.addEventListener('abort', handleAbort, { once: true });

    let operationResult: T | PromiseLike<T>;
    try {
      operationResult = operation();
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    Promise.resolve(operationResult).then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );

    if (signal.aborted) {
      handleAbort();
    }
  });
}
