import { internalActions } from '../actions';
import { createReducer, on } from '../utils/micro-ngrx';

/** Store-owned identities for the active logical generation and model attempt. @internal */
export interface GenerationOwnershipState {
  readonly generationId: string | undefined;
  readonly attemptId: string | undefined;
}

/** Initial generation ownership. @internal */
export const initialGenerationOwnershipState: GenerationOwnershipState =
  Object.freeze({
    generationId: undefined,
    attemptId: undefined,
  });

/** Reduces store-owned generation and attempt identities. @internal */
export const reducer = createReducer(
  initialGenerationOwnershipState,
  on(
    internalActions.logicalGenerationStarted,
    (_state, action): GenerationOwnershipState => ({
      generationId: action.payload.generationId,
      attemptId: undefined,
    }),
  ),
  on(
    internalActions.generationAttemptClaimed,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId
        ? {
            generationId: state.generationId,
            attemptId: action.payload.attemptId,
          }
        : state,
  ),
  on(
    internalActions.generationAttemptReleased,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId &&
      state.attemptId === action.payload.attemptId
        ? { generationId: state.generationId, attemptId: undefined }
        : state,
  ),
  on(
    internalActions.logicalGenerationSettled,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId
        ? initialGenerationOwnershipState
        : state,
  ),
);

/** Selects the active logical generation identity. @internal */
export const ɵselectGenerationId = (state: GenerationOwnershipState) =>
  state.generationId;

/** Selects the active model-attempt identity. @internal */
export const ɵselectAttemptId = (state: GenerationOwnershipState) =>
  state.attemptId;
