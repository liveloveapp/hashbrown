/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  isSignal,
  type Signal,
  signal,
  type Type,
  untracked,
} from '@angular/core';
import {
  type Chat,
  createSelectionSchema,
  type DecidableSchema,
  type Decision,
  s,
  ɵassertRuntimeMessageSchedulingAllowed,
  ɵcreateUiChatDecision,
  ɵresolveSelection,
} from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { type ExposedComponent } from '../utils/expose-component.fn';
import { readReactiveOption } from '../utils/signals';
import { type ReactiveOption } from '../utils/types';
import { type UiKitInput } from '../utils/ui-kit.fn';
import {
  decisionResource,
  type DecisionResourceRef,
  resolveDecisionTransport,
} from './decision-resource.fn';

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
  /** Whether to choose one option, or up to `max` options. */
  select: Decision.Select;
  /**
   * The minimum confidence (for `'one'`) or best probability (for `{ max }`)
   * needed to act on the decision. Defaults to 0.
   */
  minConfidence?: number;
  /**
   * Overrides the provider's decision transport for the selection. Decision
   * only: in chat mode the chat keeps its own transport.
   */
  transport?: Decision.Transport;
  /**
   * Context for the decision model (what your app is, what the input
   * means). Sent with the input, and only to the decision: in chat mode the
   * chat keeps its own system prompt.
   */
  system?: ReactiveOption<string>;
  /**
   * `'shuffled'` varies the order of the options on every request, to spread
   * the model's bias toward the first option. Defaults to `'declared'`.
   */
  optionOrder?: 'declared' | 'shuffled';
}

/**
 * Options for `uiDecisionResource` in candidates mode, where app code
 * supplies the components and the model only picks among them.
 *
 * @public
 */
export interface UiDecisionResourceCandidatesOptions extends UiDecisionResourceBaseOptions {
  /** The input to decide about. `null` or `undefined` keeps the resource idle. */
  input: Signal<string | Decision.JsonValue | null | undefined>;
  /**
   * How long the input must stay unchanged, in milliseconds, before the
   * selection is decided. Changing `system` asks again and resets the
   * selection.
   */
  debounce?: number;
  /** The candidates the model chooses from. */
  candidates: ReadonlyArray<UiDecisionCandidate>;
  /** Not used in candidates mode. */
  chat?: never;
}

/**
 * What `uiDecisionResource` needs from a chat in chat mode. The ref returned
 * by `uiChatResource` satisfies it.
 *
 * @public
 */
export interface UiDecisionChat {
  /** The components the chat offers to the model on its next request. */
  readonly components: Signal<UiKitInput<ExposedComponent<any>>[]>;
  /** Whether the chat is sending, generating or running tool calls. */
  readonly isLoading: Signal<boolean>;
  /**
   * Replaces the components the chat offers to the model. The next message
   * sent must use them.
   */
  setComponents(components: UiKitInput<ExposedComponent<any>>[]): void;
  /** Sends a user message to the chat. */
  sendMessage(message: Chat.UserMessage): void;
}

/**
 * Options for `uiDecisionResource` in chat mode, where each message sent
 * through the resource first narrows the chat's own components.
 *
 * @public
 */
export interface UiDecisionResourceChatOptions extends UiDecisionResourceBaseOptions {
  /**
   * The app's UI chat, usually the ref from `uiChatResource`. The decision
   * is over its components: UI kits are decided by member and a chosen
   * component brings the components declared in its `children`. Pass the
   * same list to `createSelectionSchema` to pin the questions on a server.
   */
  chat: UiDecisionChat;
  /** Not used in chat mode. */
  candidates?: never;
  /** Not used in chat mode: the input is each message. */
  input?: never;
  /** Not used in chat mode: messages are decided about at once. */
  debounce?: never;
}

/**
 * Options for `uiDecisionResource`.
 *
 * @public
 */
export type UiDecisionResourceOptions =
  UiDecisionResourceCandidatesOptions | UiDecisionResourceChatOptions;

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
 * The selection decision behind `uiDecisionResource` in chat mode.
 *
 * @public
 */
export interface UiDecisionChatDecisionRef {
  /** The last decoded selection, or null. */
  value: Signal<s.Infer<DecidableSchema> | null>;
  /** Metadata mirroring the value, or null. */
  meta: Signal<Decision.Meta<DecidableSchema> | null>;
  /** Whether a decision is in flight. */
  isLoading: Signal<boolean>;
  /** The last decision failure; the same as `decisionError`. */
  error: Signal<Error | undefined>;
  /**
   * Aborts the pending decision. It does not cancel the send: the message
   * is still sent, with every component.
   */
  stop: () => void;
}

