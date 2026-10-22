import {
  type AGUIEvent,
  EventType,
  type Message,
  type SystemMessage,
} from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  type ActivityArrival,
  applyActivityDelta,
  applyActivitySnapshot,
  mergeSnapshotActivities,
  recomputeActivityLinks,
} from './ag-ui-activity';
import {
  applySystemMessageOverlay,
  ɵassertAgUiMessageAppendCompatibility,
  ɵownAgUiJsonValue,
  ɵownValidatedAgUiMessages,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { createReducer, on } from '../utils/micro-ngrx';
import {
  readRawStepIdentity,
  readResultFailure,
  reopenCancelledStep,
  seedFrameResultStep,
  settleOpenSteps,
  stampStepMetadataStart,
  stampStepStart,
  withProviderIdentity,
  ɵmergeStepMetadata,
  ɵmergeToolStep,
  ɵreadToolStep,
  ɵTOOL_STEP_EVENT_NAME,
  ɵTOOL_STEP_METADATA_KEY,
  type ɵToolStep,
  type ɵToolStepRead,
} from '../models/tool-step';

const NO_PENDING_STEPS: Readonly<Record<string, ɵToolStep>> = Object.freeze({});

/** Canonical AG-UI history synchronized transactionally with an agent run. @internal */
export interface AgUiMessagesState {
  readonly committed: readonly Readonly<Message>[];
  readonly draft: readonly Readonly<Message>[];
  readonly attemptActive: boolean;
  readonly protocolError: Error | undefined;
  readonly systemMessage: Readonly<SystemMessage> | undefined;
  readonly attemptStartToolCallIds: readonly string[];
  /** Text messages the server ended, which may never be started again. */
  readonly finishedTextMessageIds: readonly string[];
  readonly draftFinishedTextMessageIds: readonly string[];
  readonly activeTextMessageId: string | undefined;
  readonly activeReasoningMessageId: string | undefined;
  readonly activeToolCallId: string | undefined;
  readonly activeToolCallName: string | undefined;
  readonly activeAssistantMessageId: string | undefined;
  /** The run that delivered the current attempt's events, from `RUN_STARTED`. */
  readonly currentRunId: string | undefined;
  /** The latest tool call of any kind started in the current attempt. */
  readonly lastToolCallId: string | undefined;
  /**
   * The last assistant message started in the current attempt, by text or by
   * a tool call's parent. Used only to link activities.
   */
  readonly lastAssistantMessageId: string | undefined;
  /** Why the last event, an `ACTIVITY_DELTA`, was dropped; logged by the effect. */
  readonly activityDeltaDropReason: string | undefined;
  /**
   * `b4.step` CUSTOM steps for calls not started yet in this attempt, keyed
   * by tool call id and applied when `TOOL_CALL_START` arrives.
   */
  readonly pendingToolSteps: Readonly<Record<string, ɵToolStep>>;
}

/** The canonical outcome of one AG-UI message event. @internal */
export type ɵAgUiMessageEventDecision =
  | {
      readonly kind: 'accepted';
      readonly event: AGUIEvent;
      readonly priorState: AgUiMessagesState;
      readonly state: AgUiMessagesState;
    }
  | { readonly kind: 'ignored'; readonly state: AgUiMessagesState }
  | { readonly kind: 'rejected'; readonly state: AgUiMessagesState };

/** Initial canonical AG-UI message state. @internal */
export const initialAgUiMessagesState: AgUiMessagesState = Object.freeze({
  committed: Object.freeze([]),
  draft: Object.freeze([]),
  attemptActive: false,
  protocolError: undefined,
  systemMessage: undefined,
  attemptStartToolCallIds: Object.freeze([]),
  finishedTextMessageIds: Object.freeze([]),
  draftFinishedTextMessageIds: Object.freeze([]),
  activeTextMessageId: undefined,
  activeReasoningMessageId: undefined,
  activeToolCallId: undefined,
  activeToolCallName: undefined,
  activeAssistantMessageId: undefined,
  currentRunId: undefined,
  lastToolCallId: undefined,
  lastAssistantMessageId: undefined,
  activityDeltaDropReason: undefined,
  pendingToolSteps: NO_PENDING_STEPS,
});

/** Reduces canonical AG-UI messages independently from Hashbrown projections. @internal */
export const reducer = createReducer(
  initialAgUiMessagesState,
  on(devActions.init, (_state, action): AgUiMessagesState => {
    const systemMessage = action.payload.systemMessage;
    const committed = ownRestored(action.payload.canonicalMessages);

    return {
      committed: withoutSystemOverlay(committed, systemMessage),
      draft: Object.freeze([]),
      attemptActive: false,
      protocolError: undefined,
      systemMessage,
      attemptStartToolCallIds: Object.freeze([]),
      finishedTextMessageIds: Object.freeze([]),
      draftFinishedTextMessageIds: Object.freeze([]),
      ...inactiveAttempt(),
    };
  }),
  on(devActions.updateOptions, (state, action): AgUiMessagesState => {
    if (!Object.hasOwn(action.payload, 'systemMessage')) {
      return state;
    }

    return {
      ...state,
      systemMessage: action.payload.systemMessage,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): AgUiMessagesState => {
    return {
      ...state,
      draft: state.committed,
      attemptActive: true,
      protocolError: undefined,
      attemptStartToolCallIds: freezeStrings(findToolCallIds(state.committed)),
      draftFinishedTextMessageIds: state.finishedTextMessageIds,
      ...inactiveAttempt(),
    };
  }),
  on(apiActions.generateMessageEvent, (state, action): AgUiMessagesState => {
    return (
      ɵreadAgUiMessageEventDecision(action) ??
      ɵdecideAgUiMessageEvent(state, action.payload)
    ).state;
  }),
  on(apiActions.generateMessageSuccess, (state): AgUiMessagesState => {
    if (!state.attemptActive) {
      return state;
    }

    return {
      ...state,
      committed: state.draft,
      attemptActive: false,
      protocolError: undefined,
      attemptStartToolCallIds: Object.freeze([]),
      finishedTextMessageIds: state.draftFinishedTextMessageIds,
      draftFinishedTextMessageIds: Object.freeze([]),
      ...inactiveAttempt(),
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): AgUiMessagesState =>
    rollback(state),
  ),
  on(
    apiActions.generateMessageError,
    internalActions.interruptThreadRetired,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    (state): AgUiMessagesState => rollback(state),
  ),
  on(devActions.sendMessage, (state, action): AgUiMessagesState => {
    if (action.payload.canonicalAppendCompatible === false) {
      return state;
    }
    try {
      const appended = own(action.payload.canonicalMessages);
      ɵassertAgUiMessageAppendCompatibility(state.committed, appended);
      const committed = Object.freeze([...state.committed, ...appended]);
      return {
        ...state,
        committed,
        draft: Object.freeze([]),
        attemptActive: false,
        protocolError: undefined,
        attemptStartToolCallIds: Object.freeze([]),
        draftFinishedTextMessageIds: Object.freeze([]),
        ...inactiveAttempt(),
      };
    } catch (error) {
      return {
        ...state,
        protocolError:
          error instanceof Error
            ? error
            : new Error('Invalid canonical message fragment'),
      };
    }
  }),
  on(devActions.setMessages, (state, action): AgUiMessagesState => {
    const committed = ownRestored(action.payload.canonicalMessages);
    return {
      ...state,
      committed: withoutSystemOverlay(committed, state.systemMessage),
      draft: Object.freeze([]),
      attemptActive: false,
      protocolError: undefined,
      attemptStartToolCallIds: Object.freeze([]),
      finishedTextMessageIds: Object.freeze([]),
      draftFinishedTextMessageIds: Object.freeze([]),
      ...inactiveAttempt(),
    };
  }),
  on(devActions.resendMessages, (state): AgUiMessagesState => rollback(state)),
  on(internalActions.toolTurnSettled, (state, action): AgUiMessagesState => {
    const canonicalMessages = readPreparedCanonicalMessages(action);
    if (!canonicalMessages) {
      return state;
    }

    return {
      ...state,
      committed: canonicalMessages,
      draft: Object.freeze([]),
      attemptActive: false,
      protocolError: undefined,
      attemptStartToolCallIds: Object.freeze([]),
      draftFinishedTextMessageIds: Object.freeze([]),
      ...inactiveAttempt(),
    };
  }),
);

/** Selects the committed synchronized AG-UI history. @internal */
export const ɵselectCommittedAgUiMessages = (state: AgUiMessagesState) =>
  state.committed;

/** Selects draft history during an attempt and committed history otherwise. @internal */
export const ɵselectVisibleAgUiMessages = (state: AgUiMessagesState) =>
  state.attemptActive ? state.draft : state.committed;

/** Selects visible history after the configured system overlay is applied. @internal */
export const ɵselectEffectiveVisibleAgUiMessages = (state: AgUiMessagesState) =>
  applySystemMessageOverlay(
    ɵselectVisibleAgUiMessages(state),
    state.systemMessage,
  );

/** Selects committed request history after the configured system overlay is applied. @internal */
export const ɵselectEffectiveCommittedAgUiMessages = (
  state: AgUiMessagesState,
) => applySystemMessageOverlay(state.committed, state.systemMessage);

/** Selects immutable tool call IDs that existed when the current attempt began. @internal */
export const ɵselectAttemptStartToolCallIds = (state: AgUiMessagesState) =>
  state.attemptStartToolCallIds;

/** Selects why the last event, an `ACTIVITY_DELTA`, was dropped. @internal */
export const ɵselectActivityDeltaDropReason = (state: AgUiMessagesState) =>
  state.activityDeltaDropReason;

/** Selects the most recent canonical message protocol error. @internal */
export const ɵselectAgUiMessagesProtocolError = (state: AgUiMessagesState) =>
  state.protocolError;

function readPreparedCanonicalMessages(
  action: unknown,
): readonly Readonly<Message>[] | undefined {
  return (
    action as { readonly ɵcanonicalMessages?: readonly Readonly<Message>[] }
  ).ɵcanonicalMessages;
}

/**
 * Validates and normalizes one AG-UI event before it is applied to derived
 * message projections.
 *
 * @internal
 */
export function ɵdecideAgUiMessageEvent(
  state: AgUiMessagesState,
  input: AGUIEvent,
): ɵAgUiMessageEventDecision {
  if (!state.attemptActive) {
    return { kind: 'ignored', state };
  }

  try {
    const event = correlateEvent(state, input);
    const activityDelta =
      event.type === EventType.ACTIVITY_DELTA
        ? applyActivityDelta(state.draft, event)
        : undefined;
    const draft =
      activityDelta?.messages ??
      applyCanonicalMessageEvent(state.draft, event, {
        finishedTextMessageIds: state.draftFinishedTextMessageIds,
        activityArrival: {
          runId: state.currentRunId,
          assistantMessageId: state.lastAssistantMessageId,
          toolCallId: state.lastToolCallId,
        },
        pendingToolSteps: state.pendingToolSteps,
        attemptScope: {
          startToolCallIds: state.attemptStartToolCallIds,
          committed: state.committed,
        },
      });
    const lifecycle = {
      ...nextLifecycle(state, event, draft),
      activityDeltaDropReason: activityDelta?.dropped,
      pendingToolSteps: nextPendingToolSteps(state, event, draft),
    };
    const draftFinishedTextMessageIds = nextFinishedTextMessageIds(
      state,
      event,
      draft,
    );
    const lifecycleChanged = Object.entries(lifecycle).some(
      ([key, value]) => state[key as keyof AgUiMessagesState] !== value,
    );
    if (isIgnoredEvent(event, draft)) {
      return { kind: 'ignored', state };
    }
    return {
      kind: 'accepted',
      event,
      priorState: state,
      state:
        draft === state.draft &&
        !lifecycleChanged &&
        !state.protocolError &&
        draftFinishedTextMessageIds === state.draftFinishedTextMessageIds
          ? state
          : {
              ...state,
              draft,
              protocolError: undefined,
              draftFinishedTextMessageIds,
              ...lifecycle,
            },
    };
  } catch (error) {
    return {
      kind: 'rejected',
      state: {
        ...state,
        protocolError:
          error instanceof Error
            ? error
            : new Error('Invalid AG-UI message event'),
      },
    };
  }
}

/** Reads a root-prepared canonical event decision from one reducer action. @internal */
export function ɵreadAgUiMessageEventDecision(
  action: unknown,
): ɵAgUiMessageEventDecision | undefined {
  const candidate = action as {
    readonly ɵagUiMessageEventDecision?: ɵAgUiMessageEventDecision;
  };
  return candidate.ɵagUiMessageEventDecision;
}

/**
 * Applies a single AG-UI event to canonical history.
 *
 * @param messages - Canonical history the event applies to.
 * @param event - The correlated AG-UI event.
 * @param context - Attempt facts that decide whether the event is legal.
 * @internal
 */
export function applyCanonicalMessageEvent(
  messages: readonly Readonly<Message>[],
  event: AGUIEvent,
  context?: {
    /** Text messages the server already ended in this thread. */
    readonly finishedTextMessageIds?: readonly string[];
    /** Run facts that link a newly created activity. */
    readonly activityArrival?: ActivityArrival;
    /** `b4.step` CUSTOM steps held for calls that have not started yet. */
    readonly pendingToolSteps?: Readonly<Record<string, ɵToolStep>>;
    /**
     * What the attempt started from. When given, a run end settles only the
     * calls started in this attempt and those whose step it wrote.
     */
    readonly attemptScope?: AttemptScope;
  },
): readonly Readonly<Message>[] {
  switch (event.type) {
    case EventType.MESSAGES_SNAPSHOT:
      return mergeSnapshotActivities(
        messages,
        recomputeActivityLinks(
          ɵreadAgUiMessageSnapshot(event),
          context?.activityArrival?.runId,
        ),
      );
    case EventType.ACTIVITY_SNAPSHOT:
      return applyActivitySnapshot(
        messages,
        event,
        context?.activityArrival ?? {},
      );
    case EventType.ACTIVITY_DELTA:
      return applyActivityDelta(messages, event).messages;
    case EventType.TEXT_MESSAGE_START:
      assertTextMessageIsUnfinished(event.messageId, context);
      return upsertText(
        messages,
        event.messageId,
        event.role,
        '',
        event,
        false,
      );
    case EventType.TEXT_MESSAGE_CONTENT:
      return upsertText(
        messages,
        event.messageId,
        undefined,
        event.delta,
        event,
        true,
      );
    case EventType.TEXT_MESSAGE_END:
      return messages.some((message) => message.id === event.messageId)
        ? upsertText(messages, event.messageId, undefined, '', event, false)
        : messages;
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId
        ? upsertText(
            messages,
            event.messageId,
            event.role,
            event.delta ?? '',
            event,
            true,
          )
        : messages;
    case EventType.REASONING_MESSAGE_START:
      return upsertText(
        messages,
        event.messageId,
        'reasoning',
        '',
        event,
        false,
      );
    case EventType.REASONING_MESSAGE_CONTENT:
      return upsertText(
        messages,
        event.messageId,
        'reasoning',
        event.delta,
        event,
        true,
      );
    case EventType.REASONING_MESSAGE_END:
      return messages.some((message) => message.id === event.messageId)
        ? upsertText(messages, event.messageId, 'reasoning', '', event, false)
        : messages;
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId
        ? upsertText(
            messages,
            event.messageId,
            'reasoning',
            event.delta ?? '',
            event,
            true,
          )
        : messages;
    case EventType.REASONING_ENCRYPTED_VALUE:
      return applyEncryptedValue(messages, event);
    case EventType.TOOL_CALL_START:
      return startToolCall(
        messages,
        event.toolCallId,
        event.toolCallName,
        event.parentMessageId,
        event,
        readHeldStep(context?.pendingToolSteps, event.toolCallId),
      );
    case EventType.TOOL_CALL_ARGS:
      return appendToolCallArguments(
        messages,
        event.toolCallId,
        event.delta,
        event,
      );
    case EventType.TOOL_CALL_END:
      return appendToolCallArguments(messages, event.toolCallId, '', event);
    case EventType.TOOL_CALL_CHUNK:
      return event.toolCallId && event.toolCallName
        ? appendOrStartToolCall(
            messages,
            event,
            readHeldStep(context?.pendingToolSteps, event.toolCallId),
          )
        : messages;
    case EventType.TOOL_CALL_RESULT:
      return upsertToolResult(messages, event);
    case EventType.CUSTOM:
      return event.name === ɵTOOL_STEP_EVENT_NAME
        ? foldCustomToolStep(messages, event.value, event.timestamp)
        : messages;
    case EventType.RUN_ERROR:
      return settleToolSteps(
        messages,
        'failed',
        new Set(),
        settleTime(event),
        context?.attemptScope,
      );
    case EventType.RUN_FINISHED: {
      const keepOpen = readFinishedKeepOpen(event);
      return keepOpen === undefined
        ? messages
        : settleToolSteps(
            messages,
            'cancelled',
            keepOpen,
            settleTime(event),
            context?.attemptScope,
          );
    }
    default:
      return messages;
  }
}

function rollback(state: AgUiMessagesState): AgUiMessagesState {
  if (!state.attemptActive) {
    return state;
  }

  return {
    ...state,
    draft: state.committed,
    attemptActive: false,
    protocolError: undefined,
    attemptStartToolCallIds: Object.freeze([]),
    draftFinishedTextMessageIds: state.finishedTextMessageIds,
    ...inactiveAttempt(),
  };
}

/** Clears per-event lifecycle and the run facts that link activities. */
function inactiveAttempt() {
  return {
    ...inactiveLifecycle(),
    currentRunId: undefined,
    lastToolCallId: undefined,
    lastAssistantMessageId: undefined,
    activityDeltaDropReason: undefined,
    pendingToolSteps: NO_PENDING_STEPS,
  } as const;
}

function inactiveLifecycle() {
  return {
    activeTextMessageId: undefined,
    activeReasoningMessageId: undefined,
    activeToolCallId: undefined,
    activeToolCallName: undefined,
    activeAssistantMessageId: undefined,
  } as const;
}

function correlateEvent(state: AgUiMessagesState, event: AGUIEvent): AGUIEvent {
  switch (event.type) {
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId || !state.activeTextMessageId
        ? event
        : { ...event, messageId: state.activeTextMessageId };
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId || !state.activeReasoningMessageId
        ? event
        : { ...event, messageId: state.activeReasoningMessageId };
    case EventType.TOOL_CALL_CHUNK:
      if (event.toolCallId) {
        const existing = findToolCall(state.draft, event.toolCallId);
        return {
          ...event,
          parentMessageId:
            event.parentMessageId ??
            (existing ? undefined : state.activeAssistantMessageId),
          toolCallName:
            event.toolCallName ??
            (event.toolCallId === state.activeToolCallId
              ? state.activeToolCallName
              : existing?.tool.function.name),
        };
      }
      return !state.activeToolCallId
        ? event
        : {
            ...event,
            toolCallId: state.activeToolCallId,
            toolCallName: event.toolCallName ?? state.activeToolCallName,
            parentMessageId:
              event.parentMessageId ?? state.activeAssistantMessageId,
          };
    case EventType.TOOL_CALL_START:
      return event.parentMessageId ||
        !state.activeAssistantMessageId ||
        findToolCall(state.draft, event.toolCallId)
        ? event
        : { ...event, parentMessageId: state.activeAssistantMessageId };
    default:
      return event;
  }
}

function nextLifecycle(
  state: AgUiMessagesState,
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
) {
  switch (event.type) {
    case EventType.RUN_STARTED:
      return { currentRunId: event.runId };
    case EventType.MESSAGES_SNAPSHOT:
      return inactiveLifecycle();
    case EventType.TEXT_MESSAGE_START:
      return {
        ...inactiveLifecycle(),
        activeTextMessageId: event.messageId,
        activeAssistantMessageId:
          (event.role ?? 'assistant') === 'assistant'
            ? event.messageId
            : undefined,
        ...((event.role ?? 'assistant') === 'assistant'
          ? { lastAssistantMessageId: event.messageId }
          : {}),
      };
    case EventType.TEXT_MESSAGE_END:
      return event.messageId === state.activeTextMessageId
        ? { activeTextMessageId: undefined }
        : {};
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId
        ? {
            activeTextMessageId: event.messageId,
            activeAssistantMessageId:
              (event.role ?? 'assistant') === 'assistant'
                ? event.messageId
                : state.activeAssistantMessageId,
            ...((event.role ?? 'assistant') === 'assistant'
              ? { lastAssistantMessageId: event.messageId }
              : {}),
          }
        : {};
    case EventType.REASONING_MESSAGE_START:
      return { activeReasoningMessageId: event.messageId };
    case EventType.REASONING_MESSAGE_END:
      return event.messageId === state.activeReasoningMessageId
        ? { activeReasoningMessageId: undefined }
        : {};
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId
        ? { activeReasoningMessageId: event.messageId }
        : {};
    case EventType.TOOL_CALL_START:
      return {
        activeToolCallId: event.toolCallId,
        activeToolCallName: event.toolCallName,
        lastToolCallId: event.toolCallId,
        ...(event.parentMessageId
          ? { lastAssistantMessageId: event.parentMessageId }
          : {}),
      };
    case EventType.TOOL_CALL_END:
      return event.toolCallId === state.activeToolCallId
        ? { activeToolCallId: undefined, activeToolCallName: undefined }
        : {};
    case EventType.TOOL_CALL_CHUNK:
      return event.toolCallId && findToolCall(draft, event.toolCallId)
        ? {
            activeToolCallId: event.toolCallId,
            activeToolCallName: event.toolCallName,
            ...(findToolCall(state.draft, event.toolCallId)
              ? {}
              : {
                  lastToolCallId: event.toolCallId,
                  ...(event.parentMessageId
                    ? { lastAssistantMessageId: event.parentMessageId }
                    : {}),
                }),
          }
        : {};
    default:
      return {};
  }
}

function isIgnoredEvent(
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
): boolean {
  if (
    event.type !== EventType.TOOL_CALL_ARGS &&
    event.type !== EventType.TOOL_CALL_END &&
    event.type !== EventType.TOOL_CALL_CHUNK
  ) {
    return false;
  }
  return !event.toolCallId || !findToolCall(draft, event.toolCallId);
}

function own(
  messages: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  return ɵownValidatedAgUiMessages(messages as readonly Message[]);
}

/** Owns restored history; its activities get links from position. */
function ownRestored(
  messages: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  return recomputeActivityLinks(own(messages));
}

function withoutSystemOverlay(
  messages: readonly Readonly<Message>[],
  systemMessage: Readonly<SystemMessage> | undefined,
): readonly Readonly<Message>[] {
  if (!systemMessage) {
    return messages;
  }

  const filtered = messages.filter(
    (message) => message.id !== systemMessage.id,
  );
  return filtered.length === messages.length
    ? messages
    : Object.freeze(filtered);
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function findToolCallIds(messages: readonly Readonly<Message>[]): string[] {
  return messages.flatMap((message) =>
    message.role === 'assistant'
      ? (message.toolCalls ?? []).map((tool) => tool.id)
      : [],
  );
}

/**
 * Rejects starting a text message the server already ended.
 *
 * Starting a message that history merely holds is legal, because a snapshot or
 * an earlier turn can deliver the message a later stream fills in. Starting one
 * that already ended is not: the deltas that follow would silently extend the
 * finished message instead of opening the new one the server meant to send.
 */
function assertTextMessageIsUnfinished(
  id: string,
  context: { readonly finishedTextMessageIds?: readonly string[] } | undefined,
): void {
  if (context?.finishedTextMessageIds?.includes(id)) {
    throw new Error(
      `AG-UI message ${id} already ended and cannot start again; message IDs must be unique within a thread`,
    );
  }
}

/**
 * Tracks the text messages this attempt has ended.
 *
 * An end that matched no canonical message is a no-op, so it must not close
 * the ID to a later start. A snapshot restates history, so the server may
 * reopen what it just sent.
 */
function nextFinishedTextMessageIds(
  state: AgUiMessagesState,
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
): readonly string[] {
  const current = state.draftFinishedTextMessageIds;
  if (event.type === EventType.MESSAGES_SNAPSHOT) {
    return current.length === 0 ? current : Object.freeze([]);
  }
  if (
    event.type !== EventType.TEXT_MESSAGE_END ||
    current.includes(event.messageId) ||
    !draft.some((message) => message.id === event.messageId)
  ) {
    return current;
  }
  return Object.freeze([...current, event.messageId]);
}

function upsertText(
  messages: readonly Readonly<Message>[],
  id: string,
  role: Message['role'] | undefined,
  delta: string,
  event: AGUIEvent,
  append: boolean,
): readonly Readonly<Message>[] {
  if (findToolCall(messages, id)) {
    throw new Error(`AG-UI message ID ${id} conflicts with a tool call ID`);
  }
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) {
    const nextRole = role ?? 'assistant';
    return appendOwned(messages, makeTextMessage(id, nextRole, delta, event));
  }

  const current = messages[index];
  if (!current) {
    return messages;
  }
  if (role !== undefined && current.role !== role) {
    throw new Error(
      `AG-UI message ${id} cannot change role from ${current.role} to ${role}`,
    );
  }
  if (!isTextRole(current.role)) {
    throw new Error(`AG-UI message ${id} is not a text message`);
  }

  const textMessage = current as Extract<
    Message,
    { role: 'assistant' | 'user' | 'system' | 'developer' | 'reasoning' }
  >;
  const content = append
    ? (textMessage.content ?? '') + delta
    : (textMessage.content ?? delta);
  return replaceAt(
    messages,
    index,
    mergeEventFields({ ...textMessage, content }, event) as Message,
  );
}

function makeTextMessage(
  id: string,
  role: Message['role'],
  content: string,
  event: AGUIEvent,
): Message {
  if (!isTextRole(role)) {
    throw new Error(`AG-UI event cannot create ${role} as a text message`);
  }

  return mergeEventFields({ id, role, content } as Message, event);
}

function isTextRole(role: Message['role']): boolean {
  return (
    role === 'assistant' ||
    role === 'user' ||
    role === 'system' ||
    role === 'developer' ||
    role === 'reasoning'
  );
}

function startToolCall(
  messages: readonly Readonly<Message>[],
  toolCallId: string,
  toolCallName: string,
  parentMessageId: string | undefined,
  event: AGUIEvent,
  heldStep?: ɵToolStep,
): readonly Readonly<Message>[] {
  if (parentMessageId === toolCallId) {
    throw new Error(`AG-UI tool call ${toolCallId} cannot parent itself`);
  }
  if (messages.some((message) => message.id === toolCallId)) {
    throw new Error(
      `AG-UI tool call ID ${toolCallId} conflicts with a message ID`,
    );
  }
  const existing = findToolCall(messages, toolCallId);
  if (existing) {
    if (existing.tool.function.name !== toolCallName) {
      throw new Error(`AG-UI tool call ${toolCallId} cannot change name`);
    }
    if (
      parentMessageId !== undefined &&
      parentMessageId !== existing.message.id
    ) {
      throw new Error(`AG-UI tool call ${toolCallId} cannot change parent`);
    }
    const reopenedMetadata = reopenCancelledStep(
      existing.tool.metadata as Record<string, unknown> | undefined,
    );
    const reopenedTool =
      reopenedMetadata === existing.tool.metadata
        ? existing.tool
        : { ...existing.tool, metadata: reopenedMetadata };
    if (
      event.metadata === undefined &&
      heldStep === undefined &&
      reopenedTool === existing.tool
    ) {
      return messages;
    }
    const merged = withStampedStart(
      mergeEventFields(withHeldStep(reopenedTool, heldStep), event),
      event.timestamp,
    ) as NonNullable<
      Extract<Message, { role: 'assistant' }>['toolCalls']
    >[number];
    if (merged === existing.tool) return messages;
    const tool = freezeToolCall(merged);
    const assistant = freezeMessage({
      ...existing.message,
      toolCalls: Object.freeze(
        (existing.message.toolCalls ?? []).map((current) =>
          current.id === toolCallId ? tool : current,
        ),
      ),
    } as Message);
    return replaceAt(messages, existing.messageIndex, assistant);
  }
  const parentId = parentMessageId ?? `assistant-${toolCallId}`;
  const index = messages.findIndex((message) => message.id === parentId);
  if (index === -1 && findToolCall(messages, parentId)) {
    throw new Error(
      `AG-UI assistant parent ID ${parentId} conflicts with a tool call ID`,
    );
  }
  const assistant =
    index === -1
      ? ({
          id: parentId,
          role: 'assistant',
          content: '',
          toolCalls: [],
        } as Message)
      : messages[index];
  if (assistant?.role !== 'assistant') {
    throw new Error(
      `AG-UI tool call ${toolCallId} parent must be an assistant message`,
    );
  }
  const tool = freezeToolCall(
    withStampedStart(
      mergeEventFields(
        withHeldStep(
          {
            id: toolCallId,
            type: 'function' as const,
            function: { name: toolCallName, arguments: '' },
          },
          heldStep,
        ),
        event,
      ),
      event.timestamp,
    ) as NonNullable<
      Extract<Message, { role: 'assistant' }>['toolCalls']
    >[number],
  );
  const nextAssistant = freezeMessage({
    ...assistant,
    toolCalls: Object.freeze([...(assistant.toolCalls ?? []), tool]),
  } as Message);
  return index === -1
    ? appendOwned(messages, nextAssistant)
    : replaceAt(messages, index, nextAssistant);
}

function appendOrStartToolCall(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_CHUNK }>,
  heldStep?: ɵToolStep,
): readonly Readonly<Message>[] {
  if (!event.toolCallId || !event.toolCallName) {
    return messages;
  }

  const found = findToolCall(messages, event.toolCallId);
  if (found && found.tool.function.name !== event.toolCallName) {
    throw new Error(`AG-UI tool call ${event.toolCallId} cannot change name`);
  }
  if (
    found &&
    event.parentMessageId !== undefined &&
    event.parentMessageId !== found.message.id
  ) {
    throw new Error(`AG-UI tool call ${event.toolCallId} cannot change parent`);
  }
  const started = found
    ? messages
    : startToolCall(
        messages,
        event.toolCallId,
        event.toolCallName,
        event.parentMessageId,
        event,
        heldStep,
      );
  return event.delta === undefined && event.metadata === undefined
    ? started
    : appendToolCallArguments(
        started,
        event.toolCallId,
        event.delta ?? '',
        event,
      );
}

function appendToolCallArguments(
  messages: readonly Readonly<Message>[],
  toolCallId: string,
  delta: string,
  event: AGUIEvent,
): readonly Readonly<Message>[] {
  const found = findToolCall(messages, toolCallId);
  if (!found) {
    return messages;
  }
  if (delta.length === 0 && event.metadata === undefined) {
    return messages;
  }
  const base = withFrameResultStep(
    messages,
    found.tool,
    event.metadata?.[ɵTOOL_STEP_METADATA_KEY],
  );
  const tool = freezeToolCall(
    mergeEventFields(
      {
        ...base,
        function: {
          ...found.tool.function,
          arguments: found.tool.function.arguments + delta,
        },
      },
      event,
    ) as NonNullable<
      Extract<Message, { role: 'assistant' }>['toolCalls']
    >[number],
  );
  const nextAssistant = freezeMessage({
    ...found.message,
    toolCalls: Object.freeze(
      (found.message.toolCalls ?? []).map((current) =>
        current.id === toolCallId ? tool : current,
      ),
    ),
  } as Message);
  return replaceAt(messages, found.messageIndex, nextAssistant);
}

function upsertToolResult(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_RESULT }>,
): readonly Readonly<Message>[] {
  const index = messages.findIndex((message) => message.id === event.messageId);
  if (index !== -1 && messages[index]?.role !== 'tool') {
    throw new Error(
      `AG-UI message ${event.messageId} cannot change role to tool`,
    );
  }
  if (
    index !== -1 &&
    messages[index]?.role === 'tool' &&
    messages[index].toolCallId !== event.toolCallId
  ) {
    throw new Error(
      `AG-UI tool result ${event.messageId} cannot change tool call`,
    );
  }
  if (!findToolCall(messages, event.toolCallId)) {
    return messages;
  }
  if (findToolCall(messages, event.messageId)) {
    throw new Error(
      `AG-UI message ID ${event.messageId} conflicts with a tool call ID`,
    );
  }
  const input = event as AGUIEvent & { readonly error?: string };
  const message = freezeMessage(
    mergeEventFields(
      {
        id: event.messageId,
        role: 'tool' as const,
        toolCallId: event.toolCallId,
        content: event.content,
        ...(input.error === undefined ? {} : { error: input.error }),
      } as Message,
      event,
    ),
  );
  return index === -1
    ? appendOwned(messages, message)
    : replaceAt(messages, index, message);
}

function applyEncryptedValue(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.REASONING_ENCRYPTED_VALUE }>,
): readonly Readonly<Message>[] {
  if (event.subtype === 'message') {
    const index = messages.findIndex(
      (message) => message.id === event.entityId,
    );
    return index === -1
      ? messages
      : replaceAt(
          messages,
          index,
          freezeMessage({
            ...(messages[index] as Message),
            encryptedValue: event.encryptedValue,
          } as Message),
        );
  }
  const found = findToolCall(messages, event.entityId);
  if (!found) {
    return messages;
  }
  const next = freezeMessage({
    ...found.message,
    toolCalls: Object.freeze(
      (found.message.toolCalls ?? []).map((tool) =>
        tool.id === event.entityId
          ? freezeToolCall({ ...tool, encryptedValue: event.encryptedValue })
          : tool,
      ),
    ),
  } as Message);
  return replaceAt(messages, found.messageIndex, next);
}

