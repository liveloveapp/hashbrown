import {
  type AGUIEvent,
  EventType,
  mergeMetadata,
  type Metadata,
  type ReasoningEncryptedValueEvent,
  type ReasoningMessage,
  type ReasoningMessageContentEvent,
  type ReasoningMessageEndEvent,
  type ReasoningMessageStartEvent,
} from '@ag-ui/core';
import {
  create,
  finish,
  push,
  resolve,
  type StreamState,
} from '@cacheplane/partial-json';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { JsonValue } from '../utils';
import { createReducer, on, select } from '../utils/micro-ngrx';

type ParserMap = Record<string, StreamState>;
type CacheMap = Record<string, s.FromJsonAstCache>;

export interface StreamingMessageState {
  message: Chat.Internal.AssistantMessage | null;
  messageId?: string;
  activeToolCallId?: string;
  toolCalls: Chat.Internal.ToolCall[];
  outputParserState?: StreamState;
  outputCache?: s.FromJsonAstCache;
  toolParserStateById: ParserMap;
  toolCacheById: CacheMap;
  finalizedToolCallIds: Record<string, true>;
  reasoningMessageStatusById: Record<string, 'active' | 'complete'>;
  configSnapshot?: {
    responseSchema?: s.HashbrownType;
    emulateStructuredOutput: boolean;
    toolsByName: Record<string, Chat.Internal.Tool>;
  };
  error?: Error;
}

export const initialState: StreamingMessageState = {
  message: null,
  messageId: undefined,
  activeToolCallId: undefined,
  toolCalls: [],
  outputParserState: undefined,
  outputCache: undefined,
  toolParserStateById: {},
  toolCacheById: {},
  finalizedToolCallIds: {},
  reasoningMessageStatusById: {},
  configSnapshot: undefined,
  error: undefined,
};

function ensureParserState(state: StreamState | undefined) {
  return state ?? create();
}

function isRecoverableTrailingToken(parserState: StreamState) {
  if (
    parserState.error?.message !== 'Unexpected token after root value' ||
    parserState.rootId === null
  ) {
    return false;
  }

  const rootNode = parserState.nodes[parserState.rootId];
  return Boolean(
    rootNode?.status === 'complete' && rootNode.value !== undefined,
  );
}

function getSchemaParserState(parserState: StreamState) {
  return isRecoverableTrailingToken(parserState)
    ? { ...parserState, error: null }
    : parserState;
}

function resolveSchemaValue(
  schema: s.HashbrownType,
  parserState: StreamState,
  cache: s.FromJsonAstCache | undefined,
) {
  const schemaParserState = getSchemaParserState(parserState);
  const output = s.fromJsonAst(schema, schemaParserState, cache);
  const value =
    output.result.state === 'match'
      ? (output.result.value as JsonValue)
      : undefined;
  const recoveredTrailingToken =
    value !== undefined && isRecoverableTrailingToken(parserState);
  const hasError =
    output.result.state === 'invalid' ||
    (Boolean(parserState.error) && !recoveredTrailingToken);
  return {
    cache: output.cache,
    value,
    hasError,
    recoveredTrailingToken,
  };
}

function resolveJsonValue(parserState: StreamState) {
  if (parserState.error || !parserState.complete) {
    return undefined;
  }

  return resolve(parserState);
}

function warnRecoveredTrailingToken(parsedData: JsonValue, extraData: string) {
  console.warn(
    'Hashbrown received extra data after a valid JSON value. The first value was used, but the extra data was ignored.',
    {
      parsedData,
      extraData,
      tips: [
        'Add examples of exactly one valid JSON object to your prompt.',
        'Ask the model not to emit multiple JSON values or split a response across JSON objects.',
        'If the response is too long, ask the model to summarize while keeping one valid JSON object.',
      ],
    },
  );
}

