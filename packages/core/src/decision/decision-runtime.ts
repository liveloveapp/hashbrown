import type { s } from '../schema';
import { TransportError } from '../transport/transport-error';
import { sleep } from '../utils/async';
import { compileDecision } from './compile-decision';
import type { DecidableSchema } from './decidable-schema';
import { decodeDecision } from './decode-decision';
import type {
  JsonValue as DecisionJsonValue,
  Meta as DecisionMeta,
  Request as DecisionRequest,
  Response as DecisionResponse,
  Result as DecisionResult,
  Transport as DecisionTransport,
} from './decision.types';

/** Fixed delay between retries. */
const RETRY_DELAY_MS = 250;

/**
 * Options for creating a decision runtime.
 *
 * @public
 */
export interface DecisionRuntimeOptions<S extends DecidableSchema> {
  /** The decidable schema whose questions the model answers. */
  schema: S;
  /** Sends decision requests to an endpoint. */
  transport: DecisionTransport;
  /** Optional system text; when set, state is sent as `{ system, input }`. */
  system?: string;
  /** Milliseconds to wait after an input change before sending. Defaults to 0. */
  debounceTime?: number;
  /** Number of retries for retryable transport errors. Defaults to 0. */
  retries?: number;
  /** Order of options in questions. `shuffled` recompiles per request. */
  optionOrder?: 'declared' | 'shuffled';
}

/**
 * The observable state of a decision runtime.
 *
 * @public
 */
export interface DecisionRuntimeState<S extends DecidableSchema> {
  /** The lifecycle status of the current request. */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** The last decoded value, or null. */
  value: s.Infer<S> | null;
  /** Metadata mirroring the value, or null. */
  meta: DecisionMeta<S> | null;
  /** The last failure, cleared when a new request starts. */
  error: Error | undefined;
}

/**
 * A framework-free runtime that turns input changes into decisions.
 *
 * @public
 */
export interface DecisionRuntime<S extends DecidableSchema> {
  /** Returns the current state; the reference is stable until it changes. */
  getState(): DecisionRuntimeState<S>;
  /** Subscribes to state changes and returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Sets the input to decide about; `null` aborts and resets to idle. */
  setInput(input: string | DecisionJsonValue | null): void;
  /** Resends the last non-null input; returns false when there is none. */
  reload(): boolean;
  /** Aborts the in-flight request, keeping the last value. */
  stop(): void;
  /** Aborts the in-flight request and drops all listeners. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// State reducer (pure)
// ---------------------------------------------------------------------------

type Action<S extends DecidableSchema> =
  | { type: 'started' }
  | { type: 'succeeded'; result: DecisionResult<S> }
  | { type: 'failed'; error: Error }
  | { type: 'reset' }
  | { type: 'stopped' };

function initialState<S extends DecidableSchema>(): DecisionRuntimeState<S> {
  return { status: 'idle', value: null, meta: null, error: undefined };
}

function reduce<S extends DecidableSchema>(
  state: DecisionRuntimeState<S>,
  action: Action<S>,
): DecisionRuntimeState<S> {
  switch (action.type) {
    case 'started':
      return state.status === 'loading' && state.error === undefined
        ? state
        : { ...state, status: 'loading', error: undefined };
    case 'succeeded':
      return {
        status: 'success',
        value: action.result.value,
        meta: action.result.meta,
        error: undefined,
      };
    case 'failed':
      return { ...state, status: 'error', error: action.error };
    case 'reset':
      return state.status === 'idle' &&
        state.value === null &&
        state.meta === null &&
        state.error === undefined
        ? state
        : initialState<S>();
    case 'stopped': {
      if (state.status !== 'loading') return state;
      return {
        ...state,
        status: state.value !== null ? 'success' : 'idle',
        error: undefined,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Runtime (effects)
// ---------------------------------------------------------------------------

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Creates a framework-free decision runtime.
 *
 * Questions are compiled once at creation, so an invalid schema throws a
 * `DecisionSchemaError` here. With `optionOrder: 'shuffled'` they are
 * recompiled for every request. Only the latest request may write state.
 *
 * @param options - The runtime options.
 * @returns The runtime.
 * @public
 */
export function createDecisionRuntime<S extends DecidableSchema>(
  options: DecisionRuntimeOptions<S>,
): DecisionRuntime<S> {
  const { schema, transport, system } = options;
  const debounceTime = options.debounceTime ?? 0;
  const retries = options.retries ?? 0;
  const shuffled = options.optionOrder === 'shuffled';
  const compiledQuestions = compileDecision(schema, {
    optionOrder: options.optionOrder,
  });

  let state = initialState<S>();
  let lastInput: string | DecisionJsonValue | null = null;
  let requestId = 0;
  let controller: AbortController | undefined;
  let destroyed = false;
  const listeners = new Set<() => void>();

  function dispatch(action: Action<S>) {
    const next = reduce(state, action);
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function abortInFlight() {
    requestId += 1;
    controller?.abort();
    controller = undefined;
  }

  async function run(input: string | DecisionJsonValue) {
    abortInFlight();
    const id = requestId;
    const current = new AbortController();
    controller = current;
    const { signal } = current;
    const isCurrent = () => id === requestId && !signal.aborted;

    dispatch({ type: 'started' });
    if (!isCurrent()) return;

    if (debounceTime > 0) {
      await sleep(debounceTime, signal);
      if (!isCurrent()) return;
    }

    const request: DecisionRequest = {
      state: system === undefined ? input : { system, input },
      questions: shuffled
        ? compileDecision(schema, { optionOrder: 'shuffled' })
        : compiledQuestions,
    };

    for (let attempt = 0; ; attempt++) {
      let response: DecisionResponse;
      try {
        response = await transport(request, signal);
      } catch (error) {
        if (!isCurrent()) return;
        const retryable =
          error instanceof TransportError &&
          error.retryable &&
          attempt < retries;
        if (!retryable) {
          dispatch({ type: 'failed', error: toError(error) });
          return;
        }
        await sleep(RETRY_DELAY_MS, signal);
        if (!isCurrent()) return;
        continue;
      }
      if (!isCurrent()) return;
      let result: DecisionResult<S>;
      try {
        result = decodeDecision(schema, response);
      } catch (error) {
        dispatch({ type: 'failed', error: toError(error) });
        return;
      }
      dispatch({ type: 'succeeded', result });
      return;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setInput(input) {
      if (destroyed) return;
      if (input === null) {
        abortInFlight();
        lastInput = null;
        dispatch({ type: 'reset' });
        return;
      }
      lastInput = input;
      void run(input);
    },
    reload() {
      if (destroyed || lastInput === null) return false;
      void run(lastInput);
      return true;
    },
    stop() {
      if (destroyed) return;
      abortInFlight();
      dispatch({ type: 'stopped' });
    },
    destroy() {
      destroyed = true;
      abortInFlight();
      listeners.clear();
    },
  };
}
