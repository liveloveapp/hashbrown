import * as Chat from './public_api';
import { s } from '../../schema';

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
      const content = outputSchema
        ? message.content
          ? s.parse(outputSchema, message.content)
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
              arguments: toolCall.rawArgumentString,
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
