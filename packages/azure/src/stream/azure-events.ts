import {
  type AGUIEvent,
  EventType,
  type TextMessageContentEvent,
  type TextMessageStartEvent,
} from '@ag-ui/core';
import type OpenAI from 'openai';

interface PendingToolCall {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly pendingArguments: string;
  readonly started: boolean;
}

/** Inputs for mapping Azure OpenAI chunks to canonical AG-UI events. */
export interface MapAzureEventsOptions {
  events: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  messageId: string;
  signal?: AbortSignal;
}

function createTextDeltaEvents(
  messageId: string,
  delta: string | null | undefined,
  started: boolean,
): Array<TextMessageStartEvent | TextMessageContentEvent> {
  if (!delta) {
    return [];
  }

  const contentEvent: TextMessageContentEvent = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
  };
  return started
    ? [contentEvent]
    : [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        },
        contentEvent,
      ];
}

function mergeToolCall(
  current: PendingToolCall | undefined,
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
): PendingToolCall {
  return {
    index: delta.index,
    id: delta.id ?? current?.id,
    name: delta.function?.name ?? current?.name,
    pendingArguments:
      current?.started === true
        ? (delta.function?.arguments ?? '')
        : `${current?.pendingArguments ?? ''}${delta.function?.arguments ?? ''}`,
    started: current?.started ?? false,
  };
}

function startToolCall(
  toolCall: PendingToolCall,
): PendingToolCall & { id: string; name: string } {
  if (!toolCall.id || !toolCall.name) {
    throw new Error(
      `Azure OpenAI returned incomplete metadata for tool call at index ${toolCall.index}`,
    );
  }

  return {
    ...toolCall,
    id: toolCall.id,
    name: toolCall.name,
    pendingArguments: '',
    started: true,
  };
}

/**
 * Maps Azure OpenAI streaming chunks to canonical AG-UI message events.
 *
 * @param options - Azure OpenAI stream and AG-UI message identity.
 * @returns Canonical AG-UI events for the provider response.
 *
 * @internal
 */
export async function* mapAzureEvents(
  options: MapAzureEventsOptions,
): AsyncIterable<AGUIEvent> {
  let textStarted = false;
  const toolCalls = new Map<number, PendingToolCall>();

  for await (const chunk of options.events) {
    if (options.signal?.aborted) {
      return;
    }

    for (const choice of chunk.choices) {
      if (choice.index !== 0) {
        continue;
      }

      for (const textDelta of [choice.delta.content, choice.delta.refusal]) {
        const textEvents = createTextDeltaEvents(
          options.messageId,
          textDelta,
          textStarted,
        );
        if (textEvents.length > 0) {
          textStarted = true;
        }
        for (const event of textEvents) {
          yield event;
          if (options.signal?.aborted) {
            return;
          }
        }
      }

      for (const delta of choice.delta.tool_calls ?? []) {
        let toolCall = mergeToolCall(toolCalls.get(delta.index), delta);

        if (!toolCall.started && toolCall.id && toolCall.name) {
          const pendingArguments = toolCall.pendingArguments;
          const startedToolCall = startToolCall(toolCall);
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: startedToolCall.id,
            toolCallName: startedToolCall.name,
            parentMessageId: options.messageId,
          };
          if (options.signal?.aborted) {
            return;
          }
          if (pendingArguments) {
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: startedToolCall.id,
              delta: pendingArguments,
            };
            if (options.signal?.aborted) {
              return;
            }
          }
          toolCall = startedToolCall;
        } else if (toolCall.started && toolCall.pendingArguments) {
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: toolCall.id as string,
            delta: toolCall.pendingArguments,
          };
          if (options.signal?.aborted) {
            return;
          }
          toolCall = { ...toolCall, pendingArguments: '' };
        }

        toolCalls.set(delta.index, toolCall);
      }
    }
  }

  if (options.signal?.aborted) {
    return;
  }

  if (textStarted) {
    yield { type: EventType.TEXT_MESSAGE_END, messageId: options.messageId };
    if (options.signal?.aborted) {
      return;
    }
  }

  for (const pendingToolCall of toolCalls.values()) {
    const toolCall = pendingToolCall.started
      ? pendingToolCall
      : startToolCall(pendingToolCall);
    if (toolCall.pendingArguments) {
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: toolCall.id as string,
        delta: toolCall.pendingArguments,
      };
      if (options.signal?.aborted) {
        return;
      }
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.id as string,
    };
    if (options.signal?.aborted) {
      return;
    }
  }
}
