import { createReducer, on, select } from '../utils/micro-ngrx';
import { Chat } from '../models';
import { apiActions, devActions } from '../actions';
import { mergeToolCalls } from '../utils/assistant-message';
import { JsonValue } from '../utils';
import { s } from '../schema';
import {
  createParserState,
  finalizeJsonParse,
  getResolvedValue,
  parseChunk,
  type ParserState,
} from '../skillet/parser/json-parser';

type ParserMap = Record<number, ParserState>;
type CacheMap = Record<number, s.FromJsonAstCache>;
type ToolCallIndexMap = Record<string, number>;

export interface StreamingMessageState {
  message: Chat.Internal.AssistantMessage | null;
  toolCalls: Chat.Internal.ToolCall[];
  rawToolCalls: Chat.Api.ToolCall[];
  outputParserState?: ParserState;
  outputCache?: s.FromJsonAstCache;
  toolParserStateByIndex: ParserMap;
  toolCacheByIndex: CacheMap;
  toolCallIndexById: ToolCallIndexMap;
  configSnapshot?: {
    responseSchema?: s.HashbrownType;
    emulateStructuredOutput: boolean;
    toolsByName: Record<string, Chat.Internal.Tool>;
  };
  error?: Error;
}

export const initialState: StreamingMessageState = {
  message: null,
  toolCalls: [],
  rawToolCalls: [],
  outputParserState: undefined,
  outputCache: undefined,
  toolParserStateByIndex: {},
  toolCacheByIndex: {},
  toolCallIndexById: {},
  configSnapshot: undefined,
  error: undefined,
};

function ensureParserState(state: ParserState | undefined) {
  return state ?? createParserState();
}

function getToolCallName(
  mergedToolCalls: Chat.Api.ToolCall[],
  index: number | undefined,
  fallback?: string,
) {
  if (fallback) {
    return fallback;
  }

  if (index === undefined) {
    return undefined;
  }

  const existing = mergedToolCalls.find((call) => call.index === index);
  return existing?.function?.name;
}

function updateToolParserState(
  parserStates: ParserMap,
  index: number,
  delta: string,
) {
  const current = ensureParserState(parserStates[index]);
  const next = parseChunk(current, delta);
  if (next === current) {
    return parserStates;
  }

  return { ...parserStates, [index]: next };
}

function updateCache(
  cacheMap: CacheMap,
  index: number,
  cache: s.FromJsonAstCache,
) {
  if (cacheMap[index] === cache) {
    return cacheMap;
  }

  return { ...cacheMap, [index]: cache };
}

function resolveSchemaValue(
  schema: s.HashbrownType,
  parserState: ParserState,
  cache: s.FromJsonAstCache | undefined,
) {
  const output = s.fromJsonAst(schema, parserState, cache);
  const value =
    output.result.state === 'match'
      ? (output.result.value as JsonValue)
      : undefined;
  const hasError =
    output.result.state === 'invalid' || Boolean(parserState.error);
  return {
    cache: output.cache,
    value,
    hasError,
  };
}

