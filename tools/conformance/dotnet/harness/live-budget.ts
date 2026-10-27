import { LIVE_PROJECTS } from './live-configuration';

/** Immutable upfront reservations; unused scenario allowance cannot fund another scenario. */
export const LIVE_BUDGET_MANIFEST = Object.freeze({
  groups: Object.freeze(
    [
      { name: 'streaming-plain', calls: 1 },
      { name: 'structured-schema', calls: 1 },
      { name: 'trusted-ui-action', calls: 2 },
      { name: 'browser-tool', calls: 2 },
      { name: 'server-tool', calls: 2 },
      { name: 'approval-resume-decline', calls: 3 },
      { name: 'cancellation-recovery', calls: 3 },
      { name: 'mixed-native-tools', calls: 2 },
    ].map((group) => Object.freeze(group)),
  ),
  preflights: Object.freeze([
    'openai-responses',
    'azure-responses',
    'azure-cli-chat',
  ]),
  reservedCalls: 99,
  maxRunCalls: 128,
  maxScenarioCalls: 4,
  maxOutputTokens: 384,
  scenarioTimeoutMs: 60_000,
  runTimeoutMs: 900_000,
});

/** Number of distinct cases required by the frozen project/group manifest. */
export const LIVE_CASE_COUNT =
  LIVE_PROJECTS.length * LIVE_BUDGET_MANIFEST.groups.length;

/** Immutable counters safe to include in diagnostic metadata. */
export interface LiveBudgetSnapshot {
  readonly dispatchedCalls: number;
  readonly reservedCalls: number;
}

/** Dispatch options must be the actual requested native output token ceiling. */
export interface LiveDispatchOptions {
  readonly signal: AbortSignal;
  readonly maxOutputTokens: number;
}

