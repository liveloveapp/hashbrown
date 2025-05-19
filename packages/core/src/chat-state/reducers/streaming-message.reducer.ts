import { createReducer, on, select } from '../../utils/micro-ngrx';
import { Chat } from '../models';
import { apiActions } from '../actions';

export interface StreamingMessageState {
  message: Chat.Internal.AssistantMessage | null;
}

export const initialState: StreamingMessageState = {
  message: null,
};

export const reducer = createReducer(
  initialState,
  on(apiActions.generateMessageChunk, (state, action) => {
    const apiMessage = action.payload;
    const [internalMessage] = Chat.helpers.toInternalMessagesFromApi({
      role: apiMessage.role ?? 'assistant',
      content: apiMessage.content ?? '',
      tool_calls: apiMessage.tool_calls ?? [],
    });

    if (!internalMessage) {
      return state;
    }

    return {
      ...state,
      message: internalMessage.role === 'assistant' ? internalMessage : null,
    };
  }),
  on(apiActions.generateMessageSuccess, (state) => {
    console.log(state);
    return {
      ...state,
      message: null,
    };
  }),
);

export const selectRawStreamingMessage = (state: StreamingMessageState) =>
  state.message;

export const selectStreamingMessage = select(
  selectRawStreamingMessage,
  (message): Chat.Internal.AssistantMessage | null => {
    if (!message) {
      return null;
    }

    return {
      role: message.role ?? 'assistant',
      content: message.content ?? '',
      toolCallIds: [],
    };
  },
);
