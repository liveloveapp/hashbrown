import {
  createEntityAdapter,
  createReducer,
  EntityChange,
  EntityState,
  on,
  select,
} from '../utils/micro-ngrx';
import { Chat } from '../models';
import { apiActions, devActions, internalActions } from '../actions';
import { toInternalToolCallsFromView } from '../models/internal_helpers';

export type ToolCallsState = EntityState<Chat.Internal.ToolCall>;

const adapter = createEntityAdapter<Chat.Internal.ToolCall>({
  selectId: (toolCall: Chat.Internal.ToolCall) => toolCall.id,
});

const initialState: ToolCallsState = {
  ids: [],
  entities: {},
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, devActions.setMessages, (state, action) => {
    const messages = action.payload.messages;

    if (!messages) {
      return initialState;
    }

    return adapter.addMany(initialState, toInternalToolCallsFromView(messages));
  }),
  on(apiActions.generateMessageSuccess, (state, action) => {
    return adapter.addMany(state, action.payload.toolCalls);
  }),
  on(internalActions.toolTurnSettled, (state, action) => {
    const { toolCalls, toolMessages } = action.payload;
    const expectedById = new Map(
      toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );
    const changes: EntityChange<Chat.Internal.ToolCall>[] =
      toolMessages.flatMap((toolMessage) =>
        state.entities[toolMessage.toolCallId] ===
        expectedById.get(toolMessage.toolCallId)
          ? [
              {
                id: toolMessage.toolCallId,
                updates: { result: toolMessage.content, status: 'done' },
              },
            ]
          : [],
      );

    return adapter.updateMany(state, changes);
  }),
);

export const selectToolCallIds = (state: ToolCallsState) => state.ids;

export const selectToolCallEntities = (state: ToolCallsState) => state.entities;

export const selectToolCalls = select(
  selectToolCallIds,
  selectToolCallEntities,
  (ids, entities) => ids.map((id) => entities[id]),
);

export const selectPendingToolCalls = select(selectToolCalls, (toolCalls) => {
  return toolCalls.filter(
    (toolCall) => toolCall.status === 'pending' && toolCall.name !== 'output',
  );
});
