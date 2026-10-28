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

/**
 * Holds a renderable plan fragment until the browser observes the unfinished component.
 * @param completeFirstStep - Waits for a complete first item when the kit uses non-streaming strings.
 */
export function createWorkbenchPlanPreview(completeFirstStep = false): {
  readonly wait: (delta: string, signal: AbortSignal) => Promise<void>;
  readonly release: () => void;
} {
  const preview = createWorkbenchPreview();
  let text = '';
  return {
    release: preview.release,
    wait: async (delta, signal) => {
      text += delta;
      const ready = completeFirstStep
        ? /"steps"\s*:\s*\[\s*"(?:[^"\\]|\\.)*"/.test(text)
        : /"steps"\s*:\s*\[\s*"[^"]+/.test(text);
      if (ready) await preview.wait(signal);
    },
  };
}

/** Holds incomplete required UI-kit props until the browser observes its framework fallback. */
export function createWorkbenchFallbackPreview(): {
  readonly wait: (delta: string, signal: AbortSignal) => Promise<void>;
  readonly release: () => void;
} {
  const preview = createWorkbenchPreview();
  let text = '';
  return {
    release: preview.release,
    wait: async (delta, signal) => {
      text += delta;
      if (/"title"\s*:\s*"[^"]+/.test(text)) await preview.wait(signal);
    },
  };
}