/**
 * The result of `uiDecisionResource` in chat mode. The transcript, rendered
 * UI, tools and loading state stay on the chat.
 *
 * @public
 */
export interface UiDecisionResourceChatRef {
  /** Identifies chat mode. */
  readonly mode: 'chat';
  /**
   * Decides about `content`, sets the chat's components to the chosen ones
   * (plus their declared children), then sends `content` to the chat. When
   * that turn finishes, errors or stops, or the chat never starts it, the
   * chat's components are set back to the full list. Calling it again while
   * a decision is pending aborts that decision, so only the latest message
   * is sent.
   *
   * Throws at once, like the chat's own `sendMessage`, when the chat cannot
   * take a message (for example while an interrupt batch is pending). When
   * the chat refuses the message after the decision, the components are
   * restored and the error is exposed as `decisionError`.
   *
   * @param content - The user message.
   */
  sendMessage: (content: string) => void;
  /** The underlying selection decision. */
  decision: UiDecisionChatDecisionRef;
  /** Whether a decision is in flight. */
  isDeciding: Signal<boolean>;
  /**
   * The last decision failure. When set, the message was sent with every
   * component. A `DecisionSchemaError` here means the components could not
   * be decided over (for example more than 255 with `'one'`, or a name
   * containing `.`), so no decision was asked.
   */
  decisionError: Signal<Error | undefined>;
}

/**
 * The result of `uiDecisionResource`.
 *
 * @public
 */
export type UiDecisionResourceRef =
  UiDecisionResourceCandidatesRef | UiDecisionResourceChatRef;

/**
 * Decided over when there are no candidates. The decision stays idle, so it
 * never sends a request.
 */
const PLACEHOLDER_SCHEMA: DecidableSchema = s.object('Selection', {
  unused: s.boolean('Unused'),
});

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
 * Narrows a UI chat's components for each message with a decision.
 *
 * In chat mode, `sendMessage(content)` asks the decision which of the chat's
 * components fit `content` (by name and description, UI kits decided by
 * member), sets the chat's components to the chosen ones plus, recursively,
 * the components declared in their `children`, and then sends `content` to
 * the chat, which writes the answer with its own system prompt and tools.
 * When the decision falls below `minConfidence`, fails, is stopped, or the
 * components break the selection limits, the message is sent with every
 * component, and a failure is exposed as `decisionError`.
 *
 * When the narrowed turn finishes, errors or is stopped, the chat's
 * components are set back to the full list, so a follow-up sent directly
 * with `chat.sendMessage` sees every component. The same happens when the
 * chat never starts the turn, and when the calling context is destroyed
 * while the chat is narrowed. If the app replaced the chat's components in
 * the meantime, they are left as the app set them.
 *
 * Calling `sendMessage` while a decision is pending aborts that decision,
 * so only the latest message is sent. While the chat is still generating,
 * the send behaves like the chat's own `sendMessage`. `sendMessage` throws
 * at once when the chat cannot take a message (for example while an
 * interrupt batch is pending); a send the chat refuses after the decision
 * restores the components and sets `decisionError`.
 *
 * There are two prompts: `system` is context for the decision model only,
 * and the chat keeps its own `system`. To pin the questions on a server,
 * pass the chat's components to `createSelectionSchema`. Render the chat as
 * usual. Must be called in an injection context and requires
 * `provideHashbrown`; a pending decision is dropped when the context is
 * destroyed.
 *
 * @public
 * @example
 * ```ts
 * readonly chat = uiChatResource({
 *   system: 'Answer questions about live flights.',
 *   components: [flightCard, airportCard, weatherCard],
 *   tools: [getFlights],
 * });
 * readonly narrowing = uiDecisionResource({
 *   chat: this.chat,
 *   select: { max: 2 },
 *   system: 'A flight-tracking app. The input is a chat message.',
 * });
 * ```
 * @param options - The chat-mode options.
 * @returns The narrowing `sendMessage` and the decision state.
 */
