import { EventType } from '@ag-ui/core';
import { createReducer, on } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { ɵreadAgUiMessageEventDecision } from './ag-ui-messages.reducer';

export interface StatusState {
  readonly activeGenerationId: string | undefined;
  isReceiving: boolean;
  isSending: boolean;
  isGenerating: boolean;
  sendingError: Error | undefined;
  generatingError: Error | undefined;
  error: Error | undefined;
  exhaustedRetries: boolean;
}

export const initialStatusState: StatusState = {
  activeGenerationId: undefined,
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
  on(devActions.sendMessage, (state, action) => {
    if (action.payload.canonicalAppendCompatible === false) {
      return state;
    }

    return {
      ...state,
      isSending: true,
      sendingError: undefined,
    };
  }),
  on(devActions.setMessages, devActions.resendMessages, (state) => {
    return {
      ...state,
      isSending: true,
      sendingError: undefined,
    };
  }),
  on(internalActions.logicalGenerationStarted, (state, action) => ({
    ...state,
    activeGenerationId: action.payload.generationId,
  })),
  on(internalActions.logicalGenerationSettled, (state, action) => {
    if (state.activeGenerationId !== action.payload.generationId) {
      return state;
    }

    return {
      ...state,
      activeGenerationId: undefined,
      isReceiving: false,
      isSending: false,
      isGenerating: false,
    };
  }),
  on(apiActions.generateMessageEvent, (state, action) => {
    const decision = ɵreadAgUiMessageEventDecision(action);
    if (decision && decision.kind !== 'accepted') return state;
    action = decision
      ? ({ ...action, payload: decision.event } as typeof action)
      : action;
    switch (action.payload.type) {
      case EventType.RUN_STARTED:
        return {
          ...state,
          isSending: false,
          isReceiving: true,
          isGenerating: true,
          sendingError: undefined,
          generatingError: undefined,
          error: undefined,
        };
      case EventType.TEXT_MESSAGE_START:
      case EventType.TEXT_MESSAGE_CONTENT:
      case EventType.TEXT_MESSAGE_CHUNK:
      case EventType.REASONING_START:
      case EventType.REASONING_MESSAGE_START:
      case EventType.REASONING_MESSAGE_CONTENT:
      case EventType.REASONING_ENCRYPTED_VALUE:
      case EventType.REASONING_MESSAGE_END:
      case EventType.REASONING_END:
      case EventType.TOOL_CALL_START:
      case EventType.TOOL_CALL_ARGS:
      case EventType.TOOL_CALL_CHUNK:
        return {
          ...state,
          isReceiving: true,
          isGenerating: true,
        };
      default:
        return state;
    }
  }),
  on(apiActions.generateMessageSuccess, (state) => {
    return {
      ...state,
      isReceiving: false,
      isGenerating: false,
      sendingError: undefined,
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
  on(internalActions.generationSilentlyRetired, (state) => {
    return {
      ...state,
      activeGenerationId: undefined,
      isReceiving: false,
      isSending: false,
      isGenerating: false,
    };
  }),
  on(internalActions.toolTurnSettled, (state, action) => {
    return {
      ...state,
      isSending:
        action.payload.continuation === 'continue' ? true : state.isSending,
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
      activeGenerationId: undefined,
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
