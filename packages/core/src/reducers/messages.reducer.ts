import { EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { ErrorMessage } from '../models/view.models';
import { s } from '../schema';
import { createReducer, on } from '../utils/micro-ngrx';
import {
  projectAgUiMessages,
  type ɵAgUiCanonicalIdIndex,
  ɵappendAgUiCanonicalIds,
  ɵindexAgUiCanonicalIds,
  ɵownValidatedAgUiMessages,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { ɵreadAgUiMessageEventDecision } from './ag-ui-messages.reducer';

export interface MessagesState {
  readonly messages: readonly Chat.Internal.Message[];
  readonly committed: readonly Chat.Internal.Message[];
  readonly draft: readonly Chat.Internal.Message[];
  readonly attemptActive: boolean;
  readonly activeAssistantMessageId: string | undefined;
  readonly activeIgnoredTextMessageId: string | undefined;
  readonly canonicalIds: ɵAgUiCanonicalIdIndex;
  readonly committedCanonicalIds: ɵAgUiCanonicalIdIndex;
}

const initialState: MessagesState = {
  messages: [],
  committed: [],
  draft: [],
  attemptActive: false,
  activeAssistantMessageId: undefined,
  activeIgnoredTextMessageId: undefined,
  canonicalIds: ɵindexAgUiCanonicalIds([]),
  committedCanonicalIds: ɵindexAgUiCanonicalIds([]),
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const messages =
      action.payload.localProjection?.messages ??
      projectCanonical(
        action.payload.canonicalMessages,
        {},
        action.payload.responseSchema,
      );
    return {
      ...state,
      messages,
      committed: messages,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
      activeIgnoredTextMessageId: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
      committedCanonicalIds: ɵindexAgUiCanonicalIds(
        action.payload.canonicalMessages,
      ),
    };
  }),
  on(devActions.setMessages, (state, action) => {
    const messages =
      action.payload.localProjection?.messages ??
      projectCanonical(
        action.payload.canonicalMessages,
        action.payload.toolsByName ?? {},
        action.payload.responseSchema,
      );
    return {
      ...state,
      messages,
      committed: messages,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
      activeIgnoredTextMessageId: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
      committedCanonicalIds: ɵindexAgUiCanonicalIds(
        action.payload.canonicalMessages,
      ),
    };
  }),
  on(devActions.sendMessage, (state, action) => {
    if (action.payload.canonicalAppendCompatible === false) return state;
    let canonicalIds: ɵAgUiCanonicalIdIndex;
    try {
      canonicalIds = ɵappendAgUiCanonicalIds(
        state.attemptActive ? state.committedCanonicalIds : state.canonicalIds,
        ɵownValidatedAgUiMessages(action.payload.canonicalMessages),
      );
    } catch {
      return state;
    }
    const appended =
      action.payload.localProjection?.messages ??
      projectCanonical(action.payload.canonicalMessages, {});
    const committed = [...state.committed, ...appended];
    return {
      ...state,
      messages: committed,
      committed,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
      activeIgnoredTextMessageId: undefined,
      canonicalIds,
      committedCanonicalIds: canonicalIds,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): MessagesState => ({
    ...state,
    draft: state.committed,
    messages: state.committed,
    attemptActive: true,
    activeAssistantMessageId: undefined,
    activeIgnoredTextMessageId: undefined,
  })),
  on(apiActions.generateMessageEvent, (state, action): MessagesState => {
    const decision = ɵreadAgUiMessageEventDecision(action);
    if (decision && decision.kind !== 'accepted') return state;
    action = decision
      ? ({ ...action, payload: decision.event } as typeof action)
      : action;
    if (!state.attemptActive) return state;
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const draft = projectRemoteSnapshot(action.payload);
      if (!draft) return state;
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: undefined,
        activeIgnoredTextMessageId: undefined,
        canonicalIds: ɵindexAgUiCanonicalIds(
          ɵreadAgUiMessageSnapshot(action.payload),
        ),
      };
    }
    if (
      action.payload.type === EventType.TEXT_MESSAGE_START &&
      action.payload.role === 'assistant'
    ) {
      const existing = state.draft.find(
        (message) => 'id' in message && message.id === action.payload.messageId,
      );
      if (existing) {
        return existing.role !== 'assistant' ||
          state.activeAssistantMessageId === action.payload.messageId
          ? state
          : { ...state, activeAssistantMessageId: action.payload.messageId };
      }
      if (state.canonicalIds.messageIds.includes(action.payload.messageId)) {
        return state;
      }
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
        activeIgnoredTextMessageId: undefined,
      };
    }
    if (
      action.payload.type === EventType.TEXT_MESSAGE_START &&
      action.payload.role === 'user'
    ) {
      const existing = state.draft.find(
        (message) => 'id' in message && message.id === action.payload.messageId,
      );
      if (existing) {
        return state;
      }
      const message = Chat.helpers.ɵwithInternalMessageId(
        { role: 'user' as const, content: '' },
        action.payload.messageId,
      );
      const draft = [...state.draft, message];
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: undefined,
        activeIgnoredTextMessageId: undefined,
      };
    }
    if (action.payload.type === EventType.TEXT_MESSAGE_START) {
      return {
        ...state,
        activeAssistantMessageId: undefined,
        activeIgnoredTextMessageId: action.payload.messageId,
      };
    }
    if (
      action.payload.type === EventType.TEXT_MESSAGE_CONTENT ||
      action.payload.type === EventType.TEXT_MESSAGE_CHUNK
    ) {
      if (
        action.payload.type === EventType.TEXT_MESSAGE_CHUNK &&
        action.payload.role !== undefined &&
        action.payload.role !== 'assistant' &&
        action.payload.role !== 'user'
      ) {
        return state;
      }
      const id = action.payload.messageId ?? state.activeAssistantMessageId;
      if (!id) return state;
      const current = state.draft.find(
        (message) => 'id' in message && message.id === id,
      );
      if (
        state.activeIgnoredTextMessageId === id ||
        (state.canonicalIds.messageIds.includes(id) && !current)
      ) {
        return state;
      }
      if (
        current?.role === 'user' ||
        (current === undefined &&
          action.payload.type === EventType.TEXT_MESSAGE_CHUNK &&
          action.payload.role === 'user')
      ) {
        const message = Chat.helpers.ɵwithInternalMessageId(
          {
            role: 'user' as const,
            content: `${current?.role === 'user' ? current.content : ''}${action.payload.delta ?? ''}`,
          },
          id,
        );
        const draft = current
          ? state.draft.map((existing) =>
              existing === current ? message : existing,
            )
          : [...state.draft, message];
        return { ...state, draft, messages: draft };
      }
      if (current && current.role !== 'assistant') {
        return state;
      }
      const message = Chat.helpers.ɵwithInternalMessageId(
        {
          role: 'assistant' as const,
          content: `${current?.role === 'assistant' ? (current.content ?? '') : ''}${action.payload.delta ?? ''}`,
          toolCallIds: current?.role === 'assistant' ? current.toolCallIds : [],
        },
        id,
      );
      const draft = reconcileAssistant(state.draft, message);
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: id,
        activeIgnoredTextMessageId: undefined,
      };
    }
    return state;
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    if (state.attemptActive) {
      const draft = isAssistantOutput(action.payload.message)
        ? reconcileSuccessfulAssistant(state.draft, action.payload.message)
        : state.draft;
      return {
        ...state,
        committed: draft,
        messages: draft,
        attemptActive: false,
        activeAssistantMessageId: undefined,
        activeIgnoredTextMessageId: undefined,
        committedCanonicalIds: state.canonicalIds,
      };
    }
    const messages = [...state.messages, action.payload.message];
    return {
      ...state,
      messages,
      committed: messages,
      activeAssistantMessageId: undefined,
      activeIgnoredTextMessageId: undefined,
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
        activeIgnoredTextMessageId: undefined,
        canonicalIds: state.committedCanonicalIds,
      }
    : state;
}

function projectRemoteSnapshot(
  event: Extract<
    import('@ag-ui/core').AGUIEvent,
    { type: EventType.MESSAGES_SNAPSHOT }
  >,
): readonly Chat.Internal.Message[] | undefined {
  try {
    return projectCanonical(ɵreadAgUiMessageSnapshot(event), {});
  } catch {
    return undefined;
  }
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

function reconcileSuccessfulAssistant(
  messages: readonly Chat.Internal.Message[],
  assistant: Chat.Internal.AssistantMessage,
): readonly Chat.Internal.Message[] {
  const id = 'id' in assistant ? assistant.id : undefined;
  const existing = messages.find(
    (message) => 'id' in message && message.id === id,
  );
  if (existing?.role !== 'assistant') {
    return reconcileAssistant(messages, assistant);
  }

  return reconcileAssistant(messages, {
    ...assistant,
    content: existing.content,
    toolCallIds:
      existing.toolCallIds.length > 0
        ? existing.toolCallIds
        : assistant.toolCallIds,
  });
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
