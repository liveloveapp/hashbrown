import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { toInternalToolCallsFromView } from '../models/internal_helpers';
import { createReducer, EntityState, on, select } from '../utils/micro-ngrx';
import { projectAgUiMessages } from './ag-ui-message-history';

export interface ToolCallsState extends EntityState<Chat.Internal.ToolCall> {
  readonly committed: EntityState<Chat.Internal.ToolCall>;
  readonly draft: EntityState<Chat.Internal.ToolCall>;
  readonly attemptActive: boolean;
}

const empty: EntityState<Chat.Internal.ToolCall> = { ids: [], entities: {} };
const initialState: ToolCallsState = {
  ...empty,
  committed: empty,
  draft: empty,
  attemptActive: false,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, devActions.setMessages, (state, action) => {
    const toolsByName =
      'toolsByName' in action.payload ? action.payload.toolsByName : undefined;
    const toolCalls = action.payload.canonicalMessages
      ? projectAgUiMessages(action.payload.canonicalMessages, toolsByName ?? {})
          .toolCalls
      : action.payload.messages
        ? toInternalToolCallsFromView(action.payload.messages)
        : [];
    const committed = toEntityState(toolCalls);
    return { ...committed, committed, draft: empty, attemptActive: false };
  }),
  on(internalActions.generationAttemptStarted, (state): ToolCallsState => ({
    ...state.committed,
    committed: state.committed,
    draft: state.committed,
    attemptActive: true,
  })),
  on(apiActions.generateMessageEvent, (state, action): ToolCallsState => {
    if (!state.attemptActive) return state;
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const draft = toEntityState(
        projectAgUiMessages(action.payload.messages, {}).toolCalls,
      );
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
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
      };
    }
    return state;
  }),
  on(apiActions.generateMessageSuccess, (state, action): ToolCallsState => {
    if (state.attemptActive)
      return {
        ...state.draft,
        committed: state.draft,
        draft: empty,
        attemptActive: false,
      };
    const committed = addEntities(state.committed, action.payload.toolCalls);
    return {
      ...committed,
      committed,
      draft: state.draft,
      attemptActive: false,
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
        }
      : {
          ...updates,
          committed: updates,
          draft: state.draft,
          attemptActive: false,
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
