import type { BrowserRecoveryCheckpoint } from './resume-checkpoint';
import type { PendingConversationRecovery } from '../models/conversation-recovery';
import { apiActions, devActions, internalActions } from '../actions';
import { createReducer, on } from '../utils/micro-ngrx';

/** Runtime-owned cold recovery epochs, claims and continuation disposition. @internal */
export interface RecoveryState {
  readonly revision: number;
  readonly restorationEpoch: number;
  readonly restored: boolean;
  readonly claimId?: string;
  readonly checkpoint?: BrowserRecoveryCheckpoint;
  readonly required: boolean;
  readonly successfulResumes: number;
  readonly pendingBrowserRecovery?: PendingConversationRecovery;
}

const initialState: RecoveryState = {
  revision: 0,
  restorationEpoch: 0,
  restored: false,
  required: false,
  successfulResumes: 0,
};

/** Local recovery lookup revision and silent-restoration scheduling barrier. @internal */
export const reducer = createReducer(
  initialState,
  on(devActions.restoreConversation, (state, action): RecoveryState => ({
    revision: state.revision + 1,
    restorationEpoch: state.restorationEpoch + 1,
    restored: true,
    required: false,
    successfulResumes: state.successfulResumes,
    pendingBrowserRecovery: action.payload.pendingBrowserRecovery,
  })),
  on(devActions.resumeConversationRecovery, (state, action): RecoveryState =>
    state.claimId
      ? state
      : {
          ...state,
          claimId: action.payload.claimId,
          checkpoint: action.payload.checkpoint,
          revision: state.revision + 1,
        },
  ),
  on(internalActions.browserRecoveryAcknowledged, (state): RecoveryState => ({
    ...state,
    pendingBrowserRecovery: undefined,
    revision: state.revision + 1,
  })),
  on(internalActions.browserRecoveryClaimReleased, (state): RecoveryState => ({
    ...state,
    claimId: undefined,
    checkpoint: undefined,
    revision: state.revision + 1,
  })),
  on(
    internalActions.browserRecoverySettled,
    (state, action): RecoveryState => ({
      ...state,
      claimId: undefined,
      checkpoint: undefined,
      successfulResumes:
        state.successfulResumes +
        (action.payload.outcome === 'success' ? 1 : 0),
      required:
        action.payload.outcome !== 'success' &&
        action.payload.outcome !== 'retired',
      revision: state.revision + 1,
    }),
  ),
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
    internalActions.toolTurnSettled,
    (state, action) => ({
      ...state,
      revision: state.revision + 1,
      pendingBrowserRecovery:
        action.type === devActions.updateOptions.type &&
        Object.hasOwn(action.payload, 'threadId')
          ? undefined
          : state.pendingBrowserRecovery,
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
  on(internalActions.interruptThreadRetired, (state): RecoveryState => ({
    ...state,
    revision: state.revision + 1,
    pendingBrowserRecovery: undefined,
    claimId: undefined,
    checkpoint: undefined,
    required: false,
  })),
  on(apiActions.generateMessageEvent, (state, action) =>
    action.payload.type === 'RUN_STARTED'
      ? { ...state, revision: state.revision + 1 }
      : state,
  ),
);
