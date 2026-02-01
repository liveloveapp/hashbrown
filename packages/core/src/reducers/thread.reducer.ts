import { apiActions, devActions } from '../actions';
import { createReducer, on } from '../utils/micro-ngrx';

export interface ThreadState {
  threadId: string | undefined;
  isLoadingThread: boolean;
  isSavingThread: boolean;
  loadingThreadError: { error: string; stacktrace?: string } | undefined;
  savingThreadError: { error: string; stacktrace?: string } | undefined;
}

export const initialThreadState: ThreadState = {
  threadId: undefined,
  isLoadingThread: false,
  isSavingThread: false,
  loadingThreadError: undefined,
  savingThreadError: undefined,
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
    return {
      ...state,
      threadId: action.payload.threadId,
    };
  }),
  on(apiActions.generateMessageStart, (state) => {
    return {
      ...state,
      loadingThreadError: undefined,
      savingThreadError: undefined,
    };
  }),
  on(apiActions.threadLoadStart, (state) => {
    return {
      ...state,
      isLoadingThread: true,
      loadingThreadError: undefined,
    };
  }),
  on(apiActions.threadLoadSuccess, (state) => {
    return {
      ...state,
      isLoadingThread: false,
      loadingThreadError: undefined,
    };
  }),
  on(apiActions.threadLoadFailure, (state, action) => {
    return {
      ...state,
      isLoadingThread: false,
      loadingThreadError: action.payload,
    };
  }),
  on(apiActions.threadSaveStart, (state) => {
    return {
      ...state,
      isSavingThread: true,
      savingThreadError: undefined,
    };
  }),
  on(apiActions.threadSaveSuccess, (state, action) => {
    return {
      ...state,
      threadId: action.payload.threadId,
      isSavingThread: false,
      savingThreadError: undefined,
    };
  }),
  on(apiActions.threadSaveFailure, (state, action) => {
    return {
      ...state,
      isSavingThread: false,
      savingThreadError: action.payload,
    };
  }),
);

export const selectThreadId = (state: ThreadState) => state.threadId;
export const selectIsLoadingThread = (state: ThreadState) =>
  state.isLoadingThread;
export const selectIsSavingThread = (state: ThreadState) =>
  state.isSavingThread;
export const selectThreadLoadError = (state: ThreadState) =>
  state.loadingThreadError;
export const selectThreadSaveError = (state: ThreadState) =>
  state.savingThreadError;
