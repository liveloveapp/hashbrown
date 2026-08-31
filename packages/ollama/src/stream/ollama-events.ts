import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { ChatResponse } from 'ollama';

const ABORTED = Symbol('aborted');

interface AbortableOllamaStream extends AsyncIterable<ChatResponse> {
  abort?: () => void;
}

/**
 * Inputs for mapping Ollama response chunks to canonical AG-UI events.
 *
 * @internal
 */
export interface MapOllamaEventsOptions {
  /** Ollama response stream. */
  events: AbortableOllamaStream;
  /** Stable AG-UI assistant message identifier. */
  messageId: string;
  /** Optional run cancellation signal. */
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawEvent(event: ChatResponse): AGUIEvent {
  return {
    type: EventType.RAW,
    source: 'ollama',
    event: structuredClone(event),
  };
}

function hasRawData(event: ChatResponse): boolean {
  return (
    event.done ||
    event.logprobs !== undefined ||
    (event.message.images?.length ?? 0) > 0
  );
}

async function nextWithCancellation(
  iterator: AsyncIterator<ChatResponse>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<ChatResponse> | typeof ABORTED> {
  const nextPromise = iterator.next();
  void nextPromise.catch(() => undefined);
  if (!signal) {
    return nextPromise;
  }
  if (signal.aborted) {
    return ABORTED;
  }

  let onAbort!: () => void;
  const abortPromise = new Promise<typeof ABORTED>((resolve) => {
    onAbort = () => resolve(ABORTED);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
  });

  try {
    return await Promise.race([nextPromise, abortPromise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Maps Ollama streaming chat chunks to canonical AG-UI events.
 *
 * @param options - Ollama stream, stable assistant ID, and cancellation signal.
 * @returns Canonical AG-UI text, reasoning, tool-call, and raw events.
 *
 * @internal
 */
export async function* mapOllamaEvents(
  options: MapOllamaEventsOptions,
): AsyncIterable<AGUIEvent> {
  const iterator = options.events[Symbol.asyncIterator]();
  let textStarted = false;
  let reasoningId: string | undefined;
  let reasoningIndex = 0;
  let toolCallIndex = 0;
  let completed = false;
  let providerAborted = false;
  let mappingFailed = false;
  let mappingError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;
  const abortProvider = () => {
    if (!providerAborted) {
      providerAborted = true;
      options.events.abort?.();
    }
  };
  const onAbort = () => abortProvider();

  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) {
    abortProvider();
  }

  try {
    while (!options.signal?.aborted) {
      const next = await nextWithCancellation(iterator, options.signal);
      if (next === ABORTED) {
        return;
      }
      if (next.done) {
        completed = true;
        break;
      }

      const chunk = next.value;
      const thinking = chunk.message.thinking;
      if (thinking) {
        if (!reasoningId) {
          reasoningId = `${options.messageId}:reasoning:${reasoningIndex}`;
          reasoningIndex += 1;
          yield {
            type: EventType.REASONING_MESSAGE_START,
            messageId: reasoningId,
            role: 'reasoning',
            metadata: { ollama: { thinking: true } },
          };
          if (options.signal?.aborted) {
            return;
          }
        }

        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: reasoningId,
          delta: thinking,
        };
        if (options.signal?.aborted) {
          return;
        }
      }

      const content = chunk.message.content;
      const toolCalls = chunk.message.tool_calls ?? [];
      if ((content || toolCalls.length > 0) && reasoningId) {
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningId,
        };
        reasoningId = undefined;
        if (options.signal?.aborted) {
          return;
        }
      }

      if (content) {
        if (!textStarted) {
          textStarted = true;
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: options.messageId,
            role: 'assistant',
          };
          if (options.signal?.aborted) {
            return;
          }
        }

        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: options.messageId,
          delta: content,
        };
        if (options.signal?.aborted) {
          return;
        }
      }

      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name;
        const args = toolCall.function?.arguments;
        if (!name) {
          throw new Error('Ollama returned a tool call without a name');
        }
        if (!isRecord(args)) {
          throw new Error(
            `Ollama returned non-object arguments for tool call "${name}"`,
          );
        }

        const toolCallId = `${options.messageId}:tool:${toolCallIndex}`;
        toolCallIndex += 1;
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: name,
          parentMessageId: options.messageId,
        };
        if (options.signal?.aborted) {
          return;
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: JSON.stringify(args),
        };
        if (options.signal?.aborted) {
          return;
        }
        yield { type: EventType.TOOL_CALL_END, toolCallId };
        if (options.signal?.aborted) {
          return;
        }
      }

      if (hasRawData(chunk)) {
        yield rawEvent(chunk);
      }
    }

    if (!completed || options.signal?.aborted) {
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
  } catch (error: unknown) {
    if (!options.signal?.aborted) {
      mappingFailed = true;
      mappingError = error;
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    if (!completed) {
      abortProvider();
    }
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
  if (cleanupFailed && !options.signal?.aborted) {
    throw cleanupError;
  }
}
