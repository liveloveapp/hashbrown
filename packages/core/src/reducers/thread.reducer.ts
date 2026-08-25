import { EventType } from '@ag-ui/core';
import { apiActions, devActions } from '../actions';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ThreadState {
  threadId: string | undefined;
}

export const initialThreadState: ThreadState = {
  threadId: undefined,
};

export const reducer = createReducer(
  initialThreadState,
  on(devActions.init, (state, action) => {
    return {
      ...state,
      threadId: action.payload.threadId,
    };
  }),
  on(devActions.updateOptions, (state, action) => {
    if (!Object.prototype.hasOwnProperty.call(action.payload, 'threadId')) {
      return state;
    }

    return {
      ...state,
      threadId: action.payload.threadId,
    };
  }),
  on(apiActions.generateMessageEvent, (state, action) => {
    if (action.payload.type !== EventType.RUN_STARTED) {
      return state;
    }

    return {
      ...state,
      threadId: action.payload.threadId,
    };
  }),
);

export const selectThreadId = (state: ThreadState) => state.threadId;
