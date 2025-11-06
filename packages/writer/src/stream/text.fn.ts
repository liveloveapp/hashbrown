/* eslint-disable @typescript-eslint/no-explicit-any */
import Writer from 'writer-sdk';
import {
  Chat,
  encodeFrame,
  mergeMessagesForThread,
  updateAssistantMessage,
} from '@hashbrownai/core';

/**
 * The options for the Writer text stream.
 */
type BaseWriterTextStreamOptions = {
  /**
   * The API Key for the Writer API.
   */
  apiKey: string;
  /**
   * The request for the stream.
   */
  request: Chat.Api.CompletionCreateParams;
  /**
   * A function to transform the request options.
   */
  transformRequestOptions?: (
    options: Writer.Chat.ChatChatParams,
  ) => Writer.Chat.ChatChatParams | Promise<Writer.Chat.ChatChatParams>;
};

type ThreadPersistenceOptions = {
  loadThread: (threadId: string) => Promise<Chat.Api.Message[]>;
  saveThread: (
    thread: Chat.Api.Message[],
    threadId?: string,
  ) => Promise<string>;
};

type ThreadlessOptions = BaseWriterTextStreamOptions & {
  loadThread?: undefined;
  saveThread?: undefined;
};

type ThreadfulOptions = BaseWriterTextStreamOptions & ThreadPersistenceOptions;

export type WriterTextStreamOptions = ThreadlessOptions | ThreadfulOptions;

/**
 * Streams text from the Writer API.
 *
 * @param options - The options for the stream.
 * @returns An async iterable of Uint8Arrays.
 */
export function text(options: ThreadfulOptions): AsyncIterable<Uint8Array>;
export function text(options: ThreadlessOptions): AsyncIterable<Uint8Array>;

export async function* text(
  options: WriterTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, request, transformRequestOptions, loadThread, saveThread } =
    options;
  const writer = new Writer({
    apiKey,
  });
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
      yield encodeFrame({
        type: 'thread-load-failure',
        error: error instanceof Error ? error.message : String(error),
        stacktrace: error instanceof Error ? error.stack : undefined,
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
    const baseRequestOptions: Writer.Chat.ChatChatParams = {
      stream: true,
      model: request.model as string,
      tool_choice: request.toolChoice
        ? { value: request.toolChoice }
        : undefined,
      response_format: request.responseFormat
        ? {
            type: 'json_schema',
            json_schema: {
              strict: true,
              name: 'schema',
              description: '',
              schema: request.responseFormat,
            },
          }
        : undefined,
      tools:
        request.tools && request.tools.length > 0
          ? request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as Record<string, object>,
                strict: true,
              },
            }))
          : undefined,
      messages: [
        {
          role: 'system',
          content: request.system,
        },
        ...mergedMessages.map((message): Writer.Chat.ChatChatParams.Message => {
          switch (message.role) {
            case 'user':
              return {
                role: 'user',
                content: message.content,
              };
            case 'assistant':
              return {
                role: 'assistant',
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
                          arguments: JSON.stringify(
                            toolCall.function.arguments,
                          ),
                        },
                      }))
                    : undefined,
              };
            case 'tool':
              return {
                role: 'tool',
                content: JSON.stringify(message.content),
                tool_call_id: message.toolCallId,
              };
            default:
              throw new Error(
                `Unsupported message role: ${(message as any).role}`,
              );
          }
        }),
      ],
    };
    const requestOptions = transformRequestOptions
      ? await transformRequestOptions(baseRequestOptions)
      : baseRequestOptions;

    const stream = await writer.chat.chat({
      ...requestOptions,
      stream: true,
    });

    yield encodeFrame({ type: 'generation-start' });

    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.choices.map(
          (choice): Chat.Api.CompletionChunkChoice => ({
            index: choice.index,
            delta: {
              ...choice.delta,
              toolCalls: choice.delta.tool_calls ?? undefined,
            },
            finishReason: choice.finish_reason,
          }),
        ),
      };

      yield encodeFrame({
        type: 'generation-chunk',
        chunk: chunkMessage,
      });

      assistantMessage = updateAssistantMessage(assistantMessage, chunkMessage);
    }
  } catch (error) {
    yield encodeFrame({
      type: 'generation-error',
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  yield encodeFrame({
    type: 'generation-finish',
  });

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
      yield encodeFrame({
        type: 'thread-save-failure',
        error: error instanceof Error ? error.message : String(error),
        stacktrace: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}
