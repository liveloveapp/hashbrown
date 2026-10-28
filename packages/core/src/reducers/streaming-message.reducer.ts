import { apiActions, devActions, internalActions } from '../actions';
import { EventType } from '@ag-ui/core';
import { Chat } from '../models';
import { JsonValue } from '../utils';
import { createReducer, on, select } from '../utils/micro-ngrx';
import {
  accumulateAgUiMessageEvent,
  type AgUiMessageAccumulatorDiagnostic,
  type AgUiMessageAccumulatorState,
  createAgUiMessageAccumulator,
  initialAgUiMessageAccumulatorState,
} from './ag-ui-message-accumulator';
import {
  projectAgUiMessages,
  type ɵAgUiMessageProjectionCache,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { ɵreadAgUiMessageEventDecision } from './ag-ui-messages.reducer';

export type StreamingMessageState = AgUiMessageAccumulatorState & {
  readonly attemptActive: boolean;
  /** Leaf parser states; the foreground state never nests this collection. */
  readonly accumulators?: ReadonlyMap<string, StreamingMessageState>;
  readonly snapshotReasoningMessageIds?: readonly string[];
};

export const initialState: StreamingMessageState = {
  ...initialAgUiMessageAccumulatorState,
  attemptActive: false,
  snapshotReasoningMessageIds: [],
};

function completeSnapshotReasoningMessages(
  state: StreamingMessageState,
): StreamingMessageState {
  const snapshotReasoningMessageIds = state.snapshotReasoningMessageIds ?? [];
  if (snapshotReasoningMessageIds.length === 0) return state;

  return {
    ...state,
    reasoningMessageStatusById: snapshotReasoningMessageIds.reduce(
      (statuses, messageId) =>
        statuses[messageId] === 'active'
          ? { ...statuses, [messageId]: 'complete' }
          : statuses,
      state.reasoningMessageStatusById,
    ),
    snapshotReasoningMessageIds: [],
  };
}

function retireSnapshotReasoningMessage(
  state: StreamingMessageState,
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
): StreamingMessageState {
  const snapshotReasoningMessageIds = state.snapshotReasoningMessageIds ?? [];
  if (
    (event.type !== EventType.REASONING_MESSAGE_CONTENT &&
      event.type !== EventType.REASONING_MESSAGE_END) ||
    !snapshotReasoningMessageIds.includes(event.messageId)
  ) {
    return state;
  }

  return {
    ...state,
    snapshotReasoningMessageIds: snapshotReasoningMessageIds.filter(
      (messageId) => messageId !== event.messageId,
    ),
  };
}

function warnRecoveredTrailingContent(
  parsedData: JsonValue,
  extraData: string,
) {
  console.warn(
    'Hashbrown received extra data after a valid JSON value. The first value was used, but the extra data was ignored.',
    {
      parsedData,
      extraData,
      tips: [
        'Add examples of exactly one valid JSON object to your prompt.',
        'Ask the model not to emit multiple JSON values or split a response across JSON objects.',
        'If the response is too long, ask the model to summarize while keeping one valid JSON object.',
      ],
    },
  );
}

function emitDiagnostic(diagnostic: AgUiMessageAccumulatorDiagnostic) {
  switch (diagnostic.type) {
    case 'recovered-trailing-content':
      warnRecoveredTrailingContent(diagnostic.parsedData, diagnostic.extraData);
      return;
  }
}

function accumulateEvent(
  state: StreamingMessageState,
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
) {
  const next = accumulateAgUiMessageEvent(state, event);
  const newDiagnostics = next.diagnostics.slice(state.diagnostics.length);

  newDiagnostics.forEach(emitDiagnostic);

  return next;
}

function findAssistantForEvent(
  messages: readonly Chat.Internal.Message[],
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
): Chat.Internal.AssistantMessage | undefined {
  const assistantById = (messageId: string | undefined) =>
    messageId === undefined
      ? undefined
      : messages.find(
          (message): message is Chat.Internal.AssistantMessage =>
            message.role === 'assistant' && message.id === messageId,
        );
  const assistantByToolCallId = (toolCallId: string | undefined) =>
    toolCallId === undefined
      ? undefined
      : messages.find(
          (message): message is Chat.Internal.AssistantMessage =>
            message.role === 'assistant' &&
            message.toolCallIds.includes(toolCallId),
        );
  const assistantByReasoningMessageId = (messageId: string | undefined) =>
    messageId === undefined
      ? undefined
      : messages.find(
          (message): message is Chat.Internal.AssistantMessage =>
            message.role === 'assistant' &&
            message.reasoning?.kind === 'details' &&
            message.reasoning.details.some((detail) => detail.id === messageId),
        );

  switch (event.type) {
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
    case EventType.TEXT_MESSAGE_END:
    case EventType.TEXT_MESSAGE_CHUNK:
      return assistantById(event.messageId);
    case EventType.REASONING_MESSAGE_START:
    case EventType.REASONING_MESSAGE_CONTENT:
    case EventType.REASONING_MESSAGE_END:
    case EventType.REASONING_MESSAGE_CHUNK:
      return assistantByReasoningMessageId(event.messageId);
    case EventType.TOOL_CALL_START:
    case EventType.TOOL_CALL_CHUNK:
      return (
        assistantById(event.parentMessageId) ??
        assistantByToolCallId(event.toolCallId)
      );
    case EventType.TOOL_CALL_ARGS:
    case EventType.TOOL_CALL_END:
      return assistantByToolCallId(event.toolCallId);
    case EventType.TOOL_CALL_RESULT:
      return assistantByToolCallId(event.toolCallId);
    case EventType.REASONING_ENCRYPTED_VALUE:
      return event.subtype === 'tool-call'
        ? assistantByToolCallId(event.entityId)
        : (assistantById(event.entityId) ??
            assistantByReasoningMessageId(event.entityId));
    default:
      return undefined;
  }
}

function findCanonicalAssistantIdForEvent(
  messages: readonly Readonly<import('@ag-ui/core').Message>[],
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
): string | undefined {
  const assistantById = (messageId: string | undefined) =>
    messages.find(
      (message) => message.role === 'assistant' && message.id === messageId,
    )?.id;
  const assistantByReasoningMessageId = (messageId: string | undefined) => {
    const pending = new Map<string, string | undefined>();
    for (const message of messages) {
      if (message.role === 'reasoning') {
        pending.set(message.id, message.subagentRunId);
        continue;
      }
      if (
        message.role === 'assistant' &&
        messageId !== undefined &&
        pending.has(messageId) &&
        pending.get(messageId) === message.subagentRunId
      ) {
        return message.id;
      }
      if (message.role === 'activity') {
        // An activity never separates reasoning from its assistant message.
        continue;
      }
      if (
        message.role === 'user' ||
        message.role === 'system' ||
        message.role === 'developer'
      )
        pending.clear();
    }
    return undefined;
  };
  const assistantByToolCallId = (toolCallId: string | undefined) =>
    messages.find(
      (message) =>
        message.role === 'assistant' &&
        (message.toolCalls ?? []).some(
          (toolCall) => toolCall.id === toolCallId,
        ),
    )?.id;

  switch (event.type) {
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
    case EventType.TEXT_MESSAGE_END:
    case EventType.TEXT_MESSAGE_CHUNK:
      return assistantById(event.messageId);
    case EventType.TOOL_CALL_START:
    case EventType.TOOL_CALL_CHUNK:
      return (
        assistantById(event.parentMessageId) ??
        assistantByToolCallId(event.toolCallId)
      );
    case EventType.TOOL_CALL_ARGS:
    case EventType.TOOL_CALL_END:
    case EventType.TOOL_CALL_RESULT:
      return assistantByToolCallId(event.toolCallId);
    case EventType.REASONING_ENCRYPTED_VALUE:
      return event.subtype === 'tool-call'
        ? assistantByToolCallId(event.entityId)
        : (assistantById(event.entityId) ??
            assistantByReasoningMessageId(event.entityId));
    case EventType.REASONING_MESSAGE_START:
    case EventType.REASONING_MESSAGE_CONTENT:
    case EventType.REASONING_MESSAGE_END:
    case EventType.REASONING_MESSAGE_CHUNK:
      return assistantByReasoningMessageId(event.messageId);
    default:
      return undefined;
  }
}

function readPreparedProjection(
  action: unknown,
): ɵAgUiMessageProjectionCache | undefined {
  return (
    action as { readonly ɵagUiMessageProjection?: ɵAgUiMessageProjectionCache }
  ).ɵagUiMessageProjection;
}

function reconcilePreparedStreaming(
  state: StreamingMessageState,
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
  projection: ɵAgUiMessageProjectionCache,
): StreamingMessageState {
  const message = findAssistantForEvent(projection.projection.messages, event);
  if (!message) return state;
  const toolCalls = projection.projection.toolCalls
    .filter((toolCall) => message.toolCallIds.includes(toolCall.id))
    .map((toolCall) => {
      const streamed = state.toolCalls.find(
        (current) => current.id === toolCall.id,
      );
      const candidate =
        streamed?.status === 'pending' &&
        toolCall.status === 'pending' &&
        streamed.name === toolCall.name &&
        streamed.arguments === toolCall.arguments &&
        streamed.argumentsResolved !== undefined
          ? { ...toolCall, argumentsResolved: streamed.argumentsResolved }
          : toolCall;
      return streamed &&
        Object.keys(candidate).length === Object.keys(streamed).length &&
        Object.entries(candidate).every(
          ([key, value]) =>
            streamed[key as keyof Chat.Internal.ToolCall] === value,
        )
        ? streamed
        : candidate;
    });
  const baseline = needsPreparedStructuralHydration(state, message)
    ? hydrateSnapshot(state, message, toolCalls)
    : state;
  const streamedMessage = baseline.message;
  const contentResolved =
    streamedMessage !== null &&
    baseline.messageId === message.id &&
    streamedMessage.content === message.content &&
    baseline.configSnapshot?.responseSchema === projection.responseSchema &&
    streamedMessage.contentResolved !== undefined
      ? streamedMessage.contentResolved
      : undefined;
  const candidate =
    contentResolved === undefined ? message : { ...message, contentResolved };
  const structuralMessage =
    baseline.message &&
    Object.keys(candidate).length === Object.keys(baseline.message).length &&
    Object.entries(candidate).every(
      ([key, value]) =>
        baseline.message?.[key as keyof Chat.Internal.AssistantMessage] ===
        value,
    )
      ? baseline.message
      : candidate;

  if (
    structuralMessage === baseline.message &&
    message.id === baseline.messageId &&
    baseline.toolCalls.length === toolCalls.length &&
    baseline.toolCalls.every((toolCall, index) => toolCall === toolCalls[index])
  ) {
    return baseline;
  }

  return {
    ...baseline,
    message: structuralMessage,
    messageId: message.id,
    toolCalls,
  };
}

function needsPreparedStructuralHydration(
  state: StreamingMessageState,
  message: Chat.Internal.AssistantMessage,
): boolean {
  if (state.messageId !== message.id) return true;

  const reasoningDetails =
    message.reasoning?.kind === 'details' ? message.reasoning.details : [];
  return reasoningDetails.some(
    (detail) => !Object.hasOwn(state.reasoningMessageStatusById, detail.id),
  );
}

function requiresFreshAssistantBaseline(
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
): boolean {
  switch (event.type) {
    case EventType.TEXT_MESSAGE_CONTENT:
      return true;
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.role === undefined || event.role === 'assistant';
    case EventType.TOOL_CALL_START:
    case EventType.TOOL_CALL_CHUNK:
      return true;
    default:
      return false;
  }
}

function hydrateAssistantForEvent(
  state: StreamingMessageState,
  event: Parameters<typeof accumulateAgUiMessageEvent>[1],
  decision: ReturnType<typeof ɵreadAgUiMessageEventDecision>,
): StreamingMessageState | undefined {
  if (!decision || decision.kind !== 'accepted') {
    return undefined;
  }

  if (
    findCanonicalAssistantIdForEvent(decision.priorState.draft, event) ===
    state.messageId
  ) {
    return state;
  }

  try {
    const projection = projectAgUiMessages(
      decision.priorState.draft,
      state.configSnapshot?.toolsByName ?? {},
      state.configSnapshot?.responseSchema,
    );
    const message = findAssistantForEvent(projection.messages, event);
    if (!message) {
      return requiresFreshAssistantBaseline(event)
        ? hydrateSnapshot(state, null, [])
        : undefined;
    }
    if (message.id === state.messageId) return state;
    const toolCalls = projection.toolCalls.filter((toolCall) =>
      message.toolCallIds.includes(toolCall.id),
    );
    return hydrateSnapshot(state, message, toolCalls);
  } catch {
    return undefined;
  }
}

const foregroundReducer = createReducer(
  initialState,
  on(devActions.restoreConversation, () => initialState),
  on(
    apiActions.generateMessageStart,
    (_state, action): StreamingMessageState => ({
      ...createAgUiMessageAccumulator(action.payload),
      attemptActive: true,
      snapshotReasoningMessageIds: [],
    }),
  ),
  on(
    apiActions.generateMessageEvent,
    (state, action): StreamingMessageState => {
      const decision = ɵreadAgUiMessageEventDecision(action);
      if (decision && decision.kind !== 'accepted') return state;
      const preparedProjection = readPreparedProjection(action);
      action = decision
        ? ({ ...action, payload: decision.event } as typeof action)
        : action;
      if (!state.attemptActive) {
        return state;
      }

      if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
        let message: Chat.Internal.AssistantMessage | null = null;
        let toolCalls: Chat.Internal.ToolCall[] = [];
        try {
          const messages =
            decision?.kind === 'accepted'
              ? decision.state.draft
              : ɵreadAgUiMessageSnapshot(action.payload);
          const projection = projectAgUiMessages(
            messages,
            state.configSnapshot?.toolsByName ?? {},
            state.configSnapshot?.responseSchema,
          );
          message =
            projection.messages.findLast(
              (current) => current.role === 'assistant',
            ) ?? null;
          const messageToolCallIds = message?.toolCallIds ?? [];
          toolCalls = projection.toolCalls.filter((toolCall) =>
            messageToolCallIds.includes(toolCall.id),
          );
        } catch {
          return state;
        }
        return hydrateSnapshot(state, message, toolCalls);
      }

      if (action.payload.type === EventType.TOOL_CALL_RESULT) {
        const hydrated = hydrateAssistantForEvent(
          state,
          action.payload,
          decision,
        );
        const current = hydrated ?? state;
        const { toolCallId } = action.payload;
        const toolCalls = current.toolCalls.filter(
          (toolCall) => toolCall.id !== toolCallId,
        );
        const next =
          toolCalls.length === current.toolCalls.length
            ? current
            : {
                ...current,
                toolCalls,
                activeToolCallId:
                  current.activeToolCallId === action.payload.toolCallId
                    ? undefined
                    : current.activeToolCallId,
              };
        return preparedProjection
          ? reconcilePreparedStreaming(next, action.payload, preparedProjection)
          : next;
      }

      const hydrated = hydrateAssistantForEvent(
        state,
        action.payload,
        decision,
      );
      const current =
        action.payload.type === EventType.RUN_FINISHED
          ? completeSnapshotReasoningMessages(hydrated ?? state)
          : retireSnapshotReasoningMessage(hydrated ?? state, action.payload);
      const next = accumulateEvent(current, action.payload);
      const accumulated =
        next === current ? current : { ...next, attemptActive: true };
      if (
        preparedProjection &&
        accumulated === state &&
        action.payload.type === EventType.REASONING_MESSAGE_START &&
        action.payload.metadata === undefined &&
        action.payload.subagentRunId === undefined
      ) {
        return state;
      }
      return preparedProjection
        ? reconcilePreparedStreaming(
            accumulated,
            action.payload,
            preparedProjection,
          )
        : accumulated;
    },
  ),
  on(
    apiActions.generateMessageSuccess,
    apiActions.generateMessageError,
    internalActions.generationAttemptRolledBack,
    internalActions.interruptThreadRetired,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    devActions.setMessages,
    devActions.resendMessages,
    () => initialState,
  ),
  on(devActions.sendMessage, (state, action): StreamingMessageState =>
    action.payload.canonicalAppendCompatible === false ? state : initialState,
  ),
);

