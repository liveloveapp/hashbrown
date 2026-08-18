import { type AGUIEvent, EventType } from '@ag-ui/core';
import { Chat } from '../models';

type LegacyToolCall = {
  id?: string;
  name?: string;
  arguments: string;
  metadata?: Record<string, unknown>;
  started: boolean;
};

function serializeArguments(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Stateful adapter for the legacy completion chunks still emitted by frame transports.
 *
 * This adapter exists only at the legacy ingress boundary. Hashbrown reducers consume
 * the returned AG-UI events and do not depend on provider-shaped completion chunks.
 *
 * @internal
 */
export interface CompletionChunkEventAdapter {
  push(chunk: Chat.Api.CompletionChunk): AGUIEvent[];
  finish(): AGUIEvent[];
}

/**
 * Creates an adapter that converts legacy completion chunks into AG-UI message events.
 *
 * @param messageId - Stable AG-UI ID assigned to the assistant message for the run.
 * @returns A stateful completion chunk adapter.
 * @internal
 */
export function createCompletionChunkEventAdapter(
  messageId: string,
): CompletionChunkEventAdapter {
  const toolCalls = new Map<number, LegacyToolCall>();
  const toolCallIndexById = new Map<string, number>();
  let textStarted = false;
  let finished = false;

  return {
    push(chunk) {
      if (finished) {
        return [];
      }

      const choice = chunk.choices[0];
      if (!choice) {
        return [];
      }

      const events: AGUIEvent[] = [];
      const content = choice.delta.content;
      if (typeof content === 'string' && content.length > 0) {
        if (!textStarted) {
          textStarted = true;
          events.push({
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: 'assistant',
          });
        }

        events.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: content,
        });
      }

      for (const delta of choice.delta.toolCalls ?? []) {
        const index =
          delta.index ??
          (delta.id ? toolCallIndexById.get(delta.id) : undefined);
        if (index === undefined) {
          continue;
        }

        const previous = toolCalls.get(index) ?? {
          arguments: '',
          started: false,
        };
        const argumentDelta = serializeArguments(
          delta.function?.arguments as unknown,
        );
        const next: LegacyToolCall = {
          id: delta.id ?? previous.id,
          name: delta.function?.name ?? previous.name,
          arguments:
            previous.arguments +
            (argumentDelta !== undefined ? argumentDelta : ''),
          metadata: delta.metadata
            ? { ...(previous.metadata ?? {}), ...delta.metadata }
            : previous.metadata,
          started: previous.started,
        };

        if (next.id) {
          toolCallIndexById.set(next.id, index);
        }

        if (!next.started && next.id && next.name) {
          next.started = true;
          events.push({
            type: EventType.TOOL_CALL_START,
            toolCallId: next.id,
            toolCallName: next.name,
            parentMessageId: messageId,
            ...(next.metadata
              ? {
                  rawEvent: {
                    hashbrown: { metadata: next.metadata },
                  },
                }
              : {}),
          });
          if (next.arguments.length > 0) {
            events.push({
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: next.id,
              delta: next.arguments,
            });
          }
        } else if (
          next.started &&
          next.id &&
          ((argumentDelta !== undefined && argumentDelta.length > 0) ||
            delta.metadata)
        ) {
          events.push({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: next.id,
            delta: argumentDelta ?? '',
            ...(delta.metadata
              ? {
                  rawEvent: {
                    hashbrown: { metadata: delta.metadata },
                  },
                }
              : {}),
          });
        }

        toolCalls.set(index, next);
      }

      return events;
    },
    finish() {
      if (finished) {
        return [];
      }
      finished = true;

      const events: AGUIEvent[] = [];
      if (textStarted) {
        events.push({
          type: EventType.TEXT_MESSAGE_END,
          messageId,
        });
      }
      for (const toolCall of toolCalls.values()) {
        if (toolCall.started && toolCall.id) {
          events.push({
            type: EventType.TOOL_CALL_END,
            toolCallId: toolCall.id,
          });
        }
      }

      return events;
    },
  };
}