/** Owned per-scenario reservation, also used to configure the independent native counter. */
export interface LiveScenarioBudget {
  readonly maxCalls: number;
  readonly signal: AbortSignal;
  readonly dispatch: <T>(
    options: LiveDispatchOptions,
    operation: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
  readonly snapshot: () => LiveBudgetSnapshot;
  readonly dispose: () => void;
}

/** Run reservation owner; call dispose after all native children have been stopped. */
export interface LiveBudget {
  readonly signal: AbortSignal;
  readonly reserveScenario: (
    project: string,
    group: string,
  ) => LiveScenarioBudget;
  readonly reservePreflight: (name: string) => LiveScenarioBudget;
  readonly snapshot: () => LiveBudgetSnapshot;
  readonly dispose: () => void;
}

/** Links cooperative cancellation and an owned-process kill hook through a bounded signal. */
function deadline(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  timer.unref();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  return {
    signal: controller.signal,
    abort,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

/**
 * Awaits and drains a cooperative callback under linked run/scenario cancellation.
 * The callback must observe the signal; attach owned-child termination to it for
 * hard process deadlines. This cannot preempt legacy SDK shared token refresh.
 */
export async function withLiveDeadline<T>(
  options: { readonly runSignal: AbortSignal; readonly timeoutMs: number },
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > LIVE_BUDGET_MANIFEST.scenarioTimeoutMs
  )
    throw new Error('LIVE_DEADLINE_INVALID');
  const linked = deadline(options.runSignal, options.timeoutMs);
  try {
    if (linked.signal.aborted) throw new Error('LIVE_DEADLINE_ABORTED');
    return await operation(linked.signal);
  } finally {
    linked.dispose();
  }
}

/** Reserves fixed ceilings and counts every attempted native call before invoking work, without retries. */
export function createLiveBudget(
  options: { readonly now?: () => number } = {},
): LiveBudget {
  const now = options.now ?? Date.now;
  const started = now();
  const run = deadline(undefined, LIVE_BUDGET_MANIFEST.runTimeoutMs);
  const scenarios = new Set<string>();
  const preflights = new Set<string>();
  const disposers: (() => void)[] = [];
  let state: LiveBudgetSnapshot = Object.freeze({
    dispatchedCalls: 0,
    reservedCalls: LIVE_BUDGET_MANIFEST.reservedCalls,
  });
  let disposed = false;
  const reserve = (maxCalls: number): LiveScenarioBudget => {
    const start = now();
    const scenario = deadline(
      run.signal,
      LIVE_BUDGET_MANIFEST.scenarioTimeoutMs,
    );
    disposers.push(scenario.dispose);
    let snapshot: LiveBudgetSnapshot = Object.freeze({
      dispatchedCalls: 0,
      reservedCalls: maxCalls,
    });
    let closed = false;
    return Object.freeze({
      maxCalls,
      signal: scenario.signal,
      snapshot: () => snapshot,
      dispose: () => {
        closed = true;
        scenario.abort();
        scenario.dispose();
      },
      dispatch: async <T>(
        request: LiveDispatchOptions,
        operation: (signal: AbortSignal) => Promise<T>,
      ) => {
        if (disposed || now() - started >= LIVE_BUDGET_MANIFEST.runTimeoutMs)
          throw new Error('LIVE_RUN_DEADLINE');
        if (closed || now() - start >= LIVE_BUDGET_MANIFEST.scenarioTimeoutMs)
          throw new Error('LIVE_SCENARIO_DEADLINE');
        if (request.signal.aborted || scenario.signal.aborted)
          throw new Error('LIVE_DEADLINE_ABORTED');
        if (
          !Number.isInteger(request.maxOutputTokens) ||
          request.maxOutputTokens <= 0 ||
          request.maxOutputTokens > LIVE_BUDGET_MANIFEST.maxOutputTokens
        )
          throw new Error('LIVE_OUTPUT_TOKEN_CAP');
        if (snapshot.dispatchedCalls >= maxCalls)
          throw new Error('LIVE_SCENARIO_CALL_CAP');
        if (
          state.dispatchedCalls >= LIVE_BUDGET_MANIFEST.reservedCalls ||
          state.dispatchedCalls >= LIVE_BUDGET_MANIFEST.maxRunCalls
        )
          throw new Error('LIVE_RUN_CALL_CAP');
        const linked = deadline(
          scenario.signal,
          Math.max(1, LIVE_BUDGET_MANIFEST.scenarioTimeoutMs - (now() - start)),
        );
        const signal = AbortSignal.any([linked.signal, request.signal]);
        try {
          if (signal.aborted) throw new Error('LIVE_DEADLINE_ABORTED');
          snapshot = Object.freeze({
            ...snapshot,
            dispatchedCalls: snapshot.dispatchedCalls + 1,
          });
          state = Object.freeze({
            ...state,
            dispatchedCalls: state.dispatchedCalls + 1,
          });
          return await operation(signal);
        } finally {
          linked.dispose();
        }
      },
    });
  };
  return Object.freeze({
    signal: run.signal,
    snapshot: () => state,
    reserveScenario: (project: string, group: string) => {
      const allocation = LIVE_BUDGET_MANIFEST.groups.find(
        (entry) => entry.name === group,
      );
      if (!LIVE_PROJECTS.some((entry) => entry.name === project) || !allocation)
        throw new Error('LIVE_SCENARIO_INVALID');
      const key = `${project}/${group}`;
      if (scenarios.has(key)) throw new Error('LIVE_SCENARIO_DUPLICATE');
      scenarios.add(key);
      return reserve(allocation.calls);
    },
    reservePreflight: (name: string) => {
      if (
        !LIVE_BUDGET_MANIFEST.preflights.includes(name) ||
        preflights.has(name)
      )
        throw new Error('LIVE_PREFLIGHT_INVALID');
      preflights.add(name);
      return reserve(1);
    },
    dispose: () => {
      disposed = true;
      run.abort();
      run.dispose();
      disposers.forEach((dispose) => dispose());
    },
  });
}
