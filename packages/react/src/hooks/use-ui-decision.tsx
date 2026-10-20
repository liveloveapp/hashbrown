/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-redeclare -- the core rule (the one enabled here) flags TypeScript overload signatures of useUiDecision */
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
import {
  cloneElement,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type ExposedComponent } from '../expose-component.fn';
import { HashbrownContext } from '../hashbrown-provider';
import { useDecision, type UseDecisionResult } from './use-decision';
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
  system?: string;
  /**
   * `'shuffled'` varies the order of the options on every request, to spread
   * the model's bias toward the first option. Defaults to `'declared'`.
   */
  optionOrder?: 'declared' | 'shuffled';
}

/**
 * Options for `useUiDecision` in candidates mode, where app code
 * supplies fully rendered elements and the model only picks among them.
 *
 * @public
 */
export interface UseUiDecisionCandidatesOptions extends UseUiDecisionBaseOptions {
  /** The input to decide about. `null` or `undefined` keeps the hook idle. */
  input: string | Decision.JsonValue | null | undefined;
  /**
   * How long the input must stay unchanged, in milliseconds, before the
   * selection is decided. Changing `system` asks again and resets the
   * selection.
   */
  debounceTime?: number;
  /** The elements the model chooses from. */
  candidates: ReadonlyArray<UiDecisionCandidate>;
  /** Not used in candidates mode. */
  chat?: never;
}

/**
 * What `useUiDecision` needs from a chat in chat mode. The result of
 * `useUiChat` satisfies it.
 *
 * @public
 */
export interface UiDecisionChat {
  /** The components the chat offers to the model on its next request. */
  readonly components: UiKitInput<ExposedComponent<any>>[];
  /** Whether the chat is sending, generating or running tool calls. */
  readonly isLoading: boolean;
  /** Replaces the components the chat offers to the model. */
  setComponents(components: UiKitInput<ExposedComponent<any>>[]): void;
  /** Sends a user message to the chat. */
  sendMessage(message: Chat.UserMessage): void;
}

/**
 * Options for `useUiDecision` in chat mode, where each message sent through
 * the hook first narrows the chat's own components.
 *
 * @public
 */
export interface UseUiDecisionChatOptions extends UseUiDecisionBaseOptions {
  /**
   * The app's UI chat, usually the result of `useUiChat`. The decision is
   * over its components: UI kits are decided by member and a chosen
   * component brings the components declared in its `children`. Pass the
   * same list to `createSelectionSchema` to pin the questions on a server.
   */
  chat: UiDecisionChat;
  /** Not used in chat mode. */
  candidates?: never;
  /** Not used in chat mode: the input is each message. */
  input?: never;
  /** Not used in chat mode: messages are decided about at once. */
  debounceTime?: never;
}

/**
 * Options for `useUiDecision`.
 *
 * @public
 */
export type UseUiDecisionOptions =
  UseUiDecisionCandidatesOptions | UseUiDecisionChatOptions;

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
 * The selection decision behind `useUiDecision` in chat mode.
 *
 * @public
 */
export interface UseUiDecisionChatDecision {
  /** The last decoded selection, or null. */
  value: s.Infer<DecidableSchema> | null;
  /** Metadata mirroring the value, or null. */
  meta: Decision.Meta<DecidableSchema> | null;
  /** Whether a decision is in flight. */
  isLoading: boolean;
  /** The last decision failure; the same as `decisionError`. */
  error: Error | undefined;
  /**
   * Aborts the pending decision. It does not cancel the send: the message
   * is still sent, with every component.
   */
  stop: () => void;
}

/**
 * The result of `useUiDecision` in chat mode. The transcript, rendered UI,
 * tools and loading state stay on the chat.
 *
 * @public
 */
export interface UseUiDecisionChatResult {
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
   */
  sendMessage: (content: string) => void;
  /** The underlying selection decision. */
  decision: UseUiDecisionChatDecision;
  /** Whether a decision is in flight. */
  isDeciding: boolean;
  /**
   * The last decision failure. When set, the message was sent with every
   * component. A `DecisionSchemaError` here means the components could not
   * be decided over (for example more than 255 with `'one'`, or a name
   * containing `.`), so no decision was asked.
   */
  decisionError: Error | undefined;
}

