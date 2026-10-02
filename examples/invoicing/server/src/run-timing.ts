/** One structured log line about an agent run's timing. */
export type RunTimingLine =
  | {
      readonly event: 'invoicing.run.step';
      readonly route: string;
      readonly runId: string;
      readonly step: string;
      /** Milliseconds from the run's authorisation to the step's start. */
      readonly at: number;
      readonly dur: number;
      readonly ok: boolean;
    }
  | {
      readonly event: 'invoicing.run.done';
      readonly route: string;
      readonly runId: string;
      readonly total: number;
    };

/**
 * Times the tool calls of one agent run. B4 has no per-turn hook, so the
 * model's own turns show up as the gaps between steps: a step's `at` minus the
 * previous step's end is the model thinking.
 *
 * B4 skips the middleware `after` hook for runs parked on an approval
 * interrupt and for errored or aborted runs, so those runs log their steps
 * without a `done` line.
 */
export interface RunTimer {
  /** Run `work` as the named step and log its offset and duration. */
  time<T>(step: string, work: () => Promise<T>): Promise<T>;
  /**
   * Log the run's total duration so far. Called from the `after` hook, which
   * B4 skips for runs parked on an approval interrupt and for errored or
   * aborted runs; those runs have steps but no `done` line.
   */
  done(): void;
}

const round = (ms: number) => Math.round(ms);

/**
 * Start timing one run.
 *
 * @param route - The B4 route, e.g. `/assistant`.
 * @param runId - The AG-UI run id from the request body.
 * @param log - Where lines go; one JSON object per line on stdout by default,
 *   which Vercel keeps in the function logs.
 * @param now - Clock in milliseconds; tests pass a fake one.
 */
export function createRunTimer(
  route: string,
  runId: string,
  log: (line: RunTimingLine) => void = (line) =>
    console.info(JSON.stringify(line)),
  now: () => number = () => performance.now(),
): RunTimer {
  const start = now();
  return {
    async time(step, work) {
      const begin = now();
      let ok = false;
      try {
        const result = await work();
        ok = true;
        return result;
      } finally {
        log({
          event: 'invoicing.run.step',
          route,
          runId,
          step,
          at: round(begin - start),
          dur: round(now() - begin),
          ok,
        });
      }
    },
    done() {
      log({
        event: 'invoicing.run.done',
        route,
        runId,
        total: round(now() - start),
      });
    },
  };
}

/**
 * A copy of a run's middleware context whose functions are timed as steps,
 * plus the timer itself under `runTimer` so the `after` hook can close the
 * run. Non-function values (the response schema, the `rendered` marker) are
 * kept by reference.
 */
export function timeContext<T extends Readonly<Record<string, unknown>>>(
  context: T,
  timer: RunTimer,
): T & { readonly runTimer: RunTimer } {
  const timed = Object.fromEntries(
    Object.entries(context).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) =>
            timer.time(name, async () =>
              (value as (...a: unknown[]) => unknown)(...args),
            )
        : value,
    ]),
  );
  return Object.freeze({ ...timed, runTimer: timer }) as T & {
    readonly runTimer: RunTimer;
  };
}

/** The run timer `timeContext` attached, if this context has one. */
export function runTimerOf(
  context: Readonly<Record<string, unknown>> | undefined,
): RunTimer | undefined {
  const timer = context?.['runTimer'];
  return timer && typeof timer === 'object' && 'done' in timer
    ? (timer as RunTimer)
    : undefined;
}
