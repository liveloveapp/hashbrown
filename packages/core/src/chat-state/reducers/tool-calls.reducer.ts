import { Chat } from '../models';
import {
  createEntityAdapter,
  createReducer,
  EntityChange,
  EntityState,
  on,
  select,
} from '../../utils/micro-ngrx';
import { apiActions, internalActions } from '../actions';

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
  on(apiActions.generateMessageSuccess, (state, action) => {
    const message = action.payload;

    if (!message.tool_calls) {
      return state;
    }

    return {
      ...state,
      ids: message.tool_calls.map((toolCall) => toolCall.id),
      entities: message.tool_calls.reduce(
        (acc, toolCall) => ({
          ...acc,
          [toolCall.id]: {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
            status: 'pending',
          },
        }),
        {},
      ),
    };
  }),
  on(internalActions.runToolCallsSuccess, (state, action) => {
    const { toolMessages } = action.payload;
    const changes: EntityChange<Chat.Internal.ToolCall>[] = toolMessages.map(
      (toolMessage) => ({
        id: toolMessage.tool_call_id,
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
