/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat } from '../models';
import { apiActions } from '../actions';
import { Prettify } from '../utils/types';
import { select } from '../utils/micro-ngrx';
import * as fromAgentState from './agent-state.reducer';
import * as fromAgUiMessages from './ag-ui-messages.reducer';
import * as fromConfig from './config.reducer';
import * as fromMessages from './messages.reducer';
import * as fromStatus from './status.reducer';
import * as fromStreamingMessage from './streaming-message.reducer';
import * as fromToolCalls from './tool-calls.reducer';
import * as fromTools from './tools.reducer';
import * as fromThread from './thread.reducer';
import { ɵreconcileAgUiMessageProjection } from './ag-ui-message-history';

export const reducers = {
  agentState: fromAgentState.reducer,
  agUiMessages: fromAgUiMessages.reducer,
  config: fromConfig.reducer,
  messages: fromMessages.reducer,
  status: fromStatus.reducer,
  streamingMessage: fromStreamingMessage.reducer,
  toolCalls: fromToolCalls.reducer,
  tools: fromTools.reducer,
  thread: fromThread.reducer,
};

/**
 * Shared agent state
 */
export const ɵselectAgentStateState = (state: State) => state.agentState;

/**
 * Selects the last state committed by the agent.
 *
 * @internal
 */
export const ɵselectCommittedAgentState = select(
  ɵselectAgentStateState,
  fromAgentState.ɵselectCommittedAgentState,
);

/**
 * Selects speculative state while an agent attempt is active.
 *
 * @internal
 */
export const ɵselectVisibleAgentState = select(
  ɵselectAgentStateState,
  fromAgentState.ɵselectVisibleAgentState,
);

/**
 * Selects whether local state writes are currently locked.
 *
 * @internal
 */
export const ɵselectStateWriteLocked = select(
  ɵselectAgentStateState,
  fromAgentState.ɵselectStateWriteLocked,
);

/**
 * Selects the most recent AG-UI state protocol error.
 *
 * @internal
 */
export const ɵselectAgentStateProtocolError = select(
  ɵselectAgentStateState,
  fromAgentState.ɵselectProtocolError,
);

/** The complete internal root reducer state. @internal */
export type State = Prettify<{
  [P in keyof typeof reducers]: ReturnType<(typeof reducers)[P]>;
}>;

/**
 * Computes canonical AG-UI acceptance before a transport event fans out to
 * derived reducer slices.
 *
 * @internal
 */
export function ɵprepareRootAction(
  state: State,
  action: { readonly type: string; readonly payload?: unknown },
) {
  if (action.type !== apiActions.generateMessageEvent.type) {
    return action;
  }
  const decision = fromAgUiMessages.ɵdecideAgUiMessageEvent(
    state.agUiMessages,
    action.payload as Parameters<
      typeof fromAgUiMessages.ɵdecideAgUiMessageEvent
    >[1],
  );
  if (decision.kind !== 'accepted') {
    return { ...action, ɵagUiMessageEventDecision: decision };
  }
  const previousProjection =
    state.messages.preparedProjection?.canonicalMessages ===
    decision.priorState.draft
      ? state.messages.preparedProjection
      : undefined;
  const projection = ɵreconcileAgUiMessageProjection(
    previousProjection,
    decision.state.draft,
    state.tools.entities,
    state.config.responseSchema,
  );
  return {
    ...action,
    ɵagUiMessageEventDecision: decision,
    ɵagUiMessageProjection: projection,
  };
}

/** Selects the canonical AG-UI message state. @internal */
export const ɵselectAgUiMessagesState = (state: State) => state.agUiMessages;

/** Selects committed canonical AG-UI history. @internal */
export const ɵselectCommittedAgUiMessages = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectCommittedAgUiMessages,
);

/** Selects visible draft-or-committed canonical AG-UI history. @internal */
export const ɵselectVisibleAgUiMessages = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectVisibleAgUiMessages,
);

/** Selects visible canonical history with the configured system overlay. @internal */
export const ɵselectEffectiveVisibleAgUiMessages = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectEffectiveVisibleAgUiMessages,
);

