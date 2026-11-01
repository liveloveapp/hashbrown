/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  bindHistoryDiagnostic,
  readHistoryDiagnostic,
} from './models/history-diagnostics';
import type {
  ConversationRecoveryConfiguration,
  ConversationRecoveryState,
  ConversationRestoreOptions,
  ConversationSnapshot,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
} from './models/conversation-recovery';
import type { PendingInterruptBatch, ResumeOptions } from './models/interrupt';
import {
  ɵisCancelledTurnMarker,
  ɵrestoreCancelledTurnProvenance,
} from './models/cancelled-turn';
import {
  assertInterruptsNotExpired,
  validateInterruptOutcome,
  validateResumeOptions,
} from './transport/interrupt-validation';
/**
 * Core entry point for the Hashbrown framework.
 * Provides state management and messaging utilities for integrating LLM-based chat interactions into frontend applications.
 */
import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from './actions';
import {
  classifyTransport,
  registerRuntimeBinder,
} from './growth/runtime-binding';
import effects from './effects';
import { Chat, type SubagentRun } from './models';
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
  selectLastRunFinishReason,
  selectLastRunResult,
  selectLastRunUsage,
  selectPendingInterrupts,
  selectRequestResponseSchema,
  selectResponseSchema,
  selectRetries,
  selectSendingError,
  selectSystem,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
  selectUnifiedError,
  selectViewMessages,
  ɵassertPendingRecoveryUpdateAllowed,
  ɵprepareRootAction,
  ɵselectBrowserRecoveryState,
  ɵselectCommittedAgentState,
  ɵselectCommittedAgUiMessages,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectGenerationId,
  ɵselectInterrupts,
  ɵselectStateWriteLocked,
  ɵselectSubagents,
  ɵselectToolTurnOwnership,
  ɵselectVisibleAgentState,
} from './reducers';
import { s } from './schema';
import { createStore, select, StateSignal } from './utils/micro-ngrx';
import { createHttpTransport, TransportOrFactory } from './transport';
import {
  createSystemMessage,
  lowerViewMessagesToAgUi,
  projectAgUiMessages,
  ɵassertAgUiMessageAppendCompatibility,
  ɵownValidatedAgUiMessages,
  ɵpairViewMessagesWithAgUi,
} from './reducers/ag-ui-message-history';
import { cloneAndFreezeOptionalJsonValue, type JsonValue } from './utils';
import { createCanonicalRunAgentInput } from './transport/hashbrown-run-agent-input';
import { deepEqual } from './utils/deep-equal';
import type { FinishReason, TokenUsage } from './models/run-finish';
import {
  createBrowserRecoveryCheckpoint,
  ownPendingBrowserRecovery,
  readBrowserRecoveryDiagnostic,
} from './recovery/browser-recovery';
import { isProviderToolCall } from './models/tool-step';

