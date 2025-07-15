import { createReducer, on, select } from '../utils/micro-ngrx';
import { Chat } from '../models';
import { apiActions, devActions } from '../actions';
import { toInternalToolCallsFromApi } from '../models/internal_helpers';

export interface StreamingMessageState {
  message: Chat.Internal.AssistantMessage | null;
  toolCalls: Chat.Internal.ToolCall[];
}

export const initialState: StreamingMessageState = {
  message: null,
  toolCalls: [],
};

export const reducer = createReducer(
  initialState,
  on(
    apiActions.generateMessageChunk,
    (state, action): StreamingMessageState => {
      const apiMessage = action.payload;
      const [internalMessage] = Chat.helpers.toInternalMessagesFromApi({
        role: apiMessage.role ?? 'assistant',
        content: apiMessage.content ?? '',
        toolCalls: apiMessage.toolCalls ?? [],
      });

      if (!internalMessage) {
        return state;
      }

      if (internalMessage.role !== 'assistant') {
        return state;
      }

      return {
        ...state,
        message: internalMessage,
        toolCalls:
          action.payload.toolCalls?.flatMap(toInternalToolCallsFromApi) ?? [],
      };
    },
  ),
  on(apiActions.generateMessageSuccess, (state) => {
    return {
      ...state,
      message: null,
    };
  }),
  on(devActions.stopMessageGeneration, (state, action) => {
    return {
      ...state,
      message: action.payload ? null : state.message,
      toolCalls: [],
    };
  }),
);

export const selectRawStreamingMessage = (state: StreamingMessageState) =>
  state.message;

export const selectRawStreamingToolCalls = (state: StreamingMessageState) =>
  state.toolCalls;

export const selectStreamingMessage = select(
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  (message, toolCalls): Chat.Internal.AssistantMessage | null => {
    if (!message) {
      return null;
    }

    return {
      role: message.role ?? 'assistant',
      content: message.content ?? '',
      toolCallIds: toolCalls.map((toolCall) => toolCall.id),
    };
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
