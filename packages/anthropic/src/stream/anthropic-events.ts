import { type AGUIEvent, EventType } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';

const ABORTED = Symbol('aborted');

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
type RawEvent = Anthropic.Messages.RawMessageStreamEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatDiagnosticValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRawEventType(value: unknown): value is RawEvent['type'] {
  return (
    value === 'message_start' ||
    value === 'message_delta' ||
    value === 'message_stop' ||
    value === 'content_block_start' ||
    value === 'content_block_delta' ||
    value === 'content_block_stop'
  );
}

function readRawEvent(value: unknown): RawEvent {
  if (!isRecord(value)) {
    throw new Error('Anthropic stream event must be an object');
  }

  const type = value['type'];
  if (!isRawEventType(type)) {
    throw new Error(
      'Anthropic stream received unsupported event type ' +
        formatDiagnosticValue(type),
    );
  }

  return value as unknown as RawEvent;
}

function readContentIndex(event: RawEvent): number {
  const eventRecord = event as unknown as Record<string, unknown>;
  const index = eventRecord['index'];
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new Error(
      `Anthropic ${event.type} has invalid content index ` +
        formatDiagnosticValue(index),
    );
  }

  return index;
}

async function nextWithCancellation(
  iterator: AsyncIterator<RawEvent>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<RawEvent> | typeof ABORTED> {
  const nextPromise = iterator.next();
  void nextPromise.catch(() => undefined);
  if (!signal) {
    return nextPromise;
  }
  if (signal.aborted) {
    return ABORTED;
  }

  let handleAbort!: () => void;
  const abortPromise = new Promise<typeof ABORTED>((resolve) => {
    handleAbort = () => resolve(ABORTED);
    signal.addEventListener('abort', handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
    }
  });

  try {
    return await Promise.race([nextPromise, abortPromise]);
  } catch (error) {
    if (signal.aborted) {
      return ABORTED;
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}

async function closeIterator(
  iterator: AsyncIterator<RawEvent>,
  suppressError: boolean,
): Promise<void> {
  try {
    await iterator.return?.();
  } catch (error) {
    if (!suppressError) {
      throw error;
    }
  }
}

function serializeInitialInput(block: ToolBlockState, index: number): string {
  const message =
    `Anthropic tool "${block.id}" at index ${index} has ` +
    'non-serializable initial input';
  let result: string | undefined;

  try {
    result = JSON.stringify(block.initialInput);
  } catch (cause) {
    const error = new Error(message);
    Object.defineProperty(error, 'cause', { configurable: true, value: cause });
    throw error;
  }

  if (result === undefined) {
    throw new Error(message);
  }

  return result;
}

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
  const seenToolIds = new Set<string>();
  const activeBlocks = new Map<number, ContentBlockState>();
  let messageStarted = false;
  let messageStopped = false;
  let textStarted = false;
  let sourceCompleted = false;
  let hasPrimaryError = false;

  try {
    while (true) {
      if (options.signal?.aborted) {
        return;
      }

      const result = await nextWithCancellation(iterator, options.signal);
      if (result === ABORTED) {
        return;
      }
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

      const event = readRawEvent(result.value);
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
          const index = readContentIndex(event);
          if (seenIndexes.has(index)) {
            throw new Error(
              `Anthropic content index ${index} started more than once`,
            );
          }

          const eventRecord = event as unknown as Record<string, unknown>;
          const contentBlock = eventRecord['content_block'];
          if (!isRecord(contentBlock)) {
            throw new Error(
              `Anthropic content block at index ${index} must be an object`,
            );
          }

          const blockType = contentBlock['type'];
          if (blockType !== 'text' && blockType !== 'tool_use') {
            throw new Error(
              `Anthropic content block at index ${index} has unsupported type ` +
                formatDiagnosticValue(blockType),
            );
          }

          seenIndexes.add(index);
          if (blockType === 'text') {
            const text = contentBlock['text'];
            if (typeof text !== 'string') {
              throw new Error(
                `Anthropic text block at index ${index} has non-string text`,
              );
            }

            activeBlocks.set(index, { kind: 'text' });
            if (text.length === 0) {
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
              delta: text,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          const id = contentBlock['id'];
          if (typeof id !== 'string') {
            throw new Error(
              `Anthropic tool block at index ${index} has a non-string id`,
            );
          }
          if (id.length === 0) {
            throw new Error(
              `Anthropic tool block at index ${index} has an empty id`,
            );
          }

          const name = contentBlock['name'];
          if (typeof name !== 'string') {
            throw new Error(
              `Anthropic tool block at index ${index} has a non-string name`,
            );
          }
          if (name.length === 0) {
            throw new Error(
              `Anthropic tool block at index ${index} has an empty name`,
            );
          }
          if (seenToolIds.has(id)) {
            throw new Error(
              `Anthropic tool id "${id}" started more than once at index ${index}`,
            );
          }

          seenToolIds.add(id);
          activeBlocks.set(index, {
            kind: 'tool',
            id,
            initialInput: contentBlock['input'],
            receivedDelta: false,
          });
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: id,
            toolCallName: name,
            parentMessageId: options.messageId,
          };
          if (options.signal?.aborted) {
            return;
          }
          break;
        }

        case 'content_block_delta': {
          const index = readContentIndex(event);
          const block = activeBlocks.get(index);
          if (!block) {
            throw new Error(
              'Anthropic content_block_delta references unknown or stopped ' +
                `index ${index}`,
            );
          }

          const eventRecord = event as unknown as Record<string, unknown>;
          const delta = eventRecord['delta'];
          if (!isRecord(delta)) {
            throw new Error(
              `Anthropic content delta at index ${index} must be an object`,
            );
          }

          const deltaType = delta['type'];
          if (deltaType !== 'text_delta' && deltaType !== 'input_json_delta') {
            throw new Error(
              `Anthropic content delta at index ${index} has unsupported type ` +
                formatDiagnosticValue(deltaType),
            );
          }

          if (block.kind === 'text') {
            if (deltaType !== 'text_delta') {
              throw new Error(
                `Anthropic text block at index ${index} cannot receive ` +
                  deltaType,
              );
            }

            const text = delta['text'];
            if (typeof text !== 'string') {
              throw new Error(
                `Anthropic text_delta at index ${index} has non-string text`,
              );
            }
            if (text.length === 0) {
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
              delta: text,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (deltaType !== 'input_json_delta') {
            throw new Error(
              `Anthropic tool block at index ${index} cannot receive ` +
                deltaType,
            );
          }

          const partialJson = delta['partial_json'];
          if (typeof partialJson !== 'string') {
            throw new Error(
              `Anthropic input_json_delta at index ${index} has ` +
                'non-string partial_json',
            );
          }

          activeBlocks.set(index, {
            ...block,
            receivedDelta: true,
          });
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: partialJson,
          };
          if (options.signal?.aborted) {
            return;
          }
          break;
        }

        case 'content_block_stop': {
          const index = readContentIndex(event);
          const block = activeBlocks.get(index);
          if (!block) {
            throw new Error(
              'Anthropic content_block_stop references unknown or stopped ' +
                `index ${index}`,
            );
          }

          activeBlocks.delete(index);
          if (block.kind === 'text') {
            break;
          }

          if (!block.receivedDelta) {
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: block.id,
              delta: serializeInitialInput(block, index),
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
  } catch (error) {
    hasPrimaryError = true;
    throw error;
  } finally {
    if (!sourceCompleted) {
      await closeIterator(iterator, hasPrimaryError);
    }
  }
}
