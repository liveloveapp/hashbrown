import {
  useContext,
  useEffect,
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
  transport: Decision.Transport;
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
 * The decision runtime is recreated only when the serialized schema, the
 * transport, or the system, debounceTime, retries or optionOrder options
 * change. Input changes trigger a new decision.
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
  const schemaKey = JSON.stringify(s.toJsonSchema(schema));
  const [, recreate] = useReducer((n: number) => n + 1, 0);
  const holderRef = useRef<Holder<S> | null>(null);

  let holder = holderRef.current;
  if (
    !holder ||
    holder.destroyed ||
    holder.schemaKey !== schemaKey ||
    holder.transport !== transport ||
    holder.system !== system ||
    holder.debounceTime !== debounceTime ||
    holder.retries !== retries ||
    holder.optionOrder !== optionOrder
  ) {
    holder = {
      schemaKey,
      transport,
      system,
      debounceTime,
      retries,
      optionOrder,
      runtime: ɵcreateDecisionRuntime({
        schema,
        transport,
        system,
        debounceTime,
        retries,
        optionOrder,
      }),
      destroyed: false,
    };
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
    reload: () => runtime.reload(),
    stop: () => runtime.stop(),
  };
}
