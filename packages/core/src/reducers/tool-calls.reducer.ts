import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { createReducer, EntityState, on, select } from '../utils/micro-ngrx';
import {
  projectAgUiMessages,
  type ɵAgUiCanonicalIdIndex,
  ɵappendAgUiCanonicalIds,
  ɵindexAgUiCanonicalIds,
  ɵownValidatedAgUiMessages,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';

export interface ToolCallsState extends EntityState<Chat.Internal.ToolCall> {
  readonly committed: EntityState<Chat.Internal.ToolCall>;
  readonly draft: EntityState<Chat.Internal.ToolCall>;
  readonly attemptActive: boolean;
  readonly activeToolCallId: string | undefined;
  readonly activeToolCallName: string | undefined;
  readonly canonicalIds: ɵAgUiCanonicalIdIndex;
}

const empty: EntityState<Chat.Internal.ToolCall> = { ids: [], entities: {} };
const initialState: ToolCallsState = {
  ...empty,
  committed: empty,
  draft: empty,
  attemptActive: false,
  activeToolCallId: undefined,
  activeToolCallName: undefined,
  canonicalIds: ɵindexAgUiCanonicalIds([]),
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const toolCalls =
      action.payload.localProjection?.toolCalls ??
      projectAgUiMessages(action.payload.canonicalMessages, {}).toolCalls;
    const committed = toEntityState(toolCalls);
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
    };
  }),
  on(internalActions.generationAttemptStarted, (state): ToolCallsState => ({
    ...state.committed,
    committed: state.committed,
    draft: state.committed,
    attemptActive: true,
    activeToolCallId: undefined,
    activeToolCallName: undefined,
    canonicalIds: state.canonicalIds,
  })),
  on(apiActions.generateMessageEvent, (state, action): ToolCallsState => {
    if (!state.attemptActive) return state;
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const draft = projectRemoteSnapshot(action.payload);
      if (!draft) return state;
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.canonicalIds,
      };
    }
    if (action.payload.type === EventType.TOOL_CALL_START) {
      const draft = addEntities(state.draft, [
        {
          id: action.payload.toolCallId,
          name: action.payload.toolCallName,
          arguments: '',
          status: 'pending',
        },
      ]);
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: action.payload.toolCallId,
        activeToolCallName: action.payload.toolCallName,
        canonicalIds: state.canonicalIds,
      };
    }
    if (
      action.payload.type === EventType.TOOL_CALL_ARGS ||
      action.payload.type === EventType.TOOL_CALL_END ||
      action.payload.type === EventType.TOOL_CALL_CHUNK
    ) {
      const event = action.payload;
      const id = event.toolCallId ?? state.activeToolCallId;
      if (!id) return state;
      const existing = state.draft.entities[id];
      const delta = 'delta' in event ? ((event.delta ?? '') as string) : '';
      const toolCallName =
        (event as { readonly toolCallName?: string }).toolCallName ??
        state.activeToolCallName;
      const draft = existing
        ? updateEntity(state.draft, id, {
            arguments: `${existing.arguments}${delta}`,
          })
        : toolCallName
          ? addEntities(state.draft, [
              { id, name: toolCallName, arguments: delta, status: 'pending' },
            ])
          : state.draft;
      const ending = event.type === EventType.TOOL_CALL_END;
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: ending ? undefined : id,
        activeToolCallName: ending ? undefined : toolCallName,
        canonicalIds: state.canonicalIds,
      };
    }
    if (action.payload.type === EventType.TOOL_CALL_RESULT) {
      const existing = state.entities[action.payload.toolCallId];
      if (!existing) return state;
      const error = (
        action.payload as typeof action.payload & { readonly error?: string }
      ).error;
      const result: PromiseSettledResult<unknown> =
        error === undefined
          ? { status: 'fulfilled', value: action.payload.content }
          : { status: 'rejected', reason: error };
      const draft = updateEntity(state.draft, action.payload.toolCallId, {
        status: 'done',
        result,
      });
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: state.activeToolCallId,
        activeToolCallName: state.activeToolCallName,
        canonicalIds: state.canonicalIds,
      };
    }
    return state;
  }),
  on(apiActions.generateMessageSuccess, (state, action): ToolCallsState => {
    if (state.attemptActive) {
      const committed = mergeSuccessToolCalls(
        state.draft,
        action.payload.toolCalls,
      );
      return {
        ...committed,
        committed,
        draft: empty,
        attemptActive: false,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.canonicalIds,
      };
    }
    const committed = addEntities(state.committed, action.payload.toolCalls);
    return {
      ...committed,
      committed,
      draft: state.draft,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: state.canonicalIds,
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): ToolCallsState =>
    rollback(state),
  ),
  on(
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    devActions.resendMessages,
    (state): ToolCallsState => rollback(state),
  ),
  on(devActions.sendMessage, (state, action): ToolCallsState => {
    if (action.payload.canonicalAppendCompatible === false) return state;
    let canonicalIds: ɵAgUiCanonicalIdIndex;
    try {
      canonicalIds = ɵappendAgUiCanonicalIds(
        state.canonicalIds,
        ɵownValidatedAgUiMessages(action.payload.canonicalMessages),
      );
    } catch {
      return state;
    }
    const committed = addEntities(
      state.committed,
      action.payload.localProjection?.toolCalls ??
        projectAgUiMessages(action.payload.canonicalMessages, {}).toolCalls,
    );
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds,
    };
  }),
  on(devActions.setMessages, (state, action): ToolCallsState => {
    const committed = toEntityState(
      action.payload.localProjection?.toolCalls ??
        projectAgUiMessages(
          action.payload.canonicalMessages,
          action.payload.toolsByName ?? {},
        ).toolCalls,
    );
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
    };
  }),
  on(internalActions.toolTurnSettled, (state, action): ToolCallsState => {
    const expected = new Map(
      action.payload.toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );
    const updates = action.payload.toolMessages.reduce(
      (current, toolMessage) => {
        const existing = current.entities[toolMessage.toolCallId];
        return existing === expected.get(toolMessage.toolCallId)
          ? updateEntity(current, toolMessage.toolCallId, {
              status: 'done',
              result: toolMessage.content,
            })
          : current;
      },
      state.attemptActive ? state.draft : state.committed,
    );
    return state.attemptActive
      ? {
          ...updates,
          committed: state.committed,
          draft: updates,
          attemptActive: true,
          activeToolCallId: state.activeToolCallId,
          activeToolCallName: state.activeToolCallName,
          canonicalIds: state.canonicalIds,
        }
      : {
          ...updates,
          committed: updates,
          draft: state.draft,
          attemptActive: false,
          activeToolCallId: undefined,
          activeToolCallName: undefined,
          canonicalIds: state.canonicalIds,
        };
  }),
);