function findToolCall(messages: readonly Readonly<Message>[], id: string) {
  for (
    let messageIndex = 0;
    messageIndex < messages.length;
    messageIndex += 1
  ) {
    const message = messages[messageIndex];
    if (message?.role !== 'assistant') continue;
    const tool = message.toolCalls?.find((current) => current.id === id);
    if (tool) return { messageIndex, message, tool };
  }
  return undefined;
}

function replaceAt<T>(
  values: readonly T[],
  index: number,
  value: T,
): readonly T[] {
  const current = values[index];
  if (current === value || sameOwnFields(current, value)) {
    return values;
  }
  return Object.freeze(
    values.map((current, currentIndex) =>
      currentIndex === index ? value : current,
    ),
  );
}

function sameOwnFields(left: unknown, right: unknown): boolean {
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) && leftRecord[key] === rightRecord[key],
    )
  );
}

function appendOwned<T>(values: readonly T[], value: T): readonly T[] {
  return Object.freeze([...values, value]);
}

function freezeMessage<T extends Message>(message: T): Readonly<T> {
  return Object.freeze(message);
}

function freezeToolCall(
  toolCall: NonNullable<
    Extract<Message, { role: 'assistant' }>['toolCalls']
  >[number],
): Readonly<
  NonNullable<Extract<Message, { role: 'assistant' }>['toolCalls']>[number]
