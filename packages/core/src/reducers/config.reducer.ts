import { devActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { type ModelInput, TransportOrFactory } from '../transport';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ConfigState {
  apiUrl?: string;
  model: ModelInput;
  system: string;
  debounce: number;
  responseSchema?: s.HashbrownType;
  structuredOutput?: Chat.Api.StructuredOutputOptions;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput: boolean;
  retries: number;
  transport?: TransportOrFactory;
  ui?: boolean;
}

const initialState: ConfigState = {
  apiUrl: '',
  model: '',
  system: '',
  debounce: 150,
  emulateStructuredOutput: false,
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
      apiUrl: action.payload.apiUrl,
      model: action.payload.model,
      system: action.payload.system,
      debounce: action.payload.debounce ?? state.debounce,
      responseSchema,
      structuredOutput: action.payload.structuredOutput,
      middleware: action.payload.middleware,
      emulateStructuredOutput:
        action.payload.emulateStructuredOutput ?? state.emulateStructuredOutput,
      retries: action.payload.retries ?? state.retries,
      transport: action.payload.transport ?? state.transport,
      ui: action.payload.ui ?? state.ui,
    };
  }),
  on(devActions.updateOptions, (state, action): ConfigState => {
    const { threadId: _threadId, ...configPayload } = action.payload;
    void _threadId;
    const responseSchema = configPayload.responseSchema
      ? s.normalizeSchemaOutput(configPayload.responseSchema)
      : state.responseSchema;

    return {
      ...state,
      ...configPayload,
      responseSchema,
    };
  }),
);

export const selectApiUrl = (state: ConfigState) => state.apiUrl;
export const selectModel = (state: ConfigState) => state.model;
export const selectSystem = (state: ConfigState) => state.system;
export const selectDebounce = (state: ConfigState) => state.debounce;
export const selectResponseSchema = (state: ConfigState) =>
  state.responseSchema;
export const selectStructuredOutput = (state: ConfigState) =>
  state.structuredOutput;
export const selectMiddleware = (state: ConfigState) => state.middleware;
export const selectEmulateStructuredOutput = (state: ConfigState) =>
  state.emulateStructuredOutput;
export const selectRetries = (state: ConfigState) => state.retries;
export const selectTransport = (state: ConfigState) => state.transport;
export const selectUiRequested = (state: ConfigState) => state.ui ?? false;
