/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Core entry point for the Hashbrown framework.
 * Provides state management and messaging utilities for integrating LLM-based chat interactions into frontend applications.
 */
import { devActions, internalActions } from './actions';
import effects from './effects';
import { Chat } from './models';
import {
  reducers,
  selectExhaustedRetries,
  selectGeneratingError,
  selectIsGenerating,
  selectIsLoading,
  selectIsReceiving,
  selectIsRunningToolCalls,
  selectIsSending,
  selectLastAssistantMessage,
  selectResponseSchema,
  selectSendingError,
  selectThreadId,
  selectToolEntities,
  selectUnifiedError,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
  ɵselectStateWriteLocked,
  ɵselectToolTurnOwnership,
  ɵselectVisibleAgentState,
} from './reducers';
import { s } from './schema';
import { createStore, StateSignal } from './utils/micro-ngrx';
import { createHttpTransport, TransportOrFactory } from './transport';
import {
  createSystemMessage,
  lowerViewMessagesToAgUi,
  ɵassertAgUiMessageAppendCompatibility,
  ɵpairViewMessagesWithAgUi,
} from './reducers/ag-ui-message-history';
import { cloneAndFreezeOptionalJsonValue } from './utils';

/**
 * A stateful client runtime for sending messages, processing AG-UI events,
 * executing tools, and exposing reactive chat state.
 *
 * @public
 * @typeParam Output - The type of messages received from the LLM, either a string or structured output defined by HashbrownType.
 * @typeParam Tools - The set of tools available to the chat instance.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface ChatRuntime<
  Output,
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  /** The currently visible shared agent state. */
  readonly state: StateSignal<State | undefined>;

  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;

  messages: StateSignal<Chat.Message<Output, Tools>[]>;
  error: StateSignal<Error | undefined>;
  isReceiving: StateSignal<boolean>;
  isSending: StateSignal<boolean>;
  isGenerating: StateSignal<boolean>;
  isRunningToolCalls: StateSignal<boolean>;
  isLoading: StateSignal<boolean>;
  exhaustedRetries: StateSignal<boolean>;
  sendingError: StateSignal<Error | undefined>;
  generatingError: StateSignal<Error | undefined>;
  lastAssistantMessage: StateSignal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;
  /** The opaque AG-UI thread identity used by the current and subsequent runs. */
  threadId: StateSignal<string | undefined>;

  /** Replace the current set of messages in the chat state. */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /** Send a new message to the LLM and update state. */
  sendMessage: (message: Chat.Message<Output, Tools>) => void;
  /** Resend messages and update state. Often used manually after an error.*/
  resendMessages: () => void;

  /** Update the chat options after initialization */
  updateOptions: (
    options: Partial<{
      debugName?: string;
      system: string;
      tools: Tools[];
      responseSchema: s.SchemaOutput;
      debounce: number;
      retries: number;
      transport: TransportOrFactory;
      ui?: boolean;
      /** Set to undefined to clear the current AG-UI thread identity. */
      threadId?: string | undefined;
    }>,
  ) => void;

  /** Stop the current LLM interaction. */
  stop: (clearStreamingMessage?: boolean) => void;

  /** Start the runtime effect loop and return a function that disposes it. */
  start: () => () => void;
}

/**
 * Creates a text chat runtime with optional shared agent state.
 *
 * @public
 * @typeParam Tools - The set of tools to register with the chat instance.
 * @typeParam State - Shared state inferred from `init.state`, or `unknown`
 * when absent.
 * @param init - Runtime options. Initial state is JSON-validated, cloned, and
 * frozen before the runtime is created.
 * @returns A configured chat runtime. Call `start()` to activate its effects.
 * @throws A `TypeError` when initial state is not JSON-compatible.
 */
export function createChatRuntime<
  Tools extends Chat.AnyTool,
  State = unknown,
