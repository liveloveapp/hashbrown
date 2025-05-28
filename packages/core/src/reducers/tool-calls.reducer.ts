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
import {
  toInternalToolCallsFromApi,
  toInternalToolCallsFromView,
} from '../models/internal_helpers';

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
    const message = action.payload;

    if (!message.toolCalls) {
      return state;
    }

    return adapter.addMany(
      state,
      message.toolCalls.flatMap(toInternalToolCallsFromApi),
    );
  }),
  on(internalActions.runToolCallsSuccess, (state, action) => {
    const { toolMessages } = action.payload;
    const changes: EntityChange<Chat.Internal.ToolCall>[] = toolMessages.map(
      (toolMessage) => ({
        id: toolMessage.toolCallId,
        updates: { result: toolMessage.content, status: 'done' },
      }),
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
  return toolCalls.filter((toolCall) => toolCall.status === 'pending');
});
