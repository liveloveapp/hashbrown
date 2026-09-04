import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { createReducer, EntityState, on, select } from '../utils/micro-ngrx';
import {
  projectAgUiMessages,
  type ɵAgUiCanonicalIdIndex,
  type ɵAgUiMessageProjectionCache,
  ɵappendAgUiCanonicalIds,
  ɵindexAgUiCanonicalIds,
  ɵownValidatedAgUiMessages,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { ɵreadAgUiMessageEventDecision } from './ag-ui-messages.reducer';

export interface ToolCallsState extends EntityState<Chat.Internal.ToolCall> {
  readonly committed: EntityState<Chat.Internal.ToolCall>;
  readonly draft: EntityState<Chat.Internal.ToolCall>;
  readonly attemptActive: boolean;
  readonly activeToolCallId: string | undefined;
  readonly activeToolCallName: string | undefined;
  readonly canonicalIds: ɵAgUiCanonicalIdIndex;
  readonly committedCanonicalIds: ɵAgUiCanonicalIdIndex;
  readonly preparedProjection?: boolean;
  readonly localProvenance?: Readonly<Record<string, LocalToolCallProvenance>>;
  readonly committedLocalProvenance?: Readonly<
    Record<string, LocalToolCallProvenance>
  >;
}

interface LocalToolCallProvenance {
  readonly source?: ɵAgUiMessageProjectionCache['toolCallSources'][string];
}

const empty: EntityState<Chat.Internal.ToolCall> = { ids: [], entities: {} };
const initialState: ToolCallsState = {
  ...empty,
  committed: empty,
  draft: empty,
  attemptActive: false,
  activeToolCallId: undefined,
  activeToolCallName: undefined,
  canonicalIds: ɵindexAgUiCanonicalIds([]),
  committedCanonicalIds: ɵindexAgUiCanonicalIds([]),
  preparedProjection: false,
  localProvenance: {},
  committedLocalProvenance: {},
};

function mergeMetadata(
  first: Chat.Internal.ToolCall['metadata'],
  second: Record<string, unknown> | undefined,
): Chat.Internal.ToolCall['metadata'] | undefined {
  if (second === undefined) return first;
  const merged = {
    ...(first === undefined ? {} : structuredClone(first)),
    ...structuredClone(second),
  };
  return sameMetadata(first, merged) ? first : merged;
}

function sameMetadata(
  first: Record<string, unknown> | undefined,
  second: Record<string, unknown>,
): boolean {
  if (first === undefined) return false;
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key) =>
        Object.hasOwn(second, key) &&
        JSON.stringify(first[key]) === JSON.stringify(second[key]),
    )
  );
}

