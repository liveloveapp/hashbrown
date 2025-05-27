import { devActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ConfigState {
  apiUrl: string;
  model: string;
  prompt: string;
  debounce: number;
  temperature?: number;
  maxTokens?: number;
  responseSchema?: s.HashbrownType;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput: boolean;
  retries: number;
}

const initialState: ConfigState = {
  apiUrl: '',
  model: '',
  prompt: '',
  debounce: 150,
  emulateStructuredOutput: false,
  retries: 0,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    console.log(action.payload);
    return {
      ...state,
      apiUrl: action.payload.apiUrl,
      model: action.payload.model,
      prompt: action.payload.prompt,
      debounce: action.payload.debounce ?? state.debounce,
      temperature: action.payload.temperature,
      maxTokens: action.payload.maxTokens,
      responseSchema: action.payload.responseSchema,
      middleware: action.payload.middleware,
      emulateStructuredOutput:
        action.payload.emulateStructuredOutput ?? state.emulateStructuredOutput,
      retries: action.payload.retries ?? state.retries,
    };
  }),
  on(devActions.updateOptions, (state, action) => {
    return {
      ...state,
      ...action.payload,
    };
  }),
);

export const selectApiUrl = (state: ConfigState) => state.apiUrl;
export const selectModel = (state: ConfigState) => state.model;
export const selectPrompt = (state: ConfigState) => state.prompt;
export const selectDebounce = (state: ConfigState) => state.debounce;
export const selectTemperature = (state: ConfigState) => state.temperature;
export const selectMaxTokens = (state: ConfigState) => state.maxTokens;
export const selectResponseSchema = (state: ConfigState) =>
  state.responseSchema;
export const selectMiddleware = (state: ConfigState) => state.middleware;
export const selectEmulateStructuredOutput = (state: ConfigState) =>
  state.emulateStructuredOutput;
export const selectRetries = (state: ConfigState) => state.retries;