/** Selects committed canonical request history with the configured system overlay. @internal */
export const ɵselectEffectiveCommittedAgUiMessages = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectEffectiveCommittedAgUiMessages,
);

/** Selects immutable tool IDs present at the start of the active attempt. @internal */
export const ɵselectAttemptStartToolCallIds = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectAttemptStartToolCallIds,
);

/** Selects canonical AG-UI message protocol errors. @internal */
export const ɵselectAgUiMessagesProtocolError = select(
  ɵselectAgUiMessagesState,
  fromAgUiMessages.ɵselectAgUiMessagesProtocolError,
);

/**
 * Messages
 */
export const selectMessagesState = (state: State) => state.messages;
export const selectMessages = select(
  selectMessagesState,
  fromMessages.selectMessages,
);

/**
 * Status
 */
export const selectStatusState = (state: State) => state.status;
export const selectIsReceiving = select(
  selectStatusState,
  fromStatus.selectIsReceiving,
);
export const selectIsSending = select(
  selectStatusState,
  fromStatus.selectIsSending,
);
export const selectIsGenerating = select(
  selectStatusState,
  fromStatus.selectIsGenerating,
);
export const selectSendingError = select(
  selectStatusState,
  fromStatus.selectSendingError,
);
export const selectGeneratingError = select(
  selectStatusState,
  fromStatus.selectGeneratingError,
);
export const selectError = select(selectStatusState, fromStatus.selectError);

export const selectExhaustedRetries = select(
  selectStatusState,
  fromStatus.selectExhaustedRetries,
);

/**
 * Streaming Message
 */
export const selectStreamingMessageState = (state: State) =>
  state.streamingMessage;
export const selectRawStreamingMessage = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectRawStreamingMessage,
);
export const selectRawStreamingToolCalls = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectRawStreamingToolCalls,
);
export const selectStreamingMessageError = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingMessageError,
);
export const selectStreamingMessage = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingMessage,
);
export const selectStreamingToolCallEntities = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingToolCallEntities,
);

/**
 * Tools
 */
export const selectToolsState = (state: State) => state.tools;
export const selectTools = select(selectToolsState, fromTools.selectTools);
export const selectToolEntities = select(
  selectToolsState,
  fromTools.selectToolEntities,
);

/**
 * Tool Calls
 */
export const selectToolCallsState = (state: State) => state.toolCalls;
export const selectToolCalls = select(
  selectToolCallsState,
  fromToolCalls.selectToolCalls,
);
export const selectToolCallEntities = select(
  selectToolCallsState,
  fromToolCalls.selectToolCallEntities,
);
export const selectPendingToolCalls = select(
  selectToolCallsState,
  fromToolCalls.selectPendingToolCalls,
);

/**
 * Thread
 */
export const selectThreadState = (state: State) => state.thread;
export const selectThreadIdState = select(
  selectThreadState,
  fromThread.selectThreadId,
);

/**
 * Config
 */
export const selectConfigState = (state: State) => state.config;
export const selectSystem = select(selectConfigState, fromConfig.selectSystem);
export const selectDebounce = select(
  selectConfigState,
  fromConfig.selectDebounce,
);
export const selectRetries = select(
  selectConfigState,
  fromConfig.selectRetries,
);
export const selectThreadId = select(
  selectThreadState,
  fromThread.selectThreadId,
);
export const selectResponseSchema = select(
  selectConfigState,
  fromConfig.selectResponseSchema,
);
export const selectTransport = select(
  selectConfigState,
  fromConfig.selectTransport,
);
export const selectUiRequested = select(
  selectConfigState,
  fromConfig.selectUiRequested,
);

/**
 * Top-level selectors
 */
const selectNonStreamingViewMessageEntries = select(
  selectMessages,
  selectToolCallEntities,
  selectTools,
  selectResponseSchema,
  (messages, toolCalls, tools, responseSchema) => {
    return messages.map((message) => ({
      id: 'id' in message ? message.id : undefined,
      messages: Chat.helpers.toViewMessagesFromInternal(
        message,
        toolCalls,
        tools,
        responseSchema,
      ),
    }));
  },
);