function warnRecoveredTrailingTokenFromSource(
  parserState: StreamState,
  parsedData: JsonValue,
  source: string,
) {
  const parserError = parserState.error;
  if (!parserError || !isRecoverableTrailingToken(parserState)) {
    return;
  }

  warnRecoveredTrailingToken(parsedData, source.slice(parserError.index));
}

function getToolCallMetadata(rawEvent: unknown) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    return undefined;
  }

  const hashbrown = (rawEvent as Record<string, unknown>)['hashbrown'];
  if (!hashbrown || typeof hashbrown !== 'object' || Array.isArray(hashbrown)) {
    return undefined;
  }

  const metadata = (hashbrown as Record<string, unknown>)['metadata'];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
}

function cloneMetadata(metadata: Metadata | undefined) {
  return metadata === undefined ? undefined : structuredClone(metadata);
}

function withStreamError(
  state: StreamingMessageState,
  message: string,
): StreamingMessageState {
  return {
    ...state,
    error: state.error ?? new Error(message),
  };
}

function getReasoningDetails(
  message: Chat.Internal.AssistantMessage | null,
): readonly Readonly<ReasoningMessage>[] {
  return message?.reasoning?.kind === 'details'
    ? message.reasoning.details
    : [];
}

function updateReasoningDetail(
  state: StreamingMessageState,
  messageId: string,
  update: (detail: Readonly<ReasoningMessage>) => ReasoningMessage,
): StreamingMessageState | undefined {
  const message = state.message;
  const details = getReasoningDetails(message);
  const detailIndex = details.findIndex((detail) => detail.id === messageId);
  if (!message || detailIndex === -1) {
    return undefined;
  }

  return {
    ...state,
    message: {
      ...message,
      reasoning: {
        kind: 'details',
        details: details.map((detail, index) =>
          index === detailIndex ? update(detail) : detail,
        ),
      },
    },
  };
}

