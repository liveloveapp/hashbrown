import { devActions, internalActions } from '../actions';
import type { PendingInterruptBatch } from '../models/interrupt';
import { createReducer, on } from '../utils/micro-ngrx';

/** Runtime-owned interrupt lifecycle; identities reject stale settlements. @internal */
export interface InterruptsState {
  readonly activeGenerationId: string | undefined;
  readonly attemptId: string | undefined;
  readonly pending: PendingInterruptBatch | undefined;
  readonly claimId: string | undefined;
  readonly generationId: string | undefined;
  readonly acknowledged: boolean;
  readonly recoveryRequired: boolean;
  readonly epoch: number;
  readonly successfulResumes: number;
}

/** Empty interrupt lifecycle. @internal */
export const initialInterruptsState: InterruptsState = {
  activeGenerationId: undefined,
  attemptId: undefined,
  pending: undefined,
  claimId: undefined,
  generationId: undefined,
  acknowledged: false,
  recoveryRequired: false,
  epoch: 0,
  successfulResumes: 0,
};

/** Pure interrupt ownership transitions. @internal */
export const reducer = createReducer(
  initialInterruptsState,
  on(
    internalActions.logicalGenerationStarted,
    (state, action): InterruptsState => ({
      ...state,
      activeGenerationId: action.payload.generationId,
      attemptId: undefined,
      ...(state.generationId &&
      state.generationId !== action.payload.generationId
        ? { generationId: undefined, claimId: undefined, acknowledged: false }
        : {}),
    }),
  ),
  on(
    internalActions.logicalGenerationSettled,
    (state, action): InterruptsState =>
      state.activeGenerationId === action.payload.generationId
        ? { ...state, activeGenerationId: undefined, attemptId: undefined }
        : state,
  ),
  on(
    internalActions.generationAttemptClaimed,
    (state, action): InterruptsState =>
      state.activeGenerationId === action.payload.generationId
        ? { ...state, attemptId: action.payload.attemptId }
        : state,
  ),
  on(
    internalActions.generationAttemptReleased,
    (state, action): InterruptsState =>
      state.activeGenerationId === action.payload.generationId &&
      state.attemptId === action.payload.attemptId
        ? { ...state, attemptId: undefined }
        : state,
  ),
  on(internalActions.interruptsPublished, (state, action): InterruptsState =>
    state.activeGenerationId === action.payload.generationId &&
    state.attemptId === action.payload.attemptId
      ? {
          ...state,
          pending: action.payload.batch,
          claimId: undefined,
          generationId: undefined,
          acknowledged: false,
        }
      : state,
  ),
  on(devActions.resume, (state, action): InterruptsState =>
    state.pending?.id === action.payload.batch.id &&
    !state.claimId &&
    !state.recoveryRequired
      ? {
          ...state,
          claimId: action.payload.claimId,
          generationId: action.payload.claimId,
          acknowledged: false,
        }
      : state,
  ),
  on(internalActions.resumeAcknowledged, (state, action): InterruptsState =>
    state.generationId === action.payload.generationId &&
    state.claimId === action.payload.claimId
      ? { ...state, pending: undefined, claimId: undefined, acknowledged: true }
      : state,
  ),
  on(internalActions.resumeSettled, (state, action): InterruptsState =>
    state.generationId === action.payload.generationId
      ? {
          ...state,
          claimId: undefined,
          generationId: undefined,
          acknowledged: false,
          recoveryRequired:
            state.acknowledged &&
            (action.payload.outcome === 'failed' ||
              action.payload.outcome === 'cancelled'),
          successfulResumes:
            state.successfulResumes +
            (action.payload.outcome === 'success' ? 1 : 0),
        }
      : state,
  ),
  on(internalActions.interruptThreadRetired, (state): InterruptsState => ({
    ...initialInterruptsState,
    epoch: state.epoch + 1,
    successfulResumes: state.successfulResumes,
  })),
);
