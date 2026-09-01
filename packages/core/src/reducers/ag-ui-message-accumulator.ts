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
import { Chat } from '../models';
import { s } from '../schema';
import { JsonValue } from '../utils';

type ParserMap = Record<string, StreamState>;
type CacheMap = Record<string, s.FromJsonAstCache>;

/**
 * A recoverable problem observed while accumulating an AG-UI message.
 */
export interface AgUiMessageAccumulatorDiagnostic {
  readonly type: 'recovered-trailing-content';
  readonly source: 'structured-output' | 'tool-arguments';
  readonly entityId: string | undefined;
  readonly parsedData: JsonValue;
  readonly extraData: string;
}

/**
 * Pure state used to accumulate AG-UI events into Hashbrown messages.
 */
export interface AgUiMessageAccumulatorState {
  readonly message: Chat.Internal.AssistantMessage | null;
  readonly messageId?: string;
  readonly activeToolCallId?: string;
  readonly toolCalls: Chat.Internal.ToolCall[];
  readonly outputParserState?: StreamState;
  readonly outputCache?: s.FromJsonAstCache;
  readonly toolParserStateById: ParserMap;
  readonly toolCacheById: CacheMap;
  readonly finalizedToolCallIds: Record<string, true>;
  readonly reasoningMessageStatusById: Record<string, 'active' | 'complete'>;
  readonly configSnapshot?: {
    readonly responseSchema?: s.HashbrownType;
    readonly toolsByName: Record<string, Chat.Internal.Tool>;
  };
  readonly diagnostics: readonly AgUiMessageAccumulatorDiagnostic[];
  readonly error?: Error;
}

/**
 * Empty AG-UI message accumulator state.
 */
export const initialAgUiMessageAccumulatorState: AgUiMessageAccumulatorState = {
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
  diagnostics: [],
  error: undefined,
};

/**
 * Creates accumulator state for one AG-UI generation run.
 */
export function createAgUiMessageAccumulator(config: {
  readonly responseSchema?: s.SchemaOutput;
  readonly toolsByName: Record<string, Chat.Internal.Tool>;
}): AgUiMessageAccumulatorState {
  const responseSchema = config.responseSchema
    ? s.normalizeSchemaOutput(config.responseSchema)
    : undefined;

  return {
    ...initialAgUiMessageAccumulatorState,
    configSnapshot: {
      responseSchema,
      toolsByName: config.toolsByName,
    },
  };
}

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

function cloneMetadata(metadata: Metadata | undefined) {
  return metadata === undefined ? undefined : structuredClone(metadata);
}

function mergeClonedMetadata(
  existing: Metadata | undefined,
  incoming: Metadata | undefined,
) {
  return mergeMetadata(existing, cloneMetadata(incoming));
}

