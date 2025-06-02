/* eslint-disable @typescript-eslint/no-explicit-any */
import Writer from 'writer-sdk';
import { Chat, encodeFrame } from '@hashbrownai/core';
import { createReadStream } from 'fs';
import { ToolParam } from 'writer-sdk/resources/shared';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The options for the Writer text stream.
 */
export interface WriterTextStreamOptions {
  /**
   * The API key for the Writer API.
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
}

/**
 * Streams text from the Writer API.
 *
 * @param options - The options for the stream.
 * @returns An async iterable of Uint8Arrays.
 */
export async function* text(
  options: WriterTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, request, transformRequestOptions } = options;
  const writer = new Writer({
    apiKey,
  });

  // Upload talks file
  const file = await writer.files.upload({
    content: createReadStream('packages/writer/src/stream/speaker-data.txt'),
    'Content-Disposition': 'attachment; filename=sessions.txt',
    'Content-Type': 'application/text',
  });
  const fileId = file.id;

  const graphInfo = await writer.graphs.create({ name: 'conference_talks' });
  const graphId = graphInfo.id;

  await writer.graphs.addFileToGraph(graphId, {
    file_id: fileId,
  });

  let updatedGraphInfo = await writer.graphs.retrieve(graphId);

  console.log('Waiting for file to finish...');
  // NB: this takes many seconds, and needs to be moved out of the per-/chat code
  while (updatedGraphInfo.file_status.completed === 0) {
    sleep(200);

    updatedGraphInfo = await writer.graphs.retrieve(graphId);
    console.log(updatedGraphInfo);
  }
  console.log('File finished.');

  const tools: any[] = [
    {
      type: 'graph',
      function: {
        description:
          'Knowledge Graph containing information conference talks and sessions',
        graph_ids: [graphId],
        subqueries: true,
      },
    },
  ];

  if (request.tools && request.tools.length > 0) {
    tools.push(
      ...request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as Record<string, object>,
          strict: true,
        },
      })),
    );
  }

  try {
    const baseRequestOptions: Writer.Chat.ChatChatParams = {
      stream: true,
      model: request.model,
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
      tools,
      messages: [
        {
          role: 'system',
          content: request.system,
        },
        ...request.messages.map(
          (message): Writer.Chat.ChatChatParams.Message => {
            switch (message.role) {
              case 'user':
                return {
                  role: 'user',
                  content: message.content,
                };
              case 'assistant':
                return {
                  role: 'assistant',
                  content: message.content,
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
          },
        ),
      ],
    };
    const requestOptions = transformRequestOptions
      ? await transformRequestOptions(baseRequestOptions)
      : baseRequestOptions;

    const stream = await writer.chat.chat({
      ...requestOptions,
      stream: true,
    });

    for await (const chunk of stream) {
      console.log(chunk);
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
        type: 'chunk',
        chunk: chunkMessage,
      });
    }
  } catch (error) {
    yield encodeFrame({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    yield encodeFrame({
      type: 'finish',
    });
  }
}
