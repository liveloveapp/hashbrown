import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { ErrorMessage } from '../models/view.models';
import { s } from '../schema';
import { createReducer, on } from '../utils/micro-ngrx';
import {
  projectAgUiMessages,
  type ɵAgUiCanonicalIdIndex,
  type ɵAgUiCanonicalMessageSource,
  type ɵAgUiMessageProjectionCache,
  ɵappendAgUiCanonicalIds,
  ɵindexAgUiCanonicalIds,
  ɵindexAgUiCanonicalMessageSources,
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
  readonly preparedProjection: ɵAgUiMessageProjectionCache | undefined;
  readonly localProvenance?: Readonly<Record<string, LocalMessageProvenance>>;
  readonly committedLocalProvenance?: Readonly<
    Record<string, LocalMessageProvenance>
  >;
}

interface LocalMessageProvenance {
  readonly source: ɵAgUiCanonicalMessageSource;
  readonly bound: boolean;
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
  preparedProjection: undefined,
  localProvenance: {},
  committedLocalProvenance: {},
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
      localProvenance: createLocalProvenance(
        action.payload.localProjection,
        action.payload.canonicalMessages,
      ),
      committedLocalProvenance: createLocalProvenance(
        action.payload.localProjection,
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
      localProvenance: createLocalProvenance(
        action.payload.localProjection,
        action.payload.canonicalMessages,
      ),
      committedLocalProvenance: createLocalProvenance(
        action.payload.localProjection,
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
    const localProvenance = {
      ...(state.committedLocalProvenance ?? {}),
      ...createLocalProvenance(
        action.payload.localProjection,
        action.payload.canonicalMessages,
      ),
    };
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
      localProvenance,
      committedLocalProvenance: localProvenance,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): MessagesState => ({
    ...state,
    draft: state.committed,
    messages: state.committed,
    attemptActive: true,
    activeAssistantMessageId: undefined,
    activeIgnoredTextMessageId: undefined,
    localProvenance: state.committedLocalProvenance,
    committedLocalProvenance: state.committedLocalProvenance,
  })),
  on(apiActions.generateMessageEvent, (state, action): MessagesState => {
    const decision = ɵreadAgUiMessageEventDecision(action);
    if (decision && decision.kind !== 'accepted') return state;
    const preparedProjection = readPreparedProjection(action);
    action = decision
      ? ({ ...action, payload: decision.event } as typeof action)
      : action;
    if (!state.attemptActive) return state;
    if (decision && preparedProjection) {
      const reconciled = reconcilePreparedMessages(
        state.draft,
        preparedProjection.projection.messages,
        preparedProjection.messageSources,
        state.localProvenance ?? {},
        action.payload,
      );
      const draft = reconciled.draft;
      if (
        draft === state.draft &&
        reconciled.localProvenance === state.localProvenance &&
        state.activeAssistantMessageId ===
          decision.state.activeAssistantMessageId &&
        state.activeIgnoredTextMessageId === undefined &&
        state.canonicalIds === preparedProjection.canonicalIds &&
        state.preparedProjection?.canonicalMessages ===
          preparedProjection.canonicalMessages
      ) {
        return state;
      }
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: decision.state.activeAssistantMessageId,
        activeIgnoredTextMessageId: undefined,
        canonicalIds: preparedProjection.canonicalIds,
        preparedProjection,
        localProvenance: reconciled.localProvenance,
      };
    }
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const projected = projectRemoteSnapshot(action.payload);
      if (!projected) return state;
      const reconciled = reconcilePreparedMessages(
        state.draft,
        projected,
        ɵindexAgUiCanonicalMessageSources(
          ɵreadAgUiMessageSnapshot(action.payload),
        ),
        state.localProvenance ?? {},
        action.payload,
      );
      const draft = reconciled.draft;
      return {
        ...state,
        draft,
        messages: draft,
        activeAssistantMessageId: undefined,
        activeIgnoredTextMessageId: undefined,
        canonicalIds: ɵindexAgUiCanonicalIds(
          ɵreadAgUiMessageSnapshot(action.payload),
        ),
        localProvenance: reconciled.localProvenance,
      };
    }
    if (decision && requiresCanonicalProjection(action.payload)) {
      const reconciled = reconcilePreparedMessages(
        state.draft,
        projectCanonical(decision.state.draft, {}),
        ɵindexAgUiCanonicalMessageSources(decision.state.draft),
        state.localProvenance ?? {},
        action.payload,
      );
      const draft = reconciled.draft;
      return {
        ...state,
        draft,
        messages: draft,
        localProvenance: reconciled.localProvenance,
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
      const draft = state.preparedProjection
        ? state.draft
        : action.payload.message && isAssistantOutput(action.payload.message)
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
        preparedProjection: state.preparedProjection,
        localProvenance: state.localProvenance,
        committedLocalProvenance: state.localProvenance,
      };
    }
    if (!action.payload.message) return state;
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
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    (state): MessagesState => rollback(state),
  ),
  on(devActions.resendMessages, (state): MessagesState => rollback(state)),
  on(internalActions.toolTurnSettled, (state, action): MessagesState => {
    const preparedProjection = readPreparedProjection(action);
    if (!preparedProjection) {
      return state;
    }

    const reconciled = reconcilePreparedMessages(
      state.attemptActive ? state.draft : state.committed,
      preparedProjection.projection.messages,
      preparedProjection.messageSources,
      state.attemptActive
        ? (state.localProvenance ?? {})
        : (state.committedLocalProvenance ?? {}),
    );
    const messages = reconciled.draft;
    return {
      ...state,
      messages,
      committed: messages,
      draft: [],
      attemptActive: false,
      activeAssistantMessageId: undefined,
      activeIgnoredTextMessageId: undefined,
      canonicalIds: preparedProjection.canonicalIds,
      committedCanonicalIds: preparedProjection.canonicalIds,
      preparedProjection,
      localProvenance: reconciled.localProvenance,
      committedLocalProvenance: reconciled.localProvenance,
    };
  }),
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
        preparedProjection: undefined,
        localProvenance: state.committedLocalProvenance,
        committedLocalProvenance: state.committedLocalProvenance,
      }
    : state;
}

