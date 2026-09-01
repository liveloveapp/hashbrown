import { devActions } from '../actions';
import { s } from '../schema';
import { TransportOrFactory } from '../transport';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ConfigState {
  system: string;
  debounce: number;
  responseSchema?: s.HashbrownType;
  retries: number;
  transport?: TransportOrFactory;
  ui?: boolean;
}

const initialState: ConfigState = {
  system: '',
  debounce: 150,
  retries: 0,
  ui: false,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action): ConfigState => {
    const responseSchema = action.payload.responseSchema
      ? s.normalizeSchemaOutput(action.payload.responseSchema)
      : undefined;
    return {
      ...state,
      system: action.payload.system,
      debounce: action.payload.debounce ?? state.debounce,
      responseSchema,
      retries: action.payload.retries ?? state.retries,
      transport: action.payload.transport ?? state.transport,
      ui: action.payload.ui ?? state.ui,
    };
  }),
  on(devActions.updateOptions, (state, action): ConfigState => {
    const {
      threadId: _threadId,
      system = state.system,
      debounce = state.debounce,
      retries = state.retries,
      transport = state.transport,
      ui = state.ui,
      ...configPayload
    } = action.payload;
    void _threadId;
    const responseSchema = configPayload.responseSchema
      ? s.normalizeSchemaOutput(configPayload.responseSchema)
      : state.responseSchema;

    return {
      ...state,
      ...configPayload,
      system,
      debounce,
      retries,
      transport,
      ui,
      responseSchema,
    };
  }),
);

export const selectSystem = (state: ConfigState) => state.system;
export const selectDebounce = (state: ConfigState) => state.debounce;
export const selectResponseSchema = (state: ConfigState) =>
  state.responseSchema;
export const selectRetries = (state: ConfigState) => state.retries;
export const selectTransport = (state: ConfigState) => state.transport;
export const selectUiRequested = (state: ConfigState) => state.ui ?? false;
