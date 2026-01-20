import { Chat } from '../models';
import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions } from '../actions';
import { ErrorMessage } from '../models/view.models';
import { resolveWithSchema } from '../utils/resolve-with-schema';
import { s } from '../schema';

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

    const responseSchema = action.payload.responseSchema;
    return {
      ...state,
      messages: messages.flatMap((message) =>
        hydrateResolvedContent(
          Chat.helpers.toInternalMessagesFromView(message),
          responseSchema,
        ),
      ),
    };
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    return {
      ...state,
      messages: [...state.messages, action.payload.message],
    };
  }),
  on(apiActions.threadLoadSuccess, (state, action) => {
    if (!action.payload.thread || action.payload.thread.length === 0) {
      return state;
    }

    const responseSchema = action.payload.responseSchema;
    const loadedMessages = action.payload.thread.flatMap((message) =>
      hydrateResolvedContent(
        Chat.helpers.toInternalMessagesFromApi(message),
        responseSchema,
      ),
    );

    return {
      ...state,
      messages: loadedMessages,
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
  on(devActions.setMessages, (state, action) => {
    const messages = action.payload.messages;
    const responseSchema = action.payload.responseSchema;
    const internalMessages = messages.flatMap((message) =>
      hydrateResolvedContent(
        Chat.helpers.toInternalMessagesFromView(message),
        responseSchema,
      ),
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

function hydrateResolvedContent(
  messages: Chat.Internal.Message[],
  responseSchema?: s.HashbrownType,
): Chat.Internal.Message[] {
  if (!responseSchema) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    if (message.contentResolved !== undefined) {
      return message;
    }

    if (typeof message.content !== 'string') {
      return message;
    }

    const resolved = resolveWithSchema(responseSchema, message.content);
    if (resolved === undefined) {
      return message;
    }

    return {
      ...message,
      contentResolved: resolved,
    };
  });
}
