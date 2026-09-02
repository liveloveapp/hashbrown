import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  applyJsonPatch,
  cloneAndFreezeOptionalJsonValue,
  JsonValue,
} from '../utils';
import { createReducer, on } from '../utils/micro-ngrx';

/**
 * State synchronized between the application and its AG-UI agent.
 *
 * @internal
 */
export interface AgentStateState {
  readonly committed: JsonValue | undefined;
  readonly draft: JsonValue | undefined;
  readonly attemptActive: boolean;
  readonly stateWriteLocked: boolean;
  readonly protocolError: Error | undefined;
}

export const initialAgentState: AgentStateState = {
  committed: undefined,
  draft: undefined,
  attemptActive: false,
  stateWriteLocked: false,
  protocolError: undefined,
};

export const reducer = createReducer(
  initialAgentState,
  on(devActions.init, (_, action): AgentStateState => {
    const messages = action.payload.messages ?? [];
    const lastMessage = messages[messages.length - 1];

    return {
      committed: action.payload.state,
      draft: undefined,
      attemptActive: false,
      stateWriteLocked: lastMessage?.role === 'user',
      protocolError: undefined,
    };
  }),
  on(devActions.setState, (state, action): AgentStateState => {
    if (state.stateWriteLocked) {
      return state;
    }

    return {
      ...state,
      committed: action.payload.state,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): AgentStateState => {
    return {
      ...state,
      draft: state.committed,
      attemptActive: true,
      protocolError: undefined,
    };
  }),
  on(apiActions.generateMessageEvent, (state, action): AgentStateState => {
    if (!state.attemptActive) {
      return state;
    }

    switch (action.payload.type) {
      case EventType.STATE_SNAPSHOT:
        return replaceDraftWithSnapshot(state, action.payload.snapshot);
      case EventType.STATE_DELTA:
        return replaceDraftWithDelta(state, action.payload.delta);
      default:
        return state;
    }
  }),
  on(apiActions.generateMessageSuccess, (state): AgentStateState => {
    if (!state.attemptActive) {
      return {
        ...state,
        stateWriteLocked: false,
        protocolError: undefined,
      };
    }

    return {
      ...state,
      committed: state.draft,
      attemptActive: false,
      stateWriteLocked: false,
      protocolError: undefined,
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): AgentStateState => {
    if (!state.attemptActive) {
      return state;
    }

    return {
      ...state,
      draft: state.committed,
      attemptActive: false,
      protocolError: undefined,
    };
  }),
  on(
    devActions.sendMessage,
    devActions.setMessages,
    devActions.resendMessages,
    (state): AgentStateState => {
      return startLogicalGeneration(state);
    },
  ),
  on(internalActions.toolTurnSettled, (state, action): AgentStateState => {
    if (action.payload.continuation === 'continue') {
      return startLogicalGeneration(state);
    }

    return state;
  }),
  on(
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    (state): AgentStateState => {
      return settleLogicalGeneration(state);
    },
  ),
);

/** @internal */
export const ɵselectCommittedAgentState = (state: AgentStateState) =>
  state.committed;

/** @internal */
export const ɵselectVisibleAgentState = (state: AgentStateState) =>
  state.attemptActive ? state.draft : state.committed;

/** @internal */
export const ɵselectStateWriteLocked = (state: AgentStateState) =>
  state.stateWriteLocked;

/** @internal */
export const ɵselectProtocolError = (state: AgentStateState) =>
  state.protocolError;

function replaceDraftWithSnapshot(
  state: AgentStateState,
  snapshot: unknown,
): AgentStateState {
  try {
    return {
      ...state,
      draft: cloneAndFreezeOptionalJsonValue(snapshot),
      protocolError: undefined,
    };
  } catch (error) {
    return withProtocolError(state, error);
  }
}

function replaceDraftWithDelta(
  state: AgentStateState,
  delta: unknown,
): AgentStateState {
  if (!Array.isArray(delta)) {
    return withProtocolError(state, new Error('Invalid AG-UI state delta'));
  }

  try {
    return {
      ...state,
      draft: applyJsonPatch(
        state.draft,
        delta as Parameters<typeof applyJsonPatch>[1],
      ),
      protocolError: undefined,
    };
  } catch (error) {
    return withProtocolError(state, error);
  }
}

function withProtocolError(
  state: AgentStateState,
  error: unknown,
): AgentStateState {
  return {
    ...state,
    protocolError:
      error instanceof Error ? error : new Error('Invalid AG-UI state event'),
  };
}

function startLogicalGeneration(state: AgentStateState): AgentStateState {
  return {
    ...state,
    draft: state.attemptActive ? state.committed : state.draft,
    attemptActive: false,
    stateWriteLocked: true,
    protocolError: undefined,
  };
}

function settleLogicalGeneration(state: AgentStateState): AgentStateState {
  return {
    ...state,
    draft: state.attemptActive ? state.committed : state.draft,
    attemptActive: false,
    stateWriteLocked: false,
  };
}