function withStreamError(
  state: AgUiMessageAccumulatorState,
  message: string,
): AgUiMessageAccumulatorState {
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
  state: AgUiMessageAccumulatorState,
  messageId: string,
  update: (detail: Readonly<ReasoningMessage>) => ReasoningMessage,
): AgUiMessageAccumulatorState | undefined {
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
    readonly metadata?: Metadata;
    readonly subagentRunId?: string;
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
  state: AgUiMessageAccumulatorState,
  event: ReasoningMessageStartEvent,
): AgUiMessageAccumulatorState {
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
  state: AgUiMessageAccumulatorState,
  event: ReasoningMessageContentEvent,
): AgUiMessageAccumulatorState {
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
  state: AgUiMessageAccumulatorState,
  event: ReasoningMessageEndEvent,
): AgUiMessageAccumulatorState {
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
  state: AgUiMessageAccumulatorState,
  event: ReasoningEncryptedValueEvent,
): AgUiMessageAccumulatorState {
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
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_START }>,
): AgUiMessageAccumulatorState {
  if (event.role !== 'assistant') {
    return state;
  }

  if (state.message && state.messageId === event.messageId) {
    if (event.metadata === undefined) {
      return state;
    }

    const metadata = mergeClonedMetadata(
      state.message.metadata,
      event.metadata,
    );
    return {
      ...state,
      message: {
        ...state.message,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    };
  }

  const message = state.message ?? {
    role: 'assistant' as const,
    content: '',
    toolCallIds: state.toolCalls.map((toolCall) => toolCall.id),
  };
  const metadata = mergeClonedMetadata(message.metadata, event.metadata);

  return {
    ...state,
    messageId: event.messageId,
    message: {
      ...message,
      ...(metadata !== undefined ? { metadata } : {}),
    },
  };
}

function appendTextContent(
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_CONTENT }>,
): AgUiMessageAccumulatorState {
  if (
    !state.message ||
    state.messageId !== event.messageId ||
    (event.delta.length === 0 && event.metadata === undefined)
  ) {
    return state;
  }

  const responseSchema = state.configSnapshot?.responseSchema;
  const content = (state.message.content ?? '') + event.delta;
  const metadata = mergeClonedMetadata(state.message.metadata, event.metadata);
  let message: Chat.Internal.AssistantMessage = {
    ...state.message,
    content,
    ...(metadata !== undefined ? { metadata } : {}),
  };
  let outputParserState = state.outputParserState;
  let outputCache = state.outputCache;
  let error = state.error;

  if (responseSchema && event.delta.length > 0) {
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

function endTextMessage(
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_END }>,
): AgUiMessageAccumulatorState {
  if (
    !state.message ||
    state.messageId !== event.messageId ||
    event.metadata === undefined
  ) {
    return state;
  }

  const metadata = mergeClonedMetadata(state.message.metadata, event.metadata);

  return {
    ...state,
    message: {
      ...state.message,
      ...(metadata !== undefined ? { metadata } : {}),
    },
  };
}

function startToolCall(
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_START }>,
): AgUiMessageAccumulatorState {
  const existingToolCallIndex = state.toolCalls.findIndex(
    (toolCall) => toolCall.id === event.toolCallId,
  );
  if (existingToolCallIndex !== -1) {
    const existingToolCall = state.toolCalls[existingToolCallIndex];
    if (!existingToolCall) {
      return state;
    }
    if (
      state.activeToolCallId === event.toolCallId &&
      event.metadata === undefined
    ) {
      return state;
    }

    const metadata = mergeClonedMetadata(
      existingToolCall.metadata,
      event.metadata,
    );

    return {
      ...state,
      activeToolCallId: event.toolCallId,
      toolCalls:
        event.metadata === undefined
          ? state.toolCalls
          : state.toolCalls.map((toolCall, index) =>
              index === existingToolCallIndex
                ? {
                    ...toolCall,
                    ...(metadata !== undefined ? { metadata } : {}),
                  }
                : toolCall,
            ),
    };
  }

  const metadata = mergeClonedMetadata(undefined, event.metadata);
  const toolCalls = [
    ...state.toolCalls,
    {
      id: event.toolCallId,
      name: event.toolCallName,
      arguments: '',
      status: 'pending' as const,
      ...(metadata !== undefined ? { metadata } : {}),
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
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_ARGS }>,
): AgUiMessageAccumulatorState {
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

  const incomingMetadata = cloneMetadata(event.metadata);
  if (event.delta.length === 0 && incomingMetadata === undefined) {
    return state;
  }

  const argumentsString = toolCall.arguments + event.delta;
  const metadata = mergeMetadata(toolCall.metadata, incomingMetadata);
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
          ...(metadata !== undefined ? { metadata } : {}),
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
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TEXT_MESSAGE_CHUNK }>,
): AgUiMessageAccumulatorState {
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
      metadata: event.metadata,
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
    metadata: event.metadata,
    rawEvent: event.rawEvent,
    timestamp: event.timestamp,
  });
}

