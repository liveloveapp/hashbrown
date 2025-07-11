import { Chat } from '../models';
import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions } from '../actions';
import { ErrorMessage } from '../models/view.models';

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
  on(apiActions.generateMessageError, (state, action) => {
    const message = action.payload;
    const errorMessage: ErrorMessage = {
      role: 'error',
      content: message.message,
    };

    return {
      ...state,
      messages: [...state.messages, errorMessage],
    };
  }),
  on(apiActions.stopMessageGeneration, (state, action) => {
    if (action.payload.clearStreamingMessage) {
      return state;
    }

    const message = action.payload.currentStreamingMessage;
    if (!message) {
      return state;
    }

    const canceledMessage: Chat.Internal.AssistantMessage = {
      role: 'assistant',
      content: message.content,
      toolCallIds: [],
    };

    return {
      ...state,
      messages: [...state.messages, canceledMessage],
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
    // @todo: proooobably why the last message gets out of sequence
    const internalMessages = Chat.helpers.toInternalMessagesFromView(message);

    return {
      ...state,
      messages: [...state.messages, ...internalMessages],
    };
  }),
);

export const selectMessages = (state: MessagesState) => state.messages;
