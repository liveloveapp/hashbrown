import { Chat } from '../models';
import { devActions } from '../actions';
import { createReducer, on, select } from '../../utils/micro-ngrx';

export type ToolState = {
  names: string[];
  entities: Record<string, Chat.Internal.Tool>;
};

const initialState: ToolState = {
  names: [],
  entities: {},
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const tools = action.payload.tools;

    if (!tools) {
      return state;
    }

    return {
      ...state,
      names: tools.map((tool) => tool.name),
      entities: tools.reduce(
        (acc, tool) => {
          acc[tool.name] = tool;
          return acc;
        },
        {} as Record<string, Chat.Internal.Tool>,
      ),
    };
  }),
);

export const selectToolNames = (state: ToolState) => state.names;
export const selectToolEntities = (state: ToolState) => state.entities;

export const selectTools = select(
  selectToolNames,
  selectToolEntities,
  (names, entities) => names.map((name) => entities[name]),
);
