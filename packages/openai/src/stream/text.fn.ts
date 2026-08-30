import {
  type AGUIEvent,
  EventType,
  type Message,
  type RunAgentInput,
  type TextMessageContentEvent,
  type TextMessageStartEvent,
} from '@ag-ui/core';
import OpenAI from 'openai';
import type { FunctionParameters } from 'openai/resources/shared';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface OpenAIHashbrownRunAgentInput extends RunAgentInput {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
}

/**
 * Options for streaming an AG-UI run from OpenAI.
 *
 * @public
 */
export interface OpenAITextStreamOptions {
  /** OpenAI API key. */
  apiKey: string;
  /** Optional OpenAI-compatible API base URL. */
  baseURL?: string;
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: OpenAIHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /** Customize the OpenAI request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  ) =>
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming
    | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
}

interface PendingToolCall {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly pendingArguments: string;
  readonly started: boolean;
}

function mapMessage(
  message: Message,
): OpenAI.ChatCompletionMessageParam | undefined {
  switch (message.role) {
    case 'developer':
    case 'system':
      return {
        role: message.role,
        content: message.content,
      };
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error('OpenAI provider currently requires text user content');
      }

      return {
        role: 'user',
        content: message.content,
      };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      };
    case 'tool':
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    case 'activity':
    case 'reasoning':
      return undefined;
  }
}

function mapMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.flatMap((message) => {
    const mapped = mapMessage(message);
    return mapped ? [mapped] : [];
  });
}

function createResponseFormat(
  responseSchema: object | undefined,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming['response_format'] {
  if (!responseSchema) {
    return undefined;
  }

  return {
    type: 'json_schema',
    json_schema: {
      strict: true,
      name: 'schema',
      description: '',
      schema: structuredClone(responseSchema) as Record<string, unknown>,
    },
  };
}

/**
 * Maps one non-empty provider text fragment to canonical AG-UI events.
 */
function createTextDeltaEvents(
  messageId: string,
  delta: string | null | undefined,
  started: boolean,
): Array<TextMessageStartEvent | TextMessageContentEvent> {
  if (!delta) {
    return [];
  }

  const contentEvent: TextMessageContentEvent = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
  };
  if (started) {
    return [contentEvent];
  }

  const startEvent: TextMessageStartEvent = {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
  };
  return [startEvent, contentEvent];
}

function mergeToolCall(
  current: PendingToolCall | undefined,
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
): PendingToolCall {
  return {
    index: delta.index,
    id: delta.id ?? current?.id,
    name: delta.function?.name ?? current?.name,
    pendingArguments:
      current?.started === true
        ? (delta.function?.arguments ?? '')
        : `${current?.pendingArguments ?? ''}${delta.function?.arguments ?? ''}`,
    started: current?.started ?? false,
  };
}

function startToolCall(
  toolCall: PendingToolCall,
): PendingToolCall & { id: string; name: string } {
  if (!toolCall.id || !toolCall.name) {
    throw new Error(
      `OpenAI returned incomplete metadata for tool call at index ${toolCall.index}`,
    );
  }

  return {
    ...toolCall,
    id: toolCall.id,
    name: toolCall.name,
    pendingArguments: '',
    started: true,
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams canonical AG-UI events from an OpenAI chat completion.
 *
 * @public
 */
export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { apiKey, baseURL, model, input, signal, transformRequestOptions } =
    options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let textStarted = false;
  let providerStream: ReturnType<
    OpenAI['chat']['completions']['stream']
  > | null = null;
  const toolCalls = new Map<number, PendingToolCall>();

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      stream: true,
      model,
      messages: mapMessages(input.messages),
      tools:
        input.tools.length > 0
          ? input.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters:
                  tool.parameters === undefined
                    ? undefined
                    : (structuredClone(tool.parameters) as FunctionParameters),
                strict: true,
              },
            }))
          : undefined,
      response_format: createResponseFormat(input.hashbrown?.responseSchema),
    };
    const requestOptions = transformRequestOptions
      ? await transformRequestOptions(baseOptions)
      : baseOptions;

    if (signal?.aborted) {
      return;
    }

    const openai = new OpenAI({ apiKey, baseURL });
    providerStream = openai.chat.completions.stream(requestOptions, { signal });

    for await (const chunk of providerStream) {
      if (signal?.aborted) {
        return;
      }

      for (const choice of chunk.choices) {
        if (choice.index !== 0) {
          continue;
        }

        for (const textDelta of [choice.delta.content, choice.delta.refusal]) {
          const textEvents = createTextDeltaEvents(
            messageId,
            textDelta,
            textStarted,
          );
          if (textEvents.length > 0) {
            textStarted = true;
          }
          for (const event of textEvents) {
            yield event;
            if (signal?.aborted) {
              return;
            }
          }
        }

        for (const delta of choice.delta.tool_calls ?? []) {
          let toolCall = mergeToolCall(toolCalls.get(delta.index), delta);

          if (!toolCall.started && toolCall.id && toolCall.name) {
            const pendingArguments = toolCall.pendingArguments;
            const startedToolCall = startToolCall(toolCall);
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: startedToolCall.id,
              toolCallName: startedToolCall.name,
              parentMessageId: messageId,
            };
            if (signal?.aborted) {
              return;
            }
            if (pendingArguments) {
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: startedToolCall.id,
                delta: pendingArguments,
              };
              if (signal?.aborted) {
                return;
              }
            }
            toolCall = startedToolCall;
          } else if (toolCall.started && toolCall.pendingArguments) {
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: toolCall.id as string,
              delta: toolCall.pendingArguments,
            };
            if (signal?.aborted) {
              return;
            }
            toolCall = { ...toolCall, pendingArguments: '' };
          }

          toolCalls.set(delta.index, toolCall);
        }
      }
    }

    if (signal?.aborted) {
      return;
    }

    if (textStarted) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
      if (signal?.aborted) {
        return;
      }
    }

    for (const pendingToolCall of toolCalls.values()) {
      const toolCall = pendingToolCall.started
        ? pendingToolCall
        : startToolCall(pendingToolCall);
      if (toolCall.pendingArguments) {
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: toolCall.id as string,
          delta: toolCall.pendingArguments,
        };
        if (signal?.aborted) {
          return;
        }
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId: toolCall.id as string,
      };
      if (signal?.aborted) {
        return;
      }
    }

    if (signal?.aborted) {
      return;
    }

    yield { type: EventType.RUN_FINISHED, threadId, runId };
  } catch (error: unknown) {
    if (!signal?.aborted) {
      yield { type: EventType.RUN_ERROR, message: normalizeError(error) };
    }
  } finally {
    providerStream?.abort();
  }
}
