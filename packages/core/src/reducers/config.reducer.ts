import { devActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { KnownModelIds } from '../utils';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ConfigState {
  apiUrl: string;
  model: KnownModelIds;
  system: string;
  debounce: number;
  responseSchema?: s.HashbrownType;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput: boolean;
  retries: number;
  useThreadId: boolean;
  threadId?: string;
}

const initialState: ConfigState = {
  apiUrl: '',
  model: '',
  system: '',
  debounce: 150,
  emulateStructuredOutput: false,
  retries: 0,
  useThreadId: false,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action): ConfigState => {
    const useThreadId = action.payload.useThreadId ?? false;
    return {
      ...state,
      apiUrl: action.payload.apiUrl,
      model: action.payload.model,
      system: action.payload.system,
      debounce: action.payload.debounce ?? state.debounce,
      responseSchema: action.payload.responseSchema,
      middleware: action.payload.middleware,
      emulateStructuredOutput:
        action.payload.emulateStructuredOutput ?? state.emulateStructuredOutput,
      retries: action.payload.retries ?? state.retries,
      useThreadId,
      threadId: useThreadId ? action.payload.threadId : undefined,
    };
  }),
  on(devActions.updateOptions, (state, action): ConfigState => {
    const useThreadId =
      action.payload.useThreadId ?? state.useThreadId ?? false;
    const hasThreadId = Object.prototype.hasOwnProperty.call(
      action.payload,
      'threadId',
    );
    const threadId = hasThreadId
      ? action.payload.threadId
      : useThreadId
        ? state.threadId
        : undefined;

    return {
      ...state,
      ...action.payload,
      useThreadId,
      threadId,
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
export const selectUseThreadId = (state: ConfigState) => state.useThreadId;
export const selectThreadId = (state: ConfigState) => state.threadId;
