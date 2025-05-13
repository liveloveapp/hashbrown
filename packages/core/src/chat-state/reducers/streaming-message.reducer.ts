import { createReducer, on, select } from '../../utils/micro-ngrx';
import { Chat } from '../models';
import { apiActions } from '../actions';
import { DeepPartial } from '../../utils/types';

export interface StreamingMessageState {
  message: DeepPartial<Chat.Internal.AssistantMessage> | null;
}

export const initialState: StreamingMessageState = {
  message: null,
};

export const reducer = createReducer(
  initialState,
  on(apiActions.generateMessageChunk, (state, action) => {
    return {
      ...state,
      message: action.payload,
    };
  }),
  on(apiActions.generateMessageSuccess, (state) => {
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
