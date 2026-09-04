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
          toolCalls = [...projection.toolCalls];
        } catch {
          return state;
        }
        return {
          ...initialState,
          configSnapshot: state.configSnapshot,
          message,
          messageId: message?.id,
          toolCalls,
          attemptActive: true,
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
  selectRawStreamingToolCalls,
  (message, messageId, toolCalls): Chat.Internal.AssistantMessage | null => {
    if (!message || !messageId) {
      return null;
    }

    return Chat.helpers.ɵwithInternalMessageId(
      {
        ...message,
        toolCallIds: toolCalls.map((toolCall) => toolCall.id),
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