export const reducer = createReducer(
  initialState,
  on(devActions.init, (state, action) => {
    const toolCalls =
      action.payload.localProjection?.toolCalls ??
      projectAgUiMessages(action.payload.canonicalMessages, {}).toolCalls;
    const committed = toEntityState(toolCalls);
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
      committedCanonicalIds: ɵindexAgUiCanonicalIds(
        action.payload.canonicalMessages,
      ),
      preparedProjection: false,
      localProvenance: createLocalProvenance(action.payload.localProjection),
      committedLocalProvenance: createLocalProvenance(
        action.payload.localProjection,
      ),
    };
  }),
  on(internalActions.generationAttemptStarted, (state): ToolCallsState => ({
    ...state.committed,
    committed: state.committed,
    draft: state.committed,
    attemptActive: true,
    activeToolCallId: undefined,
    activeToolCallName: undefined,
    canonicalIds: state.committedCanonicalIds,
    committedCanonicalIds: state.committedCanonicalIds,
    preparedProjection: false,
    localProvenance: state.committedLocalProvenance,
    committedLocalProvenance: state.committedLocalProvenance,
  })),
  on(apiActions.generateMessageEvent, (state, action): ToolCallsState => {
    const decision = ɵreadAgUiMessageEventDecision(action);
    if (decision && decision.kind !== 'accepted') return state;
    const preparedProjection = readPreparedProjection(action);
    action = decision
      ? ({ ...action, payload: decision.event } as typeof action)
      : action;
    if (!state.attemptActive) return state;
    if (decision && preparedProjection) {
      const reconciled = reconcilePreparedEntities(
        state.draft,
        preparedProjection.projection.toolCalls,
        preparedProjection.toolCallSources,
        state.localProvenance ?? {},
        action.payload,
      );
      const draft = reconciled.draft;
      if (
        draft === state.draft &&
        reconciled.localProvenance === state.localProvenance &&
        state.activeToolCallId === decision.state.activeToolCallId &&
        state.activeToolCallName === decision.state.activeToolCallName &&
        state.canonicalIds === preparedProjection.canonicalIds &&
        state.preparedProjection
      ) {
        return state;
      }
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: decision.state.activeToolCallId,
        activeToolCallName: decision.state.activeToolCallName,
        canonicalIds: preparedProjection.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
        preparedProjection: true,
        localProvenance: reconciled.localProvenance,
        committedLocalProvenance: state.committedLocalProvenance,
      };
    }
    if (action.payload.type === EventType.MESSAGES_SNAPSHOT) {
      const draft = projectRemoteSnapshot(action.payload);
      if (!draft) return state;
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
        localProvenance: state.localProvenance,
        committedLocalProvenance: state.committedLocalProvenance,
      };
    }
    if (action.payload.type === EventType.TOOL_CALL_START) {
      const existing = state.draft.entities[action.payload.toolCallId];
      const metadata = mergeMetadata(
        existing?.metadata,
        action.payload.metadata,
      );
      if (
        existing &&
        metadata === existing.metadata &&
        state.activeToolCallId === action.payload.toolCallId &&
        state.activeToolCallName === action.payload.toolCallName
      ) {
        return state;
      }
      const draft = existing
        ? metadata === existing.metadata
          ? state.draft
          : updateEntity(state.draft, action.payload.toolCallId, { metadata })
        : addEntities(state.draft, [
            {
              id: action.payload.toolCallId,
              name: action.payload.toolCallName,
              arguments: '',
              status: 'pending',
              ...(metadata === undefined ? {} : { metadata }),
            },
          ]);
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: action.payload.toolCallId,
        activeToolCallName: action.payload.toolCallName,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
        localProvenance: state.localProvenance,
        committedLocalProvenance: state.committedLocalProvenance,
      };
    }
    if (
      action.payload.type === EventType.TOOL_CALL_ARGS ||
      action.payload.type === EventType.TOOL_CALL_END ||
      action.payload.type === EventType.TOOL_CALL_CHUNK
    ) {
      const event = action.payload;
      const id = event.toolCallId ?? state.activeToolCallId;
      if (!id) return state;
      const existing = state.draft.entities[id];
      if (
        !existing &&
        (event.type !== EventType.TOOL_CALL_CHUNK || !event.toolCallName)
      ) {
        return state;
      }
      if (
        existing &&
        event.type === EventType.TOOL_CALL_CHUNK &&
        event.toolCallName !== undefined &&
        event.toolCallName !== existing.name
      ) {
        return state;
      }
      const delta = 'delta' in event ? ((event.delta ?? '') as string) : '';
      const toolCallName =
        (event as { readonly toolCallName?: string }).toolCallName ??
        state.activeToolCallName;
      const metadata = mergeMetadata(existing?.metadata, event.metadata);
      const ending = event.type === EventType.TOOL_CALL_END;
      const activeToolCallId = ending ? undefined : id;
      const activeToolCallName = ending ? undefined : toolCallName;
      if (
        existing &&
        delta.length === 0 &&
        metadata === existing.metadata &&
        state.activeToolCallId === activeToolCallId &&
        state.activeToolCallName === activeToolCallName
      ) {
        return state;
      }
      const draft = existing
        ? updateEntity(state.draft, id, {
            arguments: `${existing.arguments}${delta}`,
            ...(metadata === undefined ? {} : { metadata }),
          })
        : toolCallName
          ? addEntities(state.draft, [
              {
                id,
                name: toolCallName,
                arguments: delta,
                status: 'pending',
                ...(metadata === undefined ? {} : { metadata }),
              },
            ])
          : state.draft;
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId,
        activeToolCallName,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
      };
    }
    if (
      action.payload.type === EventType.REASONING_ENCRYPTED_VALUE &&
      action.payload.subtype === 'tool-call'
    ) {
      const existing = state.draft.entities[action.payload.entityId];
      if (
        !existing ||
        existing.encryptedValue === action.payload.encryptedValue
      ) {
        return state;
      }
      const draft = updateEntity(state.draft, action.payload.entityId, {
        encryptedValue: action.payload.encryptedValue,
      });
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: state.activeToolCallId,
        activeToolCallName: state.activeToolCallName,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
      };
    }
    if (action.payload.type === EventType.TOOL_CALL_RESULT) {
      const existing = state.entities[action.payload.toolCallId];
      if (!existing) return state;
      const error = (
        action.payload as typeof action.payload & { readonly error?: string }
      ).error;
      const result: PromiseSettledResult<unknown> =
        error === undefined
          ? { status: 'fulfilled', value: action.payload.content }
          : { status: 'rejected', reason: error };
      const metadata = mergeMetadata(
        existing.metadata,
        action.payload.metadata,
      );
      const draft = updateEntity(state.draft, action.payload.toolCallId, {
        status: 'done',
        result,
        ...(metadata === undefined ? {} : { metadata }),
      });
      return {
        ...draft,
        committed: state.committed,
        draft,
        attemptActive: true,
        activeToolCallId: state.activeToolCallId,
        activeToolCallName: state.activeToolCallName,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
      };
    }
    return state;
  }),
  on(apiActions.generateMessageSuccess, (state, action): ToolCallsState => {
    if (state.attemptActive) {
      const committed = state.preparedProjection
        ? state.draft
        : mergeSuccessToolCalls(state.draft, action.payload.toolCalls);
      return {
        ...committed,
        committed,
        draft: empty,
        attemptActive: false,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.canonicalIds,
        committedCanonicalIds: state.canonicalIds,
        preparedProjection: state.preparedProjection,
        localProvenance: state.localProvenance,
        committedLocalProvenance: state.localProvenance,
      };
    }
    const committed = addEntities(state.committed, action.payload.toolCalls);
    return {
      ...committed,
      committed,
      draft: state.draft,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: state.canonicalIds,
      committedCanonicalIds: state.committedCanonicalIds,
      localProvenance: state.localProvenance,
      committedLocalProvenance: state.localProvenance,
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): ToolCallsState =>
    rollback(state),
  ),
  on(
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    devActions.resendMessages,
    (state): ToolCallsState => rollback(state),
  ),
  on(devActions.sendMessage, (state, action): ToolCallsState => {
    if (action.payload.canonicalAppendCompatible === false) return state;
    let canonicalIds: ɵAgUiCanonicalIdIndex;
    try {
      canonicalIds = ɵappendAgUiCanonicalIds(
        state.attemptActive ? state.committedCanonicalIds : state.canonicalIds,
        ɵownValidatedAgUiMessages(action.payload.canonicalMessages),
      );
    } catch {
      return state;
    }
    const committed = addEntities(
      state.committed,
      action.payload.localProjection?.toolCalls ??
        projectAgUiMessages(action.payload.canonicalMessages, {}).toolCalls,
    );
    const localProvenance = {
      ...(state.committedLocalProvenance ?? {}),
      ...createLocalProvenance(action.payload.localProjection),
    };
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds,
      committedCanonicalIds: canonicalIds,
      localProvenance,
      committedLocalProvenance: localProvenance,
    };
  }),
  on(devActions.setMessages, (state, action): ToolCallsState => {
    const committed = toEntityState(
      action.payload.localProjection?.toolCalls ??
        projectAgUiMessages(
          action.payload.canonicalMessages,
          action.payload.toolsByName ?? {},
        ).toolCalls,
    );
    return {
      ...committed,
      committed,
      draft: empty,
      attemptActive: false,
      activeToolCallId: undefined,
      activeToolCallName: undefined,
      canonicalIds: ɵindexAgUiCanonicalIds(action.payload.canonicalMessages),
      committedCanonicalIds: ɵindexAgUiCanonicalIds(
        action.payload.canonicalMessages,
      ),
      localProvenance: createLocalProvenance(action.payload.localProjection),
      committedLocalProvenance: createLocalProvenance(
        action.payload.localProjection,
      ),
    };
  }),
  on(internalActions.toolTurnSettled, (state, action): ToolCallsState => {
    const expected = new Map(
      action.payload.toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );
    const settled = action.payload.toolMessages.reduce(
      (current, toolMessage) => {
        const existing = current.entities.entities[toolMessage.toolCallId];
        return existing === expected.get(toolMessage.toolCallId)
          ? {
              entities: updateEntity(current.entities, toolMessage.toolCallId, {
                status: 'done',
                result: toolMessage.content,
              }),
              localProvenance: {
                ...current.localProvenance,
                [toolMessage.toolCallId]: {},
              },
            }
          : current;
      },
      {
        entities: state.attemptActive ? state.draft : state.committed,
        localProvenance: state.attemptActive
          ? (state.localProvenance ?? {})
          : (state.committedLocalProvenance ?? {}),
      },
    );
    return state.attemptActive
      ? {
          ...settled.entities,
          committed: state.committed,
          draft: settled.entities,
          attemptActive: true,
          activeToolCallId: state.activeToolCallId,
          activeToolCallName: state.activeToolCallName,
          canonicalIds: state.canonicalIds,
          committedCanonicalIds: state.committedCanonicalIds,
          localProvenance: settled.localProvenance,
          committedLocalProvenance: state.committedLocalProvenance,
        }
      : {
          ...settled.entities,
          committed: settled.entities,
          draft: state.draft,
          attemptActive: false,
          activeToolCallId: undefined,
          activeToolCallName: undefined,
          canonicalIds: state.canonicalIds,
          committedCanonicalIds: state.committedCanonicalIds,
          localProvenance: settled.localProvenance,
          committedLocalProvenance: settled.localProvenance,
        };
  }),
);

