import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';

export interface StatusState {
  isReceiving: boolean;
  isSending: boolean;
  isGenerating: boolean;
  sendingError: Error | undefined;
  generatingError: Error | undefined;
  error: Error | undefined;
  exhaustedRetries: boolean;
}

export const initialStatusState: StatusState = {
  isReceiving: false,
  isSending: false,
  isGenerating: false,
  sendingError: undefined,
  generatingError: undefined,
  error: undefined,
  exhaustedRetries: false,
};

export const reducer = createReducer(
  initialStatusState,
  on(devActions.init, (state, action) => {
    const messages = action.payload.messages ?? [];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === 'user') {
      return {
        ...state,
        isSending: true,
      };
    }

    return state;
  }),
  on(
    devActions.sendMessage,
    devActions.setMessages,
    devActions.resendMessages,
    (state) => {
      return {
        ...state,
        isSending: true,
        sendingError: undefined,
      };
    },
  ),
  on(apiActions.generateMessageStart, (state) => {
    return {
      ...state,
      isSending: false,
      isReceiving: true,
      isGenerating: true,
      generatingError: undefined,
    };
  }),
  on(apiActions.generateMessageChunk, (state) => {
    return {
      ...state,
      isReceiving: true,
      isGenerating: true,
    };
  }),
  on(apiActions.generateMessageSuccess, (state) => {
    return {
      ...state,
      isReceiving: false,
      isGenerating: false,
      error: undefined,
      generatingError: undefined,
      exhaustedRetries: false,
    };
  }),
  on(apiActions.generateMessageError, (state, action) => {
    const isGenerationPhase = state.isReceiving || state.isGenerating;

    return {
      ...state,
      isReceiving: false,
      isSending: false,
      isGenerating: false,
      error: action.payload,
      sendingError: isGenerationPhase ? state.sendingError : action.payload,
      generatingError: isGenerationPhase
        ? action.payload
        : state.generatingError,
    };
  }),
  on(internalActions.runToolCallsSuccess, (state) => {
    return {
      ...state,
      isSending: true,
    };
  }),
  on(internalActions.runToolCallsError, (state, action) => {
    return {
      ...state,
      error: action.payload,
    };
  }),
  on(apiActions.generateMessageExhaustedRetries, (state) => {
    return {
      ...state,
      exhaustedRetries: true,
    };
  }),
  on(devActions.stopMessageGeneration, (state) => {
    return {
      ...state,
      isReceiving: false,
      isGenerating: false,
      isSending: false,
      sendingError: undefined,
      generatingError: undefined,
      error: undefined,
      exhaustedRetries: false,
    };
  }),
  on(internalActions.skippedToolCalls, (state) => {
    return state;
  }),
);

export const selectIsReceiving = (state: StatusState) => state.isReceiving;
export const selectIsSending = (state: StatusState) => state.isSending;
export const selectIsGenerating = (state: StatusState) => state.isGenerating;
export const selectSendingError = (state: StatusState) => state.sendingError;
export const selectGeneratingError = (state: StatusState) =>
  state.generatingError;
export const selectError = (state: StatusState) => state.error;
export const selectExhaustedRetries = (state: StatusState) =>
  state.exhaustedRetries;
