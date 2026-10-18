/* eslint-disable @typescript-eslint/no-explicit-any, no-redeclare */
import {
  type Chat,
  type DecidableSchema,
  type Decision,
  type SystemPrompt,
  type TransportOrFactory,
  ɵcreateSelectionSchema,
  ɵisUiKit,
  ɵresolveSelection,
} from '@hashbrownai/core';
import { cloneElement, type ReactElement, useMemo, useState } from 'react';
import { type ExposedComponent } from '../expose-component.fn';
import {
  useDecision,
  type UseDecisionOptions,
  type UseDecisionResult,
} from './use-decision';
import {
  useUiCompletion,
  type UseUiCompletionResult,
} from './use-ui-completion';
import { type UiKitInput } from './use-ui-kit';

/**
 * A fully rendered option for `useUiDecision` in candidates mode.
 *
 * @public
 */
export interface UiDecisionCandidate {
  /** A unique id for the candidate. Must not be empty or contain `.`. */
  id: string;
  /** Tells the model when this candidate fits the input. */
  description: string;
  /** The element rendered when the candidate is chosen. */
  element: ReactElement<any>;
}

/**
 * Options shared by both modes of `useUiDecision`.
 *
 * @public
 */
export interface UseUiDecisionBaseOptions {
  /** The input to decide about. `null` or `undefined` keeps the hook idle. */
  input: string | Decision.JsonValue | null | undefined;
  /** Whether to choose one option, or up to `max` options. */
  select: Decision.Select;
  /**
   * The minimum confidence (for `'one'`) or best probability (for `{ max }`)
   * needed to act on the decision. Defaults to 0.
   */
  minConfidence?: number;
  /** Overrides the provider's decision transport for the selection. */
  transport?: Decision.Transport;
}

/**
 * Options for `useUiDecision` in candidates mode, where app code
 * supplies fully rendered elements and the model only picks among them.
 *
 * @public
 */
export interface UseUiDecisionCandidatesOptions extends UseUiDecisionBaseOptions {
  /** The elements the model chooses from. */
  candidates: ReadonlyArray<UiDecisionCandidate>;
  /** Not used in candidates mode. */
  components?: never;
  /** Not used in candidates mode. */
  generate?: never;
}

/**
 * Settings for the UI completion that runs after the decision in narrowing
 * mode.
 *
 * @public
 */
export interface UiDecisionGenerateOptions {
  /** The system prompt for the UI completion. */
  system: string | SystemPrompt;
  /** Overrides the provider's transport for the UI completion. */
  transport?: TransportOrFactory;
  /** Milliseconds to wait after an input change before generating. */
  debounceTime?: number;
}

/**
 * Options for `useUiDecision` in narrowing mode, where the model first
 * picks exposed components and a UI completion then streams their props.
 *
 * @public
 */
export interface UseUiDecisionNarrowingOptions extends UseUiDecisionBaseOptions {
  /**
   * The components to narrow. Exposed components are decided over by `name`
   * and `description`; UI kits are always passed to the completion.
   */
  components: UiKitInput<ExposedComponent<any>>[];
  /** The UI completion settings. */
  generate: UiDecisionGenerateOptions;
  /** Not used in narrowing mode. */
  candidates?: never;
}

/**
 * Options for `useUiDecision`.
 *
 * @public
 */
export type UseUiDecisionOptions =
  UseUiDecisionCandidatesOptions | UseUiDecisionNarrowingOptions;

/**
 * The result of `useUiDecision` in candidates mode.
 *
 * @public
 */
export interface UseUiDecisionCandidatesResult {
  /** The chosen elements in order, keyed by candidate id. */
  ui: ReactElement<any>[];
  /**
   * The chosen candidate ids in order. Empty until decided, or when the
   * decision falls below `minConfidence`.
   */
  ids: string[];
  /** The underlying selection decision. */
  decision: UseDecisionResult<DecidableSchema>;
  /** Whether the decision is in flight. */
  isLoading: boolean;
  /** The decision's last failure. */
  error: Error | undefined;
}

/**
 * The result of `useUiDecision` in narrowing mode: the UI completion's
 * fields plus the decision state.
 *
 * @public
 */
export interface UseUiDecisionNarrowingResult extends Omit<
  UseUiCompletionResult<Chat.AnyTool>,
  'ui' | 'isLoading' | 'isGenerating' | 'error'
> {
  /** The rendered elements from the UI completion. */
  ui: ReactElement<any>[] | null;
  /** The underlying selection decision. */
  decision: UseDecisionResult<DecidableSchema>;
  /** Whether the selection decision has not yet settled for the input. */
  isDeciding: boolean;
  /** Whether the UI completion is loading. */
  isGenerating: boolean;
  /** Whether either phase is in progress. */
  isLoading: boolean;
  /** The UI completion's error. */
  error: Error | undefined;
  /**
   * The selection decision's failure. When set, the UI completion ran with
   * every component.
   */
  decisionError: Error | undefined;
}

const NO_COMPONENTS: UiKitInput<ExposedComponent<any>>[] = [];

interface Baseline {
  key: string | null;
  value: unknown;
  error: Error | undefined;
}

/**
 * Chooses UI for an input with a decision.
 *
 * In candidates mode the model picks among app-rendered elements and the
 * chosen elements are returned in order. Below `minConfidence` nothing is
 * chosen.
 *
 * @public
 * @example
 * ```tsx
 * const { ui } = useUiDecision({
 *   input: query,
 *   select: 'one',
 *   candidates: [
 *     { id: 'flight', description: 'One aircraft', element: <FlightCard /> },
 *     { id: 'airport', description: 'An airport', element: <AirportCard /> },
 *   ],
 * });
 * ```
 * @param options - The candidates-mode options.
 * @returns The chosen elements and decision state.
 */