export const selectToolCallIds = (state: ToolCallsState) => state.ids;
export const selectToolCallEntities = (state: ToolCallsState) => state.entities;
export const selectToolCalls = select(
  selectToolCallIds,
  selectToolCallEntities,
  (ids, entities) => ids.map((id) => entities[id]),
);
export const selectPendingToolCalls = select(selectToolCalls, (toolCalls) =>
  toolCalls.filter((toolCall) => toolCall.status === 'pending'),
);

function rollback(state: ToolCallsState): ToolCallsState {
  return state.attemptActive
    ? {
        ...state.committed,
        committed: state.committed,
        draft: state.committed,
        attemptActive: false,
        activeToolCallId: undefined,
        activeToolCallName: undefined,
        canonicalIds: state.committedCanonicalIds,
        committedCanonicalIds: state.committedCanonicalIds,
        localProvenance: state.committedLocalProvenance,
        committedLocalProvenance: state.committedLocalProvenance,
      }
    : state;
}

function toEntityState(
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce(
    (state, toolCall) => ({
      ids: [...state.ids, toolCall.id],
      entities: { ...state.entities, [toolCall.id]: toolCall },
    }),
    empty,
  );
}

function reconcileEntities(
  previous: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  const ids = toolCalls.map((toolCall) => toolCall.id);
  const unchanged =
    ids.length === previous.ids.length &&
    ids.every(
      (id, index) =>
        id === previous.ids[index] &&
        previous.entities[id] === toolCalls[index],
    );
  if (unchanged) return previous;

  return {
    ids,
    entities: Object.fromEntries(
      toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    ),
  };
}

