/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PendingInterruptBatch, ResumeOptions } from './models/interrupt';
import { validateResumeOptions } from './transport/interrupt-validation';
/**
 * Core entry point for the Hashbrown framework.
 * Provides state management and messaging utilities for integrating LLM-based chat interactions into frontend applications.
 */
import { devActions, internalActions } from './actions';
import effects from './effects';
import { Chat } from './models';
import {
  reducers,
  selectDebounce,
  selectExhaustedRetries,
  selectGeneratingError,
  selectIsGenerating,
  selectIsLoading,
  selectIsReceiving,
  selectIsResuming,
  selectIsRunningToolCalls,
  selectIsSending,
  selectLastAssistantMessage,
  selectPendingInterrupts,
  selectResponseSchema,
  selectRetries,
  selectSendingError,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
  selectUnifiedError,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgentState,
  ɵselectCommittedAgUiMessages,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectInterrupts,
  ɵselectStateWriteLocked,
  ɵselectToolTurnOwnership,
  ɵselectVisibleAgentState,
} from './reducers';
import { s } from './schema';
import { createStore, select, StateSignal } from './utils/micro-ngrx';
import { createHttpTransport, TransportOrFactory } from './transport';
import {
  createSystemMessage,
  lowerViewMessagesToAgUi,
  ɵassertAgUiMessageAppendCompatibility,
  ɵpairViewMessagesWithAgUi,
} from './reducers/ag-ui-message-history';
import { cloneAndFreezeOptionalJsonValue } from './utils';

/** Settlement and thread ownership used by completion adapters. @internal */
export interface ɵRuntimeSchedulingState {
  readonly threadEpoch: number;
  readonly successfulResumes: number;
  readonly recoveryRequired: boolean;
  readonly isResuming: boolean;
  readonly pending: boolean;
}

const runtimeSchedulingSignals = new WeakMap<
  object,
  StateSignal<ɵRuntimeSchedulingState>
>();

/**
 * Reads runtime-owned scheduling without extending facade APIs.
 * Facades must forward the runtime's `resume` function unchanged: its identity
 * is the private lookup key shared by chat and completion adapters.
 * @internal
 */
