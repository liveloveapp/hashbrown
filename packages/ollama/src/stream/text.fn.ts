import {
  Chat,
  encodeFrame,
  Frame,
  mergeMessagesForThread,
  updateAssistantMessage,
} from '@hashbrownai/core';
import OllamaClient, { ChatRequest, Message, Ollama, ToolCall } from 'ollama';
import { FunctionParameters } from 'openai/resources/shared';

type BaseOllamaTextStreamOptions = {
  turbo?: { apiKey: string };
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: ChatRequest & { stream: true },
  ) =>
    | (ChatRequest & { stream: true })
    | Promise<ChatRequest & { stream: true }>;
};

type ThreadPersistenceOptions = {
  loadThread: (threadId: string) => Promise<Chat.Api.Message[]>;
  saveThread: (
    thread: Chat.Api.Message[],
    threadId?: string,
  ) => Promise<string>;
};

type ThreadlessOptions = BaseOllamaTextStreamOptions & {
  loadThread?: undefined;
  saveThread?: undefined;
};

type ThreadfulOptions = BaseOllamaTextStreamOptions & ThreadPersistenceOptions;

export type OpenAITextStreamOptions = ThreadlessOptions | ThreadfulOptions;

export function text(options: ThreadfulOptions): AsyncIterable<Uint8Array>;
export function text(options: ThreadlessOptions): AsyncIterable<Uint8Array>;

export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { turbo, request, transformRequestOptions, loadThread, saveThread } =
    options;
  const { model, tools, responseFormat, system } = request;
  const threadId = request.threadId;
  let loadedThread: Chat.Api.Message[] = [];
  let effectiveThreadId = threadId;

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

    try {
      loadedThread = await loadThread(request.threadId as string);
      if (shouldHydrateThreadOnTheClient) {
        yield encodeFrame({
          type: 'thread-load-success',
          thread: loadedThread,
        });
      } else {
        yield encodeFrame({ type: 'thread-load-success' });
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
  const mergedMessagesLength = mergedMessages.length;
  let assistantMessage: Chat.Api.AssistantMessage | null = null;

  try {
    const baseOptions: ChatRequest & { stream: true } = {
      stream: true,
      model: model as string,
      options: {
        // num_ctx: 32768,
      },
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...mergedMessages.map((message): Message => {
          if (message.role === 'user') {
            return {
              role: message.role,
              content: message.content,
            };
          }
          if (message.role === 'assistant') {
            return {
              role: message.role,
              content: message.content ?? '',
              tool_calls:
                message.toolCalls && message.toolCalls.length > 0
                  ? message.toolCalls.map(
                      (toolCall): ToolCall => ({
                        ...toolCall,
                        function: {
                          ...toolCall.function,
                          arguments: normalizeToolArguments(
                            toolCall.function.arguments,
                          ),
                        },
                      }),
                    )
                  : undefined,
            };
          }
          if (message.role === 'tool') {
            return {
              role: message.role,
              content: JSON.stringify(message.content),
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
      format: responseFormat ? responseFormat : undefined,
    };

    const resolvedOptions: ChatRequest & { stream: true } =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const client = turbo
      ? new Ollama({
          host: 'https://ollama.com',
          headers: {
            Authorization: `Bearer ${turbo.apiKey}`,
          },
        })
      : OllamaClient;

    const stream = await client.chat(resolvedOptions);

    yield encodeFrame({ type: 'generation-start' });

    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: [
          {
            index: 0,
            delta: {
              content: chunk.message.content,
              role: chunk.message.role,
              toolCalls: chunk.message.tool_calls?.map((toolCall, index) => ({
                ...toolCall,
                id: `tool-call-${mergedMessagesLength}-${index}`,
                index,
                function: {
                  ...toolCall.function,
                  arguments: toolCall.function.arguments as any,
                },
              })),
            },
            finishReason: chunk.done ? 'stop' : null,
          },
        ],
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

function normalizeToolArguments(args: unknown): {
  [key: string]: any;
} {
  if (args && typeof args === 'object') {
    return args as { [key: string]: any };
  }

  if (typeof args === 'string') {
    try {
      let parsed: unknown = JSON.parse(args);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // Keep the original parsed string if it isn't valid JSON.
        }
      }
      if (parsed && typeof parsed === 'object') {
        return parsed as { [key: string]: any };
      }
    } catch {
      // Fall through to empty object when args are not valid JSON.
    }
  }

  return {};
}
