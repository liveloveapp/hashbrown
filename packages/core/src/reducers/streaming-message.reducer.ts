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
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { ɵreadAgUiMessageEventDecision } from './ag-ui-messages.reducer';

export type StreamingMessageState = AgUiMessageAccumulatorState & {
  readonly attemptActive: boolean;
};

export const initialState: StreamingMessageState = {
  ...initialAgUiMessageAccumulatorState,
  attemptActive: false,
};

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

export const reducer = createReducer(
  initialState,
  on(
    apiActions.generateMessageStart,
    (_state, action): StreamingMessageState => ({
      ...createAgUiMessageAccumulator(action.payload),
      attemptActive: true,
    }),
  ),
  on(
    apiActions.generateMessageEvent,
    (state, action): StreamingMessageState => {
      const decision = ɵreadAgUiMessageEventDecision(action);
      if (decision && decision.kind !== 'accepted') return state;
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
        const toolCalls = state.toolCalls.filter(
          (toolCall) => toolCall.id !== action.payload.toolCallId,
        );
        if (toolCalls.length === state.toolCalls.length) return state;
        return {
          ...state,
          toolCalls,
          activeToolCallId:
            state.activeToolCallId === action.payload.toolCallId
              ? undefined
              : state.activeToolCallId,
        };
      }

      return { ...accumulateEvent(state, action.payload), attemptActive: true };
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
        acc[toolCall.id] = toolCall;
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
  };
}