> {
  return Object.freeze({
    ...toolCall,
    function: Object.freeze({ ...toolCall.function }),
  });
}

function mergeEventFields<T extends Record<string, unknown>>(
  message: T,
  event: AGUIEvent,
): T {
  const candidate = event as unknown as object;
  const metadata = ownEventField(candidate, 'metadata');
  const name = ownEventField(candidate, 'name');
  const subagentRunId = ownEventField(candidate, 'subagentRunId');
  const next = Object.freeze({
    ...message,
    ...(metadata === undefined
      ? {}
      : {
          metadata: Object.freeze({
            ...ɵmergeStepMetadata(
              message['metadata'] as Record<string, unknown> | undefined,
              ɵownAgUiJsonValue(metadata) as Record<string, unknown>,
              message['role'] === 'tool' ? 'message' : 'call',
              readStepCallId(message),
            ),
          }),
        }),
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof subagentRunId === 'string' ? { subagentRunId } : {}),
  }) as T;
  return Object.isFrozen(message) &&
    JSON.stringify(next) === JSON.stringify(message)
    ? message
    : Object.freeze(next);
}

/** The call a tool call or tool message's step belongs to, if it is one. */
function readStepCallId(message: Record<string, unknown>): string | undefined {
  const id =
    message['role'] === 'tool'
      ? message['toolCallId']
      : 'function' in message
        ? message['id']
        : undefined;
  return typeof id === 'string' ? id : undefined;
}

