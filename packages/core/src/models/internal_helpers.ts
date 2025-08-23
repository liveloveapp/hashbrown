import * as Chat from './public_api';
import { s } from '../schema';
import { StreamSchemaParser } from '../streaming-json-parser/streaming-json-parser';

/**
 * Converts a view message to an internal message.
 *
 * @param message - The view message to convert.
 * @returns The internal message.
 * @internal
 */
export function toInternalMessagesFromView(
  message: Chat.AnyMessage,
): Chat.Internal.Message[] {
  switch (message.role) {
    case 'user': {
      return [
        {
          role: 'user',
          content: message.content,
        },
      ];
    }

    case 'assistant': {
      return [
        {
          role: 'assistant',
          content: message.content as string | undefined,
          toolCallIds: message.toolCalls.map((toolCall) => toolCall.toolCallId),
        },
      ];
    }

    default: {
      return [];
    }
  }
}

/**
 * Converts an internal message to a view message.
 *
 * @param message - The internal message to convert.
 * @returns The view message.
 * @internal
 */
export function toViewMessagesFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Record<string, Chat.Internal.ToolCall>,
  tools: Chat.AnyTool[],
  outputSchema?: s.HashbrownType,
  streaming = true,
): Chat.AnyMessage[] {
  console.log({
    message,
    toolCalls,
    tools,
    outputSchema,
    streaming,
  });
  switch (message.role) {
    case 'user': {
      return [
        {
          role: 'user',
          content: message.content,
        },
      ];
    }
    case 'error': {
      return [
        {
          role: 'error',
          content: message.content,
        },
      ];
    }
    case 'assistant': {
      const tater = outputSchema
        ? new StreamSchemaParser(outputSchema)
        : undefined;

      let content = message.content;

      if (typeof message.content === 'string' && tater) {
        content = tater.parse(message.content, !streaming);
      } else if (message.content && typeof message.content === 'object') {
        content = message.content;
      }

      return [
        {
          role: 'assistant',
          content,
          toolCalls: message.toolCallIds.flatMap(
            (toolCallId): Chat.AnyToolCall[] => {
              const toolCall = toolCalls[toolCallId];
              const tool = tools.find((tool) => tool.name === toolCall.name);

              if (!tool) {
                return [];
              }

              switch (toolCall.status) {
                case 'done': {
                  return [
                    {
                      role: 'tool',
                      status: 'done',
                      name: toolCall.name,
                      toolCallId,
                      args:
                        // TODO: add tests around how this has to be this way for Ollama,
                        // since tool args are just an object.
                        // TODO: maybe compare tool args with how OpenAI does it to see
                        // "keys materializing" in different frames
                        typeof toolCall.arguments === 'string'
                          ? s.isHashbrownType(tool.schema)
                            ? new StreamSchemaParser(tool.schema).parse(
                                toolCall.arguments,
                                !streaming,
                              )
                            : // TODO: Ok, so, this isn't a string and doesn't get passed to tater,
                              // but that means streaming doesn't work.  Need to find a better solution.
                              JSON.parse(toolCall.arguments)
                          : toolCall.arguments,
                      // The internal models don't use a union, since that tends to
                      // complicate reducer logic. This is necessary to uplift our
                      // internal model into the view union.
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      result: toolCall.result!,
                    },
                  ];
                }
                case 'pending': {
                  console.log('pending', { toolCall, tool });
                  return [
                    {
                      role: 'tool',
                      status: 'pending',
                      name: toolCall.name,
                      toolCallId,
                      progress: toolCall.progress,
                      args:
                        typeof toolCall.arguments === 'string'
                          ? s.isHashbrownType(tool.schema)
                            ? new StreamSchemaParser(tool.schema).parse(
                                toolCall.arguments,
                                !streaming,
                              )
                            : null
                          : toolCall.arguments,
                    },
                  ];
                }
              }
            },
          ),
        },
      ];
    }

    default: {
      return [];
    }
  }
}

/**
 * Converts an internal message to an API message.
 *
 * @param message - The internal message to convert.
 * @param toolCalls - The tool calls to convert.
 * @returns The API message.
 * @internal
 */
