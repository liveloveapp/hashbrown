import { devActions } from '../actions';
import { createReducer, on } from '../../utils/micro-ngrx';
import { s } from '../../schema';

export interface ConfigState {
  apiUrl: string;
  model: string;
  prompt: string;
  debounce: number;
  temperature?: number;
  maxTokens?: number;
  responseSchema?: s.HashbrownType;
}

const initialState: ConfigState = {
  apiUrl: '',
  model: '',
  prompt: '',
  debounce: 150,
};

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    return {
      ...state,
      apiUrl: action.payload.apiUrl,
      model: action.payload.model,
      prompt: action.payload.prompt,
      debounce: action.payload.debounce ?? state.debounce,
      temperature: action.payload.temperature,
      maxTokens: action.payload.maxTokens,
      responseSchema: action.payload.responseSchema,
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