function mergeStreamingToolCallEntities(
  streamingToolCalls: Record<string, Chat.Internal.ToolCall>,
  canonicalToolCalls: Record<string, Chat.Internal.ToolCall>,
): Record<string, Chat.Internal.ToolCall> {
  return Object.entries(canonicalToolCalls).reduce(
    (merged, [toolCallId, canonicalToolCall]) => {
      const streamingToolCall = streamingToolCalls[toolCallId];
      const argumentsResolved =
        canonicalToolCall.status === 'pending' &&
        streamingToolCall?.status === 'pending' &&
        streamingToolCall.name === canonicalToolCall.name &&
        streamingToolCall.arguments === canonicalToolCall.arguments
          ? streamingToolCall.argumentsResolved
          : undefined;

      return {
        ...merged,
        [toolCallId]:
          argumentsResolved === undefined
            ? canonicalToolCall
            : { ...canonicalToolCall, argumentsResolved },
      };
    },
    streamingToolCalls,
  );
}

const selectStreamingViewMessageEntries = select(
  selectStreamingMessage,
  selectStreamingToolCallEntities,
  selectToolCallEntities,
  selectTools,
  selectResponseSchema,
  (
    streamingMessage,
    streamingToolCalls,
    canonicalToolCalls,
    tools,
    responseSchema,
  ) => {
    return (streamingMessage ? [streamingMessage] : []).map((message) => ({
      id: message.id,
      messages: Chat.helpers.toViewMessagesFromInternal(
        message,
        mergeStreamingToolCallEntities(streamingToolCalls, canonicalToolCalls),
        tools,
        responseSchema,
      ),
    }));
  },
);

export const selectViewMessages = select(
  selectNonStreamingViewMessageEntries,
  selectStreamingViewMessageEntries,
  (nonStreamingEntries, streamingEntries) => {
    const streamingById = new Map(
      streamingEntries.map((entry) => [entry.id, entry.messages]),
    );
    const nonStreamingMessages = nonStreamingEntries.flatMap((entry) =>
      entry.id && streamingById.has(entry.id)
        ? (streamingById.get(entry.id) ?? entry.messages)
        : entry.messages,
    );
    const streamedIds = new Set(nonStreamingEntries.map((entry) => entry.id));
    const appended = streamingEntries.flatMap((entry) =>
      streamedIds.has(entry.id) ? [] : entry.messages,
    );
    return [...nonStreamingMessages, ...appended];
  },
);

export const selectLastAssistantMessage = select(
  selectViewMessages,
  (messages): Chat.AssistantMessage<any, any> | undefined => {
    return messages.findLast((message) => message.role === 'assistant');
  },
);

export const selectApiMessages = select(
  selectMessages,
  selectToolCalls,
  (messages, toolCalls): Chat.Api.Message[] => {
    return messages.flatMap((message): Chat.Api.Message[] =>
      Chat.helpers.toApiMessagesFromInternal(message, toolCalls),
    );
  },
);

export const selectShouldGenerateMessage = select(
  selectApiMessages,
  (messages) => {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      return false;
    }

    return lastMessage.role === 'user' || lastMessage.role === 'tool';
  },
);

export const selectApiTools = select(selectTools, (tools) =>
  Chat.helpers.toApiToolsFromInternal(tools),
);

export const selectUnifiedError = select(
  selectSendingError,
  selectGeneratingError,
  selectError,
  (sendingError, generatingError, statusError) =>
    sendingError ?? generatingError ?? statusError,
);

export const selectIsRunningToolCalls = select(
  selectPendingToolCalls,
  selectIsGenerating,
  selectUnifiedError,
  (pendingToolCalls, isGenerating, error) =>
    pendingToolCalls.length > 0 && !isGenerating && !error,
);

export const selectIsLoading = select(
  selectIsSending,
  selectIsGenerating,
  selectIsReceiving,
  selectIsRunningToolCalls,
  (isSending, isGenerating, isReceiving, isRunningToolCalls) =>
    isSending || isGenerating || isReceiving || isRunningToolCalls,
);
