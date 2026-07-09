import { devActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { createReducer, on, select } from '../utils/micro-ngrx';

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
  on(devActions.init, devActions.updateOptions, (state, action) => {
    const tools = action.payload.tools;

    if (!tools || tools.length === 0) {
      return state;
    }

    return {
      ...state,
      names: tools.map((tool) => tool.name),
      entities: tools.reduce(
        (acc, tool) => {
          let schema = tool.schema;
          try {
            schema = s.normalizeSchemaInput(tool.schema);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `Tool "${tool.name}" schema normalization failed (mode: input). ${message}`,
            );
          }

          acc[tool.name] = {
            ...tool,
            schema,
          };
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