/** Retains independent streaming parsers for every canonical assistant. @internal */
export function reducer(
  state: StreamingMessageState | undefined,
  action: Parameters<typeof foregroundReducer>[1],
): StreamingMessageState {
  const current = state ?? initialState;
  if (action.type !== apiActions.generateMessageEvent.type) {
    return foregroundReducer(state, action);
  }
  const decision = ɵreadAgUiMessageEventDecision(action);
  if (!decision) return foregroundReducer(state, action);
  if (decision.kind !== 'accepted' || !current.attemptActive) return current;
  const projection = readPreparedProjection(action);
  if (!projection) return foregroundReducer(state, action);
  if (
    decision.event.type === EventType.REASONING_MESSAGE_START &&
    decision.event.metadata === undefined &&
    decision.state.draft === decision.priorState.draft &&
    current.accumulators?.has(
      findAssistantForEvent(projection.projection.messages, decision.event)
        ?.id ?? '',
    )
  )
    return current;
  let accumulators = new Map(current.accumulators);
  const { accumulators: cached, ...baseline } = current;
  void cached;
  let foreground = current.messageId
    ? (accumulators.get(current.messageId) ?? baseline)
    : baseline;
  const implicitReasoningEnds = new Set(
    decision.events
      .slice(0, -1)
      .flatMap((event) =>
        event.type === EventType.REASONING_MESSAGE_END ? [event.messageId] : [],
      ),
  );
  for (const event of decision.events) {
    if (event.type === EventType.MESSAGES_SNAPSHOT) {
      accumulators = new Map();
      for (const message of projection.projection.messages) {
        if (message.role !== 'assistant' || message.id === undefined) continue;
        const hydrated = hydrateSnapshot(
          current,
          message,
          projection.projection.toolCalls.filter((call) =>
            message.toolCallIds.includes(call.id),
          ),
        );
        accumulators.set(message.id, hydrated);
        foreground = hydrated;
      }
      if (!accumulators.size) foreground = hydrateSnapshot(current, null, []);
      continue;
    }
    if (
      event.type === EventType.RUN_FINISHED ||
      event.type === EventType.RUN_ERROR
    ) {
      for (const [id, accumulator] of accumulators) {
        const normalizedAction = {
          ...action,
          payload: event,
          ɵagUiMessageEventDecision: { ...decision, event },
        };
        const next = foregroundReducer(accumulator, normalizedAction);
        accumulators.set(id, next);
        if (foreground.messageId === id) foreground = next;
      }
      continue;
    }
    // A later event in this transaction may create the assistant. Do not
    // hydrate its final text before its first chunk has been accumulated.
    if (
      event.type === EventType.REASONING_MESSAGE_END &&
      implicitReasoningEnds.has(event.messageId) &&
      findCanonicalAssistantIdForEvent(decision.priorState.draft, event) ===
        undefined
    )
      continue;
    const assistant = findAssistantForEvent(
      projection.projection.messages,
      event,
    );
    const reasoning = event.type.startsWith('REASONING_MESSAGE_');
    if (!assistant && reasoning) continue;
    const target =
      assistant?.id !== undefined
        ? (accumulators.get(assistant.id) ?? {
            ...initialState,
            configSnapshot: current.configSnapshot,
            attemptActive: true,
          })
        : foreground;
    const normalizedAction = {
      ...action,
      payload: event,
      ɵagUiMessageEventDecision: { ...decision, event },
    };
    const next = foregroundReducer(target, normalizedAction);
    foreground = next;
    if (next.messageId && next.message) accumulators.set(next.messageId, next);
  }
  // Canonical metadata and provenance remain authoritative even off foreground.
  for (const [id, accumulator] of accumulators) {
    let next = reconcilePreparedStreaming(
      accumulator,
      { type: EventType.TEXT_MESSAGE_END, messageId: id },
      projection,
    );
    const completed = [...implicitReasoningEnds].filter(
      (messageId) => next.reasoningMessageStatusById[messageId] === 'active',
    );
    if (completed.length)
      next = {
        ...next,
        reasoningMessageStatusById: {
          ...next.reasoningMessageStatusById,
          ...Object.fromEntries(
            completed.map((messageId) => [messageId, 'complete' as const]),
          ),
        },
        snapshotReasoningMessageIds: next.snapshotReasoningMessageIds?.filter(
          (messageId) => !implicitReasoningEnds.has(messageId),
        ),
      };
    accumulators.set(id, next);
    if (foreground.messageId === id) foreground = next;
  }
  if (
    current.accumulators?.size === accumulators.size &&
    [...accumulators].every(
      ([id, value]) => current.accumulators?.get(id) === value,
    ) &&
    Object.entries(foreground).every(
      ([key, value]) =>
        key === 'accumulators' ||
        current[key as keyof StreamingMessageState] === value,
    )
  )
    return current;
  return { ...foreground, accumulators };
}