export function uiDecisionResource(
  options: UiDecisionResourceChatOptions,
): UiDecisionResourceChatRef;
export function uiDecisionResource(
  options: UiDecisionResourceOptions,
): UiDecisionResourceRef {
  assertInInjectionContext(uiDecisionResource);
  return options.chat !== undefined
    ? chatMode(options as UiDecisionResourceChatOptions)
    : candidatesMode(options as UiDecisionResourceCandidatesOptions);
}

function candidatesMode(
  options: UiDecisionResourceCandidatesOptions,
): UiDecisionResourceCandidatesRef {
  const { select, minConfidence, candidates } = options;
  const decisionOptions = candidates.map(({ id, description }) => ({
    id,
    description,
  }));
  const optionIds = decisionOptions.map(({ id }) => id);
  // Candidates are app-authored, so an invalid candidate list throws.
  const schema =
    decisionOptions.length === 0
      ? null
      : createSelectionSchema(decisionOptions, select);
  const hasOptions = schema !== null;

  const decision = decisionResource({
    schema: schema ?? PLACEHOLDER_SCHEMA,
    input: computed(() => (hasOptions ? (options.input() ?? null) : null)),
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Throws the error the chat's own `sendMessage` would throw right now (for
 * example while an interrupt batch is pending), when the chat is backed by
 * a Hashbrown runtime.
 */
function assertChatCanSend(chat: UiDecisionChat): void {
  const resume = (chat as { resume?: unknown }).resume;
  if (typeof resume === 'function') {
    ɵassertRuntimeMessageSchedulingAllowed(
      chat as unknown as Parameters<
        typeof ɵassertRuntimeMessageSchedulingAllowed
      >[0],
    );
  }
}

function chatMode(
  options: UiDecisionResourceChatOptions,
): UiDecisionResourceChatRef {
  const { chat } = options;
  const transport = resolveDecisionTransport(
    options,
    ɵinjectHashbrownConfig(),
    inject(Injector),
  );
  const controller = ɵcreateUiChatDecision();
  const state = signal(controller.getState());
  const unsubscribe = controller.subscribe(() =>
    state.set(controller.getState()),
  );

  // The chat's components while the resource has narrowed them, and
  // whether a sent turn is in flight.
  let narrowing: {
    original: UiKitInput<ExposedComponent<any>>[];
    narrowed: UiKitInput<ExposedComponent<any>>[];
  } | null = null;
  let turnInFlight = false;

  // Sets the chat back to every component, unless the app has replaced the
  // narrowed list in the meantime.
  function restore() {
    const current = narrowing;
    narrowing = null;
    turnInFlight = false;
    if (!current || current.narrowed === current.original) return;
    if (untracked(chat.components) !== current.narrowed) return;
    chat.setComponents(current.original);
  }

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
    restore();
  });

  // A turn ends when the chat stops loading: it finished, errored or was
  // stopped. The send sets `isLoading` synchronously, so the turn is in
  // flight when it is recorded and any later change to false ends it.
  effect(() => {
    const loading = chat.isLoading();
    untracked(() => {
      if (!loading && turnInFlight) restore();
    });
  });

  const readSystem = () => {
    const system = options.system;
    return system === undefined
      ? undefined
      : untracked(() => readReactiveOption(system));
  };

  function sendMessage(content: string) {
    assertChatCanSend(chat);
    const full = narrowing?.original ?? untracked(chat.components);
    void controller
      .decide(content, full, {
        select: options.select,
        system: readSystem(),
        minConfidence: options.minConfidence,
        optionOrder: options.optionOrder,
        transport,
      })
      .then((outcome) => {
        if (outcome.kind === 'superseded') return;
        const components =
          outcome.kind === 'narrowed' ? outcome.components : full;
        narrowing = { original: full, narrowed: components };
        chat.setComponents(components);
        try {
          chat.sendMessage({ role: 'user', content });
        } catch (error) {
          // The chat refused the message (for example an interrupt arrived
          // while deciding): offer every component again and report it.
          restore();
          controller.fail(toError(error));
          return;
        }
        if (untracked(chat.isLoading)) {
          turnInFlight = true;
        } else {
          // The chat did not start a turn, so there is nothing to wait for.
          restore();
        }
      });
  }

  const isDeciding = computed(() => state().status === 'loading');
  const error = computed(() => state().error);
  return {
    mode: 'chat',
    sendMessage,
    decision: {
      value: computed(() => state().value),
      meta: computed(() => state().meta),
      isLoading: isDeciding,
      error,
      stop: () => controller.stop(),
    },
    isDeciding,
    decisionError: error,
  };
}
