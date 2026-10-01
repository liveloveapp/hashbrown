/**
 * Collects named phase durations for one HTTP response and formats them as a
 * `Server-Timing` header (`session;dur=1.2, snapshot;dur=10.4`), which browser
 * devtools and Playwright can read.
 */
export interface ServerTiming {
  /** Run `work`, recording how long it took under `name`, even if it throws. */
  measure<T>(name: string, work: () => Promise<T>): Promise<T>;
  /** The phases measured so far, in order, as a header value. */
  header(): string;
}

/**
 * Start collecting phases for one response.
 *
 * @param now - Clock in milliseconds; tests pass a fake one.
 */
export function createServerTiming(
  now: () => number = () => performance.now(),
): ServerTiming {
  const phases: { readonly name: string; readonly dur: number }[] = [];
  return {
    async measure(name, work) {
      const start = now();
      try {
        return await work();
      } finally {
        phases.push({ name, dur: now() - start });
      }
    },
    header: () =>
      phases.map(({ name, dur }) => `${name};dur=${dur.toFixed(1)}`).join(', '),
  };
}

/** Add phases to a `Server-Timing` value an earlier layer may already have set. */
export function appendServerTiming(
  existing: string | undefined,
  phases: string,
): string {
  return [existing, phases].filter(Boolean).join(', ');
}