/** Selects all active assistant parsers in canonical arrival order. @internal */
export const ɵselectStreamingMessages = (state: StreamingMessageState) => {
  if (state.accumulators)
    return [...state.accumulators.values()].flatMap((accumulator) => {
      const message = selectStreamingMessage(accumulator);
      return message ? [message] : [];
    });
  const message = selectStreamingMessage(state);
  return message ? [message] : [];
};

export const selectRawStreamingMessage = (
  state: StreamingMessageState,
): Chat.Internal.AssistantMessage | null =>
  !state.message || !state.messageId
    ? state.message
    : Chat.helpers.ɵwithInternalMessageId(state.message, state.messageId);

export const selectStreamingMessageId = (state: StreamingMessageState) =>
  state.messageId;

export const selectRawStreamingToolCalls = (state: StreamingMessageState) =>
  state.accumulators
    ? [...state.accumulators.values()].flatMap(
        (accumulator) => accumulator.toolCalls,
      )
    : state.toolCalls;

export const selectStreamingMessageError = (state: StreamingMessageState) =>
  state.error ??
  [...(state.accumulators?.values() ?? [])].find(
    (accumulator) => accumulator.error,
  )?.error;

export const selectStreamingMessage = select(
  selectRawStreamingMessage,
  selectStreamingMessageId,
  (message, messageId): Chat.Internal.AssistantMessage | null => {
    if (!message || !messageId) {
      return null;
    }

    return Chat.helpers.ɵwithInternalMessageId(
      {
        ...message,
        toolCallIds: message.toolCallIds,
      },
      messageId,
    );
  },
);

