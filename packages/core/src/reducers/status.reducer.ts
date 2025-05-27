import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { toInternalToolCallsFromApi } from '../models/internal_helpers';

export interface StatusState {
  isReceiving: boolean;
  isSending: boolean;
  isRunningToolCalls: boolean;
  error: Error | null;
  exhaustedRetries: boolean;
}

export const initialStatusState: StatusState = {
  isReceiving: false,
  isSending: false,
  isRunningToolCalls: false,
  error: null,
  exhaustedRetries: false,
};

export const reducer = createReducer(
  initialStatusState,
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
  on(apiActions.generateMessageSuccess, (state, action) => {
    // NB: We don't treat 'output' calls the same as other tool
    // calls (i.e. they are not handled by the 'runTools' effect)
    // so we need to not consider them when setting isRunningToolCalls.
    // Otherwise, the status will never clear.
    const toolCalls = action.payload.tool_calls?.flatMap(
      toInternalToolCallsFromApi,
    );

    return {
      ...state,
      isReceiving: false,
      isRunningToolCalls: Boolean(toolCalls && toolCalls.length > 0),
      error: null,
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
    console.log('in exhausted retires for status reducer');

    return {
      ...state,
      exhaustedRetries: true,
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