function readPreparedProjection(
  action: unknown,
): ɵAgUiMessageProjectionCache | undefined {
  return (
    action as { readonly ɵagUiMessageProjection?: ɵAgUiMessageProjectionCache }
  ).ɵagUiMessageProjection;
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
    ...existing,
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

function requiresCanonicalProjection(
  event: Parameters<typeof apiActions.generateMessageEvent>[0],
): boolean {
  switch (event.type) {
    case EventType.TEXT_MESSAGE_END:
      return event.metadata !== undefined;
    case EventType.REASONING_MESSAGE_START:
    case EventType.REASONING_MESSAGE_CONTENT:
    case EventType.REASONING_MESSAGE_END:
    case EventType.REASONING_MESSAGE_CHUNK:
    case EventType.REASONING_ENCRYPTED_VALUE:
      return true;
    default:
      return false;
  }
}

function createLocalProvenance(
  localProjection:
    { readonly messages: readonly Chat.Internal.Message[] } | undefined,
  canonicalMessages: readonly Readonly<Message>[],
): Readonly<Record<string, LocalMessageProvenance>> {
  if (!localProjection) return {};

  const sources = ɵindexAgUiCanonicalMessageSources(canonicalMessages);
  return localProjection.messages.reduce<
    Record<string, LocalMessageProvenance>
  >((provenance, message) => {
    if (message.role === 'error' || message.id === undefined) {
      return provenance;
    }
    const source = readOwn(sources, message.id);
    if (!source) return provenance;

    writeOwn(provenance, message.id, { source, bound: false });
    return provenance;
  }, {});
}

function reconcilePreparedMessages(
  previous: readonly Chat.Internal.Message[],
  projected: readonly Chat.Internal.Message[],
  sources: ɵAgUiMessageProjectionCache['messageSources'],
  provenance: Readonly<Record<string, LocalMessageProvenance>>,
  event?: AGUIEvent,
): {
  readonly draft: readonly Chat.Internal.Message[];
  readonly localProvenance: Readonly<Record<string, LocalMessageProvenance>>;
} {
  const previousById = new Map(
    previous.flatMap((message) =>
      message.role === 'error' || message.id === undefined
        ? []
        : [[message.id, message] as const],
    ),
  );
  const nextProvenance: Record<string, LocalMessageProvenance> = {};
  let provenanceChanged = false;
  const synchronized = projected.map((message) => {
    if (message.role === 'error' || message.id === undefined) return message;

    const local = readOwn(provenance, message.id);
    const source = readOwn(sources, message.id);
    const existing = previousById.get(message.id);
    const valid =
      local !== undefined &&
      source !== undefined &&
      existing !== undefined &&
      event?.type !== EventType.MESSAGES_SNAPSHOT &&
      (local.bound
        ? sameCanonicalMessageSourceReferences(local.source, source)
        : sameCanonicalMessageSourceValues(local.source, source));
    if (!valid) {
      if (local !== undefined) provenanceChanged = true;
      return message;
    }

    const next = local.bound ? local : { source, bound: true };
    writeOwn(nextProvenance, message.id, next);
    if (local !== next) provenanceChanged = true;
    return existing;
  });
  if (Object.keys(provenance).length !== Object.keys(nextProvenance).length) {
    provenanceChanged = true;
  }

  const withErrors = retainLocalErrors(previous, synchronized);
  return {
    draft: sameReferences(previous, withErrors) ? previous : withErrors,
    localProvenance: provenanceChanged ? nextProvenance : provenance,
  };
}

function retainLocalErrors(
  previous: readonly Chat.Internal.Message[],
  synchronized: readonly Chat.Internal.Message[],
): readonly Chat.Internal.Message[] {
  const previousSynchronizedCount = previous.filter(
    (message) => message.role !== 'error',
  ).length;
  let synchronizedBefore = 0;
  const errors = previous.flatMap((message) => {
    if (message.role !== 'error') {
      synchronizedBefore += 1;
      return [];
    }
    return [
      {
        message,
        insertionIndex:
          synchronizedBefore === previousSynchronizedCount
            ? synchronized.length
            : Math.min(synchronizedBefore, synchronized.length),
      },
    ];
  });

  const errorsByIndex = errors.reduce((groups, error) => {
    const group = groups.get(error.insertionIndex);
    if (group) {
      group.push(error.message);
    } else {
      groups.set(error.insertionIndex, [error.message]);
    }
    return groups;
  }, new Map<number, Chat.Internal.ErrorMessage[]>());
  return [
    ...synchronized.flatMap((message, index) => [
      ...(errorsByIndex.get(index) ?? []),
      message,
    ]),
    ...(errorsByIndex.get(synchronized.length) ?? []),
  ];
}

function sameCanonicalMessageSourceReferences(
  first: ɵAgUiCanonicalMessageSource,
  second: ɵAgUiCanonicalMessageSource,
): boolean {
  return (
    first.message === second.message &&
    sameReferences(first.reasoning, second.reasoning)
  );
}

function sameCanonicalMessageSourceValues(
  first: ɵAgUiCanonicalMessageSource,
  second: ɵAgUiCanonicalMessageSource,
): boolean {
  return (
    sameCanonicalValue(first.message, second.message) &&
    sameCanonicalValue(first.reasoning, second.reasoning)
  );
}

function sameCanonicalValue(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (
    first === null ||
    second === null ||
    typeof first !== 'object' ||
    typeof second !== 'object'
  ) {
    return false;
  }

  const firstRecord = first as Readonly<Record<string, unknown>>;
  const secondRecord = second as Readonly<Record<string, unknown>>;
  const firstKeys = Object.keys(firstRecord);
  const secondKeys = Object.keys(secondRecord);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key) =>
        Object.hasOwn(secondRecord, key) &&
        sameCanonicalValue(firstRecord[key], secondRecord[key]),
    )
  );
}

function sameReferences<T>(first: readonly T[], second: readonly T[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function readOwn<T>(record: Readonly<Record<string, T>>, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function writeOwn<T>(record: Record<string, T>, key: string, value: T) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
