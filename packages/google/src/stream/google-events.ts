import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { GenerateContentResponse } from '@google/genai';

/**
 * Inputs for mapping Google response chunks to canonical AG-UI events.
 *
 * @internal
 */
export interface MapGoogleEventsOptions {
  events: AsyncIterable<GenerateContentResponse>;
  messageId: string;
  signal?: AbortSignal;
}

/**
 * Maps Google response chunks to canonical AG-UI message events.
 *
 * @param options - Google stream and AG-UI message identity.
 * @returns Canonical AG-UI events for the provider response.
 *
 * @internal
 */
export async function* mapGoogleEvents(
  options: MapGoogleEventsOptions,
): AsyncIterable<AGUIEvent> {
  let textStarted = false;
  let reasoningId: string | undefined;
  let reasoningIndex = 0;
  let lastToolCallId: string | undefined;
  let toolCallIndex = 0;
  const iterator = options.events[Symbol.asyncIterator]();
  let mappingFailed = false;
  let mappingError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;

  try {
    while (!options.signal?.aborted) {
      const next = await iterator.next();
      if (next.done) {
        break;
      }

      const candidates = next.value.candidates ?? [];
      const candidate =
        candidates.find((entry) => entry.index === 0) ??
        candidates.find((entry) => entry.index === undefined);
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (options.signal?.aborted) {
          return;
        }

        if (part.thought) {
          if (!reasoningId) {
            reasoningId = `${options.messageId}:reasoning:${reasoningIndex}`;
            reasoningIndex += 1;
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningId,
              role: 'reasoning',
              metadata: { google: { thought: true } },
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          if (part.text) {
            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: reasoningId,
              delta: part.text,
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          if (part.thoughtSignature) {
            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'message',
              entityId: reasoningId,
              encryptedValue: part.thoughtSignature,
            };
          }
          continue;
        }

        if (
          part.thoughtSignature &&
          reasoningId &&
          !part.functionCall &&
          !part.text
        ) {
          yield {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: reasoningId,
            encryptedValue: part.thoughtSignature,
          };
          continue;
        }

        if (reasoningId) {
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: reasoningId,
          };
          reasoningId = undefined;
          if (options.signal?.aborted) {
            return;
          }
        }

        if (part.functionCall) {
          const name = part.functionCall.name;
          if (!name) {
            throw new Error('Google returned a function call without a name');
          }

          const toolCallId =
            part.functionCall.id ??
            `${options.messageId}:tool:${toolCallIndex}`;
          lastToolCallId = toolCallId;
          toolCallIndex += 1;
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: name,
            parentMessageId: options.messageId,
            metadata: { google: { functionCall: true } },
          };
          if (options.signal?.aborted) {
            return;
          }

          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: JSON.stringify(part.functionCall.args ?? {}),
          };
          if (options.signal?.aborted) {
            return;
          }

          if (part.thoughtSignature) {
            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'tool-call',
              entityId: toolCallId,
              encryptedValue: part.thoughtSignature,
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          yield { type: EventType.TOOL_CALL_END, toolCallId };
          continue;
        }

        if (part.thoughtSignature && lastToolCallId && !part.text) {
          yield {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'tool-call',
            entityId: lastToolCallId,
            encryptedValue: part.thoughtSignature,
          };
          continue;
        }

        if (!part.text) {
          continue;
        }

        if (!textStarted) {
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: options.messageId,
            role: 'assistant',
          };
          textStarted = true;
          if (options.signal?.aborted) {
            return;
          }
        }

        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: options.messageId,
          delta: part.text,
        };
      }
    }
  } catch (error: unknown) {
    mappingFailed = true;
    mappingError = error;
  } finally {
    try {
      await iterator.return?.();
    } catch (error: unknown) {
      cleanupFailed = true;
      cleanupError = error;
    }
  }

  if (mappingFailed) {
    throw mappingError;
  }
  if (cleanupFailed) {
    throw cleanupError;
  }

  if (options.signal?.aborted) {
    return;
  }

  if (reasoningId) {
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: reasoningId,
    };
    if (options.signal?.aborted) {
      return;
    }
  }

  if (textStarted) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: options.messageId,
    };
  }
}