export function ɵgetRuntimeSchedulingState(runtime: {
  readonly resume: (options: ResumeOptions) => void;
}): StateSignal<ɵRuntimeSchedulingState> {
  const signal = runtimeSchedulingSignals.get(runtime.resume);
  if (!signal) throw new Error('Unknown chat runtime.');
  return signal;
}

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
  /** The current batch, retained until the server acknowledges resume. */
  readonly pendingInterrupts: StateSignal<PendingInterruptBatch | undefined>;
  /** Whether the whole resumed interaction is still executing. */
  readonly isResuming: StateSignal<boolean>;
  /** Validate and synchronously claim a complete interrupt response batch. */
  resume(options: ResumeOptions): void;

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
      devActions.resume,
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

  let synchronousThreadChange:
    { readonly threadId: string | undefined } | undefined;
  let synchronousStateWrite:
    | { readonly value: ReturnType<typeof cloneAndFreezeOptionalJsonValue> }
    | undefined;

  function setState(nextState: unknown) {
    if (
      synchronousResumeClaim !== undefined ||
      (!synchronousThreadChange &&
        state.read(ɵselectInterrupts).claimId !== undefined) ||
      pendingStateWriteLockReservations.size > 0 ||
      (!synchronousThreadChange && state.read(ɵselectStateWriteLocked))
    ) {
      throw new Error(
        'Cannot set shared state while generation is in progress.',
      );
    }

    const ownedState = cloneAndFreezeOptionalJsonValue(nextState);
    const write = { value: ownedState };
    synchronousStateWrite = write;
    state.dispatch(devActions.setState({ state: ownedState }));
    void Promise.resolve().then(() => {
      if (synchronousStateWrite === write) synchronousStateWrite = undefined;
    });
  }

  let synchronousResumeClaim: string | undefined;

  function assertMessageSchedulingAllowed() {
    if (synchronousThreadChange) return;
    const interrupts = state.read(ɵselectInterrupts);
    if (interrupts.recoveryRequired)
      throw new Error('Recovery requires a new thread.');
    if (interrupts.pending || synchronousResumeClaim)
      throw new Error(
        'Cannot change messages while an interrupt batch is pending or claimed.',
      );
  }

  function resume(options: ResumeOptions) {
    if (synchronousThreadChange) throw new Error('Stale interrupt batch.');
    const interrupts = state.read(ɵselectInterrupts);
    if (interrupts.recoveryRequired)
      throw new Error('Recovery requires a new thread.');
    if (interrupts.claimId || synchronousResumeClaim)
      throw new Error('Interrupt batch already claimed.');
    if (!interrupts.pending) throw new Error('Stale interrupt batch.');
    const ownedOptions = validateResumeOptions(
      interrupts.pending,
      options,
      Date.now(),
    );
    const claimId = createCanonicalId();
    const checkpoint = {
      messages: state.read(ɵselectEffectiveCommittedAgUiMessages),
      state: synchronousStateWrite
        ? synchronousStateWrite.value
        : state.read(ɵselectCommittedAgentState),
      responseSchema: state.read(selectResponseSchema),
      debounce: state.read(selectDebounce),
      retries: state.read(selectRetries),
      internalTools: state.read(selectTools),
      toolsByName: state.read(selectToolEntities),
      uiRequested: state.read(selectUiRequested),
      transportProvider: state.read(selectTransport),
    };
    synchronousResumeClaim = claimId;
    try {
      dispatchGenerationSchedulingAction(
        devActions.resume({
          claimId,
          batch: interrupts.pending,
          options: ownedOptions,
          checkpoint,
        }),
      );
    } finally {
      void Promise.resolve().then(() => {
        if (synchronousResumeClaim === claimId)
          synchronousResumeClaim = undefined;
      });
    }
  }

  function setMessages(messages: Chat.Message<any, Chat.AnyTool>[]) {
    assertMessageSchedulingAllowed();
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
    assertMessageSchedulingAllowed();
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
    assertMessageSchedulingAllowed();
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
    const threadChanged =
      Object.hasOwn(options, 'threadId') &&
      options.threadId !==
        (synchronousThreadChange
          ? synchronousThreadChange.threadId
          : state.read(selectThreadId));
    if (threadChanged) {
      const change = { threadId: options.threadId };
      synchronousThreadChange = change;
      void Promise.resolve().then(() => {
        if (synchronousThreadChange === change)
          synchronousThreadChange = undefined;
      });
      synchronousResumeClaim = undefined;
      pendingStateWriteLockReservations.clear();
    }
    const update = devActions.updateOptions({
      ...options,
      ...(Object.hasOwn(options, 'system')
        ? {
            systemMessage: createSystemMessage(
              systemMessageId,
              options.system ?? '',
            ),
          }
        : {}),
    });
    if (threadChanged) {
      void state.dispatchAndWait(
        internalActions.threadUpdateStarted(),
        (followUps) => {
          followUps.dispatch(internalActions.interruptThreadRetired());
          followUps.dispatch(update);
        },
      );
    } else {
      state.dispatch(update);
    }
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
    const isLoading =
      state.read(selectIsLoading) ||
      state.read(selectIsResuming) ||
      synchronousResumeClaim !== undefined;
    const hasReservedToolTurn =
      state.read(ɵselectToolTurnOwnership) !== undefined;

    if (!isLoading && !hasReservedToolTurn) {
      throw new Error('Cannot stop streaming messages when not streaming.');
    }

    synchronousResumeClaim = undefined;
    state.dispatch(devActions.stopMessageGeneration(clearStreamingMessage));
  }

  const pendingSignal = state.createSignal(selectPendingInterrupts);
  const threadSignal = state.createSignal(selectThreadId);
  const resumingSignal = state.createSignal(selectIsResuming);
  const loadingSignal = state.createSignal(
    (root) => selectIsLoading(root) || selectIsResuming(root),
  );
  const runtime = {
    resume,
    pendingInterrupts: Object.assign(
      () => (synchronousThreadChange ? undefined : pendingSignal()),
      { subscribe: pendingSignal.subscribe },
    ),
    isResuming: Object.assign(
      () =>
        synchronousResumeClaim !== undefined ||
        (!synchronousThreadChange && resumingSignal()),
      { subscribe: resumingSignal.subscribe },
    ),
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
    isLoading: Object.assign(
      () => synchronousResumeClaim !== undefined || loadingSignal(),
      { subscribe: loadingSignal.subscribe },
    ),
    sendingError: state.createSignal(selectSendingError),
    generatingError: state.createSignal(selectGeneratingError),
    exhaustedRetries: state.createSignal(selectExhaustedRetries),
    lastAssistantMessage: state.createSignal(selectLastAssistantMessage),
    threadId: Object.assign(
      () =>
        synchronousThreadChange
          ? synchronousThreadChange.threadId
          : threadSignal(),
      { subscribe: threadSignal.subscribe },
    ),
  };
  runtimeSchedulingSignals.set(
    runtime.resume,
    state.createSignal(
      select(ɵselectInterrupts, (interrupts) => ({
        threadEpoch: interrupts.epoch,
        successfulResumes: interrupts.successfulResumes,
        recoveryRequired: interrupts.recoveryRequired,
        isResuming: interrupts.generationId !== undefined,
        pending: interrupts.pending !== undefined,
      })),
    ),
  );
  return runtime;
}