function ownEventField(event: object, field: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(event, field);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

type CanonicalToolCall = NonNullable<
  Extract<Message, { role: 'assistant' }>['toolCalls']
>[number];

function readHeldStep(
  pending: Readonly<Record<string, ɵToolStep>> | undefined,
  toolCallId: string | undefined,
): ɵToolStep | undefined {
  return pending !== undefined &&
    toolCallId !== undefined &&
    Object.hasOwn(pending, toolCallId)
    ? pending[toolCallId]
    : undefined;
}

/**
 * Stamps the call's step with the START time when the step has no
 * `startedAt` of its own.
 */
function withStampedStart<T extends Record<string, unknown>>(
  tool: T,
  timestamp: number | undefined,
): T {
  const metadata = tool['metadata'] as Record<string, unknown> | undefined;
  const stamped = stampStepMetadataStart(metadata, timestamp);
  return stamped === metadata
    ? tool
    : { ...tool, metadata: Object.freeze({ ...stamped }) };
}

/** Folds a held CUSTOM step into a tool call before its START metadata. */
function withHeldStep<T extends Record<string, unknown>>(
  tool: T,
  heldStep: ɵToolStep | undefined,
): T {
  if (heldStep === undefined) return tool;
  return {
    ...tool,
    metadata: Object.freeze({
      ...ɵmergeStepMetadata(
        tool['metadata'] as Record<string, unknown> | undefined,
        { [ɵTOOL_STEP_METADATA_KEY]: heldStep },
        'call',
        tool['id'] as string | undefined,
      ),
    }),
  };
}

/**
 * Normalizes a CUSTOM step value without its `toolCallId`, which the call
 * already names, as B4 does. `kind` is kept only when the value states it, so
 * a legacy value never overwrites a stored kind.
 */
function withoutToolCallId(
  value: unknown,
  keepKind = false,
): Record<string, unknown> | undefined {
  const step = ɵreadToolStep(value);
  if (step === undefined) return undefined;
  const raw = value as Record<string, unknown>;
  const statedKind =
    keepKind || raw['kind'] === 'server' || raw['kind'] === 'provider';
  return Object.fromEntries(
    Object.entries(step).filter(
      ([key]) => key !== 'toolCallId' && (statedKind || key !== 'kind'),
    ),
  );
}

/** Reads the call a CUSTOM `b4.step` value targets, if it is a readable step. */
function readCustomStepTarget(value: unknown): string | undefined {
  return ɵreadToolStep(value)?.toolCallId;
}

/** Folds a CUSTOM `b4.step` into its call's metadata, as a call step. */
function foldCustomToolStep(
  messages: readonly Readonly<Message>[],
  value: unknown,
  timestamp: number | undefined,
): readonly Readonly<Message>[] {
  const toolCallId = readCustomStepTarget(value);
  if (toolCallId === undefined) return messages;
  const found = findToolCall(messages, toolCallId);
  if (!found) return messages;
  const base = withFrameResultStep(messages, found.tool, value);
  const held = ɵreadToolStep(base.metadata?.[ɵTOOL_STEP_METADATA_KEY]);
  const merged = ɵmergeStepMetadata(
    base.metadata as Record<string, unknown> | undefined,
    { [ɵTOOL_STEP_METADATA_KEY]: withoutToolCallId(value) },
    'call',
    toolCallId,
  );
  // A running write never contributes to a settled step, not even its time.
  const ignored =
    held?.status !== undefined &&
    held.status !== 'running' &&
    ɵreadToolStep(value)?.status === 'running';
  const metadata = ignored ? merged : stampStepMetadataStart(merged, timestamp);
  return replaceToolCall(messages, found, {
    ...found.tool,
    metadata: Object.freeze({ ...metadata }),
  } as CanonicalToolCall);
}

/**
 * Prepares a call for an incoming step write. When the write is a readable
 * step, the call has no step, and its result already arrived without one,
 * the call takes the step that frame-only result implies, and the write then
 * merges onto it as any call write does, as in B4's fold. Otherwise the call
 * is returned unchanged.
 */
function withFrameResultStep(
  messages: readonly Readonly<Message>[],
  tool: CanonicalToolCall,
  incomingStep: unknown,
): CanonicalToolCall {
  if (ɵreadToolStep(incomingStep) === undefined) return tool;
  const metadata = tool.metadata as Record<string, unknown> | undefined;
  const seeded = seedFrameResultStep(
    metadata,
    readFrameOnlyResult(messages, tool.id),
  );
  return seeded === metadata
    ? tool
    : { ...tool, metadata: Object.freeze({ ...seeded }) };
}

/**
 * The result a call already has when that result carries no readable step,
 * with its error string if it failed; `undefined` otherwise.
 */
function readFrameOnlyResult(
  messages: readonly Readonly<Message>[],
  toolCallId: string,
): { readonly error?: string } | undefined {
  const result = messages.find(
    (message) => message.role === 'tool' && message.toolCallId === toolCallId,
  );
  if (result?.role !== 'tool') return undefined;
  if (ɵreadToolStep(result.metadata?.[ɵTOOL_STEP_METADATA_KEY]) !== undefined) {
    return undefined;
  }
  const error = readResultFailure(result.error);
  return error === undefined ? {} : { error };
}

/**
 * Holds a CUSTOM `b4.step` for a call the draft does not have yet, and drops
 * a held step once its call has started.
 */
function nextPendingToolSteps(
  state: AgUiMessagesState,
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
): Readonly<Record<string, ɵToolStep>> {
  const pending = state.pendingToolSteps;
  if (event.type === EventType.CUSTOM) {
    if (event.name !== ɵTOOL_STEP_EVENT_NAME) return pending;
    const step = ɵreadToolStep(event.value);
    const id = step?.toolCallId;
    if (step === undefined || id === undefined || findToolCall(draft, id)) {
      return pending;
    }
    return Object.freeze({
      ...pending,
      [id]: withProviderIdentity(
        readHeldStep(pending, id),
        undefined,
        stampStepStart(
          ɵmergeToolStep(
            readHeldStep(pending, id),
            withoutToolCallId(event.value, true) as ɵToolStepRead,
            'call',
          ),
          event.timestamp,
        ),
      ),
    });
  }
  if (
    (event.type === EventType.TOOL_CALL_START ||
      event.type === EventType.TOOL_CALL_CHUNK) &&
    readHeldStep(pending, event.toolCallId) !== undefined &&
    event.toolCallId !== undefined &&
    findToolCall(draft, event.toolCallId)
  ) {
    const id = event.toolCallId;
    return Object.freeze(
      Object.fromEntries(Object.entries(pending).filter(([key]) => key !== id)),
    );
  }
  return pending;
}

function settleTime(event: AGUIEvent): number {
  return typeof event.timestamp === 'number' ? event.timestamp : Date.now();
}

/**
 * The calls a `RUN_FINISHED` keeps open, or `undefined` when it settles
 * nothing. An interrupt keeps the calls its interrupts name, plus any
 * `pendingToolCallIds`; a cancel keeps none; a success settles nothing.
 */
function readFinishedKeepOpen(
  event: Extract<AGUIEvent, { type: EventType.RUN_FINISHED }>,
): ReadonlySet<string> | undefined {
  const outcome = (event as { readonly outcome?: unknown }).outcome;
  if (typeof outcome !== 'object' || outcome === null) return undefined;
  const record = outcome as Record<string, unknown>;
  if (record['type'] === 'cancelled') return new Set();
  if (record['type'] !== 'interrupt') return undefined;
  const interrupts = Array.isArray(record['interrupts'])
    ? record['interrupts']
    : [];
  const pending = Array.isArray(record['pendingToolCallIds'])
    ? record['pendingToolCallIds']
    : [];
  return new Set(
    [
      ...interrupts.map((interrupt: unknown) =>
        typeof interrupt === 'object' && interrupt !== null
          ? (interrupt as Record<string, unknown>)['toolCallId']
          : undefined,
      ),
      ...pending,
    ].filter((id): id is string => typeof id === 'string'),
  );
}

/**
 * Settles the step of every open call. A call is open when it has no result
 * and its step is absent or running; a call with no step gets one.
 */
function settleToolSteps(
  messages: readonly Readonly<Message>[],
  outcome: 'failed' | 'cancelled',
  keepOpen: ReadonlySet<string>,
  at: number,
  scope: AttemptScope | undefined,
): readonly Readonly<Message>[] {
  const answered = new Set(
    messages.flatMap((message) =>
      message.role === 'tool' ? [message.toolCallId] : [],
    ),
  );
  const open: Record<string, ɵToolStep> = {};
  for (const id of findToolCallIds(messages)) {
    if (answered.has(id) || keepOpen.has(id)) continue;
    const found = findToolCall(messages, id);
    if (scope !== undefined && !inAttempt(scope, id, found?.tool)) continue;
    const raw = found?.tool.metadata?.[ɵTOOL_STEP_METADATA_KEY];
    const step = ɵreadToolStep(raw);
    if (
      step !== undefined &&
      step.status !== undefined &&
      step.status !== 'running'
    ) {
      continue;
    }
    Object.defineProperty(open, id, {
      value:
        step === undefined
          ? // An unreadable provider step keeps its identity (never replayed).
            {
              v: 1,
              kind: 'server',
              ...readRawStepIdentity(raw),
              status: 'running',
            }
          : { ...step, status: 'running' },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const settled = settleOpenSteps(open, outcome, new Set(), at);
  return Object.entries(settled).reduce((current, [id, step]) => {
    const found = findToolCall(current, id);
    if (!found) return current;
    return replaceToolCall(current, found, {
      ...found.tool,
      metadata: Object.freeze({
        ...found.tool.metadata,
        [ɵTOOL_STEP_METADATA_KEY]: withProviderIdentity(
          found.tool.metadata?.[ɵTOOL_STEP_METADATA_KEY],
          undefined,
          step,
        ),
      }),
    } as CanonicalToolCall);
  }, messages);
}

/** What an attempt started from, to tell its calls from earlier turns'. */
interface AttemptScope {
  readonly startToolCallIds: readonly string[];
  readonly committed: readonly Readonly<Message>[];
}

/**
 * Whether a call belongs to the current attempt: it started in it, or the
 * attempt wrote its step (a parked call resumed by a CUSTOM step). Writes
 * always produce a new step object, so identity tells them apart.
 */
function inAttempt(
  scope: AttemptScope,
  id: string,
  tool: CanonicalToolCall | undefined,
): boolean {
  if (!scope.startToolCallIds.includes(id)) return true;
  const committed = findToolCall(scope.committed, id)?.tool;
  return (
    committed?.metadata?.[ɵTOOL_STEP_METADATA_KEY] !==
    tool?.metadata?.[ɵTOOL_STEP_METADATA_KEY]
  );
}

function replaceToolCall(
  messages: readonly Readonly<Message>[],
  found: NonNullable<ReturnType<typeof findToolCall>>,
  tool: CanonicalToolCall,
): readonly Readonly<Message>[] {
  const frozen = freezeToolCall(tool);
  const assistant = freezeMessage({
    ...found.message,
    toolCalls: Object.freeze(
      (found.message.toolCalls ?? []).map((current) =>
        current.id === tool.id ? frozen : current,
      ),
    ),
  } as Message);
  return replaceAt(messages, found.messageIndex, assistant);
}