export const selectStreamingToolCallEntities = select(
  selectRawStreamingToolCalls,
  (toolCalls): Record<string, Chat.Internal.ToolCall> => {
    return toolCalls.reduce(
      (acc, toolCall) => {
        Object.defineProperty(acc, toolCall.id, {
          value: toolCall,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        return acc;
      },
      {} as Record<string, Chat.Internal.ToolCall>,
    );
  },
);

function hydrateSnapshot(
  state: StreamingMessageState,
  message: Chat.Internal.AssistantMessage | null,
  toolCalls: readonly Chat.Internal.ToolCall[],
): StreamingMessageState {
  if (!message || !message.id) {
    return {
      ...initialState,
      configSnapshot: state.configSnapshot,
      attemptActive: true,
    };
  }

  let hydrated: StreamingMessageState = {
    ...initialState,
    configSnapshot: state.configSnapshot,
    attemptActive: true,
  };
  hydrated = {
    ...accumulateAgUiMessageEvent(hydrated, {
      type: EventType.TEXT_MESSAGE_START,
      messageId: message.id,
      role: 'assistant',
    }),
    attemptActive: true,
  };
  if (message.content) {
    hydrated = {
      ...accumulateAgUiMessageEvent(hydrated, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: message.id,
        delta: message.content,
      }),
      attemptActive: true,
    };
  }
  const reasoningDetails =
    message.reasoning?.kind === 'details' ? message.reasoning.details : [];
  for (const detail of reasoningDetails) {
    hydrated = {
      ...accumulateAgUiMessageEvent(hydrated, {
        type: EventType.REASONING_MESSAGE_START,
        messageId: detail.id,
        role: 'reasoning',
        ...(detail.metadata === undefined ? {} : { metadata: detail.metadata }),
        ...(detail.subagentRunId === undefined
          ? {}
          : { subagentRunId: detail.subagentRunId }),
      }),
      attemptActive: true,
    };
    if (detail.content) {
      hydrated = {
        ...accumulateAgUiMessageEvent(hydrated, {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: detail.id,
          delta: detail.content,
        }),
        attemptActive: true,
      };
    }
    if (detail.encryptedValue !== undefined) {
      hydrated = {
        ...accumulateAgUiMessageEvent(hydrated, {
          type: EventType.REASONING_ENCRYPTED_VALUE,
          subtype: 'message',
          entityId: detail.id,
          encryptedValue: detail.encryptedValue,
        }),
        attemptActive: true,
      };
    }
  }
  for (const toolCall of toolCalls) {
    hydrated = {
      ...accumulateAgUiMessageEvent(hydrated, {
        type: EventType.TOOL_CALL_START,
        toolCallId: toolCall.id,
        toolCallName: toolCall.name,
        parentMessageId: message.id,
      }),
      attemptActive: true,
    };
    if (toolCall.arguments) {
      hydrated = {
        ...accumulateAgUiMessageEvent(hydrated, {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: toolCall.id,
          delta: toolCall.arguments,
        }),
        attemptActive: true,
      };
    }
  }

  return {
    ...hydrated,
    message: {
      ...message,
      ...(hydrated.message?.contentResolved === undefined
        ? {}
        : { contentResolved: hydrated.message.contentResolved }),
      ...(hydrated.message?.reasoning === undefined
        ? {}
        : { reasoning: hydrated.message.reasoning }),
    },
    messageId: message.id,
    toolCalls: toolCalls.map((toolCall) => {
      const parsed = hydrated.toolCalls.find(
        (candidate) => candidate.id === toolCall.id,
      );
      return parsed?.argumentsResolved === undefined
        ? toolCall
        : { ...toolCall, argumentsResolved: parsed.argumentsResolved };
    }),
    activeToolCallId: toolCalls.at(-1)?.id,
    attemptActive: true,
    snapshotReasoningMessageIds: reasoningDetails.map((detail) => detail.id),
  };
}