export const selectToolCallIds = (state: ToolCallsState) => state.ids;
export const selectToolCallEntities = (state: ToolCallsState) => state.entities;
export const selectToolCalls = select(
  selectToolCallIds,
  selectToolCallEntities,
  (ids, entities) => ids.map((id) => entities[id]),
);
export const selectPendingToolCalls = select(selectToolCalls, (toolCalls) =>
  toolCalls.filter((toolCall) => toolCall.status === 'pending'),
);

function rollback(state: ToolCallsState): ToolCallsState {
  return state.attemptActive
    ? {
        ...state.committed,
        committed: state.committed,
        draft: state.committed,
        attemptActive: false,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.canonicalIds,
      }
    : state;
}

function toEntityState(
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce(
    (state, toolCall) => ({
      ids: [...state.ids, toolCall.id],
      entities: { ...state.entities, [toolCall.id]: toolCall },
    }),
    empty,
  );
}

function projectRemoteSnapshot(
  event: Extract<
    import('@ag-ui/core').AGUIEvent,
    { type: EventType.MESSAGES_SNAPSHOT }
  >,
): EntityState<Chat.Internal.ToolCall> | undefined {
  try {
    return toEntityState(
      projectAgUiMessages(ɵreadAgUiMessageSnapshot(event), {}).toolCalls,
    );
  } catch {
    return undefined;
  }
}

function addEntities(
  state: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce(
    (current, toolCall) =>
      current.entities[toolCall.id]
        ? current
        : {
            ids: [...current.ids, toolCall.id],
            entities: { ...current.entities, [toolCall.id]: toolCall },
          },
    state,
  );
}

function updateEntity(
  state: EntityState<Chat.Internal.ToolCall>,
  id: string,
  updates: Partial<Chat.Internal.ToolCall>,
): EntityState<Chat.Internal.ToolCall> {
  const existing = state.entities[id];
  return existing
    ? {
        ...state,
        entities: { ...state.entities, [id]: { ...existing, ...updates } },
      }
    : state;
}

function mergeSuccessToolCalls(
  draft: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce((current, toolCall) => {
    const existing = current.entities[toolCall.id];
    if (!existing) {
      return current;
    }

    const merged: Chat.Internal.ToolCall = {
      ...existing,
      ...toolCall,
      status: existing.status,
      ...(existing.result === undefined ? {} : { result: existing.result }),
    };
    return {
      ...current,
      entities: { ...current.entities, [toolCall.id]: merged },
    };
  }, draft);
}
