import {
  RELEASE_RECOVERY_MANIFEST as limits,
  releaseRecoveryCases,
} from './live-recovery-manifest';

/** Dispatch context checked before native acquisition; cancelled/failed attempts remain charged. */
export interface RecoveryDispatchOptions {
  readonly signal: AbortSignal;
  readonly maxOutputTokens: number;
}
/** Immutable allowlisted counters, safe to persist. */
export interface RecoveryBudgetSnapshot {
  readonly dispatchedCalls: number;
  readonly reservedCalls: number;
}
/** One serial scenario reservation shared by both worker lifetimes. */
export interface RecoveryScenarioBudget {
  readonly maxCalls: number;
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
  readonly assertActive: () => void;
  readonly dispatch: <T>(
    worker: 'original' | 'replacement',
    request: RecoveryDispatchOptions,
    work: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
  readonly snapshot: () => RecoveryBudgetSnapshot;
  readonly dispose: () => void;
}
/** Separate one-call preflight reservation. */
export interface RecoveryPreflightBudget {
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
  readonly assertActive: () => void;
  readonly dispatch: <T>(
    request: RecoveryDispatchOptions,
    work: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
  readonly dispose: () => void;
}
/** Run owner; dispose only after workers and infrastructure drain. */
export interface ReleaseRecoveryBudget {
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
  readonly assertActive: () => void;
  readonly reserveScenario: (
    project: string,
    group: string,
  ) => RecoveryScenarioBudget;
  readonly reservePreflight: (name: string) => RecoveryPreflightBudget;
  readonly snapshot: () => RecoveryBudgetSnapshot;
  readonly dispose: () => void;
}

/** Reserves the twelve exact cases and three preflights with serial ownership and no retries. */
export function createReleaseRecoveryBudget(
  options: { readonly now?: () => number } = {},
): ReleaseRecoveryBudget {
  const now = options.now ?? Date.now;
  const started = now();
  const run = new AbortController();
  const timer = setTimeout(() => run.abort(), limits.runTimeoutMs);
  timer.unref();
  const seen = new Set<string>();
  const preflights = new Set<string>();
  const children = new Set<AbortController>();
  let total = 0;
  let active = false;
  let closed = false;
  const remainingRunMs = () =>
    Math.max(0, limits.runTimeoutMs - (now() - started));
  const assertRunActive = () => {
    if (closed || remainingRunMs() <= 0)
      throw new Error('RECOVERY_RUN_DEADLINE');
    run.signal.throwIfAborted();
  };
  const make = (key: string, max: number) => {
    assertRunActive();
    if (active) throw new Error('RECOVERY_SCENARIO_ACTIVE');
    const begun = now();
    const controller = new AbortController();
    children.add(controller);
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(limits.scenarioTimeoutMs, remainingRunMs()),
    );
    timeout.unref();
    const signal = AbortSignal.any([run.signal, controller.signal]);
    let disposed = false;
    let calls = 0;
    let busy = false;
    const workers = { original: 0, replacement: 0 };
    active = true;
    const remainingMs = () =>
      Math.max(
        0,
        Math.min(
          limits.scenarioTimeoutMs - (now() - begun),
          limits.runTimeoutMs - (now() - started),
        ),
      );
    const assertActive = () => {
      assertRunActive();
      if (disposed || now() - begun >= limits.scenarioTimeoutMs)
        throw new Error('RECOVERY_SCENARIO_DEADLINE');
      signal.throwIfAborted();
    };
    const dispatch = async <T>(
      worker: 'original' | 'replacement' | 'preflight',
      request: RecoveryDispatchOptions,
      work: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => {
      assertActive();
      if (signal.aborted || request.signal.aborted)
        throw new Error('RECOVERY_ABORTED');
      if (
        !Number.isInteger(request.maxOutputTokens) ||
        request.maxOutputTokens <= 0 ||
        request.maxOutputTokens > limits.maxOutputTokens
      )
        throw new Error('RECOVERY_OUTPUT_TOKEN_CAP');
      if (busy) throw new Error('RECOVERY_DISPATCH_ACTIVE');
      if (
        worker !== 'preflight' &&
        workers[worker] >= limits.workerCalls[worker]
      )
        throw new Error('RECOVERY_WORKER_CALL_CAP');
      if (calls >= max)
        throw new Error(
          worker === 'preflight'
            ? 'RECOVERY_PREFLIGHT_CALL_CAP'
            : 'RECOVERY_SCENARIO_CALL_CAP',
        );
      if (total >= limits.maxRunCalls) throw new Error('RECOVERY_RUN_CALL_CAP');
      calls++;
      total++;
      if (worker !== 'preflight') workers[worker]++;
      busy = true;
      try {
        const result = await work(AbortSignal.any([signal, request.signal]));
        assertRunActive();
        if (now() - begun >= limits.scenarioTimeoutMs)
          throw new Error('RECOVERY_SCENARIO_DEADLINE');
        return result;
      } finally {
        busy = false;
        if (disposed) active = false;
      }
    };
    return {
      key,
      maxCalls: max,
      signal,
      remainingMs,
      assertActive,
      dispatch,
      snapshot: () =>
        Object.freeze({ dispatchedCalls: calls, reservedCalls: max }),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (!busy) active = false;
        clearTimeout(timeout);
        controller.abort();
        children.delete(controller);
      },
    };
  };
  return Object.freeze({
    signal: run.signal,
    remainingMs: remainingRunMs,
    assertActive: assertRunActive,
    snapshot: () =>
      Object.freeze({
        dispatchedCalls: total,
        reservedCalls: limits.reservedCalls,
      }),
    reserveScenario: (
      project: string,
      group: string,
    ): RecoveryScenarioBudget => {
      const key = `${project}/${group}`;
      if (!releaseRecoveryCases().some((entry) => entry.id === key))
        throw new Error('RECOVERY_SCENARIO_INVALID');
      if (seen.has(key)) throw new Error('RECOVERY_SCENARIO_DUPLICATE');
      const reservation = make(key, limits.maxScenarioCalls);
      seen.add(key);
      return Object.freeze(reservation);
    },
    reservePreflight: (name: string): RecoveryPreflightBudget => {
      if (!limits.preflights.includes(name) || preflights.has(name))
        throw new Error('RECOVERY_PREFLIGHT_INVALID');
      const allocation = make(name, 1);
      preflights.add(name);
      return Object.freeze({
        signal: allocation.signal,
        remainingMs: allocation.remainingMs,
        assertActive: allocation.assertActive,
        dispose: allocation.dispose,
        dispatch: <T>(
          request: RecoveryDispatchOptions,
          work: (signal: AbortSignal) => Promise<T>,
        ) => allocation.dispatch('preflight', request, work),
      });
    },
    dispose: () => {
      closed = true;
      clearTimeout(timer);
      run.abort();
      for (const child of children) child.abort();
    },
  });
}

/** Bounds provider-free cleanup even after the execution deadline; timeout is a cleanup failure, never success. */
export async function drainRecoveryCleanup(
  work: () => Promise<unknown>,
  timeoutMs = 5000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('RECOVERY_CLEANUP_DEADLINE')),
          timeoutMs,
        );
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
