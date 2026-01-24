import { Chat } from '@hashbrownai/core';
import OpenAI from 'openai';
import { FunctionParameters } from 'openai/resources/shared';

type BaseOpenAITextStreamOptions = {
  apiKey: string;
  baseURL?: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  ) =>
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming
    | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
};

export type OpenAITextStreamOptions = BaseOpenAITextStreamOptions;

export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, baseURL, request, transformRequestOptions } = options;
  const { model, tools, responseFormat, toolChoice, system } = request;

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL,
  });

  if (request.operation === 'load-thread') {
    yield encodeFrame(
      buildErrorFrame(
        'invalid_request',
        'Thread operations are not supported.',
      ),
    );
    return;
  }

  const mergedMessages = request.messages ?? [];

  try {
    const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      stream: true,
      model: model as string,
      messages: [
        ...(system
          ? ([
              {
                role: 'system',
                content: system,
              },
            ] as OpenAI.ChatCompletionMessageParam[])
          : []),
        ...mergedMessages.map((message): OpenAI.ChatCompletionMessageParam => {
          if (message.role === 'user') {
            return {
              role: message.role,
              content: message.content,
            };
          }
          if (message.role === 'assistant') {
            return {
              role: message.role,
              content:
                message.content && typeof message.content !== 'string'
                  ? JSON.stringify(message.content)
                  : message.content,
              tool_calls:
                message.toolCalls && message.toolCalls.length > 0
                  ? message.toolCalls.map((toolCall) => ({
                      ...toolCall,
                      type: 'function',
                      function: {
                        ...toolCall.function,
                        arguments: JSON.stringify(toolCall.function.arguments),
                      },
                    }))
                  : undefined,
            };
          }
          if (message.role === 'tool') {
            return {
              role: message.role,
              content: JSON.stringify(message.content),
              tool_call_id: message.toolCallId,
            };
          }

          throw new Error('Invalid message role');
        }),
      ],
      tools:
        tools && tools.length > 0
          ? tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as FunctionParameters,
                strict: true,
              },
            }))
          : undefined,
      tool_choice: toolChoice,
      response_format: responseFormat
        ? {
            type: 'json_schema',
            json_schema: {
              strict: true,
              name: 'schema',
              description: '',
              schema: responseFormat as Record<string, unknown>,
            },
          }
        : undefined,
    };

    const resolvedOptions: OpenAI.Chat.ChatCompletionCreateParams =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const stream = openai.chat.completions.stream(resolvedOptions);

    const state = createOpenResponsesState();

    for await (const chunk of stream) {
      const response = ensureResponse(state, chunk, request);
      if (response && !state.inProgressEmitted) {
        yield encodeFrame({ type: 'response.created', response });
        yield encodeFrame({ type: 'response.in_progress', response });
        state.inProgressEmitted = true;
      }

      for (const choice of chunk.choices) {
        const choiceIndex = choice.index;
        const delta =
          choice.delta as OpenAI.Chat.Completions.ChatCompletionChunk.Choice['delta'] &
            Record<string, unknown>;

        const contentDelta =
          typeof delta.content === 'string' ? delta.content : undefined;

        if (contentDelta !== undefined) {
          const textItem = ensureTextItem(state, choiceIndex);
          if (!textItem.contentStarted) {
            yield encodeFrame({
              type: 'response.output_item.added',
              outputIndex: textItem.outputIndex,
              item: buildMessageItem(textItem.itemId),
            });
            yield encodeFrame({
              type: 'response.content_part.added',
              itemId: textItem.itemId,
              outputIndex: textItem.outputIndex,
              contentIndex: textItem.contentIndex,
              part: buildTextPart(),
            });
            textItem.contentStarted = true;
          }

          textItem.text = `${textItem.text ?? ''}${contentDelta}`;

          yield encodeFrame({
            type: 'response.output_text.delta',
            itemId: textItem.itemId,
            outputIndex: textItem.outputIndex,
            contentIndex: textItem.contentIndex,
            delta: contentDelta,
          });
        }

        const toolCalls = Array.isArray(delta.tool_calls)
          ? delta.tool_calls
          : [];
        for (const toolCall of toolCalls) {
          const toolItem = ensureToolItem(state, choiceIndex, toolCall);

          if (!toolItem.outputEmitted) {
            yield encodeFrame({
              type: 'response.output_item.added',
              outputIndex: toolItem.outputIndex,
              item: buildToolItem(toolItem),
            });
            toolItem.outputEmitted = true;
          }

          const argDelta =
            typeof toolCall.function?.arguments === 'string'
              ? toolCall.function.arguments
              : undefined;

          if (argDelta !== undefined) {
            toolItem.arguments = `${toolItem.arguments ?? ''}${argDelta}`;
            yield encodeFrame({
              type: 'response.function_call_arguments.delta',
              itemId: toolItem.itemId,
              outputIndex: toolItem.outputIndex,
              delta: argDelta,
            });
          }
        }

        if (choice.finish_reason) {
          for (const item of state.items.values()) {
            if (item.choiceIndex === choiceIndex && !item.done) {
              yield* finalizeItem(item);
            }
          }
        }
      }
    }

    for (const item of state.items.values()) {
      if (!item.done) {
        yield* finalizeItem(item);
      }
    }

    if (state.response) {
      yield encodeFrame({
        type: 'response.completed',
        response: state.response,
      });
    }
  } catch (error: unknown) {
    const { message } = normalizeError(error);
    yield encodeFrame(buildErrorFrame('stream_error', message));
  }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

type ResponseResource = Record<string, unknown>;
type ToolCallDelta = NonNullable<
  OpenAI.Chat.Completions.ChatCompletionChunk.Choice['delta']['tool_calls']
