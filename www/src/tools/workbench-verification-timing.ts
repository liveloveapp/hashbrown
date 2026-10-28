/**
 * Keeps intermediate streaming frames observable where they are asserted, while
 * ordinary fixture runs avoid the pacing used for published recordings.
 */
export function workbenchVerificationTiming(
  recording: boolean,
  lesson?: string,
): { readonly chunkMs: number; readonly verdictMs: number } {
  const streaming = lesson === 'streaming' || lesson === 'first-plan';
  return {
    chunkMs: recording || streaming ? 80 : 10,
    verdictMs: recording ? 400 : 150,
  };
}

/** Holds a fixture verdict until the browser observes its provisional UI. */
export function createWorkbenchPreview(): {
  readonly wait: (signal: AbortSignal) => Promise<void>;
  readonly release: () => void;
} {
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    wait: async (signal) => {
      if (signal.aborted) return;
      let abort: () => void = () => undefined;
      const aborted = new Promise<void>((resolve) => {
        abort = resolve;
      });
      signal.addEventListener('abort', abort, { once: true });
      try {
        await Promise.race([ready, aborted]);
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
}
