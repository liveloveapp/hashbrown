import { internalActions } from '../actions';
import { Chat } from '../models';
import { createReducer, on } from '../utils/micro-ngrx';

/** Ownership reserved for one immutable local tool-execution snapshot. @internal */
export interface ToolTurnOwnership {
  readonly toolTurnId: string;
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
  readonly runningToolCallIds: readonly string[];
}

/** Store-owned identities for the active logical generation and model attempt. @internal */
export interface GenerationOwnershipState {
  readonly generationId: string | undefined;
  readonly attemptId: string | undefined;
  readonly toolTurn: ToolTurnOwnership | undefined;
}

/** Initial generation ownership. @internal */
export const initialGenerationOwnershipState: GenerationOwnershipState =
  Object.freeze({
    generationId: undefined,
    attemptId: undefined,
    toolTurn: undefined,
  });

/** Reduces store-owned generation and attempt identities. @internal */
export const reducer = createReducer(
  initialGenerationOwnershipState,
  on(
    internalActions.logicalGenerationStarted,
    (_state, action): GenerationOwnershipState => ({
      generationId: action.payload.generationId,
      attemptId: undefined,
      toolTurn: undefined,
    }),
  ),
  on(
    internalActions.generationAttemptClaimed,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId
        ? {
            generationId: state.generationId,
            attemptId: action.payload.attemptId,
            toolTurn: state.toolTurn,
          }
        : state,
  ),
  on(
    internalActions.generationAttemptReleased,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId &&
      state.attemptId === action.payload.attemptId
        ? { ...state, attemptId: undefined }
        : state,
  ),
  on(
    internalActions.toolTurnReserved,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId
        ? {
            ...state,
            toolTurn: {
              toolTurnId: action.payload.toolTurnId,
              toolCalls: action.payload.toolCalls,
              runningToolCallIds: [],
            },
          }
        : state,
  ),
  on(
    internalActions.toolTurnStarted,
    (state, action): GenerationOwnershipState =>
      state.generationId === action.payload.generationId &&
      state.toolTurn?.toolTurnId === action.payload.toolTurnId
        ? {
            ...state,
            toolTurn: {
              ...state.toolTurn,
              runningToolCallIds: state.toolTurn.toolCalls.map(
                (toolCall) => toolCall.id,
              ),
            },
          }
        : state,
  ),
  on(
    internalActions.toolTurnSettled,
    (state, action): GenerationOwnershipState =>
      action.payload.generationId !== undefined &&
      action.payload.toolTurnId !== undefined &&
      state.generationId === action.payload.generationId &&
      state.toolTurn?.toolTurnId === action.payload.toolTurnId
        ? { ...state, toolTurn: undefined }
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

/** Selects IDs for tool calls whose handlers have actually started. @internal */
export const ɵselectRunningToolCallIds = (state: GenerationOwnershipState) =>
  state.toolTurn?.runningToolCallIds ?? [];

/** Selects the currently reserved tool-turn ownership. @internal */
export const ɵselectToolTurnOwnership = (state: GenerationOwnershipState) =>
  state.toolTurn;
