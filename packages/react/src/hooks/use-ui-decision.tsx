/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-redeclare -- the core rule (the one enabled here) flags TypeScript overload signatures of useUiDecision */
import {
  type Chat,
  createSelectionSchema,
  type DecidableSchema,
  type Decision,
  s,
  type TransportOrFactory,
  ɵcreateComponentSelection,
  ɵresolveSelection,
} from '@hashbrownai/core';
import { cloneElement, type ReactElement, useMemo, useState } from 'react';
import { type ExposedComponent } from '../expose-component.fn';
import { useDecision, type UseDecisionResult } from './use-decision';
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
  /**
   * Context sent with the input, such as what the app does. Changing it asks
   * again.
   */
  system?: string;
  /**
   * `'shuffled'` varies the order of the options on every request, to spread
   * the model's bias toward the first option. Defaults to `'declared'`.
   */
  optionOrder?: 'declared' | 'shuffled';
  /**
   * How long the input must stay unchanged, in milliseconds, before the
   * selection is decided. Separate from `generate.debounceTime`.
   */
  debounceTime?: number;
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
  system: string;
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
   * The components to narrow. UI kits are flattened into their members
   * (deduped by name, declared children included) and each component is
   * decided over by `name` and `description`. A chosen component brings the
   * components declared in its `children` with it. Use
   * `componentSelectionOptions` to build the same options on a server.
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
  'ui' | 'isLoading' | 'isGenerating' | 'error' | 'setComponents'
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

/**
 * Decided over when there is nothing to choose (no components after
 * flattening, or no candidates). The decision stays idle, so it never sends a request.
 */
const PLACEHOLDER_SCHEMA: DecidableSchema = s.object('Selection', {
  unused: s.boolean('Unused'),
});

interface Baseline {
  key: string | null;
  value: unknown;
  error: Error | undefined;
  /** Whether a request was seen in flight for `key`. */
  started: boolean;
}

/**
 * Chooses UI for an input with a decision.
 *
 * In candidates mode the model picks among app-rendered elements and the
 * chosen elements are returned in order. Below `minConfidence`, or with no
 * candidates, nothing is chosen.
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
 * In narrowing mode the model first picks among the components (by name and
 * description), with UI kits flattened into their members; a UI completion
 * then streams props using only the chosen components plus, recursively, the
 * components declared in their `children`, in declared order. The completion
 * waits until the decision settles. When the decision fails or falls below
 * `minConfidence`, the completion runs with the original `components`
 * unchanged (kits intact), and a failure is exposed as `decisionError`; the
 * same applies when the decision is stopped. With no components there is
 * nothing to decide, so the completion runs straight away. To pin the
 * questions on a server, pass `componentSelectionOptions(components)` to
 * `createSelectionSchema`. Input changes re-run
 * the decision before generating again.
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
  const {
    select,
    minConfidence,
    transport,
    system,
    optionOrder,
    debounceTime,
  } = options;
  const candidates = options.candidates;
  const isCandidates = candidates !== undefined;
  const components = isCandidates ? NO_COMPONENTS : options.components;
  const generate = options.generate;
  const input = options.input ?? null;
  const inputKey = input === null ? null : JSON.stringify(input);

  const componentSelection = useMemo(
    () => ɵcreateComponentSelection<ExposedComponent<any>>(components),
    [components],
  );
  const optionsKey = JSON.stringify({
    select,
    options: isCandidates
      ? candidates.map(({ id, description }) => ({ id, description }))
      : componentSelection.options,
  });
  const schema = useMemo(() => {
    const parsed = JSON.parse(optionsKey) as {
      select: Decision.Select;
      options: Array<{ id: string; description: string }>;
    };
    return parsed.options.length === 0
      ? null
      : createSelectionSchema(parsed.options, parsed.select);
  }, [optionsKey]);
  const hasOptions = schema !== null;

  const decision = useDecision({
    schema: schema ?? PLACEHOLDER_SCHEMA,
    input: hasOptions ? input : null,
    transport,
    system,
    optionOrder,
    debounceTime,
  });

  const selectKey = JSON.stringify(select);
  const { value, meta } = decision;
  const selection = useMemo(() => {
    if (value === null || meta === null) return null;
    const parsed = JSON.parse(optionsKey) as {
      options: Array<{ id: string }>;
    };
    return ɵresolveSelection(
      { value, meta } as Decision.Result<DecidableSchema>,
      JSON.parse(selectKey) as Decision.Select,
      parsed.options.map(({ id }) => id),
      minConfidence,
    );
  }, [value, meta, selectKey, optionsKey, minConfidence]);

  // Phase 1 has settled for this input once no request is in flight and
  // either a request was seen in flight since the input (or options) changed,
  // or the value or error changed since then. Without options there is
  // nothing to decide, so it settles at once.
  const requestKey =
    inputKey === null ? null : JSON.stringify([optionsKey, inputKey]);
  const [baseline, setBaseline] = useState<Baseline>(() => ({
    key: requestKey,
    value: decision.value,
    error: decision.error,
    started: decision.isLoading,
  }));
  if (baseline.key !== requestKey) {
    setBaseline({
      key: requestKey,
      value: decision.value,
      error: decision.error,
      started: decision.isLoading,
    });
  } else if (decision.isLoading && !baseline.started) {
    setBaseline({ ...baseline, started: true });
  }
  const freshValue =
    baseline.key === requestKey &&
    decision.value !== null &&
    decision.value !== baseline.value;
  const freshError =
    baseline.key === requestKey &&
    decision.error !== undefined &&
    decision.error !== baseline.error;
  const settled =
    requestKey !== null &&
    (!hasOptions ||
      (baseline.key === requestKey &&
        !decision.isLoading &&
        (baseline.started || freshValue || freshError)));

  // Only a fresh, error-free, confident result narrows; anything else (no
  // options, a failure, a stop, low confidence) falls back to every component.
  const confidentIds =
    hasOptions &&
    freshValue &&
    decision.error === undefined &&
    selection !== null &&
    selection.confident
      ? selection.ids
      : null;
  const chosenKey = !settled
    ? null
    : JSON.stringify([requestKey, confidentIds]);

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
      confidentIds !== null
        ? componentSelection.expand(confidentIds)
        : components;
    completion.setComponents(chosen);
  }

  const ids = useMemo(
    () =>
      hasOptions && selection !== null && selection.confident
        ? selection.ids
        : [],
    [hasOptions, selection],
  );
  const ui = useMemo(
    () =>
      ids.flatMap((id) => {
        const candidate = candidates?.find((entry) => entry.id === id);
        return candidate ? [cloneElement(candidate.element, { key: id })] : [];
      }),
    [ids, candidates],
  );

  if (isCandidates) {
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
    decisionError: hasOptions ? decision.error : undefined,
  };
}
