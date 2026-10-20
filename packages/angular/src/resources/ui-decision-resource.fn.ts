/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  assertInInjectionContext,
  computed,
  type DestroyableInjector,
  DestroyRef,
  effect,
  inject,
  Injector,
  isSignal,
  linkedSignal,
  runInInjectionContext,
  signal,
  type Signal,
  type Type,
  untracked,
} from '@angular/core';
import {
  type Chat,
  createSelectionSchema,
  type DecidableSchema,
  type Decision,
  DecisionSchemaError,
  s,
  type TransportOrFactory,
  ɵcreateComponentSelection,
  ɵresolveSelection,
} from '@hashbrownai/core';
import { type ExposedComponent } from '../utils/expose-component.fn';
import { type UiAssistantMessage } from '../utils/ui-chat.helpers';
import { readReactiveOption } from '../utils/signals';
import { type ReactiveOption } from '../utils/types';
import { type UiKitInput } from '../utils/ui-kit.fn';
import {
  decisionResource,
  type DecisionResourceRef,
} from './decision-resource.fn';
import {
  uiCompletionResource,
  type UiCompletionResourceRef,
} from './ui-completion-resource.fn';

/**
 * A component option for `uiDecisionResource` in candidates mode.
 *
 * @public
 */
export interface UiDecisionCandidate {
  /** A unique id for the candidate. Must not be empty or contain `.`. */
  id: string;
  /** Tells the model when this candidate fits the input. */
  description: string;
  /** The component rendered when the candidate is chosen. */
  component: Type<unknown>;
  /**
   * Inputs bound to the component when it is rendered. Pass a signal to keep
   * the rendered component in step with app state; changing it re-renders the
   * chosen candidate without a new decision. The `id` and `description` stay
   * static.
   */
  inputs?: Record<string, unknown> | Signal<Record<string, unknown>>;
}

/**
 * A candidate chosen by `uiDecisionResource`, with its `inputs` resolved to
 * their latest value.
 *
 * @public
 */
export interface UiDecisionChosenCandidate {
  /** The candidate's id. */
  id: string;
  /** The candidate's description. */
  description: string;
  /** The component to render. */
  component: Type<unknown>;
  /** The latest inputs to bind to the component. */
  inputs?: Record<string, unknown>;
}

/**
 * Options shared by both modes of `uiDecisionResource`.
 *
 * @public
 */
export interface UiDecisionResourceBaseOptions {
  /** The input to decide about. `null` or `undefined` keeps the resource idle. */
  input: Signal<string | Decision.JsonValue | null | undefined>;
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
   * again and resets the selection.
   */
  system?: ReactiveOption<string>;
  /**
   * `'shuffled'` varies the order of the options on every request, to spread
   * the model's bias toward the first option. Defaults to `'declared'`.
   */
  optionOrder?: 'declared' | 'shuffled';
  /**
   * How long the input must stay unchanged, in milliseconds, before the
   * selection is decided. Separate from `generate.debounce`.
   */
  debounce?: number;
}

/**
 * Options for `uiDecisionResource` in candidates mode, where app code
 * supplies the components and the model only picks among them.
 *
 * @public
 */
export interface UiDecisionResourceCandidatesOptions extends UiDecisionResourceBaseOptions {
  /** The candidates the model chooses from. */
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
  system: ReactiveOption<string>;
  /** Overrides the provider's transport for the UI completion. */
  transport?: TransportOrFactory;
  /** Milliseconds to wait after an input change before generating. */
  debounce?: number;
}

/**
 * Options for `uiDecisionResource` in narrowing mode, where the model
 * first picks exposed components and a UI completion then streams their props.
 *
 * @public
 */