/** Settlement and thread ownership used by completion adapters. @internal */
export interface ɵRuntimeSchedulingState {
  readonly threadEpoch: number;
  readonly restorationEpoch?: number;
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

const runtimeMessagePreflights = new WeakMap<object, () => void>();

/**
 * Rejects message scheduling when runtime interrupt ownership requires a pause
 * or recovery, including synchronous claims and thread retirement.
 * @param runtime - The runtime or facade forwarding its unchanged resume command.
 * @internal
 */
export function ɵassertRuntimeMessageSchedulingAllowed(runtime: {
  readonly resume: (options: ResumeOptions) => void;
}): void {
  const assertAllowed = runtimeMessagePreflights.get(runtime.resume);
  if (!assertAllowed) throw new Error('Unknown chat runtime.');
  assertAllowed();
}

const runtimeRequestSchemaSetters = new WeakMap<
  object,
  (schema: s.SchemaOutput | undefined) => void
>();

/**
 * Narrows the response schema sent to the model on later requests, while
 * responses and history keep being parsed with the runtime's response
 * schema. Pass `undefined` to send the response schema again. The change
 * applies synchronously, so a message sent right after uses it.
 *
 * @param runtime - The runtime or a facade forwarding its unchanged resume
 * command.
 * @param schema - The schema to send, or `undefined` to clear it.
 * @internal
 */
export function ɵsetRequestResponseSchema(
  runtime: { readonly resume: (options: ResumeOptions) => void },
  schema: s.SchemaOutput | undefined,
): void {
  const setSchema = runtimeRequestSchemaSetters.get(runtime.resume);
  if (!setSchema) throw new Error('Unknown chat runtime.');
  setSchema(schema);
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
  /** Read owned trusted native request configuration without starting work. */
  getRecoveryConfiguration(): ConversationRecoveryConfiguration;
  /** Local lookup revision and acknowledged-failure recovery disposition. */
  readonly recovery: StateSignal<ConversationRecoveryState>;
  /** Atomically install retained canonical history while idle, without starting work. */
  restoreConversation(
    snapshot: ConversationSnapshot<State>,
    options: ConversationRestoreOptions,
  ): void;
  /** Inert browser calls and genuine interrupts awaiting explicit recovery settlement. */
  readonly pendingConversationRecovery: StateSignal<
    PendingConversationRecovery | undefined
  >;
  /** Validate and synchronously claim every browser outcome and protected decision. */
  resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;
  /** Observed native subagent invocations in the current conversation. */
  readonly subagents: StateSignal<readonly SubagentRun[]>;
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
  /**
   * The return value the agent attached to the last run that completed
   * (AG-UI's `RUN_FINISHED.result`), or `undefined` when it attached none.
   * Cleared when the next run starts, so it always belongs to the messages
   * currently shown. Interrupted, cancelled, and failed runs never set it.
   */
  lastRunResult: StateSignal<JsonValue | undefined>;
  /**
   * The token usage of the last run that completed (AG-UI's
   * `RUN_FINISHED.usage`), one entry per provider and model, or `undefined`
   * when the server reported none. Cleared when the next run starts, so a turn
   * that calls tools reports only its final run. Interrupted, cancelled, and
   * failed runs never set it.
   */
  lastRunUsage: StateSignal<readonly TokenUsage[] | undefined>;
  /**
   * Why the model stopped in the last run that completed, such as `length`
   * when the answer was cut off, or `undefined` when the server did not say.
   * Hashbrown's provider packages always report it. Cleared when the next run
   * starts; interrupted, cancelled, and failed runs never set it.
   */
  lastRunFinishReason: StateSignal<FinishReason | undefined>;
  lastAssistantMessage: StateSignal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;
  /** The opaque AG-UI thread identity used by the current and subsequent runs. */
  threadId: StateSignal<string | undefined>;

  /** Replace the current set of messages in the chat state. */
  setMessages: (messages: Chat.MessageInput<Output, Tools>[]) => void;

  /** Send a new message to the LLM and update state. */
  sendMessage: (message: Chat.MessageInput<Output, Tools>) => void;
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
  messages?: Chat.MessageInput<string, Tools>[];
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
  messages?: Chat.MessageInput<Output, Tools>[];
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
  messages?: Chat.MessageInput<string, Chat.AnyTool>[];
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
  const pendingRecoveryConfigurations = new WeakMap<
    PendingConversationRecovery,
    {
      readonly wire: ConversationRecoveryConfiguration;
      readonly responseSchema: s.HashbrownType | undefined;
      readonly requestResponseSchema: s.HashbrownType | undefined;
      readonly transport: TransportOrFactory | undefined;
      readonly tools: readonly Readonly<Chat.Internal.Tool>[];
    }
  >();
  let systemMessageId = createCanonicalId();
  const lower = (messages: readonly Chat.AnyMessageInput[]) =>
    lowerViewMessagesToAgUi(messages, { createId: createCanonicalId });
  const lowerWithProjection = (messages: readonly Chat.AnyMessageInput[]) => {
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
      lastRunResult: selectLastRunResult(state),
      lastRunUsage: selectLastRunUsage(state),
      lastRunFinishReason: selectLastRunFinishReason(state),
      ɵɵinternal: state,
    }),
  });

  const initial = lowerWithProjection(init.messages ?? []);
  state.dispatch(
    devActions.init({
      system: init.system,
      messages: init.messages as Chat.AnyMessageInput[],
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
      devActions.resumeConversationRecovery,
      devActions.sendMessage,
      devActions.setMessages,
      devActions.resendMessages,
      devActions.updateOptions,
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

  function assertNoPendingBrowserRecovery() {
    if (
      !synchronousThreadChange &&
      state.read(
        (root) =>
          root.recovery.pendingBrowserRecovery ||
          root.recovery.claimId ||
          root.recovery.required,
      )
    )
      throw new Error('Browser recovery is pending.');
  }

  function setState(nextState: unknown) {
    assertNoPendingBrowserRecovery();
    if (synchronousRestoration)
      throw new Error('Conversation restoration is in progress.');
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
  let effectsRunning = false;
  let startupResumeAction: ReturnType<typeof devActions.resume> | undefined;
  let startupRecoveryAction:
    ReturnType<typeof devActions.resumeConversationRecovery> | undefined;

  function assertMessageSchedulingAllowed() {
    assertNoPendingBrowserRecovery();
    if (synchronousRestoration)
      throw new Error('Conversation restoration is in progress.');
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
    assertNoPendingBrowserRecovery();
    if (synchronousRestoration)
      throw new Error('Conversation restoration is in progress.');
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
      requestResponseSchema: state.read(selectRequestResponseSchema),
      debounce: state.read(selectDebounce),
      retries: state.read(selectRetries),
      internalTools: state.read(selectTools),
      toolsByName: state.read(selectToolEntities),
      uiRequested: state.read(selectUiRequested),
      transportProvider: state.read(selectTransport),
    };
    synchronousResumeClaim = claimId;
    try {
      const action = devActions.resume({
        claimId,
        batch: interrupts.pending,
        options: ownedOptions,
        checkpoint,
      });
      if (!effectsRunning) startupResumeAction = action;
      dispatchGenerationSchedulingAction(action);
    } finally {
      void Promise.resolve().then(() => {
        if (synchronousResumeClaim === claimId)
          synchronousResumeClaim = undefined;
      });
    }
  }

  function resumeConversationRecovery(
    options: ResumeConversationRecoveryOptions,
  ) {
    if (
      synchronousRestoration ||
      synchronousThreadChange ||
      synchronousResumeClaim
    )
      throw new Error('Browser recovery is pending or already claimed.');
    const recovery = state.read((root) => root.recovery);
    if (
      !recovery.pendingBrowserRecovery ||
      recovery.claimId ||
      recovery.required
    )
      throw new Error('Stale or already claimed browser recovery batch.');
    const captured = pendingRecoveryConfigurations.get(
      recovery.pendingBrowserRecovery,
    );
    const tools = state.read(selectTools);
    if (
      !captured ||
      !deepEqual(captured.wire, getRecoveryConfiguration()) ||
      captured.responseSchema !== state.read(selectResponseSchema) ||
      captured.requestResponseSchema !==
        state.read(selectRequestResponseSchema) ||
      captured.transport !== state.read(selectTransport) ||
      captured.tools.length !== tools.length ||
      captured.tools.some(
        (tool, index) =>
          tool.handler !== tools[index].handler ||
          tool.schema !== tools[index].schema,
      )
    )
      throw new Error(
        'Browser recovery configuration changed after restoration.',
      );
    const checkpoint = createBrowserRecoveryCheckpoint(
      recovery.pendingBrowserRecovery,
      options,
      {
        messages: state.read(ɵselectEffectiveCommittedAgUiMessages),
        state: state.read(ɵselectCommittedAgentState),
        responseSchema: state.read(selectResponseSchema),
        requestResponseSchema: state.read(selectRequestResponseSchema),
        debounce: state.read(selectDebounce),
        retries: state.read(selectRetries),
        internalTools: state.read(selectTools),
        toolsByName: state.read(selectToolEntities),
        uiRequested: state.read(selectUiRequested),
        transportProvider: state.read(selectTransport),
      },
      state.read(ɵselectCommittedAgUiMessages),
      state.read(selectThreadId) ?? '',
      createCanonicalId,
      state.read(ɵselectInterrupts).pending,
    );
    const claimId = createCanonicalId();
    const action = devActions.resumeConversationRecovery({
      claimId,
      batch: recovery.pendingBrowserRecovery,
      checkpoint,
    });
    synchronousResumeClaim = claimId;
    if (!effectsRunning) startupRecoveryAction = action;
    dispatchGenerationSchedulingAction(action);
    void Promise.resolve().then(() => {
      if (synchronousResumeClaim === claimId)
        synchronousResumeClaim = undefined;
    });
  }

  function setMessages(messages: Chat.MessageInput<any, Chat.AnyTool>[]) {
    assertMessageSchedulingAllowed();
    const responseSchema = state.read(selectResponseSchema);
    const toolsByName = state.read(selectToolEntities);
    const lowered = lowerWithProjection(messages as Chat.AnyMessageInput[]);
    dispatchGenerationSchedulingAction(
      devActions.setMessages({
        messages: messages as Chat.AnyMessageInput[],
        canonicalMessages: lowered.canonicalMessages,
        localProjection: lowered.localProjection,
        responseSchema,
        toolsByName,
      }),
    );
  }

  function sendMessage(message: Chat.MessageInput<any, Chat.AnyTool>) {
    assertMessageSchedulingAllowed();
    const lowered = lowerWithProjection([message as Chat.AnyMessageInput]);
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
        message: message as Chat.AnyMessageInput,
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
    if (synchronousRestoration)
      throw new Error('Conversation restoration is in progress.');
    ɵassertPendingRecoveryUpdateAllowed(
      state.read((root) => root),
      devActions.updateOptions(options),
    );
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
      startupResumeAction = undefined;
      startupRecoveryAction = undefined;
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
      dispatchGenerationSchedulingAction(update);
    }
  }

  function getRecoveryConfiguration(): ConversationRecoveryConfiguration {
    const schema = state.read(selectRequestResponseSchema);
    const native = createCanonicalRunAgentInput({
      threadId: '',
      runId: '',
      messages: [],
      state: undefined,
      tools: Chat.helpers.toApiToolsFromInternal(state.read(selectTools)),
      responseSchema: schema ? s.toJsonSchema(schema) : undefined,
      ui: state.read(selectUiRequested),
    });
    const system = state.read(selectSystem);
    return cloneAndFreezeOptionalJsonValue({
      ...(system ? { system } : {}),
      tools: native.tools,
      forwardedProps: native.forwardedProps,
    }) as unknown as ConversationRecoveryConfiguration;
  }

  let synchronousRestoration = false;

  function assertRestoreAllowed(expectedRevision: number) {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision !== state.read((root) => root.recovery.revision)
    )
      throw new Error('Stale recovery revision.');
    if (
      synchronousRestoration ||
      synchronousThreadChange ||
      synchronousResumeClaim ||
      synchronousStateWrite ||
      pendingStateWriteLockReservations.size > 0 ||
      state.read(selectIsLoading) ||
      state.read(selectIsResuming) ||
      state.read(ɵselectToolTurnOwnership) ||
      state.read((root) => root.generationOwnership.generationId !== undefined)
    )
      throw new Error('Cannot restore a conversation while work is active.');
  }

  function restoreConversation(
    snapshot: ConversationSnapshot,
    options: ConversationRestoreOptions,
  ) {
    assertRestoreAllowed(options?.expectedRevision);
    if (
      options.structuredHistory !== undefined &&
      options.structuredHistory !== 'strict' &&
      options.structuredHistory !== 'preserve-diagnostics'
    )
      throw new TypeError('Invalid structured history policy.');
    if (
      !snapshot ||
      typeof snapshot.threadId !== 'string' ||
      snapshot.threadId.trim().length === 0
    )
      throw new TypeError('Invalid recovery thread identity.');
    if (!Array.isArray(snapshot.messages) || snapshot.messages.length > 2048)
      throw new TypeError('Invalid recovery message history.');
    const canonicalMessages = ɵrestoreCancelledTurnProvenance(
      snapshot.threadId === state.read(selectThreadId)
        ? state.read(ɵselectCommittedAgUiMessages)
        : [],
      ɵownValidatedAgUiMessages(snapshot.messages),
    );
    const configuredSystem = state.read(selectSystem);
    const originalSystem = canonicalMessages[0];
    if (configuredSystem) {
      if (
        !snapshot.configuredSystemMessageId ||
        originalSystem?.role !== 'system' ||
        originalSystem.id !== snapshot.configuredSystemMessageId ||
        originalSystem.content !== configuredSystem ||
        Object.keys(originalSystem).some(
          (key) => !['id', 'role', 'content'].includes(key),
        )
      )
        throw new TypeError(
          'Recovery configured system provenance does not match trusted configuration.',
        );
    } else if (snapshot.configuredSystemMessageId !== undefined) {
      throw new TypeError('Unexpected recovery configured system provenance.');
    }
    const history = configuredSystem
      ? Object.freeze(canonicalMessages.slice(1))
      : canonicalMessages;
    const responseSchema = state.read(selectResponseSchema);
    const toolsByName = state.read(selectToolEntities);
    if (
      options.structuredHistory === 'preserve-diagnostics' &&
      responseSchema
    ) {
      for (const message of history) {
        if (
          message.role === 'assistant' &&
          typeof message.content === 'string' &&
          message.toolCalls === undefined &&
          message.encryptedValue === undefined &&
          Object.keys(message).every((key) =>
            [
              'id',
              'role',
              'content',
              'name',
              'metadata',
              'subagentRunId',
            ].includes(key),
          ) &&
          !ɵisCancelledTurnMarker(message)
        ) {
          const projected = projectAgUiMessages(
            [message],
            toolsByName,
            responseSchema,
          );
          if (
            projected.messages[0]?.role === 'assistant' &&
            projected.messages[0].contentResolved === undefined
          )
            bindHistoryDiagnostic(message, snapshot.threadId);
        }
      }
    }
    const projection = projectAgUiMessages(
      history,
      toolsByName,
      responseSchema,
    );
    const pendingBrowserCalls: PendingConversationRecovery['toolCalls'][number][] =
      [];
    for (const message of canonicalMessages) {
      for (const key of [
        'contentResolved',
        'argumentsResolved',
        'handler',
        'status',
        'result',
        'provenance',
      ]) {
        if (Object.hasOwn(message, key))
          throw new TypeError('Recovery only accepts native AG-UI messages.');
      }
      if (message.role !== 'assistant') continue;
      if (
        responseSchema &&
        !ɵisCancelledTurnMarker(message) &&
        !readHistoryDiagnostic(message, responseSchema) &&
        message.content !== undefined &&
        projection.messages.find(
          (candidate) =>
            candidate.role === 'assistant' &&
            candidate.content === message.content &&
            candidate.contentResolved !== undefined,
        ) === undefined
      )
        throw new TypeError(
          'Recovery assistant content does not match the response schema.',
        );
      for (const call of message.toolCalls ?? []) {
        for (const key of [
          'argumentsResolved',
          'handler',
          'status',
          'result',
          'provenance',
        ]) {
          if (Object.hasOwn(call, key))
            throw new TypeError(
              'Recovery only accepts native AG-UI tool calls.',
            );
        }
        const projected = projection.toolCalls.find(
          (candidate) => candidate.id === call.id,
        );
        if (
          !isProviderToolCall(call) &&
          Object.hasOwn(toolsByName, call.function.name)
        ) {
          if (
            projected?.status !== 'done' &&
            snapshot.pendingBrowserRecovery === undefined
          )
            throw new TypeError(
              'Recovery contains an unresolved executable browser tool call.',
            );
          if (
            s.isHashbrownType(toolsByName[call.function.name].schema) &&
            projected?.argumentsResolved === undefined
          )
            throw new TypeError(
              'Recovery tool arguments do not match the registered schema.',
            );
          if (projected?.status !== 'done') {
            const args = cloneAndFreezeOptionalJsonValue(
              JSON.parse(call.function.arguments),
            );
            if (
              args === null ||
              typeof args !== 'object' ||
              Array.isArray(args)
            )
              throw new TypeError(
                'Recovery browser arguments must be an object.',
              );
            pendingBrowserCalls.push(
              Object.freeze({
                id: call.id,
                name: call.function.name,
                arguments: args,
              }),
            );
          }
        }
      }
    }
    const ownedState = cloneAndFreezeOptionalJsonValue(snapshot.state);
    const interrupts =
      snapshot.interrupts === undefined
        ? undefined
        : validateInterruptOutcome({
            type: 'interrupt',
            interrupts: snapshot.interrupts,
          });
    if (interrupts) assertInterruptsNotExpired(interrupts, Date.now());
    const pendingBrowserRecovery = ownPendingBrowserRecovery(
      snapshot.pendingBrowserRecovery,
      pendingBrowserCalls,
      interrupts ?? Object.freeze([]),
      createCanonicalId,
    );
    if (pendingBrowserRecovery)
      pendingRecoveryConfigurations.set(
        pendingBrowserRecovery,
        Object.freeze({
          wire: getRecoveryConfiguration(),
          responseSchema: state.read(selectResponseSchema),
          requestResponseSchema: state.read(selectRequestResponseSchema),
          transport: state.read(selectTransport),
          tools: Object.freeze(
            state.read(selectTools).map((tool) => Object.freeze({ ...tool })),
          ),
        }),
      );
    const batch = interrupts
      ? Object.freeze({ id: createCanonicalId(), interrupts })
      : undefined;
    const adoptedSystemId =
      configuredSystem && originalSystem ? originalSystem.id : systemMessageId;
    const restore = devActions.restoreConversation({
      expectedRevision: options.expectedRevision,
      threadId: snapshot.threadId,
      canonicalMessages: history,
      systemMessage: configuredSystem
        ? createSystemMessage(adoptedSystemId, configuredSystem)
        : undefined,
      state: ownedState,
      batch,
      pendingBrowserRecovery,
      responseSchema,
      toolsByName,
    });
    synchronousRestoration = true;
    let acknowledged = false;
    const unsubscribe = state.when(devActions.restoreConversation, (action) => {
      if (action !== restore) return;
      acknowledged = true;
      unsubscribe();
      systemMessageId = adoptedSystemId;
      synchronousRestoration = false;
    });
    try {
      state.dispatch(restore);
    } catch (error) {
      unsubscribe();
      synchronousRestoration = false;
      throw error;
    }
    if (!acknowledged)
      void Promise.resolve().then(() => {
        unsubscribe();
        synchronousRestoration = false;
      });
  }

  function start() {
    const abortController = new AbortController();
    let effectCleanupFn: (() => void) | undefined;

    Promise.resolve().then(() => {
      if (abortController.signal.aborted) {
        return;
      }

      effectCleanupFn = state.runEffects();
      effectsRunning = true;
      const acceptedResume = startupResumeAction;
      const acceptedRecovery = startupRecoveryAction;
      startupResumeAction = undefined;
      startupRecoveryAction = undefined;
      if (acceptedRecovery) state.dispatch(acceptedRecovery);
      else if (acceptedResume) state.dispatch(acceptedResume);
      else state.dispatch(internalActions.start());
    });

    return () => {
      abortController.abort('Initialization aborted');
      effectCleanupFn?.();
      if (effectCleanupFn) effectsRunning = false;
    };
  }

  function stop(clearStreamingMessage = false) {
    const recovery = state.read(ɵselectBrowserRecoveryState);
    if (
      startupRecoveryAction &&
      startupRecoveryAction.payload.claimId === recovery.claimId &&
      startupRecoveryAction.payload.checkpoint === recovery.checkpoint &&
      state.read(ɵselectGenerationId) === undefined
    ) {
      const claimId = startupRecoveryAction.payload.claimId;
      startupRecoveryAction = undefined;
      if (synchronousResumeClaim === claimId)
        synchronousResumeClaim = undefined;
      state.dispatch(internalActions.browserRecoveryClaimReleased({ claimId }));
      return;
    }
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
    startupResumeAction = undefined;
    state.dispatch(devActions.stopMessageGeneration(clearStreamingMessage));
  }

  const pendingSignal = state.createSignal(selectPendingInterrupts);
  const threadSignal = state.createSignal(selectThreadId);
  const resumingSignal = state.createSignal(selectIsResuming);
  const loadingSignal = state.createSignal(
    (root) => selectIsLoading(root) || selectIsResuming(root),
  );
  const runtime = {
    pendingConversationRecovery: state.createSignal(
      (root): PendingConversationRecovery | undefined =>
        root.recovery.pendingBrowserRecovery,
    ),
    resumeConversationRecovery,
    getRecoveryConfiguration,
    restoreConversation,
    recovery: state.createSignal(
      select(
        (root: Parameters<typeof ɵselectInterrupts>[0]) => root.recovery,
        (root: Parameters<typeof ɵselectInterrupts>[0]) =>
          root.interrupts.recoveryRequired,
        ɵselectCommittedAgUiMessages,
        selectResponseSchema,
        selectToolEntities,
        selectThreadId,
        (recovery, required, messages, schema, toolsByName, threadId) => {
          const browserCallIds = new Set(
            messages.flatMap((message) =>
              message.role === 'assistant'
                ? (message.toolCalls ?? [])
                    .filter(
                      (call) =>
                        !isProviderToolCall(call) &&
                        Object.hasOwn(toolsByName, call.function.name),
                    )
                    .map((call) => call.id)
                : [],
            ),
          );
          const diagnostics = messages.flatMap((message) => {
            const diagnostic =
              readHistoryDiagnostic(message, schema) ??
              readBrowserRecoveryDiagnostic(message, threadId, browserCallIds);
            return diagnostic ? [diagnostic] : [];
          });
          return {
            revision: recovery.revision,
            required: required || recovery.required,
            ...(diagnostics.length
              ? { diagnostics: Object.freeze(diagnostics) }
              : {}),
          };
        },
      ),
    ),
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
    subagents: state.createSignal(ɵselectSubagents),
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
    lastRunResult: state.createSignal(selectLastRunResult),
    lastRunUsage: state.createSignal(selectLastRunUsage),
    lastRunFinishReason: state.createSignal(selectLastRunFinishReason),
    lastAssistantMessage: state.createSignal(selectLastAssistantMessage),
    threadId: Object.assign(
      () =>
        synchronousThreadChange
          ? synchronousThreadChange.threadId
          : threadSignal(),
      { subscribe: threadSignal.subscribe },
    ),
  };
  runtimeMessagePreflights.set(runtime.resume, assertMessageSchedulingAllowed);
  registerRuntimeBinder(runtime.resume, (observer) => {
    observer.sessionStarted(() =>
      classifyTransport(state.read(selectTransport)),
    );

    let runStartedAt: number | undefined;
    let contentSeen = false;
    let streamReported = false;
    const startedToolTurns = new Set<string>();
    let toolReported = false;

    const unsubscribers = [
      state.when(apiActions.generateMessageStart, () => {
        runStartedAt = Date.now();
        contentSeen = false;
      }),
      state.when(apiActions.generateMessageEvent, (action) => {
        const event = action.payload;
        if (
          event.type === EventType.TEXT_MESSAGE_CONTENT ||
          event.type === EventType.TEXT_MESSAGE_CHUNK
        ) {
          contentSeen = true;
          return;
        }
        if (event.type !== EventType.RUN_FINISHED || streamReported) return;
        const outcome = (event as { outcome?: { type?: unknown } }).outcome;
        if (outcome?.type === 'interrupt' || !contentSeen) return;
        streamReported = true;
        observer.streamCompleted(
          runStartedAt === undefined ? undefined : Date.now() - runStartedAt,
        );
      }),
      state.when(internalActions.toolTurnStarted, (action) => {
        startedToolTurns.add(action.payload.toolTurnId);
      }),
      state.when(internalActions.toolTurnSettled, (action) => {
        const started = startedToolTurns.delete(action.payload.toolTurnId);
        if (!started || toolReported) return;
        toolReported = true;
        observer.toolExecuted();
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  });
  runtimeRequestSchemaSetters.set(runtime.resume, (schema) => {
    const update = devActions.updateOptions({
      ɵrequestResponseSchema: schema ?? null,
    });
    ɵassertPendingRecoveryUpdateAllowed(
      state.read((root) => root),
      update,
    );
    dispatchGenerationSchedulingAction(update);
  });
  runtimeSchedulingSignals.set(
    runtime.resume,
    state.createSignal(
      select(
        ɵselectInterrupts,
        ɵselectBrowserRecoveryState,
        (interrupts, recovery) => ({
          threadEpoch: interrupts.epoch,
          restorationEpoch: recovery.restorationEpoch,
          successfulResumes:
            interrupts.successfulResumes + recovery.successfulResumes,
          recoveryRequired: interrupts.recoveryRequired || recovery.required,
          isResuming:
            interrupts.generationId !== undefined ||
            recovery.claimId !== undefined,
          pending:
            !interrupts.recoveryRequired &&
            !recovery.required &&
            (interrupts.pending !== undefined ||
              recovery.pendingBrowserRecovery !== undefined),
        }),
      ),
    ),
  );
  return runtime;
}