function createLocalProvenance(
  localProjection:
    | {
        readonly toolCalls: readonly Chat.Internal.ToolCall[];
      }
    | undefined,
): Readonly<Record<string, LocalToolCallProvenance>> {
  if (!localProjection) return {};

  return localProjection.toolCalls.reduce<
    Record<string, LocalToolCallProvenance>
  >((provenance, toolCall) => {
    if (
      toolCall.argumentsResolved === undefined &&
      toolCall.result === undefined
    ) {
      return provenance;
    }
    return { ...provenance, [toolCall.id]: {} };
  }, {});
}

function reconcilePreparedEntities(
  previous: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
  sources: ɵAgUiMessageProjectionCache['toolCallSources'],
  provenance: Readonly<Record<string, LocalToolCallProvenance>>,
  event: import('@ag-ui/core').AGUIEvent,
): {
  readonly draft: EntityState<Chat.Internal.ToolCall>;
  readonly localProvenance: Readonly<Record<string, LocalToolCallProvenance>>;
} {
  let provenanceChanged = false;
  const nextProvenance: Record<string, LocalToolCallProvenance> = {};
  const reconciled = toolCalls.map((toolCall) => {
    const local = provenance[toolCall.id];
    const source = sources[toolCall.id];
    const existing = previous.entities[toolCall.id];
    const valid =
      local !== undefined &&
      existing !== undefined &&
      !eventSupersedesToolCall(event, toolCall.id) &&
      (local.source === undefined || sameToolCallSource(local.source, source));
    if (!valid) {
      if (local !== undefined) provenanceChanged = true;
      return toolCall;
    }

    const next = { source };
    nextProvenance[toolCall.id] = next;
    if (local.source !== source) provenanceChanged = true;
    const metadata = mergeMetadata(existing.metadata, toolCall.metadata);
    return metadata === existing.metadata
      ? existing
      : { ...existing, metadata };
  });
  if (Object.keys(provenance).length !== Object.keys(nextProvenance).length) {
    provenanceChanged = true;
  }

  return {
    draft: reconcileEntities(previous, reconciled),
    localProvenance: provenanceChanged ? nextProvenance : provenance,
  };
}

