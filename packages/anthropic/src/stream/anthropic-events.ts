import { type AGUIEvent, EventType } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';

interface TextBlockState {
  readonly kind: 'text';
}

interface ToolBlockState {
  readonly kind: 'tool';
  readonly id: string;
  readonly initialInput: unknown;
  readonly receivedDelta: boolean;
}

type ContentBlockState = TextBlockState | ToolBlockState;

/**
 * Options for mapping a raw Anthropic message stream to AG-UI events.
 *
 * @internal
 */
export interface MapAnthropicEventsOptions {
  readonly events: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>;
  readonly messageId: string;
  readonly signal?: AbortSignal;
}

/**
 * Maps raw Anthropic message events to canonical AG-UI message and tool events.
 *
 * @param options - Raw event source, stable assistant message ID, and cancellation
 * signal.
 * @returns An asynchronous stream of AG-UI message and tool events.
 *
 * @internal
 */
export async function* mapAnthropicEvents(
  options: MapAnthropicEventsOptions,
): AsyncIterable<AGUIEvent> {
  const iterator = options.events[Symbol.asyncIterator]();
  const seenIndexes = new Set<number>();
  const activeBlocks = new Map<number, ContentBlockState>();
  let messageStarted = false;
  let messageStopped = false;
  let textStarted = false;
  let sourceCompleted = false;

  try {
    while (true) {
      if (options.signal?.aborted) {
        return;
      }

      const result = await iterator.next();
      if (result.done) {
        sourceCompleted = true;
        if (options.signal?.aborted) {
          return;
        }
        break;
      }

      if (options.signal?.aborted) {
        return;
      }

      const event = result.value;
      if (messageStopped) {
        throw new Error(
          `Anthropic event ${event.type} received after message_stop`,
        );
      }

      if (event.type === 'message_start') {
        if (messageStarted) {
          throw new Error('Anthropic stream received duplicate message_start');
        }

        messageStarted = true;
        continue;
      }

      if (!messageStarted) {
        throw new Error(
          `Anthropic event ${event.type} received before message_start`,
        );
      }

      switch (event.type) {
        case 'content_block_start': {
          if (seenIndexes.has(event.index)) {
            throw new Error(
              `Anthropic content index ${event.index} started more than once`,
            );
          }

          seenIndexes.add(event.index);
          if (event.content_block.type === 'text') {
            activeBlocks.set(event.index, { kind: 'text' });
            if (event.content_block.text.length === 0) {
              break;
            }

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
              delta: event.content_block.text,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (event.content_block.id.length === 0) {
            throw new Error(
              `Anthropic tool block at index ${event.index} has an empty id`,
            );
          }
          if (event.content_block.name.length === 0) {
            throw new Error(
              `Anthropic tool block at index ${event.index} has an empty name`,
            );
          }

          activeBlocks.set(event.index, {
            kind: 'tool',
            id: event.content_block.id,
            initialInput: event.content_block.input,
            receivedDelta: false,
          });
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: event.content_block.id,
            toolCallName: event.content_block.name,
            parentMessageId: options.messageId,
          };
          if (options.signal?.aborted) {
            return;
          }
          break;
        }

        case 'content_block_delta': {
          const block = activeBlocks.get(event.index);
          if (!block) {
            throw new Error(
              'Anthropic content_block_delta references unknown or stopped ' +
                `index ${event.index}`,
            );
          }

          if (block.kind === 'text') {
            if (event.delta.type !== 'text_delta') {
              throw new Error(
                `Anthropic text block at index ${event.index} cannot receive ` +
                  event.delta.type,
              );
            }
            if (event.delta.text.length === 0) {
              break;
            }

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
              delta: event.delta.text,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (event.delta.type !== 'input_json_delta') {
            throw new Error(
              `Anthropic tool block at index ${event.index} cannot receive ` +
                event.delta.type,
            );
          }

          activeBlocks.set(event.index, {
            ...block,
            receivedDelta: true,
          });
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: event.delta.partial_json,
          };
          if (options.signal?.aborted) {
            return;
          }
          break;
        }

        case 'content_block_stop': {
          const block = activeBlocks.get(event.index);
          if (!block) {
            throw new Error(
              'Anthropic content_block_stop references unknown or stopped ' +
                `index ${event.index}`,
            );
          }

          activeBlocks.delete(event.index);
          if (block.kind === 'text') {
            break;
          }

          if (!block.receivedDelta) {
            const initialInput = JSON.stringify(block.initialInput);
            if (initialInput === undefined) {
              throw new Error(
                `Anthropic tool block at index ${event.index} has ` +
                  'non-serializable initial input',
              );
            }

            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: block.id,
              delta: initialInput,
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: block.id,
          };
          if (options.signal?.aborted) {
            return;
          }
          break;
        }

        case 'message_delta':
          if (activeBlocks.size > 0) {
            throw new Error(
              'Anthropic message_delta received while content blocks are open',
            );
          }
          break;

        case 'message_stop':
          if (activeBlocks.size > 0) {
            throw new Error(
              'Anthropic message_stop received while content blocks are open',
            );
          }

          messageStopped = true;
          if (textStarted) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: options.messageId,
            };
            if (options.signal?.aborted) {
              return;
            }
          }
          break;
      }
    }

    if (!messageStarted) {
      throw new Error('Anthropic stream ended before message_start');
    }
    if (activeBlocks.size > 0) {
      throw new Error('Anthropic stream ended with open content blocks');
    }
    if (!messageStopped) {
      throw new Error('Anthropic stream ended before message_stop');
    }
  } finally {
    if (!sourceCompleted) {
      await iterator.return?.();
    }
  }
}
