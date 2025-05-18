import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';

export interface StatusState {
  isReceiving: boolean;
  isSending: boolean;
  isRunningToolCalls: boolean;
  error: Error | null;
}

export const initialStatusState: StatusState = {
  isReceiving: false,
  isSending: false,
  isRunningToolCalls: false,
  error: null,
};

export const reducer = createReducer(
  initialStatusState,
  on(devActions.sendMessage, devActions.setMessages, (state) => {
    return {
      ...state,
      isSending: true,
    };
  }),
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
    const toolCalls = action.payload.tool_calls;

    return {
      ...state,
      isReceiving: false,
      isRunningToolCalls: Boolean(toolCalls && toolCalls.length > 0),
    };
  }),
  on(apiActions.generateMessageError, (state, action) => {
    return {
      ...state,
      isReceiving: false,
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
);

export const selectIsReceiving = (state: StatusState) => state.isReceiving;
export const selectIsSending = (state: StatusState) => state.isSending;
export const selectIsRunningToolCalls = (state: StatusState) =>
  state.isRunningToolCalls;
export const selectError = (state: StatusState) => state.error;
