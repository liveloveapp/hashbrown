import * as Chat from './public_api';
import { s } from '../../schema';
import { StreamSchemaParser } from '../../streaming-json-parser/streaming-json-parser';

/**
 * Converts a view message to an internal message.
 *
 * @param message - The view message to convert.
 * @returns The internal message.
 * @internal
 */
export function toInternalMessageFromView(
  message: Chat.AnyMessage,
): Chat.Internal.Message {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        content: message.content,
      };
    }

    case 'assistant': {
      return {
        role: 'assistant',
        content: message.content as string | undefined,
        toolCallIds: message.toolCalls.map((toolCall) => toolCall.toolCallId),
      };
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
export function toViewMessageFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Record<string, Chat.Internal.ToolCall>,
  outputSchema?: s.HashbrownType,
): Chat.AnyMessage {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        content: message.content,
      };
    }
    case 'assistant': {
      const tater = outputSchema
        ? new StreamSchemaParser(outputSchema)
        : undefined;
      const content = tater
        ? message.content
          ? tater.parse(message.content)
          : undefined
        : message.content;

      return {
        role: 'assistant',
        content,
        toolCalls: message.toolCallIds.map((toolCallId): Chat.AnyToolCall => {
          const toolCall = toolCalls[toolCallId];

          switch (toolCall.status) {
            case 'done': {
              return {
                role: 'tool',
                status: 'done',
                name: toolCall.name,
                toolCallId,
                args: toolCall.arguments,
                // The internal models don't use a union, since that tends to
                // complicate reducer logic. This is necessary to uplift our
                // internal model into the view union.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                result: toolCall.result!,
              };
            }
            case 'pending': {
              return {
                role: 'tool',
                status: 'pending',
                name: toolCall.name,
                toolCallId,
                progress: toolCall.progress,
                args: toolCall.arguments,
              };
            }
          }
        }),
      };
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
export function toApiMessageFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Chat.Internal.ToolCall[],
): Chat.Api.Message[] {
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
      const toolCallsForMessage = toolCalls.filter((toolCall) =>
        message.toolCallIds.includes(toolCall.id),
      );
      const toolMessages = toolCallsForMessage.flatMap(
        (toolCall): Chat.Api.ToolMessage[] => {
          if (toolCall.status !== 'done') {
            return [];
          }

          const result = toolCall.result;

          if (!result) {
            return [];
          }

          return [
            {
              role: 'tool',
              content: result,
              tool_call_id: toolCall.id,
              tool_name: toolCall.name,
            },
          ];
        },
      );
      return [
        {
          role: 'assistant',
          content: message.content,
          tool_calls: toolCallsForMessage.map((toolCall, index) => ({
            id: toolCall.id,
            index,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
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
export function toApiToolFromInternal(tool: Chat.Internal.Tool): Chat.Api.Tool {
  return {
    description: tool.description,
    name: tool.name,
    parameters: s.toJsonSchema(tool.schema),
  };
}

/**
 * Converts an API tool call to an internal tool call.
 *
 * @param toolCall - The API tool call to convert.
 * @returns The internal tool call.
 * @internal
 */
export function toInternalToolCallFromApi(
  toolCall: Chat.Api.ToolCall,
): Chat.Internal.ToolCall {
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: JSON.parse(toolCall.function.arguments),
    status: 'pending',
  };
}

export function toInternalToolCallsFromView(
  messages: Chat.AnyMessage[],
): Chat.Internal.ToolCall[] {
  return messages.flatMap((message): Chat.Internal.ToolCall[] => {
    if (message.role !== 'assistant') {
      return [];
    }

    return message.toolCalls.map((toolCall) => {
      switch (toolCall.status) {
        case 'done': {
          return {
            id: toolCall.toolCallId,
            name: toolCall.name,
            arguments: toolCall.args,
            status: 'done',
            result: toolCall.result,
          };
        }
        case 'pending': {
          return {
            id: toolCall.toolCallId,
            name: toolCall.name,
            status: 'pending',
            arguments: toolCall.args,
          };
        }
      }
    });
  });
}
