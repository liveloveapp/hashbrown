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
        Chat.helpers.toInternalMessageFromView(message),
      ),
    };
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    const message = action.payload;
    const internalMessage = toInternalMessage(message);

    if (!message.tool_calls) {
      return state;
    }

    if (!internalMessage) {
      return state;
    }

    return {
      ...state,
      messages: [...state.messages, internalMessage],
    };
  }),
  on(devActions.setMessages, (state, action) => {
    const messages = action.payload.messages;
    const internalMessages = messages.flatMap((message) =>
      Chat.helpers.toInternalMessageFromView(message),
    );
    return {
      ...state,
      messages: internalMessages,
    };
  }),
);

function toInternalMessage(
  message: Chat.Api.Message,
): Chat.Internal.Message | undefined {
  switch (message.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        toolCallIds: message.tool_calls?.map((toolCall) => toolCall.id) || [],
      };
    case 'user':
      return {
        role: 'user',
        content: message.content,
      };
    default:
      return undefined;
  }
}

export const selectMessages = (state: MessagesState) => state.messages;