function applyToolCallChunk(
  state: AgUiMessageAccumulatorState,
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_CHUNK }>,
): AgUiMessageAccumulatorState {
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
      metadata: event.metadata,
      rawEvent: event.rawEvent,
      timestamp: event.timestamp,
    });
  } else if (state.activeToolCallId !== toolCallId) {
    next = { ...state, activeToolCallId: toolCallId };
  }

  if (
    event.delta === undefined &&
    event.metadata === undefined &&
    event.rawEvent === undefined
  ) {
    return next;
  }

  return appendToolArguments(next, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: event.delta ?? '',
    metadata: event.metadata,
    rawEvent: event.rawEvent,
    timestamp: event.timestamp,
  });
}

function freezeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeJsonValue)) as JsonValue;
  }

  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          freezeJsonValue(child),
        ]),
      ),
    ) as JsonValue;
  }

  return value;
}

function addTrailingContentDiagnostic(
  state: AgUiMessageAccumulatorState,
  diagnostic: AgUiMessageAccumulatorDiagnostic,
): AgUiMessageAccumulatorState {
  const exists = state.diagnostics.some(
    (current) =>
      current.type === diagnostic.type &&
      current.source === diagnostic.source &&
      current.entityId === diagnostic.entityId,
  );
  if (exists) {
    return state;
  }

  return {
    ...state,
    diagnostics: [...state.diagnostics, Object.freeze(diagnostic)],
  };
}

function addTrailingContentDiagnosticFromSource(
  state: AgUiMessageAccumulatorState,
  parserState: StreamState,
  source: AgUiMessageAccumulatorDiagnostic['source'],
  entityId: string | undefined,
  parsedData: JsonValue,
  content: string,
) {
  const parserError = parserState.error;
  if (!parserError || !isRecoverableTrailingToken(parserState)) {
    return state;
  }

  return addTrailingContentDiagnostic(state, {
    type: 'recovered-trailing-content',
    source,
    entityId,
    parsedData: freezeJsonValue(parsedData),
    extraData: content.slice(parserError.index),
  });
}

function finalizeOutput(
  state: AgUiMessageAccumulatorState,
): AgUiMessageAccumulatorState {
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

  const next = {
    ...state,
    message,
    outputParserState,
    outputCache: output.cache,
    error,
  };

  return output.recoveredTrailingToken && output.value !== undefined
    ? addTrailingContentDiagnosticFromSource(
        next,
        outputParserState,
        'structured-output',
        state.messageId,
        output.value,
        message?.content ?? '',
      )
    : next;
}

function finalizeToolCalls(
  state: AgUiMessageAccumulatorState,
  toolCallIds?: ReadonlySet<string>,
): AgUiMessageAccumulatorState {
  const toolsByName = state.configSnapshot?.toolsByName ?? {};
  let toolParserStateById = state.toolParserStateById;
  let toolCacheById = state.toolCacheById;
  let finalizedToolCallIds = state.finalizedToolCallIds;
  let diagnostics = state.diagnostics;
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
        const next = addTrailingContentDiagnosticFromSource(
          { ...state, diagnostics },
          finalized,
          'tool-arguments',
          toolCall.id,
          resolved.value,
          toolCall.arguments,
        );
        diagnostics = next.diagnostics;
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
    diagnostics,
    error,
  };
}

function finishRun(
  state: AgUiMessageAccumulatorState,
): AgUiMessageAccumulatorState {
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

/**
 * Applies one AG-UI event without mutating the event or prior accumulator state.
 */
export function accumulateAgUiMessageEvent(
  state: AgUiMessageAccumulatorState,
  event: AGUIEvent,
): AgUiMessageAccumulatorState {
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
    case EventType.TEXT_MESSAGE_END:
      return endTextMessage(state, event);
    case EventType.TEXT_MESSAGE_CHUNK:
      return applyTextMessageChunk(state, event);
    case EventType.TOOL_CALL_START:
      return startToolCall(state, event);
    case EventType.TOOL_CALL_ARGS:
      return appendToolArguments(state, event);
    case EventType.TOOL_CALL_CHUNK:
      return applyToolCallChunk(state, event);
    case EventType.TOOL_CALL_END:
      return finalizeToolCalls(
        appendToolArguments(state, {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: event.toolCallId,
          delta: '',
          metadata: event.metadata,
        }),
        new Set([event.toolCallId]),
      );
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
