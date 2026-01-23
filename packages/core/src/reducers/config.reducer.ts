import { apiActions, devActions } from '../actions';
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
  middleware?: Chat.Middleware[];
  emulateStructuredOutput: boolean;
  retries: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}

const initialState: ConfigState = {
  apiUrl: '',
  model: '',
  system: '',
  debounce: 150,
  emulateStructuredOutput: false,
  retries: 0,
  ui: false,
  threadId: undefined,
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
      middleware: action.payload.middleware,
      emulateStructuredOutput:
        action.payload.emulateStructuredOutput ?? state.emulateStructuredOutput,
      retries: action.payload.retries ?? state.retries,
      transport: action.payload.transport ?? state.transport,
      ui: action.payload.ui ?? state.ui,
      threadId: action.payload.threadId,
    };
  }),
  on(devActions.updateOptions, (state, action): ConfigState => {
    const hasThreadId = Object.prototype.hasOwnProperty.call(
      action.payload,
      'threadId',
    );
    const threadId = hasThreadId ? action.payload.threadId : state.threadId;
    const responseSchema = action.payload.responseSchema
      ? s.normalizeSchemaOutput(action.payload.responseSchema)
      : state.responseSchema;

    return {
      ...state,
      ...action.payload,
      responseSchema,
      threadId,
    };
  }),
  on(apiActions.threadSaveSuccess, (state, action): ConfigState => {
    return {
      ...state,
      threadId: action.payload.threadId,
    };
  }),
);

export const selectApiUrl = (state: ConfigState) => state.apiUrl;
export const selectModel = (state: ConfigState) => state.model;
export const selectSystem = (state: ConfigState) => state.system;
export const selectDebounce = (state: ConfigState) => state.debounce;
export const selectResponseSchema = (state: ConfigState) =>
  state.responseSchema;
export const selectMiddleware = (state: ConfigState) => state.middleware;
export const selectEmulateStructuredOutput = (state: ConfigState) =>
  state.emulateStructuredOutput;
export const selectRetries = (state: ConfigState) => state.retries;
export const selectTransport = (state: ConfigState) => state.transport;
export const selectUiRequested = (state: ConfigState) => state.ui ?? false;
export const selectThreadId = (state: ConfigState) => state.threadId;
