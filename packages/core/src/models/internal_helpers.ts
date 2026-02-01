import * as Chat from './public_api';
import { s } from '../schema';
import { JsonValue, resolveWithSchema } from '../utils';

function normalizeAssistantContent(
  resolved: JsonValue | undefined,
  fallback: string | undefined,
): string | object | undefined {
  if (resolved === undefined) {
    return fallback;
  }

  if (resolved === null) {
    return 'null';
  }

  if (typeof resolved === 'string') {
    return resolved;
  }

  if (typeof resolved === 'number' || typeof resolved === 'boolean') {
    return JSON.stringify(resolved);
  }

  return resolved;
}

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
      const contentResolved =
        message.content && typeof message.content === 'object'
          ? (message.content as JsonValue)
          : undefined;
      const content =
        typeof message.content === 'string'
          ? (message.content as string | undefined)
          : JSON.stringify(message.content);
      return [
        {
          role: 'assistant',
          content,
          contentResolved,
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
      const content = normalizeAssistantContent(
        message.contentResolved,
        message.content ?? '',
      );

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

              const resolvedArgs =
                toolCall.argumentsResolved ??
                (typeof toolCall.arguments === 'object'
                  ? toolCall.arguments
                  : undefined);

              const toolArgsString =
                typeof toolCall.arguments === 'string'
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments);

              switch (toolCall.status) {
                case 'done': {
                  return [
                    {
                      role: 'tool',
                      status: 'done',
                      name: toolCall.name,
                      toolCallId,
                      args: s.isHashbrownType(tool.schema)
                        ? (resolvedArgs ?? null)
                        : (resolvedArgs ?? JSON.parse(toolArgsString)),

                      // The internal models don't use a union, since that tends to
                      // complicate reducer logic. This is necessary to uplift our
                      // internal model into the view union.
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      result: toolCall.result!,
                    },
                  ];
                }
                case 'pending': {
                  return [
                    {
                      role: 'tool',
                      status: 'pending',
                      name: toolCall.name,
                      toolCallId,
                      progress: toolCall.progress,
                      args: s.isHashbrownType(tool.schema)
                        ? (resolvedArgs ?? null)
                        : (resolvedArgs ?? null),
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
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.contentResolved
            ? JSON.stringify(message.contentResolved)
            : '';
      const toolCallsForMessage = toolCalls.filter(
        (toolCall) =>
          message.toolCallIds.includes(toolCall.id) &&
          toolCall.name !== 'output',
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
          content,
          toolCalls: toolCallsForMessage.map((toolCall, index) => ({
            id: toolCall.id,
            index,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments:
                typeof toolCall.arguments === 'string'
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments),
            },
            metadata: toolCall.metadata,
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

  const rawArguments =
    typeof toolCall.function.arguments === 'string'
      ? toolCall.function.arguments
      : JSON.stringify(toolCall.function.arguments);

  return [
    {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: rawArguments,
      argumentsResolved:
        typeof toolCall.function.arguments === 'object'
          ? toolCall.function.arguments
          : undefined,
      status: 'pending',
      metadata: toolCall.metadata,
    },
  ];
}

/**
 * Converts a list of API messages (e.g., when hydrating a thread) into
 * internal tool call entities, stitching together assistant tool calls and
 * their corresponding tool results.
 * @internal
 */
export function toInternalToolCallsFromApiMessages(
  messages: Chat.Api.Message[] = [],
  toolsByName: Record<string, Chat.Internal.Tool> = {},
): Chat.Internal.ToolCall[] {
  const calls: Record<string, Chat.Internal.ToolCall> = {};

  // First capture all tool calls declared by assistant messages
  messages.forEach((message) => {
    if (message.role === 'assistant' && message.toolCalls) {
      message.toolCalls.forEach((toolCall) => {
        if (toolCall.function.name === 'output') {
          return;
        }

        const rawArguments =
          typeof toolCall.function.arguments === 'string'
            ? toolCall.function.arguments
            : JSON.stringify(toolCall.function.arguments);
        const tool = toolsByName[toolCall.function.name];
        const argumentsResolved =
          tool && s.isHashbrownType(tool.schema)
            ? resolveWithSchema(tool.schema, rawArguments)
            : undefined;

        calls[toolCall.id] = {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: rawArguments,
          argumentsResolved:
            argumentsResolved ??
            (typeof toolCall.function.arguments === 'object'
              ? toolCall.function.arguments
              : undefined),
          status: 'pending',
          metadata: toolCall.metadata,
        };
      });
    }
  });

  // Then stitch in tool results
  messages.forEach((message) => {
    if (message.role === 'tool') {
      const existing = calls[message.toolCallId];
      calls[message.toolCallId] = {
        id: message.toolCallId,
        name: existing?.name ?? message.toolName,
        arguments: existing?.arguments ?? '',
        status: 'done',
        result: message.content,
        metadata: existing?.metadata,
      };
    }
  });

  return Object.values(calls);
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
            argumentsResolved: toolCall.args,
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
            argumentsResolved: toolCall.args,
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

  const rawContent = output ? output.function.arguments : message.content;
  const content =
    typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

  return [
    {
      role: 'assistant',
      content,
      contentResolved: typeof rawContent === 'object' ? rawContent : undefined,
      toolCallIds:
        message.toolCalls
          ?.filter((toolCall) => toolCall.function.name !== 'output')
          .map((toolCall) => toolCall.id) || [],
    },
  ];
}