>(init: {
  debugName?: string;
  system: string;
  state?: State;
  messages?: Chat.Message<string, Tools>[];
  tools?: Tools[];
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<string, Tools, State>;
/**
 * Creates a structured-output chat runtime with optional shared agent state.
 *
 * @public
 * @typeParam Schema - The schema used to validate assistant output.
 * @typeParam Tools - The set of tools to register with the chat instance.
 * @typeParam Output - The assistant output inferred from `Schema` unless
 * explicitly supplied.
 * @typeParam State - Shared state inferred from `init.state`, or `unknown`
 * when absent.
 * @param init - Runtime options including the response schema. Initial state
 * is JSON-validated, cloned, and frozen before creation.
 * @returns A configured structured chat runtime. Call `start()` to activate
 * its effects.
 * @throws A `TypeError` when initial state is not JSON-compatible.
 */
export function createChatRuntime<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(init: {
  debugName?: string;
  system: string;
  state?: State;
  messages?: Chat.Message<Output, Tools>[];
  tools?: Tools[];
  responseSchema: Schema;
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<Output, Tools, State>;
/**
 * @public
 */
export function createChatRuntime(init: {
  debugName?: string;
  system: string;
  state?: unknown;
  messages?: Chat.Message<string, Chat.AnyTool>[];
  tools?: Chat.AnyTool[];
  responseSchema?: s.SchemaOutput;
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<any, Chat.AnyTool, unknown> {
  const initialAgentState = cloneAndFreezeOptionalJsonValue(init.state);
  const initialThreadId = init.threadId;
  const transport = init.transport ?? (() => createHttpTransport({}));
  const createCanonicalId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `hashbrown-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const systemMessageId = createCanonicalId();
  const lower = (messages: readonly Chat.AnyMessage[]) =>
    lowerViewMessagesToAgUi(messages, { createId: createCanonicalId });
  const lowerWithProjection = (messages: readonly Chat.AnyMessage[]) => {
    const canonicalMessages = lower(messages);
    return {
      canonicalMessages,
      localProjection: ɵpairViewMessagesWithAgUi(messages, canonicalMessages),
    };
  };

  const state = createStore({
    debugName: init.debugName,
    reducers,
    effects,
    prepareAction: ɵprepareRootAction,
    projectStateForDevtools: (state) => ({
      messages: selectViewMessages(state),
      isReceiving: selectIsReceiving(state),
      isSending: selectIsSending(state),
      isGenerating: selectIsGenerating(state),
      isRunningToolCalls: selectIsRunningToolCalls(state),
      isLoading: selectIsLoading(state),
      state: ɵselectVisibleAgentState(state),
      stateAttemptActive: state.agentState.attemptActive,
      threadId: selectThreadId(state),
      sendingError: selectSendingError(state),
      generatingError: selectGeneratingError(state),
      error: selectUnifiedError(state),
      ɵɵinternal: state,
    }),
  });

  const initial = lowerWithProjection(init.messages ?? []);
  state.dispatch(
    devActions.init({
      system: init.system,
      messages: init.messages as Chat.AnyMessage[],
      canonicalMessages: initial.canonicalMessages,
      localProjection: initial.localProjection,
      systemMessage: createSystemMessage(systemMessageId, init.system),
      tools: init.tools as Chat.AnyTool[],
      responseSchema: init.responseSchema,
      debounce: init.debounce,
      retries: init.retries,
      transport,
      ui: init.ui,
      threadId: initialThreadId,
      state: initialAgentState,
    }),
  );

  let nextStateWriteLockReservationId = 0;
  const pendingStateWriteLockReservations = new Set<number>();

  function dispatchGenerationSchedulingAction(
    action: Parameters<typeof state.dispatch>[0],
  ) {
    const reservationId = ++nextStateWriteLockReservationId;
    let actionAcknowledged = false;
    let stopObservingAction: () => void = () => undefined;
    pendingStateWriteLockReservations.add(reservationId);
    stopObservingAction = state.when(
      devActions.sendMessage,
      devActions.setMessages,
      devActions.resendMessages,
      (observedAction) => {
        if (observedAction !== action) return;

        actionAcknowledged = true;
        stopObservingAction();
        pendingStateWriteLockReservations.delete(reservationId);
      },
    );

    state.dispatch(action);
    if (actionAcknowledged) {
      return;
    }

    // The synchronous trampoline drains reentrant actions before microtasks.
    // This fallback releases reservations for actions that never notify.
    void Promise.resolve().then(() => {
      if (actionAcknowledged) return;

      stopObservingAction();
      pendingStateWriteLockReservations.delete(reservationId);
    });
  }

  function setState(nextState: unknown) {
    if (
      pendingStateWriteLockReservations.size > 0 ||
      state.read(ɵselectStateWriteLocked)
    ) {
      throw new Error(
        'Cannot set shared state while generation is in progress.',
      );
    }

    const ownedState = cloneAndFreezeOptionalJsonValue(nextState);
    state.dispatch(devActions.setState({ state: ownedState }));
  }

  function setMessages(messages: Chat.Message<any, Chat.AnyTool>[]) {
    const responseSchema = state.read(selectResponseSchema);
    const toolsByName = state.read(selectToolEntities);
    const lowered = lowerWithProjection(messages as Chat.AnyMessage[]);
    dispatchGenerationSchedulingAction(
      devActions.setMessages({
        messages: messages as Chat.AnyMessage[],
        canonicalMessages: lowered.canonicalMessages,
        localProjection: lowered.localProjection,
        responseSchema,
        toolsByName,
      }),
    );
  }

  function sendMessage(message: Chat.Message<any, Chat.AnyTool>) {
    const lowered = lowerWithProjection([message as Chat.AnyMessage]);
    const canonicalAppendCompatible = (() => {
      try {
        ɵassertAgUiMessageAppendCompatibility(
          state.read(ɵselectCommittedAgUiMessages),
          lowered.canonicalMessages,
        );
        return true;
      } catch {
        return false;
      }
    })();
    if (!canonicalAppendCompatible) {
      return;
    }
    dispatchGenerationSchedulingAction(
      devActions.sendMessage({
        message: message as Chat.AnyMessage,
        canonicalMessages: lowered.canonicalMessages,
        localProjection: lowered.localProjection,
        canonicalAppendCompatible,
      }),
    );
  }

  function resendMessages() {
    dispatchGenerationSchedulingAction(devActions.resendMessages());
  }

  function updateOptions(
    options: Partial<{
      debugName?: string;
      system: string;
      tools: Chat.AnyTool[];
      responseSchema: s.SchemaOutput;
      debounce: number;
      retries: number;
      transport: TransportOrFactory;
      ui?: boolean;
      threadId?: string | undefined;
    }>,
  ) {
    state.dispatch(
      devActions.updateOptions({
        ...options,
        ...(Object.hasOwn(options, 'system')
          ? {
              systemMessage: createSystemMessage(
                systemMessageId,
                options.system ?? '',
              ),
            }
          : {}),
      }),
    );
  }

  function start() {
    const abortController = new AbortController();
    let effectCleanupFn: () => void;

    Promise.resolve().then(() => {
      if (abortController.signal.aborted) {
        return;
      }

      effectCleanupFn = state.runEffects();

      state.dispatch(internalActions.start());
    });

    return () => {
      abortController.abort('Initialization aborted');
      effectCleanupFn?.();
    };
  }

  function stop(clearStreamingMessage = false) {
    const isLoading = state.read(selectIsLoading);
    const hasReservedToolTurn =
      state.read(ɵselectToolTurnOwnership) !== undefined;

    if (!isLoading && !hasReservedToolTurn) {
      throw new Error('Cannot stop streaming messages when not streaming.');
    }

    state.dispatch(devActions.stopMessageGeneration(clearStreamingMessage));
  }

  return {
    setState,
    setMessages,
    sendMessage,
    resendMessages,
    updateOptions,
    stop,
    start,
    state: state.createSignal(ɵselectVisibleAgentState),
    messages: state.createSignal(selectViewMessages),
    error: state.createSignal(selectUnifiedError),
    isReceiving: state.createSignal(selectIsReceiving),
    isSending: state.createSignal(selectIsSending),
    isGenerating: state.createSignal(selectIsGenerating),
    isRunningToolCalls: state.createSignal(selectIsRunningToolCalls),
    isLoading: state.createSignal(selectIsLoading),
    sendingError: state.createSignal(selectSendingError),
    generatingError: state.createSignal(selectGeneratingError),
    exhaustedRetries: state.createSignal(selectExhaustedRetries),
    lastAssistantMessage: state.createSignal(selectLastAssistantMessage),
    threadId: state.createSignal(selectThreadId),
  };
}
