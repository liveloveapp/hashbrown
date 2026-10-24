import { apiActions, devActions, internalActions } from '../actions';
import { createReducer, on } from '../utils/micro-ngrx';

const initialState = { revision: 0, restorationEpoch: 0, restored: false };

/** Local recovery lookup revision and silent-restoration scheduling barrier. @internal */
export const reducer = createReducer(
  initialState,
  on(devActions.restoreConversation, (state) => ({
    revision: state.revision + 1,
    restorationEpoch: state.restorationEpoch + 1,
    restored: true,
  })),
  on(
    devActions.init,
    devActions.updateOptions,
    devActions.setState,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    devActions.resume,
    apiActions.generateMessageSuccess,
    internalActions.interruptsPublished,
    internalActions.resumeAcknowledged,
    internalActions.resumeSettled,
    internalActions.interruptThreadRetired,
    internalActions.toolTurnSettled,
    (state, action) => ({
      ...state,
      revision: state.revision + 1,
      restored: [
        devActions.setMessages.type,
        devActions.sendMessage.type,
        devActions.resendMessages.type,
        devActions.resume.type,
      ].some((type) => type === action.type)
        ? false
        : state.restored,
    }),
  ),
  on(apiActions.generateMessageEvent, (state, action) =>
    action.payload.type === 'RUN_STARTED'
      ? { ...state, revision: state.revision + 1 }
      : state,
  ),
);