export function useUiDecision(
  options: UseUiDecisionCandidatesOptions,
): UseUiDecisionCandidatesResult;
/**
 * Chooses UI for an input with a decision, then generates it.
 *
 * In narrowing mode the model first picks among the exposed components (by
 * name and description); a UI completion then streams props using only the
 * chosen components plus any UI kits. The completion waits until the decision
 * settles. When the decision fails or falls below `minConfidence`, the
 * completion runs with every component, and a failure is exposed as
 * `decisionError`. Input changes re-run the decision before generating again.
 *
 * @public
 * @example
 * ```tsx
 * const { ui, isDeciding } = useUiDecision({
 *   input: query,
 *   select: { max: 2 },
 *   components: [flightCard, airportCard, weatherCard],
 *   generate: { system: 'Show the relevant cards.' },
 * });
 * ```
 * @param options - The narrowing-mode options.
 * @returns The UI completion state plus the decision state.
 */
export function useUiDecision(
  options: UseUiDecisionNarrowingOptions,
): UseUiDecisionNarrowingResult;
export function useUiDecision(
  options: UseUiDecisionOptions,
): UseUiDecisionCandidatesResult | UseUiDecisionNarrowingResult {
  const { select, minConfidence, transport } = options;
  const candidates = options.candidates;
  const isCandidates = candidates !== undefined;
  const components = isCandidates ? NO_COMPONENTS : options.components;
  const generate = options.generate;
  const input = options.input ?? null;
  const inputKey = input === null ? null : JSON.stringify(input);

  const optionsKey = JSON.stringify({
    select,
    options: isCandidates
      ? candidates.map(({ id, description }) => ({ id, description }))
      : components
          .filter((entry) => !ɵisUiKit(entry))
          .map((entry) => {
            const { name, description } = entry as ExposedComponent<any>;
            return { id: name, description };
          }),
  });
  const schema = useMemo(() => {
    const parsed = JSON.parse(optionsKey) as {
      select: Decision.Select;
      options: Array<{ id: string; description: string }>;
    };
    return ɵcreateSelectionSchema(parsed.options, parsed.select);
  }, [optionsKey]);

  const decisionOptions: UseDecisionOptions<DecidableSchema> = {
    schema,
    input,
    transport,
  };
  const decision = useDecision(decisionOptions);

  const selectKey = JSON.stringify(select);
  const { value, meta } = decision;
  const selection = useMemo(() => {
    if (value === null || meta === null) return null;
    return ɵresolveSelection(
      { value, meta } as Decision.Result<DecidableSchema>,
      JSON.parse(selectKey) as Decision.Select,
      minConfidence,
    );
  }, [value, meta, selectKey, minConfidence]);

  // Phase 1 has settled for this input once its value or error changes after
  // the input (or schema) changed and no request is in flight.
  const requestKey =
    inputKey === null ? null : JSON.stringify([optionsKey, inputKey]);
  const [baseline, setBaseline] = useState<Baseline>(() => ({
    key: requestKey,
    value: decision.value,
    error: decision.error,
  }));
  if (baseline.key !== requestKey) {
    setBaseline({
      key: requestKey,
      value: decision.value,
      error: decision.error,
    });
  }
  const settled =
    requestKey !== null &&
    baseline.key === requestKey &&
    !decision.isLoading &&
    (decision.value !== null || decision.error !== undefined) &&
    (decision.value !== baseline.value || decision.error !== baseline.error);

  const confidentIds =
    selection !== null && selection.confident ? selection.ids : null;
  const chosenKey = !settled
    ? null
    : JSON.stringify([
        requestKey,
        decision.error === undefined ? confidentIds : null,
      ]);

  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  const completion = useUiCompletion<string | Decision.JsonValue>({
    input:
      !isCandidates && chosenKey !== null && chosenKey === appliedKey
        ? input
        : null,
    system: generate?.system ?? '',
    components,
    transport: generate?.transport,
    debounceTime: generate?.debounceTime,
  });

  if (!isCandidates && chosenKey !== null && chosenKey !== appliedKey) {
    // Adjusts state from the previous render (the completion's components
    // and ours); React re-renders before committing, so the completion sees
    // the chosen components together with the input.
    setAppliedKey(chosenKey);
    const chosen =
      decision.error === undefined && confidentIds !== null
        ? components.filter(
            (entry) =>
              ɵisUiKit(entry) ||
              confidentIds.includes((entry as ExposedComponent<any>).name),
          )
        : components;
    completion.setComponents(chosen);
  }

  if (isCandidates) {
    const ids = selection !== null && selection.confident ? selection.ids : [];
    const ui = ids.flatMap((id) => {
      const candidate = candidates.find((entry) => entry.id === id);
      return candidate ? [cloneElement(candidate.element, { key: id })] : [];
    });
    return {
      ui,
      ids,
      decision,
      isLoading: decision.isLoading,
      error: decision.error,
    };
  }

  const isDeciding = requestKey !== null && !settled;
  return {
    ...completion,
    ui: completion.ui,
    decision,
    isDeciding,
    isGenerating: completion.isLoading,
    isLoading: isDeciding || completion.isLoading,
    error: completion.error,
    decisionError: decision.error,
  };
}
