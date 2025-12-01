import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ContentBlock,
  ContentBlockDelta,
  ConverseStreamCommand,
  ConverseStreamCommandInput,
  ToolChoice,
  ToolConfiguration,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  Message as BedrockMessage,
  Tool,
} from '@aws-sdk/client-bedrock-runtime';
import { AwsCredentialIdentity, DocumentType, Provider } from '@aws-sdk/types';
import { Chat, encodeFrame, Frame } from '@hashbrownai/core';

export interface BedrockTextStreamOptions {
  request: Chat.Api.CompletionCreateParams;
  /**
   * Optional pre-configured Bedrock client. If omitted, a client will be created
   * using the supplied region, and credentials (or ambient AWS env).
   */
  client?: BedrockRuntimeClient;
  region?: string;
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
}

export async function* text(
  options: BedrockTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { request } = options;
  const client = getBedrockClient(options);

  try {
    const baseOptions: ConverseStreamCommandInput = {
      modelId: request.model as string,
      system: request.system ? [{ text: request.system }] : undefined,
      messages: toBedrockMessages(request.messages),
      toolConfig: toToolConfiguration(request.tools, request.toolChoice),
    };

    const response = await client.send(new ConverseStreamCommand(baseOptions));

    const stream = response.stream;
    if (!stream) {
      throw new Error('Amazon Bedrock did not return a streaming response.');
    }

    const toolCallBlocks = new Map<
      number,
      { id: string; index: number; name: string; buffer: string }
    >();
    let nextToolCallIndex = 0;
    let finishReason: string | null = null;

    for await (const event of stream) {
      if (event.contentBlockStart?.start?.toolUse) {
        const blockIndex =
          event.contentBlockStart.contentBlockIndex ?? toolCallBlocks.size;
        const { toolUseId, name } = event.contentBlockStart.start.toolUse;
        const toolIndex = nextToolCallIndex++;

        if (!toolUseId || !name) {
          continue;
        }

        toolCallBlocks.set(blockIndex, {
          id: toolUseId,
          name,
          index: toolIndex,
          buffer: '',
        });

        /*
          When a tool call has no arguments and has a schema, we must send '{}' 
          for the arguments, as the schema would be an empty object. 

          So, for this initial tool call, we need to set arguments to '{}', but
          streaming tool calls (i.e. 'output') will get subsequent calls starting 
          with '' and then appending streaming input.

          On the UI side, the 'output' tool call's streamed arguments will start
          with {}.

          If we don't set the initial arguments to '{}' to prevent the extra brackets,
          we end up back at the original problem.
          
          To resolve this, we recognize that there are two sorts of tool calls:
          * those with empty arguments that, based on the schema, will always be empty
          * those with empty arguments _now_ that will get filled in later
          
          For a given tool call, we find the tool definition in the request object and
          check if it is an object type with no child properties.  If so, we assume 
          it to be an "empty" argument object and set arguments to '{}'.  

          Otherwise, we set arguments to ''.
        */
        let shouldProvideEmptyArgumentsObject = false;

        request.tools?.forEach((tool) => {
          if (tool.name === name) {
            if (
              'type' in tool.parameters &&
              'properties' in tool.parameters &&
              tool.parameters.type === 'object' &&
              Object.keys(tool.parameters.properties as any).length === 0
            ) {
              shouldProvideEmptyArgumentsObject = true;
            }
          }
        });

        yield encodeFrame({
          type: 'chunk',
          chunk: createChunk({
            finishReason,
            toolCalls: [
              {
                id: toolUseId,
                index: toolIndex,
                name,
                arguments: shouldProvideEmptyArgumentsObject ? '{}' : '',
              },
            ],
          }),
        });

        continue;
      }

      if (event.contentBlockDelta) {
        const { contentBlockIndex, delta } = event.contentBlockDelta;

        if (delta && isTextDelta(delta) && delta.text !== undefined) {
          yield encodeFrame({
            type: 'chunk',
            chunk: createChunk({
              content: delta.text,
              finishReason,
            }),
          });
          continue;
        }

        if (delta && isToolUseDelta(delta) && contentBlockIndex !== undefined) {
          const block = toolCallBlocks.get(contentBlockIndex);
          if (block) {
            block.buffer = delta.toolUse.input ?? '';
            toolCallBlocks.set(contentBlockIndex, block);

            yield encodeFrame({
              type: 'chunk',
              chunk: createChunk({
                finishReason,
                toolCalls: [
                  {
                    id: block.id,
                    index: block.index,
                    name: block.name,
                    arguments: block.buffer,
                  },
                ],
              }),
            });
          }
          continue;
        }

        if (delta && isSerializableDelta(delta)) {
          yield encodeFrame({
            type: 'chunk',
            chunk: createChunk({
              content: JSON.stringify(delta),
              finishReason,
            }),
          });
          continue;
        }
      }

      if (
        event.contentBlockStop &&
        event.contentBlockStop.contentBlockIndex !== undefined
      ) {
        toolCallBlocks.delete(event.contentBlockStop.contentBlockIndex);
        continue;
      }

      if (event.messageStop) {
        finishReason = event.messageStop.stopReason ?? null;
        yield encodeFrame({
          type: 'chunk',
          chunk: createChunk({ finishReason }),
        });
        continue;
      }

      if (event.internalServerException) {
        throw event.internalServerException;
      }

      if (event.modelStreamErrorException) {
        throw event.modelStreamErrorException;
      }

      if (event.validationException) {
        throw event.validationException;
      }

      if (event.throttlingException) {
        throw event.throttlingException;
      }

      if (event.serviceUnavailableException) {
        throw event.serviceUnavailableException;
      }
    }
  } catch (error: unknown) {
    yield encodeFrame(toErrorFrame(error));
  } finally {
    yield encodeFrame({ type: 'finish' });
  }
}