const NO_CANDIDATES: ReadonlyArray<UiDecisionCandidate> = [];

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
 * Narrows a UI chat's components for each message with a decision.
 *
 * In chat mode, `sendMessage(content)` asks the decision which of the chat's
 * components fit `content` (by name and description, UI kits decided by
 * member), sets the chat's components to the chosen ones plus, recursively,
 * the components declared in their `children`, and then sends `content` to
 * the chat, which writes the answer with its own system prompt and tools.
 * The send waits until the chat offers the narrowed components. When the
 * decision falls below `minConfidence`, fails, is stopped, or the
 * components break the selection limits, the message is sent with every
 * component, and a failure is exposed as `decisionError`.
 *
 * When the narrowed turn finishes, errors or is stopped, the chat's
 * components are set back to the full list, so a follow-up sent directly
 * with `chat.sendMessage` sees every component. The same happens when the
 * chat never starts the turn, and when the hook unmounts while the chat is
 * narrowed. If the app replaced the chat's components in the meantime, they
 * are left as the app set them.
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
 * pass the chat's components to `createSelectionSchema`.
 *
 * @public
 * @example
 * ```tsx
 * const chat = useUiChat({
 *   system: 'Answer questions about live flights.',
 *   components: [flightCard, airportCard, weatherCard],
 *   tools: [getFlights],
 * });
 * const { sendMessage, isDeciding } = useUiDecision({
 *   chat,
 *   select: { max: 2 },
 *   system: 'A flight-tracking app. The input is a chat message.',
 * });
 * ```
 * @param options - The chat-mode options.
 * @returns The narrowing `sendMessage` and the decision state.
 */
export function useUiDecision(
  options: UseUiDecisionChatOptions,
): UseUiDecisionChatResult;
export function useUiDecision(
  options: UseUiDecisionOptions,
): UseUiDecisionCandidatesResult | UseUiDecisionChatResult {
  // Both modes' hooks always run, so the hook order never changes; the
  // inactive mode stays idle.
  const isChat = options.chat !== undefined;
  const candidatesResult = useCandidates(
    isChat ? null : (options as UseUiDecisionCandidatesOptions),
  );
  const chatResult = useChatNarrowing(
    isChat ? (options as UseUiDecisionChatOptions) : null,
  );
  return isChat ? chatResult : candidatesResult;
}

function useCandidates(
  options: UseUiDecisionCandidatesOptions | null,
): UseUiDecisionCandidatesResult {
  const candidates = options?.candidates ?? NO_CANDIDATES;
  const select = options?.select ?? 'one';
  const optionsKey = JSON.stringify({
    select,
    options: candidates.map(({ id, description }) => ({ id, description })),
  });
  // Candidates are app-authored, so an invalid candidate list throws.
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
    input: hasOptions ? options?.input : null,
    transport: options?.transport,
    system: options?.system,
    optionOrder: options?.optionOrder,
    debounceTime: options?.debounceTime,
  });

  const { value, meta } = decision;
  const minConfidence = options?.minConfidence;
  const selection = useMemo(() => {
    if (value === null || meta === null) return null;
    const parsed = JSON.parse(optionsKey) as {
      select: Decision.Select;
      options: Array<{ id: string }>;
    };
    return ɵresolveSelection(
      { value, meta } as Decision.Result<DecidableSchema>,
      parsed.select,
      parsed.options.map(({ id }) => id),
      minConfidence,
    );
  }, [value, meta, optionsKey, minConfidence]);

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
        const candidate = candidates.find((entry) => entry.id === id);
        return candidate ? [cloneElement(candidate.element, { key: id })] : [];
      }),
    [ids, candidates],
  );

  return {
    ui,
    ids,
    decision,
    isLoading: decision.isLoading,
    error: decision.error,
  };
}

/** A decided message waiting for the chat to offer its components. */
interface PendingSend {
  content: string;
  components: UiKitInput<ExposedComponent<any>>[];
}