function mergeReasoningEventFields(
  detail: Readonly<ReasoningMessage>,
  event: {
    metadata?: Metadata;
    subagentRunId?: string;
  },
): ReasoningMessage {
  const metadata = mergeMetadata(
    detail.metadata,
    cloneMetadata(event.metadata),
  );

  return {
    ...detail,
    ...(event.subagentRunId !== undefined
      ? { subagentRunId: event.subagentRunId }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function startReasoningMessage(
  state: StreamingMessageState,
  event: ReasoningMessageStartEvent,
): StreamingMessageState {
  if (Object.hasOwn(state.reasoningMessageStatusById, event.messageId)) {
    return withStreamError(
      state,
      `Reasoning message ${event.messageId} has already started`,
    );
  }

  const details = getReasoningDetails(state.message);
  const metadata = mergeMetadata(undefined, cloneMetadata(event.metadata));
  const detail: ReasoningMessage = {
    id: event.messageId,
    role: 'reasoning',
    content: '',
    ...(event.subagentRunId !== undefined
      ? { subagentRunId: event.subagentRunId }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  const message = state.message ?? {
    role: 'assistant' as const,
    content: '',
    toolCallIds: state.toolCalls.map((toolCall) => toolCall.id),
  };

  return {
    ...state,
    message: {
      ...message,
      reasoning: {
        kind: 'details',
        details: [...details, detail],
      },
    },
    reasoningMessageStatusById: {
      ...state.reasoningMessageStatusById,
      [event.messageId]: 'active',
    },
  };
}

function appendReasoningContent(
  state: StreamingMessageState,
  event: ReasoningMessageContentEvent,
): StreamingMessageState {
  if (
    !Object.hasOwn(state.reasoningMessageStatusById, event.messageId) ||
    state.reasoningMessageStatusById[event.messageId] !== 'active'
  ) {
    return withStreamError(
      state,
      `Reasoning message ${event.messageId} is not active`,
    );
  }

  const next = updateReasoningDetail(state, event.messageId, (detail) => ({
    ...mergeReasoningEventFields(detail, event),
    content: detail.content + event.delta,
  }));
  return (
    next ??
    withStreamError(
      state,
      `Reasoning message ${event.messageId} does not exist`,
    )
  );
}

function endReasoningMessage(
  state: StreamingMessageState,
  event: ReasoningMessageEndEvent,
): StreamingMessageState {
  if (
    !Object.hasOwn(state.reasoningMessageStatusById, event.messageId) ||
    state.reasoningMessageStatusById[event.messageId] !== 'active'
  ) {
    return withStreamError(
      state,
      `Reasoning message ${event.messageId} is not active`,
    );
  }

  const next = updateReasoningDetail(state, event.messageId, (detail) =>
    mergeReasoningEventFields(detail, event),
  );
  if (!next) {
    return withStreamError(
      state,
      `Reasoning message ${event.messageId} does not exist`,
    );
  }

  return {
    ...next,
    reasoningMessageStatusById: {
      ...next.reasoningMessageStatusById,
      [event.messageId]: 'complete',
    },
  };
}

function applyReasoningEncryptedValue(
  state: StreamingMessageState,
  event: ReasoningEncryptedValueEvent,
): StreamingMessageState {
  if (event.subtype === 'tool-call') {
    const toolCallIndex = state.toolCalls.findIndex(
      (toolCall) => toolCall.id === event.entityId,
    );
    if (toolCallIndex === -1) {
      return state;
    }

    return {
      ...state,
      toolCalls: state.toolCalls.map((toolCall, index) =>
        index === toolCallIndex
          ? { ...toolCall, encryptedValue: event.encryptedValue }
          : toolCall,
      ),
    };
  }

  if (state.message && state.messageId === event.entityId) {
    return {
      ...state,
      message: {
        ...state.message,
        encryptedValue: event.encryptedValue,
      },
    };
  }

  const next = updateReasoningDetail(state, event.entityId, (detail) => ({
    ...detail,
    encryptedValue: event.encryptedValue,
    ...(event.subagentRunId !== undefined
      ? { subagentRunId: event.subagentRunId }
      : {}),
  }));
  return next ?? state;
}

function startTextMessage(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_START }>,
): StreamingMessageState {
  if (event.role !== 'assistant') {
    return state;
  }

  if (state.message && state.messageId === event.messageId) {
    return state;
  }

  return {
    ...state,
    messageId: event.messageId,
    message: state.message ?? {
      role: 'assistant',
      content: '',
      toolCallIds: state.toolCalls.map((toolCall) => toolCall.id),
    },
  };
}

function appendTextContent(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_CONTENT }>,
): StreamingMessageState {
  if (
    !state.message ||
    state.messageId !== event.messageId ||
    event.delta.length === 0
  ) {
    return state;
  }

  const responseSchema = state.configSnapshot?.responseSchema;
  const content = (state.message.content ?? '') + event.delta;
  let message: Chat.Internal.AssistantMessage = {
    ...state.message,
    content,
  };
  let outputParserState = state.outputParserState;
  let outputCache = state.outputCache;
  let error = state.error;

  if (responseSchema) {
    outputParserState = push(ensureParserState(outputParserState), event.delta);
    const output = resolveSchemaValue(
      responseSchema,
      outputParserState,
      outputCache,
    );
    outputCache = output.cache;
    if (output.hasError && !error) {
      error = new Error('Invalid structured output');
    }
    if (output.value !== undefined) {
      message = {
        ...message,
        contentResolved: output.value,
      };
    }
  }

  return {
    ...state,
    message,
    outputParserState,
    outputCache,
    error,
  };
}

function startToolCall(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_START }>,
): StreamingMessageState {
  if (state.toolCalls.some((toolCall) => toolCall.id === event.toolCallId)) {
    return state.activeToolCallId === event.toolCallId
      ? state
      : { ...state, activeToolCallId: event.toolCallId };
  }

  const toolCalls = [
    ...state.toolCalls,
    {
      id: event.toolCallId,
      name: event.toolCallName,
      arguments: '',
      status: 'pending' as const,
      metadata: getToolCallMetadata(event.rawEvent),
    },
  ];
  const message = state.message ?? {
    role: 'assistant' as const,
    content: '',
    toolCallIds: [],
  };

  return {
    ...state,
    messageId: state.messageId ?? event.parentMessageId,
    activeToolCallId: event.toolCallId,
    message: {
      ...message,
      toolCallIds: toolCalls.map((toolCall) => toolCall.id),
    },
    toolCalls,
  };
}

function appendToolArguments(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_ARGS }>,
): StreamingMessageState {
  const toolCallIndex = state.toolCalls.findIndex(
    (toolCall) => toolCall.id === event.toolCallId,
  );
  if (toolCallIndex === -1) {
    return state;
  }

  const toolCall = state.toolCalls[toolCallIndex];
  if (!toolCall) {
    return state;
  }

  const incomingMetadata = getToolCallMetadata(event.rawEvent);
  if (event.delta.length === 0 && !incomingMetadata) {
    return state;
  }

  const argumentsString = toolCall.arguments + event.delta;
  const metadata = incomingMetadata
    ? { ...(toolCall.metadata ?? {}), ...incomingMetadata }
    : toolCall.metadata;
  const tool = state.configSnapshot?.toolsByName[toolCall.name];
  let argumentsResolved = toolCall.argumentsResolved;
  let toolParserStateById = state.toolParserStateById;
  let toolCacheById = state.toolCacheById;
  let error = state.error;

  if (tool && event.delta.length > 0) {
    const parserState = push(
      ensureParserState(toolParserStateById[event.toolCallId]),
      event.delta,
    );
    toolParserStateById = {
      ...toolParserStateById,
      [event.toolCallId]: parserState,
    };

    if (s.isHashbrownType(tool.schema)) {
      const resolved = resolveSchemaValue(
        tool.schema,
        parserState,
        toolCacheById[event.toolCallId],
      );
      toolCacheById = {
        ...toolCacheById,
        [event.toolCallId]: resolved.cache,
      };
      if (resolved.value !== undefined) {
        argumentsResolved = resolved.value;
      }
      if (resolved.hasError && !error) {
        error = new Error(`Invalid tool arguments for ${toolCall.name}`);
      }
    } else if (parserState.error && !error) {
      error = new Error(`Invalid tool arguments for ${toolCall.name}`);
    } else {
      const resolvedValue = resolveJsonValue(parserState);
      if (resolvedValue !== undefined) {
        argumentsResolved = resolvedValue;
      }
    }
  }

  const toolCalls = state.toolCalls.map((current, index) =>
    index === toolCallIndex
      ? {
          ...current,
          arguments: argumentsString,
          argumentsResolved,
          metadata,
        }
      : current,
  );

  return {
    ...state,
    activeToolCallId: event.toolCallId,
    toolCalls,
    toolParserStateById,
    toolCacheById,
    error,
  };
}

function applyTextMessageChunk(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_CHUNK }>,
): StreamingMessageState {
  const messageId = event.messageId ?? state.messageId;
  if (!messageId) {
    return state;
  }

  let next = state;
  if (!state.message || state.messageId !== messageId) {
    next = startTextMessage(state, {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: event.role ?? 'assistant',
      name: event.name,
      rawEvent: event.rawEvent,
      timestamp: event.timestamp,
    });
  }

  if (event.delta === undefined) {
    return next;
  }

  return appendTextContent(next, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: event.delta,
    rawEvent: event.rawEvent,
    timestamp: event.timestamp,
  });
}