export function toApiMessagesFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Chat.Internal.ToolCall[],
): Chat.Api.Message[] {
  switch (message.role) {
    case 'user': {
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        },
      ];
    }

    case 'assistant': {
      const toolCallsForMessage = toolCalls.filter((toolCall) =>
        message.toolCallIds.includes(toolCall.id),
      );
      const toolMessages = toolCallsForMessage.flatMap(
        (toolCall): Chat.Api.ToolMessage[] => {
          if (toolCall.status !== 'done' || !toolCall.result) {
            return [];
          }

          return [
            {
              role: 'tool',
              content: toolCall.result,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            },
          ];
        },
      );
      return [
        {
          role: 'assistant',
          content: message.content,
          toolCalls: toolCallsForMessage.map((toolCall, index) => ({
            id: toolCall.id,
            index,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        },
        ...toolMessages,
      ];
    }

    default: {
      return [];
    }
  }
}

/**
 * Converts an internal tool to an API tool.
 *
 * @param tool - The internal tool to convert.
 * @returns The API tool.
 * @internal
 */
export function toApiToolsFromInternal(
  tools: Chat.Internal.Tool[],
  emulateStructuredOutput: boolean,
  outputSchema: s.HashbrownType,
): Chat.Api.Tool[] {
  const apiTools = tools.map((tool) => ({
    description: tool.description,
    name: tool.name,
    parameters: s.isHashbrownType(tool.schema)
      ? s.toJsonSchema(tool.schema)
      : tool.schema,
  }));

  if (emulateStructuredOutput) {
    apiTools.push({
      description:
        'This should be your final tool call. Generate a response that matches the provided schema.',
      name: 'output',
      parameters: s.toJsonSchema(outputSchema),
    });
  }

  return apiTools;
}

/**
 * Converts an API tool call to an internal tool call.
 *
 * @param toolCall - The API tool call to convert.
 * @returns The internal tool calls.
 * @internal
 */
export function toInternalToolCallsFromApi(
  toolCall: Chat.Api.ToolCall,
): Chat.Internal.ToolCall[] {
  if (toolCall.function.name === 'output') {
    return [];
  }

  return [
    {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
      status: 'pending',
    },
  ];
}

/**
 * Converts a view message to an internal tool call.
 *
 * @param message - The view message to convert.
 * @returns The internal tool calls.
 * @internal
 */
export function toInternalToolCallsFromView(
  messages: Chat.AnyMessage[],
): Chat.Internal.ToolCall[] {
  return messages.flatMap((message): Chat.Internal.ToolCall[] => {
    if (message.role !== 'assistant') {
      return [];
    }

    return message.toolCalls.map((toolCall): Chat.Internal.ToolCall => {
      switch (toolCall.status) {
        case 'done': {
          return {
            id: toolCall.toolCallId,
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args),
            status: 'done',
            result: toolCall.result,
          };
        }
        case 'pending': {
          return {
            id: toolCall.toolCallId,
            name: toolCall.name,
            status: 'pending',
            arguments: JSON.stringify(toolCall.args),
          };
        }
      }
    });
  });
}

/**
 * Converts an API assistant message to an internal assistant message.
 *
 * @param message - The API assistant message to convert.
 * @returns The internal assistant message.
 * @internal
 */
export function toInternalMessagesFromApi(
  message: Chat.Api.Message,
): Chat.Internal.Message[] {
  if (message.role === 'tool') {
    return [];
  }

  if (message.role === 'user') {
    return [
      {
        role: 'user',
        content: message.content,
      },
    ];
  }

  if (message.role === 'error') {
    return [
      {
        role: 'error',
        content: message.content,
      },
    ];
  }

  const output = message.toolCalls?.find(
    (toolCall) => toolCall.function.name === 'output',
  );

  const content = output ? output.function.arguments : message.content;

  return [
    {
      role: 'assistant',
      content,
      toolCallIds:
        message.toolCalls
          ?.filter((toolCall) => toolCall.function.name !== 'output')
          .map((toolCall) => toolCall.id) || [],
    },
  ];
}
