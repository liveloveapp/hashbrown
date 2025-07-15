import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';

export interface StatusState {
  isReceiving: boolean;
  isSending: boolean;
  isRunningToolCalls: boolean;
  error: Error | undefined;
  exhaustedRetries: boolean;
}

export const initialStatusState: StatusState = {
  isReceiving: false,
  isSending: false,
  isRunningToolCalls: false,
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
      };
    },
  ),
  on(apiActions.generateMessageStart, (state) => {
    return {
      ...state,
      isSending: false,
      isReceiving: true,
    };
  }),
  on(apiActions.generateMessageChunk, (state) => {
    return {
      ...state,
      isReceiving: true,
    };
  }),
  on(apiActions.generateMessageSuccess, (state) => {
    return {
      ...state,
      isReceiving: false,
      isRunningToolCalls: true,
      error: undefined,
      exhaustedRetries: false,
    };
  }),
  on(apiActions.generateMessageError, (state, action) => {
    return {
      ...state,
      isReceiving: false,
      isSending: false,
      error: action.payload,
    };
  }),
  on(internalActions.runToolCallsSuccess, (state) => {
    return {
      ...state,
      isRunningToolCalls: false,
      isSending: true,
    };
  }),
  on(internalActions.runToolCallsError, (state, action) => {
    return {
      ...state,
      isRunningToolCalls: false,
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
      isSending: false,
      isRunningToolCalls: false,
      error: undefined,
      exhaustedRetries: false,
    };
  }),
  on(internalActions.skippedToolCalls, (state) => {
    return {
      ...state,
      isRunningToolCalls: false,
      isSending: false,
      isReceiving: false,
    };
  }),
);

export const selectIsReceiving = (state: StatusState) => state.isReceiving;
export const selectIsSending = (state: StatusState) => state.isSending;
export const selectIsRunningToolCalls = (state: StatusState) =>
  state.isRunningToolCalls;
export const selectError = (state: StatusState) => state.error;
export const selectExhaustedRetries = (state: StatusState) =>
  state.exhaustedRetries;