function resolveJsonValue(parserState: ParserState) {
  if (parserState.error || !parserState.isComplete) {
    return undefined;
  }

  return getResolvedValue(parserState);
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
  on(
    apiActions.generateMessageChunk,
    (state, action): StreamingMessageState => {
      const choice = action.payload.choices[0];
      if (!choice) {
        return state;
      }

      const config = state.configSnapshot;
      const responseSchema = config?.responseSchema;
      const emulateStructuredOutput = config?.emulateStructuredOutput ?? false;
      const toolsByName = config?.toolsByName ?? {};

      const delta = choice.delta;
      const deltaContent = delta.content ?? '';
      const deltaToolCalls = delta.toolCalls ?? [];

      let message = state.message;
      if (!message) {
        if (delta.role !== 'assistant') {
          return state;
        }
        message = {
          role: 'assistant',
          content: '',
          toolCallIds: [],
        };
      }
      const baseMessage: Chat.Internal.AssistantMessage = message ?? {
        role: 'assistant',
        content: '',
        toolCallIds: [],
      };
      message = baseMessage;

      const mergedRawToolCalls = mergeToolCalls(
        state.rawToolCalls,
        deltaToolCalls,
      );

      let outputParserState = state.outputParserState;
      let outputCache = state.outputCache;
      let toolParserStateByIndex = state.toolParserStateByIndex;
      let toolCacheByIndex = state.toolCacheByIndex;
      let toolCallIndexById = state.toolCallIndexById;
      let error = state.error;
      const updatedToolIds = new Set<string>();
      const updatedToolIndices = new Set<number>();
      const resolvedArgsByIndex = new Map<number, JsonValue | undefined>();

      for (const toolCallDelta of deltaToolCalls) {
        const index =
          toolCallDelta.index ??
          (toolCallDelta.id ? toolCallIndexById[toolCallDelta.id] : undefined);
        const deltaArgs = toolCallDelta.function?.arguments;
        const isStringArgs = typeof deltaArgs === 'string';
        const hasArgs =
          deltaArgs !== undefined &&
          deltaArgs !== null &&
          (!isStringArgs || deltaArgs.length > 0);

        if (toolCallDelta.id && toolCallDelta.index !== undefined) {
          toolCallIndexById = {
            ...toolCallIndexById,
            [toolCallDelta.id]: toolCallDelta.index,
          };
        }

        if (index === undefined) {
          continue;
        }
        updatedToolIndices.add(index);

        const name = getToolCallName(
          mergedRawToolCalls,
          index,
          toolCallDelta.function?.name,
        );

        if (!hasArgs) {
          continue;
        }

        if (!name) {
          continue;
        }

        const tool = toolsByName[name];
        if (!tool) {
          continue;
        }

        if (isStringArgs) {
          toolParserStateByIndex = updateToolParserState(
            toolParserStateByIndex,
            index,
            deltaArgs,
          );

          const toolState = toolParserStateByIndex[index];
          if (!toolState) {
            continue;
          }

          if (s.isHashbrownType(tool.schema)) {
            const resolved = resolveSchemaValue(
              tool.schema,
              toolState,
              toolCacheByIndex[index],
            );
            toolCacheByIndex = updateCache(
              toolCacheByIndex,
              index,
              resolved.cache,
            );
            if (resolved.value !== undefined) {
              resolvedArgsByIndex.set(index, resolved.value);
            }

            if (resolved.hasError && !error) {
              error = new Error(`Invalid tool arguments for ${name}`);
            }
          } else if (toolState.error && !error) {
            error = new Error(`Invalid tool arguments for ${name}`);
          } else {
            const resolvedValue = resolveJsonValue(toolState);
            if (resolvedValue !== undefined) {
              resolvedArgsByIndex.set(index, resolvedValue);
            }
          }
        } else {
          resolvedArgsByIndex.set(index, deltaArgs as JsonValue);
        }

        if (toolCallDelta.id) {
          updatedToolIds.add(toolCallDelta.id);
        }
      }

      let nextContent = message.content ?? '';
      nextContent += deltaContent;

      if (responseSchema && deltaContent) {
        const nextOutputState = parseChunk(
          ensureParserState(outputParserState),
          deltaContent,
        );
        outputParserState = nextOutputState;
        const output = resolveSchemaValue(
          responseSchema,
          nextOutputState,
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

      const existingToolCalls = state.toolCalls;
      const existingById = existingToolCalls.reduce(
        (acc, toolCall) => {
          acc[toolCall.id] = toolCall;
          return acc;
        },
        {} as Record<string, Chat.Internal.ToolCall>,
      );

      const nextToolCalls = mergedRawToolCalls.flatMap((toolCall) => {
        const name = toolCall.function?.name;
        if (!name) {
          return [];
        }

        const toolCallId =
          toolCall.id ??
          (toolCall.index !== undefined
            ? `tool-call-${toolCall.index}`
            : undefined);
        if (!toolCallId) {
          return [];
        }

        const existing = existingById[toolCallId];
        if (
          existing &&
          !updatedToolIds.has(toolCallId) &&
          !updatedToolIndices.has(toolCall.index ?? -1)
        ) {
          return [existing];
        }

        const base: Chat.Internal.ToolCall = existing ?? {
          id: toolCallId,
          name,
          arguments: '',
          status: 'pending',
        };

        const rawArguments = toolCall.function?.arguments;
        const argumentsString =
          typeof rawArguments === 'string'
            ? rawArguments
            : rawArguments != null
              ? JSON.stringify(rawArguments)
              : '';

        const tool = toolsByName[name];
        const toolIndex =
          toolCall.index ??
          (toolCall.id ? toolCallIndexById[toolCall.id] : undefined);
        const parserState =
          tool && toolIndex !== undefined
            ? toolParserStateByIndex[toolIndex]
            : undefined;
        let argumentsResolved = base.argumentsResolved;

        if (tool && parserState && toolIndex !== undefined) {
          const resolved = resolvedArgsByIndex.get(toolIndex);
          if (resolved !== undefined) {
            argumentsResolved = resolved;
          }
        }

        return [
          {
            ...base,
            name,
            arguments: argumentsString,
            argumentsResolved,
          },
        ];
      });

      const nextMessage: Chat.Internal.AssistantMessage = {
        ...message,
        content: nextContent,
        toolCallIds: nextToolCalls.map((toolCall) => toolCall.id),
      };

      return {
        ...state,
        message: nextMessage,
        toolCalls: nextToolCalls,
        rawToolCalls: mergedRawToolCalls,
        outputParserState,
        outputCache,
        toolParserStateByIndex,
        toolCacheByIndex,
        toolCallIndexById,
        error,
      };
    },
  ),
  on(apiActions.generateMessageFinish, (state): StreamingMessageState => {
    const config = state.configSnapshot;
    const responseSchema = config?.responseSchema;
    const toolsByName = config?.toolsByName ?? {};

    let outputParserState = state.outputParserState;
    let outputCache = state.outputCache;
    let toolParserStateByIndex = state.toolParserStateByIndex;
    let toolCacheByIndex = state.toolCacheByIndex;
    const toolCallIndexById = state.toolCallIndexById;
    let error = state.error;
    let message = state.message;

    if (responseSchema && outputParserState) {
      outputParserState = finalizeJsonParse(outputParserState);
      if (outputParserState.error && !error) {
        error = new Error('Invalid structured output');
      }

      const output = resolveSchemaValue(
        responseSchema,
        outputParserState,
        outputCache,
      );
      outputCache = output.cache;
      if (output.hasError && !error) {
        error = new Error('Invalid structured output');
      }
      if (output.value !== undefined && message) {
        message = {
          ...message,
          contentResolved: output.value,
        };
      }
    }

    const finalizedToolStates: ParserMap = {};
    Object.entries(toolParserStateByIndex).forEach(([key, parserState]) => {
      const index = Number(key);
      const finalized = finalizeJsonParse(parserState);
      finalizedToolStates[index] = finalized;
      if (finalized.error && !error) {
        error = new Error('Invalid tool arguments');
      }
    });
    toolParserStateByIndex = finalizedToolStates;

    const existingById = state.toolCalls.reduce(
      (acc, toolCall) => {
        acc[toolCall.id] = toolCall;
        return acc;
      },
      {} as Record<string, Chat.Internal.ToolCall>,
    );

    const nextToolCalls = state.rawToolCalls.flatMap((toolCall) => {
      const name = toolCall.function?.name;
      if (!name) {
        return [];
      }

      const toolCallId =
        toolCall.id ??
        (toolCall.index !== undefined
          ? `tool-call-${toolCall.index}`
          : undefined);
      if (!toolCallId) {
        return [];
      }

      const existing = existingById[toolCallId];
      const base: Chat.Internal.ToolCall = existing ?? {
        id: toolCallId,
        name,
        arguments: '',
        status: 'pending',
        metadata: toolCall.metadata,
      };

      const rawArguments = toolCall.function?.arguments;
      const argumentsString =
        typeof rawArguments === 'string'
          ? rawArguments
          : rawArguments != null
            ? JSON.stringify(rawArguments)
            : '';

      const tool = toolsByName[name];
      const toolIndex =
        toolCall.index ??
        (toolCall.id ? toolCallIndexById[toolCall.id] : undefined);
      const parserState = tool ? toolParserStateByIndex[toolIndex] : undefined;
      let argumentsResolved = base.argumentsResolved;

      if (tool && parserState && toolIndex !== undefined) {
        if (s.isHashbrownType(tool.schema)) {
          const resolved = resolveSchemaValue(
            tool.schema,
            parserState,
            toolCacheByIndex[toolIndex],
          );
          toolCacheByIndex = updateCache(
            toolCacheByIndex,
            toolIndex,
            resolved.cache,
          );
          if (resolved.value !== undefined) {
            argumentsResolved = resolved.value;
          }
          if (resolved.hasError && !error) {
            error = new Error(`Invalid tool arguments for ${name}`);
          }
        } else {
          const resolvedValue = resolveJsonValue(parserState);
          if (resolvedValue !== undefined) {
            argumentsResolved = resolvedValue;
          }
        }
      }

      return [
        {
          ...base,
          name,
          arguments: argumentsString,
          argumentsResolved,
          metadata: toolCall.metadata ?? base.metadata,
        },
      ];
    });

    if (message) {
      message = {
        ...message,
        toolCallIds: nextToolCalls.map((toolCall) => toolCall.id),
      };
    }

    return {
      ...state,
      message,
      toolCalls: nextToolCalls,
      outputParserState,
      outputCache,
      toolParserStateByIndex,
      toolCacheByIndex,
      error,
    };
  }),
  on(
    apiActions.generateMessageSuccess,
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    () => {
      return initialState;
    },
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
