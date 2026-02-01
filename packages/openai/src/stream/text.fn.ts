import {
  Chat,
  encodeFrame,
  Frame,
  mergeMessagesForThread,
  updateAssistantMessage,
} from '@hashbrownai/core';
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

type ThreadPersistenceOptions = {
  loadThread: (threadId: string) => Promise<Chat.Api.Message[]>;
  saveThread: (
    thread: Chat.Api.Message[],
    threadId?: string,
  ) => Promise<string>;
};

type ThreadlessOptions = BaseOpenAITextStreamOptions & {
  loadThread?: undefined;
  saveThread?: undefined;
};

type ThreadfulOptions = BaseOpenAITextStreamOptions & ThreadPersistenceOptions;

export type OpenAITextStreamOptions = ThreadlessOptions | ThreadfulOptions;

export function text(options: ThreadfulOptions): AsyncIterable<Uint8Array>;
export function text(options: ThreadlessOptions): AsyncIterable<Uint8Array>;

export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const {
    apiKey,
    baseURL,
    request,
    transformRequestOptions,
    loadThread,
    saveThread,
  } = options;
  const { model, tools, responseFormat, toolChoice, system } = request;
  const threadId = request.threadId;
  let loadedThread: Chat.Api.Message[] = [];
  let effectiveThreadId = threadId;

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL,
  });

  // Thread loading (both load-thread op and generate op with threadId)
  const shouldLoadThread = Boolean(request.threadId);
  const shouldHydrateThreadOnTheClient = Boolean(
    request.operation === 'load-thread',
  );

  if (shouldLoadThread) {
    yield encodeFrame({ type: 'thread-load-start' });

    if (!loadThread) {
      yield encodeFrame({
        type: 'thread-load-failure',
        error: 'Thread loading is not available for this transport.',
      });
      return;
    }

    const loadFn = loadThread;
    try {
      loadedThread = await loadFn(request.threadId as string);
      if (shouldHydrateThreadOnTheClient) {
        yield encodeFrame({
          type: 'thread-load-success',
          thread: loadedThread,
        });
      } else {
        yield encodeFrame({
          type: 'thread-load-success',
        });
      }
    } catch (error: unknown) {
      const { message, stack } = normalizeError(error);
      yield encodeFrame({
        type: 'thread-load-failure',
        error: message,
        stacktrace: stack,
      });
      return;
    }
  }

  if (request.operation === 'load-thread') {
    return;
  }

  const mergedMessages =
    request.threadId && shouldLoadThread
      ? mergeMessagesForThread(loadedThread, request.messages ?? [])
      : (request.messages ?? []);
  let assistantMessage: Chat.Api.AssistantMessage | null = null;

  try {
    const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      stream: true,
      model: model as string,
      messages: [
        {
          role: 'system',
          content: system,
        },
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

          throw new Error(`Invalid message role`);
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

    yield encodeFrame({ type: 'generation-start' });

    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.choices.map(
          (
            choice: OpenAI.Chat.Completions.ChatCompletionChunk.Choice,
          ): Chat.Api.CompletionChunkChoice => ({
            index: choice.index,
            delta: {
              content: choice.delta.content,
              role: choice.delta.role,
              toolCalls: choice.delta.tool_calls,
            },
            finishReason: choice.finish_reason,
          }),
        ),
      };

      const frame: Frame = {
        type: 'generation-chunk',
        chunk: chunkMessage,
      };

      assistantMessage = updateAssistantMessage(assistantMessage, chunkMessage);

      yield encodeFrame(frame);
    }

    yield encodeFrame({ type: 'generation-finish' });
  } catch (error: unknown) {
    const { message, stack } = normalizeError(error);
    const frame: Frame = {
      type: 'generation-error',
      error: message,
      stacktrace: stack,
    };
    yield encodeFrame(frame);

    return;
  }

  if (saveThread) {
    const threadToSave = mergeMessagesForThread(mergedMessages, [
      ...(assistantMessage ? [assistantMessage] : []),
    ]);
    yield encodeFrame({ type: 'thread-save-start' });
    try {
      const savedThreadId = await saveThread(threadToSave, effectiveThreadId);
      if (effectiveThreadId && savedThreadId !== effectiveThreadId) {
        throw new Error(
          'Save returned a different threadId than the existing thread',
        );
      }
      effectiveThreadId = savedThreadId;
      yield encodeFrame({
        type: 'thread-save-success',
        threadId: savedThreadId,
      });
    } catch (error: unknown) {
      const { message, stack } = normalizeError(error);
      yield encodeFrame({
        type: 'thread-save-failure',
        error: message,
        stacktrace: stack,
      });
      return;
    }
  }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