function applyToolCallChunk(
  state: StreamingMessageState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_CHUNK }>,
): StreamingMessageState {
  const toolCallId = event.toolCallId ?? state.activeToolCallId;
  if (!toolCallId) {
    return state;
  }

  let next = state;
  const existing = state.toolCalls.some(
    (toolCall) => toolCall.id === toolCallId,
  );
  if (!existing) {
    if (!event.toolCallName) {
      return state;
    }
    next = startToolCall(state, {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: event.toolCallName,
      parentMessageId: event.parentMessageId,
      rawEvent: event.rawEvent,
      timestamp: event.timestamp,
    });
  } else if (state.activeToolCallId !== toolCallId) {
    next = { ...state, activeToolCallId: toolCallId };
  }

  if (event.delta === undefined && event.rawEvent === undefined) {
    return next;
  }

  return appendToolArguments(next, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: event.delta ?? '',
    rawEvent: event.rawEvent,
    timestamp: event.timestamp,
  });
}

function finalizeOutput(state: StreamingMessageState): StreamingMessageState {
  const responseSchema = state.configSnapshot?.responseSchema;
  if (!responseSchema || !state.outputParserState) {
    return state;
  }

  const outputParserState = finish(state.outputParserState);
  const output = resolveSchemaValue(
    responseSchema,
    outputParserState,
    state.outputCache,
  );
  let message = state.message;
  let error = state.error;

  if (output.hasError && !error) {
    error = new Error('Invalid structured output');
  }
  if (output.value !== undefined && message) {
    message = {
      ...message,
      contentResolved: output.value,
    };
  }
  if (output.recoveredTrailingToken && output.value !== undefined) {
    warnRecoveredTrailingTokenFromSource(
      outputParserState,
      output.value,
      message?.content ?? '',
    );
  }

  return {
    ...state,
    message,
    outputParserState,
    outputCache: output.cache,
    error,
  };
}

