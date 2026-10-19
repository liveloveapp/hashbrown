import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  type DecidableSchema,
  type Decision,
  s,
  ɵcreateDecisionRuntime,
} from '@hashbrownai/core';
import { HashbrownContext } from '../hashbrown-provider';

/**
 * Options for {@link useDecision}.
 *
 * @public
 */
export interface UseDecisionOptions<S extends DecidableSchema> {
  /** The decidable schema whose questions the model answers. */
  schema: S;
  /** The input to decide about. `null` or `undefined` keeps the hook idle. */
  input: string | Decision.JsonValue | null | undefined;
  /** Optional system text sent along with the input. */
  system?: string;
  /** Milliseconds to wait after an input change before sending. */
  debounceTime?: number;
  /** Number of retries for retryable transport errors. */
  retries?: number;
  /** Overrides the provider's decision transport for this hook. */
  transport?: Decision.Transport;
  /** Order of options in questions; `shuffled` varies per request. */
  optionOrder?: 'declared' | 'shuffled';
}

/**
 * The result of {@link useDecision}.
 *
 * @public
 */
export interface UseDecisionResult<S extends DecidableSchema> {
  /** The last decoded value, or null. */
  value: s.Infer<S> | null;
  /** Metadata mirroring the value, or null. */
  meta: Decision.Meta<S> | null;
  /** Whether a request is in flight. */
  isLoading: boolean;
  /** The last failure, cleared when a new request starts. */
  error: Error | undefined;
  /** Resends the last non-null input; returns false when there is none. */
  reload: () => boolean;
  /** Aborts the in-flight request, keeping the last value. */
  stop: () => void;
}

type Runtime<S extends DecidableSchema> = ReturnType<
  typeof ɵcreateDecisionRuntime<S>
>;

interface Holder<S extends DecidableSchema> {
  schemaKey: string;
  system: string | undefined;
  debounceTime: number | undefined;
  retries: number | undefined;
  optionOrder: 'declared' | 'shuffled' | undefined;
  runtime: Runtime<S>;
  destroyed: boolean;
}

/**
 * Decides about an input by asking a model closed questions defined by a
 * decidable schema, and exposes the typed answer with its metadata.
 *
 * The decision runtime is recreated only when the serialized schema, or the
 * system, debounceTime, retries or optionOrder options change. A changed
 * transport (including a new inline function each render) applies from the
 * next request and never recreates the runtime. Input changes trigger a new
 * decision.
 *
 * @public
 * @example
 * ```ts
 * const { value, isLoading } = useDecision({
 *   schema: s.object('Decision', {
 *     intent: s.enumeration('Intent', ['filter', 'chat']),
 *   }),
 *   input: query,
 * });
 * ```
 * @param options - The decision options.
 * @returns The decision state and controls.
 */
export function useDecision<S extends DecidableSchema>(
  options: UseDecisionOptions<S>,
): UseDecisionResult<S> {
  const config = useContext(HashbrownContext);

  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const { schema, system, debounceTime, retries, optionOrder } = options;
  const transport = options.transport ?? config.decisionTransport;
  const schemaKey = useMemo(
    () => JSON.stringify(s.toJsonSchema(schema)),
    [schema],
  );
  const transportRef = useRef(transport);
  const stableTransport = useCallback<Decision.Transport>(
    (request, signal) => transportRef.current(request, signal),
    [],
  );

  // Runs before the passive effects below, so the next request sees it.
  useLayoutEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  const [, recreate] = useReducer((n: number) => n + 1, 0);
  const holderRef = useRef<Holder<S> | null>(null);

  let holder = holderRef.current;
  if (
    !holder ||
    holder.destroyed ||
    holder.schemaKey !== schemaKey ||
    holder.system !== system ||
    holder.debounceTime !== debounceTime ||
    holder.retries !== retries ||
    holder.optionOrder !== optionOrder
  ) {
    holder = {
      schemaKey,
      system,
      debounceTime,
      retries,
      optionOrder,
      runtime: ɵcreateDecisionRuntime({
        schema,
        transport: stableTransport,
        system,
        debounceTime,
        retries,
        optionOrder,
      }),
      destroyed: false,
    };
    // Construction is side-effect free (no timers or requests until setInput).
    holderRef.current = holder;
  }
  const current = holder;
  const runtime = current.runtime;

  // Owns the runtime's lifetime. StrictMode runs cleanup then setup again on
  // the same holder, so a destroyed holder is replaced and a render requested.
  useEffect(() => {
    if (current.destroyed) {
      recreate();
      return;
    }
    return () => {
      current.destroyed = true;
      current.runtime.destroy();
    };
  }, [current]);

  const input = options.input ?? null;
  const inputKey = input === null ? null : JSON.stringify(input);

  useEffect(() => {
    runtime.setInput(inputKey === null ? null : JSON.parse(inputKey));
  }, [runtime, inputKey]);

  const reload = useCallback(() => runtime.reload(), [runtime]);
  const stop = useCallback(() => runtime.stop(), [runtime]);

  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getState,
    runtime.getState,
  );

  return {
    value: state.value,
    meta: state.meta,
    isLoading: state.status === 'loading',
    error: state.error,
    reload,
    stop,
  };
}