/** The chat's components while the hook has narrowed them. */
interface Narrowing {
  original: UiKitInput<ExposedComponent<any>>[];
  narrowed: UiKitInput<ExposedComponent<any>>[];
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

function useChatNarrowing(
  options: UseUiDecisionChatOptions | null,
): UseUiDecisionChatResult {
  const config = useContext(HashbrownContext);
  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const [controller] = useState(() => ɵcreateUiChatDecision());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  // The latest options, read when a decision settles and on unmount.
  const latest = useRef({ options, transport: config.decisionTransport });
  useLayoutEffect(() => {
    latest.current = { options, transport: config.decisionTransport };
  });

  const [pending, setPending] = useState<PendingSend | null>(null);
  const sent = useRef<PendingSend | null>(null);
  const narrowing = useRef<Narrowing | null>(null);
  // The sent turn, keyed to the narrowing it was sent with.
  const turn = useRef<Narrowing | null>(null);
  // Bumped after a send, so the next commit checks whether the turn started.
  const [sends, setSends] = useState(0);

  const chat = options?.chat ?? null;
  const chatComponents = chat?.components;
  const chatIsLoading = chat?.isLoading ?? false;

  // Sets the chat back to every component, unless the app has replaced the
  // narrowed list in the meantime.
  const restore = useCallback((target: UiDecisionChat | null | undefined) => {
    const current = narrowing.current;
    narrowing.current = null;
    turn.current = null;
    if (!target || !current || current.narrowed === current.original) return;
    if (target.components !== current.narrowed) return;
    target.setComponents(current.original);
  }, []);

  // Drops a pending decision and restores a narrowed chat on unmount. The
  // controller stays usable, so StrictMode's remount keeps working.
  useEffect(
    () => () => {
      controller.dispose();
      restore(latest.current.options?.chat);
    },
    [controller, restore],
  );

  // Runs before the send below, so a turn ending in the same commit is
  // restored before the next one starts. A turn ends when the chat stops
  // loading after it started, or at the first commit after the send when
  // the chat never started it (it refused the message).
  // A newer narrowing (a decided message waiting to be sent, or already
  // sent) owns the components, so an older turn ending never restores over
  // it.
  useEffect(() => {
    const current = turn.current;
    if (!chat || !current || chatIsLoading) return;
    if (narrowing.current !== current) {
      turn.current = null;
      return;
    }
    restore(chat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIsLoading, sends]);

  // `setComponents` only applies on the next render, so the message is sent
  // once the chat offers the decided components. The chat updates what its
  // next request offers in the same commit, before the request is built.
  useEffect(() => {
    if (!chat || !pending || sent.current === pending) return;
    if (chatComponents !== pending.components) return;
    sent.current = pending;
    try {
      chat.sendMessage({ role: 'user', content: pending.content });
    } catch (error) {
      // The chat refused the message (for example an interrupt arrived
      // while deciding): offer every component again and report it.
      restore(chat);
      controller.fail(toError(error));
      return;
    }
    turn.current = narrowing.current;
    setSends((count) => count + 1);
  }, [chat, chatComponents, controller, pending, restore]);

  const sendMessage = useCallback(
    (content: string) => {
      const current = latest.current.options;
      if (!current) return;
      assertChatCanSend(current.chat);
      const full = narrowing.current?.original ?? current.chat.components;
      void controller
        .decide(content, full, {
          select: current.select,
          system: current.system,
          minConfidence: current.minConfidence,
          optionOrder: current.optionOrder,
          transport: current.transport ?? latest.current.transport,
        })
        .then((outcome) => {
          const now = latest.current.options;
          if (outcome.kind === 'superseded' || !now) return;
          const components =
            outcome.kind === 'narrowed' ? outcome.components : full;
          narrowing.current = { original: full, narrowed: components };
          now.chat.setComponents(components);
          setPending({ content, components });
        });
    },
    [controller],
  );

  const stop = useCallback(() => controller.stop(), [controller]);
  const isDeciding = state.status === 'loading';
  const decision = useMemo(
    () => ({
      value: state.value,
      meta: state.meta,
      isLoading: isDeciding,
      error: state.error,
      stop,
    }),
    [state, isDeciding, stop],
  );

  return {
    sendMessage,
    decision,
    isDeciding,
    decisionError: state.error,
  };
}