function finalizeToolCalls(
  state: StreamingMessageState,
  toolCallIds?: ReadonlySet<string>,
): StreamingMessageState {
  const toolsByName = state.configSnapshot?.toolsByName ?? {};
  let toolParserStateById = state.toolParserStateById;
  let toolCacheById = state.toolCacheById;
  let finalizedToolCallIds = state.finalizedToolCallIds;
  let error = state.error;

  const toolCalls = state.toolCalls.map((toolCall) => {
    if (
      (toolCallIds && !toolCallIds.has(toolCall.id)) ||
      finalizedToolCallIds[toolCall.id]
    ) {
      return toolCall;
    }

    const parserState = toolParserStateById[toolCall.id];
    const tool = toolsByName[toolCall.name];
    if (!parserState || !tool) {
      return toolCall;
    }

    const finalized = finish(parserState);
    toolParserStateById = {
      ...toolParserStateById,
      [toolCall.id]: finalized,
    };
    finalizedToolCallIds = {
      ...finalizedToolCallIds,
      [toolCall.id]: true,
    };
    let argumentsResolved = toolCall.argumentsResolved;

    if (s.isHashbrownType(tool.schema)) {
      const resolved = resolveSchemaValue(
        tool.schema,
        finalized,
        toolCacheById[toolCall.id],
      );
      toolCacheById = {
        ...toolCacheById,
        [toolCall.id]: resolved.cache,
      };
      if (resolved.value !== undefined) {
        argumentsResolved = resolved.value;
      }
      if (resolved.recoveredTrailingToken && resolved.value !== undefined) {
        warnRecoveredTrailingTokenFromSource(
          finalized,
          resolved.value,
          toolCall.arguments,
        );
      }
      if (resolved.hasError && !error) {
        error = new Error(`Invalid tool arguments for ${toolCall.name}`);
      }
    } else {
      const resolvedValue = resolveJsonValue(finalized);
      if (resolvedValue !== undefined) {
        argumentsResolved = resolvedValue;
      }
      if (finalized.error && !error) {
        error = new Error(`Invalid tool arguments for ${toolCall.name}`);
      }
    }

    return argumentsResolved === toolCall.argumentsResolved
      ? toolCall
      : { ...toolCall, argumentsResolved };
  });

  return {
    ...state,
    toolCalls,
    toolParserStateById,
    toolCacheById,
    finalizedToolCallIds,
    error,
  };
}

