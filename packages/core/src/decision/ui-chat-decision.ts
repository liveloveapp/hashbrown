import type { ExposedComponentDescriptor } from '../ui/expose-component';
import type { UiKitInput } from '../ui/ui-kit';
import { createComponentSelection } from './component-selection';
import type { DecidableSchema } from './decidable-schema';
import {
  createDecisionRuntime,
  type DecisionRuntime,
  type DecisionRuntimeState,
} from './decision-runtime';
import type { Result, Select, Transport } from './decision.types';
import { createSelectionSchema, resolveSelection } from './ui-selection';

/**
 * Options for one chat-mode UI selection decision.
 *
 * @public
 */
export interface UiChatDecisionOptions {
  /** Whether to choose one component, or up to `max` components. */
  select: Select;
  /** Context for the decision model, sent with the message. */
  system?: string;
  /** The minimum confidence needed to narrow. Defaults to 0. */
  minConfidence?: number;
  /** Order of options in questions; `shuffled` varies per request. */
  optionOrder?: 'declared' | 'shuffled';
  /** Sends the decision request. */
  transport: Transport;
}

/**
 * What a chat-mode UI selection decision settled on.
 *
 * - `narrowed`: send with these components (the chosen ones plus their
 *   declared children, in declared order).
 * - `fallback`: send with every component (low confidence, a failure, a
 *   stop, nothing to decide, or components that break the selection limits).
 * - `superseded`: a newer decision replaced this one, or it was disposed;
 *   do not send.
 *
 * @public
 */
export type UiChatDecisionOutcome<T> =
  | { kind: 'narrowed'; components: T[] }
  | { kind: 'fallback' }
  | { kind: 'superseded' };

/**
 * The observable state of a chat-mode UI selection decision. `error` holds
 * the last decision failure, including a `DecisionSchemaError` when the
 * components could not be decided over.
 *
 * @public
 */
export type UiChatDecisionState = DecisionRuntimeState<DecidableSchema>;

/**
 * Decides which of a chat's components to offer for one message. Only the
 * latest decision may settle: a new `decide` call aborts the pending one.
 *
 * @public
 */
export interface UiChatDecision {
  /** Returns the current state; the reference is stable until it changes. */
  getState(): UiChatDecisionState;
  /** Subscribes to state changes and returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Asks the decision about `content` over `components` (UI kits are
   * decided by member).
   */
  decide<T extends ExposedComponentDescriptor>(
    content: string,
    components: ReadonlyArray<UiKitInput<T>>,
    options: UiChatDecisionOptions,
  ): Promise<UiChatDecisionOutcome<T>>;
  /** Aborts the pending decision, which then settles as a fallback. */
  stop(): void;
  /** Aborts the pending decision, which then settles as superseded. */
  dispose(): void;
  /**
   * Records a failure that happened after the decision settled, such as the
   * chat refusing the send, as the state's `error`.
   */
  fail(error: Error): void;
}

interface Pending {
  runtime: DecisionRuntime<DecidableSchema>;
  settle: (outcome: UiChatDecisionOutcome<never>) => void;
}

const IDLE: UiChatDecisionState = {
  status: 'idle',
  value: null,
  meta: null,
  error: undefined,
};

/**
 * Creates the framework-free decision behind chat-mode `useUiDecision` and
 * `uiDecisionResource`. Each `decide` builds the questions with
 * `createSelectionSchema` from the given components, so a server pinning
 * them with the same components asks identical questions.
 *
 * @returns The decision.
 * @public
 */
export function createUiChatDecision(): UiChatDecision {
  let state = IDLE;
  let pending: Pending | undefined;
  const listeners = new Set<() => void>();

  function setState(next: UiChatDecisionState) {
    if (
      next.status === state.status &&
      next.value === state.value &&
      next.meta === state.meta &&
      next.error === state.error
    ) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function settled(): UiChatDecisionState {
    return { ...state, status: state.value !== null ? 'success' : 'idle' };
  }

  function abortPending(outcome: UiChatDecisionOutcome<never>) {
    const current = pending;
    pending = undefined;
    if (!current) return;
    current.runtime.destroy();
    current.settle(outcome);
  }

  function decide<T extends ExposedComponentDescriptor>(
    content: string,
    components: ReadonlyArray<UiKitInput<T>>,
    options: UiChatDecisionOptions,
  ): Promise<UiChatDecisionOutcome<T>> {
    abortPending({ kind: 'superseded' });
    const selection = createComponentSelection<T>(components);
    if (selection.options.length === 0) {
      setState({ ...settled(), error: undefined });
      return Promise.resolve({ kind: 'fallback' });
    }
    let runtime: DecisionRuntime<DecidableSchema>;
    try {
      runtime = createDecisionRuntime({
        schema: createSelectionSchema(selection.options, options.select),
        transport: options.transport,
        system: options.system,
        optionOrder: options.optionOrder,
      });
    } catch (error) {
      setState({
        ...settled(),
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return Promise.resolve({ kind: 'fallback' });
    }
    const optionIds = selection.options.map(({ id }) => id);

    return new Promise((resolve) => {
      const entry: Pending = { runtime, settle: resolve };
      pending = entry;
      const finish = (outcome: UiChatDecisionOutcome<T>) => {
        if (pending !== entry) return;
        pending = undefined;
        runtime.destroy();
        resolve(outcome);
      };
      runtime.subscribe(() => {
        if (pending !== entry) return;
        const next = runtime.getState();
        if (next.status === 'loading') {
          setState({ ...state, status: 'loading', error: undefined });
          return;
        }
        if (next.status === 'error') {
          setState({ ...state, status: 'error', error: next.error });
          finish({ kind: 'fallback' });
          return;
        }
        if (next.status === 'success' && next.value !== null && next.meta) {
          setState(next);
          const selected = resolveSelection(
            { value: next.value, meta: next.meta } as Result<DecidableSchema>,
            options.select,
            optionIds,
            options.minConfidence,
          );
          finish(
            selected.confident
              ? { kind: 'narrowed', components: selection.expand(selected.ids) }
              : { kind: 'fallback' },
          );
          return;
        }
        // Stopped before an answer arrived.
        setState(settled());
        finish({ kind: 'fallback' });
      });
      runtime.setInput(content);
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    decide,
    stop() {
      pending?.runtime.stop();
    },
    dispose() {
      if (!pending) return;
      abortPending({ kind: 'superseded' });
      setState(settled());
    },
    fail(error) {
      setState({ ...state, status: 'error', error });
    },
  };
}
