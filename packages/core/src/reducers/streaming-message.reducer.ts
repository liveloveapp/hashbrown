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
    const pending = new Set<string>();
    for (const message of messages) {
      if (message.role === 'reasoning') {
        pending.add(message.id);
        continue;
      }
      if (message.role === 'assistant' && messageId && pending.has(messageId)) {
        return message.id;
      }
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
      return streamed?.status === 'pending' &&
        toolCall.status === 'pending' &&
        streamed.name === toolCall.name &&
        streamed.arguments === toolCall.arguments &&
        streamed.argumentsResolved !== undefined
        ? { ...toolCall, argumentsResolved: streamed.argumentsResolved }
        : toolCall;
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
  const structuralMessage =
    contentResolved === undefined ? message : { ...message, contentResolved };

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
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
      return event.role === undefined || event.role === 'assistant';
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

export const reducer = createReducer(
  initialState,
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
          const messages = ɵreadAgUiMessageSnapshot(action.payload);
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
        const toolCalls = current.toolCalls.filter(
          (toolCall) => toolCall.id !== action.payload.toolCallId,
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
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    devActions.stopMessageGeneration,
    devActions.setMessages,
    devActions.resendMessages,
    () => initialState,
  ),
  on(devActions.sendMessage, (state, action): StreamingMessageState =>
    action.payload.canonicalAppendCompatible === false ? state : initialState,
  ),
);

export const selectRawStreamingMessage = (
  state: StreamingMessageState,
): Chat.Internal.AssistantMessage | null =>
  !state.message || !state.messageId
    ? state.message
    : Chat.helpers.ɵwithInternalMessageId(state.message, state.messageId);

export const selectStreamingMessageId = (state: StreamingMessageState) =>
  state.messageId;

export const selectRawStreamingToolCalls = (state: StreamingMessageState) =>
  state.toolCalls;

export const selectStreamingMessageError = (state: StreamingMessageState) =>
  state.error;

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