function sameToolCallSource(
  first: LocalToolCallProvenance['source'],
  second: LocalToolCallProvenance['source'],
): boolean {
  return (
    first?.toolCall.id === second?.toolCall.id &&
    first?.toolCall.function.name === second?.toolCall.function.name &&
    first?.toolCall.function.arguments ===
      second?.toolCall.function.arguments &&
    first?.result === second?.result
  );
}

function eventSupersedesToolCall(
  event: import('@ag-ui/core').AGUIEvent,
  toolCallId: string,
): boolean {
  if (event.type === EventType.MESSAGES_SNAPSHOT) return true;
  if (event.type === EventType.TOOL_CALL_RESULT) {
    return event.toolCallId === toolCallId;
  }
  if (event.type === EventType.TOOL_CALL_START) {
    return false;
  }
  if (
    event.type === EventType.TOOL_CALL_ARGS ||
    event.type === EventType.TOOL_CALL_END ||
    event.type === EventType.TOOL_CALL_CHUNK
  ) {
    return (
      event.toolCallId === toolCallId &&
      ('delta' in event && typeof event.delta === 'string' ? event.delta : '')
        .length > 0
    );
  }
  return (
    event.type === EventType.REASONING_ENCRYPTED_VALUE &&
    event.subtype === 'tool-call' &&
    event.entityId === toolCallId
  );
}

function readPreparedProjection(
  action: unknown,
): ɵAgUiMessageProjectionCache | undefined {
  return (
    action as { readonly ɵagUiMessageProjection?: ɵAgUiMessageProjectionCache }
  ).ɵagUiMessageProjection;
}

function projectRemoteSnapshot(
  event: Extract<
    import('@ag-ui/core').AGUIEvent,
    { type: EventType.MESSAGES_SNAPSHOT }
  >,
): EntityState<Chat.Internal.ToolCall> | undefined {
  try {
    return toEntityState(
      projectAgUiMessages(ɵreadAgUiMessageSnapshot(event), {}).toolCalls,
    );
  } catch {
    return undefined;
  }
}

function addEntities(
  state: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce(
    (current, toolCall) =>
      current.entities[toolCall.id]
        ? current
        : {
            ids: [...current.ids, toolCall.id],
            entities: { ...current.entities, [toolCall.id]: toolCall },
          },
    state,
  );
}

function updateEntity(
  state: EntityState<Chat.Internal.ToolCall>,
  id: string,
  updates: Partial<Chat.Internal.ToolCall>,
): EntityState<Chat.Internal.ToolCall> {
  const existing = state.entities[id];
  return existing
    ? {
        ...state,
        entities: { ...state.entities, [id]: { ...existing, ...updates } },
      }
    : state;
}

function mergeSuccessToolCalls(
  draft: EntityState<Chat.Internal.ToolCall>,
  toolCalls: readonly Chat.Internal.ToolCall[],
): EntityState<Chat.Internal.ToolCall> {
  return toolCalls.reduce((current, toolCall) => {
    const existing = current.entities[toolCall.id];
    if (!existing) {
      return current;
    }

    const merged: Chat.Internal.ToolCall = {
      ...existing,
      ...toolCall,
      name: existing.name,
      arguments:
        existing.arguments.length > 0 ? existing.arguments : toolCall.arguments,
      status: existing.status,
      ...(existing.result === undefined ? {} : { result: existing.result }),
    };
    return {
      ...current,
      entities: { ...current.entities, [toolCall.id]: merged },
    };
  }, draft);
}