function getBedrockClient(
  options: BedrockTextStreamOptions,
): BedrockRuntimeClient {
  if (options.client) {
    return options.client;
  }

  const config: BedrockRuntimeClientConfig = {};

  if (options.region) {
    config.region = options.region;
  }

  if (options.credentials) {
    config.credentials = options.credentials;
  }

  return new BedrockRuntimeClient(config);
}

function toBedrockMessages(messages: Chat.Api.Message[]): BedrockMessage[] {
  return messages.map((message): BedrockMessage => {
    if (message.role === 'user') {
      return {
        role: 'user',
        content: [{ text: message.content }],
      };
    }

    if (message.role === 'assistant') {
      const contentBlocks: ContentBlock[] = [];

      if (message.content !== undefined) {
        contentBlocks.push({ text: coerceText(message.content) });
      }

      if (message.toolCalls?.length) {
        for (const toolCall of message.toolCalls) {
          contentBlocks.push({
            toolUse: {
              toolUseId: toolCall.id,
              name: toolCall.function.name,
              input: safeJsonParse(toolCall.function.arguments),
            },
          });
        }
      }

      if (contentBlocks.length === 0) {
        contentBlocks.push({ text: '' });
      }

      return {
        role: 'assistant',
        content: contentBlocks,
      };
    }

    if (message.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: message.toolCallId,
              content: toToolResultContent(message.content),
            },
          },
        ],
      };
    }

    throw new Error(`Invalid message role: ${message['role'] as string}`);
  });
}

function toToolConfiguration(
  tools: Chat.Api.Tool[] | undefined,
  toolChoice: Chat.Api.CompletionToolChoiceOption | undefined,
): ToolConfiguration | undefined {
  if (!tools?.length || toolChoice === 'none') {
    return undefined;
  }

  const config: ToolConfiguration = {
    tools: tools.map(
      (tool): Tool.ToolSpecMember => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: (tool.parameters ?? {}) as DocumentType,
          },
        },
      }),
    ),
  };

  const mappedChoice = mapToolChoice(toolChoice);
  if (mappedChoice) {
    config.toolChoice = mappedChoice;
  }

  return config;
}

function mapToolChoice(
  toolChoice: Chat.Api.CompletionToolChoiceOption | undefined,
): ToolChoice | undefined {
  switch (toolChoice) {
    case 'auto':
      return { auto: {} };
    case 'required':
      return { any: {} };
    default:
      return undefined;
  }
}

function toToolResultContent(
  result: PromiseSettledResult<unknown>,
): ToolResultContentBlock[] {
  const payload =
    result.status === 'fulfilled'
      ? result.value
      : {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };

  if (typeof payload === 'string') {
    return [{ text: payload }];
  }

  if (payload !== null && typeof payload === 'object') {
    return [{ json: { result: payload } as DocumentType }];
  }

  return [{ text: String(payload) }];
}

function safeJsonParse(value: string | undefined): DocumentType {
  if (!value) {
    // Bedrock requires an empty JSON object if there are no args
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function coerceText(value: unknown): string {
  if (typeof value === 'string') {
    if (value === '') {
      // NB: Bedrock doesn't allow empty text if the text field is present
      return 'tool call';
    }
    return value;
  }

  if (value === null || value === undefined) {
    // NB: Bedrock doesn't allow empty text if the text field is present
    return 'tool call';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isTextDelta(delta: ContentBlockDelta): delta is { text: string } {
  return Object.prototype.hasOwnProperty.call(delta, 'text');
}

function isToolUseDelta(
  delta: ContentBlockDelta,
): delta is ContentBlockDelta.ToolUseMember {
  return Object.prototype.hasOwnProperty.call(delta, 'toolUse');
}

function isSerializableDelta(delta: ContentBlockDelta): boolean {
  return (
    Object.prototype.hasOwnProperty.call(delta, 'toolResult') ||
    Object.prototype.hasOwnProperty.call(delta, 'reasoningContent') ||
    Object.prototype.hasOwnProperty.call(delta, 'citation')
  );
}

function createChunk({
  content,
  toolCalls,
  finishReason,
}: {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    index: number;
    arguments: string;
  }>;
  finishReason: string | null;
}): Chat.Api.CompletionChunk {
  return {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          ...(content !== undefined ? { content } : {}),
          ...(toolCalls
            ? {
                toolCalls: toolCalls.map((call) => ({
                  id: call.id,
                  index: call.index,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: call.arguments,
                  },
                })),
              }
            : {}),
        },
        finishReason,
      },
    ],
  };
}

function toErrorFrame(error: unknown): Frame {
  if (error instanceof Error) {
    return {
      type: 'error',
      error: error.toString(),
      stacktrace: error.stack,
    };
  }

  return {
    type: 'error',
    error: String(error),
  };
}
