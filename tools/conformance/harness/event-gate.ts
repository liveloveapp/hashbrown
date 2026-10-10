/** Creates a bounded, abortable gate for explicit event delivery in HTTP tests. */
export function createEventGate(timeoutMs = 10_000): {
  wait: (index: number, signal: AbortSignal) => Promise<void>;
  releaseThrough: (index: number) => void;
} {
  let released = -1;
  const listeners = new Set<() => void>();

  return {
    releaseThrough(index) {
      released = Math.max(released, index);
      for (const listener of [...listeners]) listener();
    },
    wait(index, signal) {
      if (signal.aborted)
        return Promise.reject(new Error('Event gate aborted'));
      if (index <= released) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          listeners.delete(check);
          signal.removeEventListener('abort', abort);
        };
        const check = () => {
          if (index <= released) {
            cleanup();
            resolve();
          }
        };
        const abort = () => {
          cleanup();
          reject(new Error('Event gate aborted'));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Timed out waiting for event ${index}`));
        }, timeoutMs);
        listeners.add(check);
        signal.addEventListener('abort', abort, { once: true });
      });
    },
  };
}
