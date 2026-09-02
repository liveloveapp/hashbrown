import { EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { ErrorMessage } from '../models/view.models';
import { s } from '../schema';
import { createReducer, on } from '../utils/micro-ngrx';
import { resolveWithSchema } from '../utils/resolve-with-schema';
import { projectAgUiMessages } from './ag-ui-message-history';

export interface MessagesState {
  readonly messages: readonly Chat.Internal.Message[];
  readonly committed: readonly Chat.Internal.Message[];
  readonly draft: readonly Chat.Internal.Message[];
  readonly attemptActive: boolean;
  readonly activeAssistantMessageId: string | undefined;
}

const initialState: MessagesState = {
  messages: [],
  committed: [],
  draft: [],
  attemptActive: false,
  activeAssistantMessageId: undefined,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const messages = action.payload.canonicalMessages
      ? projectCanonical(
          action.payload.canonicalMessages,
          {},
          action.payload.responseSchema,
        )
      : projectView(action.payload.messages, action.payload.responseSchema);
    return {
      ...state,
      messages,
      committed: messages,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
    };
  }),
  on(devActions.setMessages, (state, action) => {
    const messages = action.payload.canonicalMessages
      ? projectCanonical(
          action.payload.canonicalMessages,
          action.payload.toolsByName ?? {},
          action.payload.responseSchema,
        )
      : projectView(action.payload.messages, action.payload.responseSchema);
    return {
      ...state,
      messages,
      committed: messages,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
    };
  }),
  on(devActions.sendMessage, (state, action) => {
    const appended = action.payload.canonicalMessages
      ? projectCanonical(action.payload.canonicalMessages, {})
      : Chat.helpers.toInternalMessagesFromView(action.payload.message);
    const committed = [...state.committed, ...appended];
    return {
      ...state,
      messages: committed,
      committed,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): MessagesState => ({
    ...state,
    draft: state.committed,
    messages: state.committed,
    attemptActive: true,
    activeAssistantMessageId: undefined,
  })),
  on(apiActions.generateMessageEvent, (state, action): MessagesState => {
    if (!state.attemptActive) return state;
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const draft = projectCanonical(action.payload.messages, {});
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: undefined,
      };
    }
    if (
      action.payload.type === EventType.TEXT_MESSAGE_START &&
      action.payload.role === 'assistant'
    ) {
      const message = Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant' as const, content: '', toolCallIds: [] },
        action.payload.messageId,
      );
      const draft = reconcileAssistant(state.draft, message);
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: action.payload.messageId,
      };
    }
    if (
      (action.payload.type === EventType.TEXT_MESSAGE_CONTENT ||
        action.payload.type === EventType.TEXT_MESSAGE_CHUNK) &&
      (action.payload.type !== EventType.TEXT_MESSAGE_CHUNK ||
        action.payload.role === 'assistant' ||
        action.payload.messageId === state.activeAssistantMessageId)
    ) {
      const id = action.payload.messageId ?? state.activeAssistantMessageId;
      if (!id) return state;
      const current = state.draft.find(
        (message) => 'id' in message && message.id === id,
      );
      const message = Chat.helpers.ɵwithInternalMessageId(
        {
          role: 'assistant' as const,
          content: `${current?.role === 'assistant' ? (current.content ?? '') : ''}${action.payload.delta ?? ''}`,
          toolCallIds: current?.role === 'assistant' ? current.toolCallIds : [],
        },
        id,
      );
      const draft = reconcileAssistant(state.draft, message);
      return { ...state, draft, messages: draft, activeAssistantMessageId: id };
    }
    return state;
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    if (state.attemptActive) {
      const draft = isAssistantOutput(action.payload.message)
        ? reconcileAssistant(state.draft, action.payload.message)
        : state.draft;
      return {
        ...state,
        committed: draft,
        messages: draft,
        attemptActive: false,
        activeAssistantMessageId: undefined,
      };
    }
    const messages = [...state.messages, action.payload.message];
    return {
      ...state,
      messages,
      committed: messages,
      activeAssistantMessageId: undefined,
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): MessagesState =>
    rollback(state),
  ),
  on(
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    (state): MessagesState => rollback(state),
  ),
  on(devActions.resendMessages, (state): MessagesState => rollback(state)),
  on(apiActions.generateMessageError, (state, action) => {
    const errorMessage: ErrorMessage = {
      role: 'error',
      content: action.payload.message,
    };
    return { ...state, messages: [...state.messages, errorMessage] };
  }),
);

export const selectMessages = (state: MessagesState) => state.messages;

function rollback(state: MessagesState): MessagesState {
  return state.attemptActive
    ? {
        ...state,
        messages: state.committed,
        draft: state.committed,
        attemptActive: false,
        activeAssistantMessageId: undefined,
      }
    : state;
}

function isAssistantOutput(message: Chat.Internal.AssistantMessage): boolean {
  return (message.content ?? '').length > 0 || message.toolCallIds.length > 0;
}

function reconcileAssistant(
  messages: readonly Chat.Internal.Message[],
  assistant: Chat.Internal.AssistantMessage,
): readonly Chat.Internal.Message[] {
  const id = 'id' in assistant ? assistant.id : undefined;
  const index =
    id === undefined
      ? -1
      : messages.findIndex((message) => 'id' in message && message.id === id);
  return index === -1
    ? [...messages, assistant]
    : messages.map((message, current) =>
        current === index ? assistant : message,
      );
}

function projectCanonical(
  messages: readonly Readonly<Message>[],
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
  responseSchema?: s.SchemaOutput,
): readonly Chat.Internal.Message[] {
  return projectAgUiMessages(
    messages,
    toolsByName,
    responseSchema ? s.normalizeSchemaOutput(responseSchema) : undefined,
  ).messages;
}

function projectView(
  messages: readonly Chat.AnyMessage[] | undefined,
  responseSchema?: s.SchemaOutput,
): readonly Chat.Internal.Message[] {
  if (!messages) return [];
  const schema = responseSchema
    ? s.normalizeSchemaOutput(responseSchema)
    : undefined;
  return messages.flatMap((message) =>
    hydrateResolvedContent(
      Chat.helpers.toInternalMessagesFromView(message),
      schema,
    ),
  );
}

function hydrateResolvedContent(
  messages: Chat.Internal.Message[],
  responseSchema?: s.HashbrownType,
): Chat.Internal.Message[] {
  if (!responseSchema) return messages;
  return messages.map((message) => {
    if (
      message.role !== 'assistant' ||
      message.contentResolved !== undefined ||
      typeof message.content !== 'string'
    )
      return message;
    const resolved = resolveWithSchema(responseSchema, message.content);
    return resolved === undefined
      ? message
      : { ...message, contentResolved: resolved };
  });
}