>[number];

type OpenResponsesFrame =
  | {
      type: 'response.created' | 'response.in_progress' | 'response.completed';
      response: ResponseResource;
    }
  | {
      type: 'response.output_item.added' | 'response.output_item.done';
      outputIndex: number;
      item: Record<string, unknown> | null;
    }
  | {
      type: 'response.content_part.added' | 'response.content_part.done';
      itemId: string;
      outputIndex: number;
      contentIndex: number;
      part: Record<string, unknown>;
    }
  | {
      type: 'response.output_text.delta';
      itemId: string;
      outputIndex: number;
      contentIndex: number;
      delta: string;
    }
  | {
      type: 'response.output_text.done';
      itemId: string;
      outputIndex: number;
      contentIndex: number;
      text: string;
    }
  | {
      type: 'response.function_call_arguments.delta';
      itemId: string;
      outputIndex: number;
      delta: string;
    }
  | {
      type: 'response.function_call_arguments.done';
      itemId: string;
      outputIndex: number;
      arguments: string;
    }
  | {
      type: 'error';
      error: {
        type: string;
        message: string;
      };
    };

type OutputItemState = {
  itemId: string;
  outputIndex: number;
  choiceIndex: number;
  kind: 'text' | 'tool';
  contentIndex: number;
  text?: string;
  arguments?: string;
  name?: string;
  callId?: string;
  contentStarted: boolean;
  outputEmitted: boolean;
  done: boolean;
};

type OpenResponsesState = {
  response: ResponseResource | null;
  nextOutputIndex: number;
  items: Map<string, OutputItemState>;
  inProgressEmitted: boolean;
};

const createOpenResponsesState = (): OpenResponsesState => ({
  response: null,
  nextOutputIndex: 0,
  items: new Map(),
  inProgressEmitted: false,
});

const ensureResponse = (
  state: OpenResponsesState,
  chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  request: Chat.Api.CompletionCreateParams,
): ResponseResource | null => {
  if (state.response) {
    return state.response;
  }

  const id = chunk.id ?? Math.random().toString(36).slice(2);

  state.response = {
    id,
    model: chunk.model ?? request.model,
    created: chunk.created,
    object: 'response',
  };

  return state.response;
};

const ensureTextItem = (
  state: OpenResponsesState,
  choiceIndex: number,
): OutputItemState => {
  const key = `text:${choiceIndex}`;
  const existing = state.items.get(key);
  if (existing) {
    return existing;
  }

  const outputIndex = state.nextOutputIndex++;
  const itemId = `item_${outputIndex}`;
  const item: OutputItemState = {
    itemId,
    outputIndex,
    choiceIndex,
    kind: 'text',
    contentIndex: 0,
    contentStarted: false,
    outputEmitted: false,
    done: false,
  };
  state.items.set(key, item);

  return item;
};

const ensureToolItem = (
  state: OpenResponsesState,
  choiceIndex: number,
  toolCall: ToolCallDelta,
): OutputItemState => {
  const fallbackKey = `tool:${choiceIndex}:${toolCall.index ?? '0'}`;
  const key = toolCall.id ? `tool:${toolCall.id}` : fallbackKey;
  const existing = state.items.get(key);
  if (existing) {
    if (!existing.name && toolCall.function?.name) {
      existing.name = toolCall.function.name;
    }
    return existing;
  }

  const outputIndex = state.nextOutputIndex++;
  const itemId = `item_${outputIndex}`;

  const item: OutputItemState = {
    itemId,
    outputIndex,
    choiceIndex,
    kind: 'tool',
    contentIndex: 0,
    name: toolCall.function?.name,
    callId: toolCall.id,
    contentStarted: false,
    outputEmitted: false,
    done: false,
  };
  state.items.set(key, item);

  return item;
};

const buildMessageItem = (itemId: string): Record<string, unknown> => ({
  id: itemId,
  type: 'message',
  role: 'assistant',
  content: [],
});

const buildTextPart = (): Record<string, unknown> => ({
  type: 'output_text',
  text: '',
});

const buildToolItem = (item: OutputItemState): Record<string, unknown> => ({
  id: item.itemId,
  type: 'function_call',
  call_id: item.callId ?? item.itemId,
  name: item.name,
});

function* finalizeItem(item: OutputItemState): Generator<Uint8Array> {
  if (item.done) {
    return;
  }

  if (item.kind === 'text') {
    const text = item.text ?? '';
    yield encodeFrame({
      type: 'response.output_text.done',
      itemId: item.itemId,
      outputIndex: item.outputIndex,
      contentIndex: item.contentIndex,
      text,
    });
    yield encodeFrame({
      type: 'response.content_part.done',
      itemId: item.itemId,
      outputIndex: item.outputIndex,
      contentIndex: item.contentIndex,
      part: buildTextPart(),
    });
  } else {
    const args = item.arguments ?? '';
    yield encodeFrame({
      type: 'response.function_call_arguments.done',
      itemId: item.itemId,
      outputIndex: item.outputIndex,
      arguments: args,
    });
  }

  yield encodeFrame({
    type: 'response.output_item.done',
    outputIndex: item.outputIndex,
    item:
      item.kind === 'text'
        ? buildMessageItem(item.itemId)
        : buildToolItem(item),
  });

  item.done = true;
}

const buildErrorFrame = (
  type: string,
  message: string,
): OpenResponsesFrame => ({
  type: 'error',
  error: {
    type,
    message,
  },
});

const encodeFrame = (frame: OpenResponsesFrame): Uint8Array => {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(frame));
  const out = new Uint8Array(4 + jsonBytes.length);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  view.setUint32(0, jsonBytes.length, false);
  out.set(jsonBytes, 4);

  return out;
};
