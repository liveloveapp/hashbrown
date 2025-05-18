import { Chat } from '../models';
import { createReducer, on } from '../../utils/micro-ngrx';
import { apiActions, devActions } from '../actions';

export interface MessagesState {
  messages: Chat.Internal.Message[];
}

const initialState: MessagesState = {
  messages: [],
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const messages = action.payload.messages;

    if (!messages) {
      return state;
    }

    return {
      ...state,
      messages: messages.flatMap((message) =>
        Chat.helpers.toInternalMessagesFromView(message),
      ),
    };
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    const message = action.payload;
    const internalMessages = Chat.helpers.toInternalMessagesFromApi(message);

    return {
      ...state,
      messages: [...state.messages, ...internalMessages],
    };
  }),
  on(devActions.setMessages, (state, action) => {
    const messages = action.payload.messages;
    const internalMessages = messages.flatMap((message) =>
      Chat.helpers.toInternalMessagesFromView(message),
    );
    return {
      ...state,
      messages: internalMessages,
    };
  }),
  on(devActions.sendMessage, (state, action) => {
    const message = action.payload.message;
    const internalMessages = Chat.helpers.toInternalMessagesFromView(message);

    return {
      ...state,
      messages: [...state.messages, ...internalMessages],
    };
  }),
);

export const selectMessages = (state: MessagesState) => state.messages;