export interface UiDecisionResourceNarrowingOptions extends UiDecisionResourceBaseOptions {
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
 * Options for `uiDecisionResource`.
 *
 * @public
 */
export type UiDecisionResourceOptions =
  UiDecisionResourceCandidatesOptions | UiDecisionResourceNarrowingOptions;

/**
 * The result of `uiDecisionResource` in candidates mode.
 *
 * @public
 */
export interface UiDecisionResourceCandidatesRef {
  /** Identifies candidates mode. */
  readonly mode: 'candidates';
  /**
   * The chosen candidate ids in order. Empty until decided, or when the
   * decision falls below `minConfidence`.
   */
  ids: Signal<string[]>;
  /**
   * The chosen candidates in order, with signal `inputs` read reactively so
   * this updates when they change.
   */
  chosen: Signal<UiDecisionChosenCandidate[]>;
  /** The underlying selection decision. */
  decision: DecisionResourceRef<DecidableSchema>;
  /** Whether the decision is in flight. */
  isLoading: Signal<boolean>;
  /** The decision's last failure. */
  error: Signal<Error | undefined>;
}

/**
 * The result of `uiDecisionResource` in narrowing mode.
 *
 * @public
 */
export interface UiDecisionResourceNarrowingRef {
  /** Identifies narrowing mode. */
  readonly mode: 'narrowing';
  /**
   * The UI completion's assistant message. Null before the completion runs
   * and while it is in an error state (see `error`).
   */
  value: Signal<UiAssistantMessage<Chat.AnyTool> | null>;
  /** The underlying selection decision. */
  decision: DecisionResourceRef<DecidableSchema>;
  /** Whether the selection decision has not yet settled for the input. */
  isDeciding: Signal<boolean>;
  /** Whether the UI completion is loading. */
  isGenerating: Signal<boolean>;
  /** Whether either phase is in progress. */
  isLoading: Signal<boolean>;
  /** The UI completion's error. */
  error: Signal<Error | undefined>;
  /**
   * The selection decision's failure. When set, the UI completion ran with
   * every component. A `DecisionSchemaError` here means the components could
   * not be decided over (for example more than 255 with `'one'`, or a name
   * containing `.`), so no decision was asked.
   */
  decisionError: Signal<Error | undefined>;
  /**
   * Reloads the UI completion.
   *
   * @returns Whether the completion was reloaded; false before it exists.
   */
  reload: () => boolean;
  /** Stops the UI completion's streaming response, if any. */
  stop: () => void;
}

/**
 * The result of `uiDecisionResource`.
 *
 * @public
 */
export type UiDecisionResourceRef =
  UiDecisionResourceCandidatesRef | UiDecisionResourceNarrowingRef;

/**
 * Decided over when there is nothing to choose (no components after
 * flattening, or no candidates). The decision stays idle, so it never sends a request.
 */
const PLACEHOLDER_SCHEMA: DecidableSchema = s.object('Selection', {
  unused: s.boolean('Unused'),
});

/**
 * Builds the selection schema, or null when there is nothing to decide.
 * Candidates are app-authored, so an invalid candidate list throws. Narrowing
 * options come from component names, which may not fit the selection limits;
 * then the schema error is returned and narrowing falls back to every
 * component.
 */
function buildSelectionSchema(
  options: Array<{ id: string; description: string }>,
  select: Decision.Select,
  isCandidates: boolean,
): { schema: DecidableSchema | null; schemaError: Error | undefined } {
  if (options.length === 0) return { schema: null, schemaError: undefined };
  try {
    return {
      schema: createSelectionSchema(options, select),
      schemaError: undefined,
    };
  } catch (error) {
    if (isCandidates || !(error instanceof DecisionSchemaError)) throw error;
    return { schema: null, schemaError: error };
  }
}

interface Baseline {
  key: string | null;
  value: unknown;
  error: Error | undefined;
  /** Whether a request was seen in flight for `key`. */
  started: boolean;
}

interface Phase2 {
  setKey: string;
  injector: DestroyableInjector;
  ref: UiCompletionResourceRef<Chat.AnyTool>;
}

/**
 * Chooses UI for an input with a decision.
 *
 * In candidates mode the model picks among app-supplied components and the
 * chosen candidates are exposed in order; render them with `hb-ui-decision`.
 * Below `minConfidence`, or with no candidates, nothing is chosen. Must be
 * called in an injection context and requires `provideHashbrown`.
 *
 * @public
 * @example
 * ```ts
 * readonly cards = uiDecisionResource({
 *   input: this.query,
 *   select: 'one',
 *   candidates: [
 *     { id: 'flight', description: 'One aircraft', component: FlightCard },
 *     { id: 'airport', description: 'An airport', component: AirportCard },
 *   ],
 * });
 * ```
 * @param options - The candidates-mode options.
 * @returns The chosen candidates and decision state.
 */
export function uiDecisionResource(
  options: UiDecisionResourceCandidatesOptions,
): UiDecisionResourceCandidatesRef;
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
 * same applies when the decision is stopped, and when the flattened
 * components break the selection limits (exposed as a `DecisionSchemaError`).
 * With no components there is nothing to decide, so the completion runs
 * straight away. Changing `system` re-runs the decision before generating
 * again. To pin the
 * questions on a server, pass `componentSelectionOptions(components)` to
 * `createSelectionSchema`. Input changes re-run
 * the decision before generating again.
 *
 * Each distinct chosen set gets a fresh UI completion, created in a child
 * injector of the calling context; the previous one is destroyed when the
 * set changes and when the calling context is destroyed. Must be called in an
 * injection context and requires `provideHashbrown`.
 *
 * @public
 * @example
 * ```ts
 * readonly cards = uiDecisionResource({
 *   input: this.query,
 *   select: { max: 2 },
 *   components: [flightCard, airportCard, weatherCard],
 *   generate: { system: 'Show the relevant cards.' },
 * });
 * ```
 * @param options - The narrowing-mode options.
 * @returns The UI completion state plus the decision state.
 */
export function uiDecisionResource(
  options: UiDecisionResourceNarrowingOptions,
): UiDecisionResourceNarrowingRef;
export function uiDecisionResource(
  options: UiDecisionResourceOptions,
): UiDecisionResourceRef {
  assertInInjectionContext(uiDecisionResource);
  const { select, minConfidence } = options;
  const candidates = options.candidates;
  const isCandidates = candidates !== undefined;
  const components = isCandidates ? [] : options.components;

  const componentSelection =
    ɵcreateComponentSelection<ExposedComponent<any>>(components);
  const decisionOptions = isCandidates
    ? candidates.map(({ id, description }) => ({ id, description }))
    : componentSelection.options;
  const optionIds = decisionOptions.map(({ id }) => id);
  const { schema, schemaError } = buildSelectionSchema(
    decisionOptions,
    select,
    isCandidates,
  );
  const hasOptions = schema !== null;

  const input = computed(() => options.input() ?? null);
  const decision = decisionResource({
    schema: schema ?? PLACEHOLDER_SCHEMA,
    input: computed(() => (hasOptions ? input() : null)),
    transport: options.transport,
    system: options.system,
    optionOrder: options.optionOrder,
    debounce: options.debounce,
  });

  const selection = computed(() => {
    const value = decision.value();
    const meta = decision.meta();
    if (!hasOptions || value === null || meta === null) return null;
    return ɵresolveSelection(
      { value, meta } as Decision.Result<DecidableSchema>,
      select,
      optionIds,
      minConfidence,
    );
  });
  const ids = computed(() => {
    const current = selection();
    return current !== null && current.confident ? current.ids : [];
  });

  if (isCandidates) {
    const chosen = computed(() =>
      ids().flatMap((id): UiDecisionChosenCandidate[] => {
        const candidate = candidates.find((entry) => entry.id === id);
        if (!candidate) return [];
        const { inputs, ...rest } = candidate;
        if (inputs === undefined) return [rest];
        return [{ ...rest, inputs: isSignal(inputs) ? inputs() : inputs }];
      }),
    );
    return {
      mode: 'candidates',
      ids,
      chosen,
      decision,
      isLoading: decision.isLoading,
      error: decision.error,
    };
  }

  const generate = options.generate;
  // A `system` change recreates the decision runtime (resetting its value),
  // so it starts a new request too. `optionOrder` and `debounce` are static.
  const requestKey = computed(() => {
    const current = input();
    return current === null
      ? null
      : JSON.stringify([
          current,
          options.system === undefined
            ? null
            : readReactiveOption(options.system),
          options.optionOrder ?? null,
          options.debounce ?? null,
        ]);
  });

  // Phase 1 has settled for this input once no request is in flight and
  // either a request was seen in flight since the input changed, or the value
  // or error changed since then. Without options there is nothing to decide,
  // so it settles at once. The baseline is captured when the key changes and
  // accumulates `started` while the key stays the same.
  const baseline = linkedSignal<
    {
      key: string | null;
      value: unknown;
      error: Error | undefined;
      loading: boolean;
    },
    Baseline
  >({
    source: () => ({
      key: requestKey(),
      value: decision.value(),
      error: decision.error(),
      loading: decision.isLoading(),
    }),
    computation: (source, previous) =>
      previous !== undefined && previous.value.key === source.key
        ? {
            ...previous.value,
            started: previous.value.started || source.loading,
          }
        : {
            key: source.key,
            value: source.value,
            error: source.error,
            started: source.loading,
          },
  });
  const freshValue = computed(
    () => decision.value() !== null && decision.value() !== baseline().value,
  );
  const settled = computed(() => {
    if (requestKey() === null) return false;
    if (!hasOptions) return true;
    const current = baseline();
    const error = decision.error();
    const freshError = error !== undefined && error !== current.error;
    return (
      !decision.isLoading() && (current.started || freshValue() || freshError)
    );
  });
  const isDeciding = computed(() => requestKey() !== null && !settled());

  // Only a fresh, error-free, confident result narrows; anything else (no
  // options, a failure, a stop, low confidence) falls back to every component.
  const chosen = computed(() => {
    if (!settled()) return null;
    const current = selection();
    const confidentIds =
      freshValue() &&
      decision.error() === undefined &&
      current !== null &&
      current.confident
        ? current.ids
        : null;
    return {
      setKey: JSON.stringify(confidentIds),
      confidentIds,
      input: input(),
    };
  });
  const chosenSetKey = computed(() => chosen()?.setKey ?? null);

  const injector = inject(Injector);
  const phase2 = signal<Phase2 | null>(null);
  let destroyed = false;

  function destroyPhase2() {
    untracked(phase2)?.injector.destroy();
    phase2.set(null);
  }

  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    destroyPhase2();
  });

  effect(() => {
    const setKey = chosenSetKey();
    if (setKey === null || destroyed) return;
    const confidentIds = untracked(chosen)?.confidentIds ?? null;
    untracked(() => {
      if (phase2()?.setKey === setKey) return;
      destroyPhase2();
      const chosenComponents =
        confidentIds === null
          ? components
          : componentSelection.expand(confidentIds);
      // The phase-2 input carries the input only while the decision has
      // settled with this resource's set; otherwise it holds it back.
      const gatedInput = computed(() => {
        const current = chosen();
        return current !== null && current.setKey === setKey
          ? current.input
          : null;
      });
      const child = Injector.create({ providers: [], parent: injector });
      const ref = runInInjectionContext(child, () =>
        uiCompletionResource<string | Decision.JsonValue>({
          components: chosenComponents,
          input: gatedInput,
          system: generate.system,
          transport: generate.transport,
          debounce: generate.debounce,
        }),
      );
      phase2.set({ setKey, injector: child, ref });
    });
  });

  const value = computed(() => {
    const current = phase2();
    return current && current.ref.status() !== 'error'
      ? current.ref.value()
      : null;
  });
  const isGenerating = computed(() => phase2()?.ref.isLoading() ?? false);

  return {
    mode: 'narrowing',
    value,
    decision,
    isDeciding,
    isGenerating,
    isLoading: computed(() => isDeciding() || isGenerating()),
    error: computed(() => phase2()?.ref.error() ?? undefined),
    decisionError: computed(() =>
      hasOptions ? decision.error() : schemaError,
    ),
    reload: () => untracked(phase2)?.ref.reload() ?? false,
    stop: () => untracked(phase2)?.ref.stop(),
  };
}