function finishRun(state: StreamingMessageState): StreamingMessageState {
  const activeReasoningMessageId = Object.entries(
    state.reasoningMessageStatusById,
  ).find(([, status]) => status === 'active')?.[0];
  const next = activeReasoningMessageId
    ? withStreamError(
        state,
        `Reasoning message ${activeReasoningMessageId} is still active`,
      )
    : state;

  return finalizeToolCalls(finalizeOutput(next));
}

function reduceEvent(
  state: StreamingMessageState,
  event: AGUIEvent,
): StreamingMessageState {
  switch (event.type) {
    case EventType.REASONING_START:
    case EventType.REASONING_END:
      return state;
    case EventType.REASONING_MESSAGE_START:
      return startReasoningMessage(state, event);
    case EventType.REASONING_MESSAGE_CONTENT:
      return appendReasoningContent(state, event);
    case EventType.REASONING_ENCRYPTED_VALUE:
      return applyReasoningEncryptedValue(state, event);
    case EventType.REASONING_MESSAGE_END:
      return endReasoningMessage(state, event);
    case EventType.TEXT_MESSAGE_START:
      return startTextMessage(state, event);
    case EventType.TEXT_MESSAGE_CONTENT:
      return appendTextContent(state, event);
    case EventType.TEXT_MESSAGE_CHUNK:
      return applyTextMessageChunk(state, event);
    case EventType.TOOL_CALL_START:
      return startToolCall(state, event);
    case EventType.TOOL_CALL_ARGS:
      return appendToolArguments(state, event);
    case EventType.TOOL_CALL_CHUNK:
      return applyToolCallChunk(state, event);
    case EventType.TOOL_CALL_END:
      return finalizeToolCalls(state, new Set([event.toolCallId]));
    case EventType.RUN_FINISHED:
      return finishRun(state);
    case EventType.RUN_ERROR:
      return {
        ...state,
        error: state.error ?? new Error(event.message),
      };
    default:
      return state;
  }
}

export const reducer = createReducer(
  initialState,
  on(
    apiActions.generateMessageStart,
    (state, action): StreamingMessageState => {
      const responseSchema = action.payload.responseSchema
        ? s.normalizeSchemaOutput(action.payload.responseSchema)
        : undefined;
      return {
        ...initialState,
        configSnapshot: {
          responseSchema,
          emulateStructuredOutput: action.payload.emulateStructuredOutput,
          toolsByName: action.payload.toolsByName,
        },
      };
    },
  ),
  on(apiActions.generateMessageEvent, (state, action): StreamingMessageState =>
    reduceEvent(state, action.payload),
  ),
  on(
    apiActions.generateMessageSuccess,
    apiActions.generateMessageError,
    internalActions.generationSilentlyRetired,
    devActions.stopMessageGeneration,
    () => initialState,
  ),
);

export const selectRawStreamingMessage = (state: StreamingMessageState) =>
  state.message;

export const selectRawStreamingToolCalls = (state: StreamingMessageState) =>
  state.toolCalls;

export const selectStreamingMessageError = (state: StreamingMessageState) =>
  state.error;

export const selectStreamingMessage = select(
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  (message, toolCalls): Chat.Internal.AssistantMessage | null => {
    if (!message) {
      return null;
    }

    return {
      ...message,
      toolCallIds: toolCalls.map((toolCall) => toolCall.id),
    };
  },
);

export const selectStreamingToolCallEntities = select(
  selectRawStreamingToolCalls,
  (toolCalls): Record<string, Chat.Internal.ToolCall> => {
    return toolCalls.reduce(
      (acc, toolCall) => {
        acc[toolCall.id] = toolCall;
        return acc;
      },
      {} as Record<string, Chat.Internal.ToolCall>,
    );
  },
);
