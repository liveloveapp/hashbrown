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

interface ThinkingBlockState {
  readonly kind: 'thinking';
  readonly messageId: string;
  readonly initialSignature: string;
  readonly signatureDelta: string | undefined;
}

interface RedactedThinkingBlockState {
  readonly kind: 'redacted_thinking';
  readonly messageId: string;
}

interface ServerToolBlockState {
  readonly kind: 'server_tool';
}

type RawTerminalBlockType =
  | 'web_search_tool_result'
  | 'web_fetch_tool_result'
  | 'code_execution_tool_result'
  | 'bash_code_execution_tool_result'
  | 'text_editor_code_execution_tool_result'
  | 'tool_search_tool_result'
  | 'container_upload';

interface RawTerminalBlockState {
  readonly kind: 'raw_terminal';
  readonly nativeType: RawTerminalBlockType;
}

type ContentBlockState =
  | TextBlockState
  | ToolBlockState
  | ThinkingBlockState
  | RedactedThinkingBlockState
  | ServerToolBlockState
  | RawTerminalBlockState;
type RawEvent = Anthropic.Messages.RawMessageStreamEvent;
type NativeContentBlock =
  Anthropic.Messages.RawContentBlockStartEvent['content_block'];
type NativeContentDelta = Anthropic.Messages.RawContentBlockDeltaEvent['delta'];
type RawTerminalBlock = Extract<
  NativeContentBlock,
  { type: RawTerminalBlockType }
>;

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

function assertNever(value: never): never {
  throw new Error(
    'Anthropic stream received an unhandled event ' +
      formatDiagnosticValue(value),
  );
}

function assertUnsupportedContentBlock(value: never, index: number): never {
  const record = value as unknown as Record<string, unknown>;
  throw new Error(
    `Anthropic content block at index ${index} has unsupported type ` +
      formatDiagnosticValue(record['type']),
  );
}

function assertUnsupportedContentDelta(value: never, index: number): never {
  const record = value as unknown as Record<string, unknown>;
  throw new Error(
    `Anthropic content delta at index ${index} has unsupported type ` +
      formatDiagnosticValue(record['type']),
  );
}

function readContentBlock(
  event: Anthropic.Messages.RawContentBlockStartEvent,
  index: number,
): NativeContentBlock {
  const eventRecord = event as unknown as Record<string, unknown>;
  if (!isRecord(eventRecord['content_block'])) {
    throw new Error(
      `Anthropic content block at index ${index} must be an object`,
    );
  }

  const contentBlock = event.content_block;
  switch (contentBlock.type) {
    case 'text':
    case 'tool_use':
    case 'thinking':
    case 'redacted_thinking':
    case 'server_tool_use':
    case 'web_search_tool_result':
    case 'web_fetch_tool_result':
    case 'code_execution_tool_result':
    case 'bash_code_execution_tool_result':
    case 'text_editor_code_execution_tool_result':
    case 'tool_search_tool_result':
    case 'container_upload':
      return contentBlock;
    default:
      return assertUnsupportedContentBlock(contentBlock, index);
  }
}

function readContentDelta(
  event: Anthropic.Messages.RawContentBlockDeltaEvent,
  index: number,
): NativeContentDelta {
  const eventRecord = event as unknown as Record<string, unknown>;
  if (!isRecord(eventRecord['delta'])) {
    throw new Error(
      `Anthropic content delta at index ${index} must be an object`,
    );
  }

  const delta = event.delta;
  switch (delta.type) {
    case 'text_delta':
    case 'input_json_delta':
    case 'citations_delta':
    case 'thinking_delta':
    case 'signature_delta':
      return delta;
    default:
      return assertUnsupportedContentDelta(delta, index);
  }
}

function rawEvent(event: RawEvent): AGUIEvent {
  let clonedEvent: RawEvent;
  try {
    clonedEvent = structuredClone(event);
  } catch (cause) {
    const error = new Error('Failed to clone Anthropic native stream event');
    Object.defineProperty(error, 'cause', { configurable: true, value: cause });
    throw error;
  }

  return {
    type: EventType.RAW,
    source: 'anthropic',
    event: clonedEvent,
  };
}

function isRawTerminalBlock(
  value: NativeContentBlock,
): value is RawTerminalBlock {
  return (
    value.type === 'web_search_tool_result' ||
    value.type === 'web_fetch_tool_result' ||
    value.type === 'code_execution_tool_result' ||
    value.type === 'bash_code_execution_tool_result' ||
    value.type === 'text_editor_code_execution_tool_result' ||
    value.type === 'tool_search_tool_result' ||
    value.type === 'container_upload'
  );
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
  let nativeTextBlockStarted = false;
  let textStarted = false;
  let clientToolStarted = false;
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

          const contentBlock = readContentBlock(event, index);
          const blockType = contentBlock.type;

          seenIndexes.add(index);
          if (blockType === 'thinking' || blockType === 'redacted_thinking') {
            if (nativeTextBlockStarted || clientToolStarted) {
              throw new Error(
                `Anthropic reasoning block at index ${index} cannot start ` +
                  'after assistant text or a client tool block',
              );
            }

            const messageId = `${options.messageId}:reasoning:${index}`;
            if (blockType === 'thinking') {
              const thinking = contentBlock['thinking'];
              if (typeof thinking !== 'string') {
                throw new Error(
                  `Anthropic thinking block at index ${index} has ` +
                    'non-string thinking',
                );
              }

              const signature = contentBlock['signature'];
              if (typeof signature !== 'string') {
                throw new Error(
                  `Anthropic thinking block at index ${index} has ` +
                    'non-string signature',
                );
              }

              activeBlocks.set(index, {
                kind: 'thinking',
                messageId,
                initialSignature: signature,
                signatureDelta: undefined,
              });
              yield {
                type: EventType.REASONING_MESSAGE_START,
                messageId,
                role: 'reasoning',
                metadata: { anthropic: { blockType: 'thinking' } },
              };
              if (options.signal?.aborted) {
                return;
              }

              if (thinking.length > 0) {
                yield {
                  type: EventType.REASONING_MESSAGE_CONTENT,
                  messageId,
                  delta: thinking,
                };
                if (options.signal?.aborted) {
                  return;
                }
              }
              break;
            }

            const data = contentBlock['data'];
            if (typeof data !== 'string') {
              throw new Error(
                `Anthropic redacted_thinking block at index ${index} has ` +
                  'non-string data',
              );
            }
            if (data.length === 0) {
              throw new Error(
                `Anthropic redacted_thinking block at index ${index} has ` +
                  'empty data',
              );
            }

            activeBlocks.set(index, { kind: 'redacted_thinking', messageId });
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId,
              role: 'reasoning',
              metadata: { anthropic: { blockType: 'redacted_thinking' } },
            };
            if (options.signal?.aborted) {
              return;
            }

            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'message',
              entityId: messageId,
              encryptedValue: data,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (blockType === 'text') {
            const text = contentBlock['text'];
            if (typeof text !== 'string') {
              throw new Error(
                `Anthropic text block at index ${index} has non-string text`,
              );
            }

            nativeTextBlockStarted = true;
            activeBlocks.set(index, { kind: 'text' });
            if (text.length > 0) {
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
            }

            if (
              Array.isArray(contentBlock.citations) &&
              contentBlock.citations.length > 0
            ) {
              yield rawEvent(event);
              if (options.signal?.aborted) {
                return;
              }
            }
            break;
          }

          if (blockType === 'server_tool_use') {
            activeBlocks.set(index, { kind: 'server_tool' });
            yield rawEvent(event);
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (isRawTerminalBlock(contentBlock)) {
            activeBlocks.set(index, {
              kind: 'raw_terminal',
              nativeType: contentBlock.type,
            });
            yield rawEvent(event);
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
          clientToolStarted = true;
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

          const delta = readContentDelta(event, index);
          const deltaType = delta.type;

          if (block.kind === 'text') {
            if (deltaType === 'citations_delta') {
              yield rawEvent(event);
              if (options.signal?.aborted) {
                return;
              }
              break;
            }

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

          if (block.kind === 'tool') {
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

          if (block.kind === 'server_tool') {
            if (deltaType !== 'input_json_delta') {
              throw new Error(
                `Anthropic server_tool_use block at index ${index} cannot ` +
                  `receive ${deltaType}`,
              );
            }

            const partialJson = delta['partial_json'];
            if (typeof partialJson !== 'string') {
              throw new Error(
                `Anthropic input_json_delta at index ${index} has ` +
                  'non-string partial_json',
              );
            }

            yield rawEvent(event);
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (block.kind === 'raw_terminal') {
            throw new Error(
              `Anthropic ${block.nativeType} block at index ${index} cannot ` +
                `receive ${deltaType}`,
            );
          }

          if (block.kind === 'redacted_thinking') {
            throw new Error(
              `Anthropic redacted_thinking block at index ${index} cannot ` +
                `receive ${deltaType}`,
            );
          }

          if (deltaType === 'thinking_delta') {
            const thinking = delta['thinking'];
            if (typeof thinking !== 'string') {
              throw new Error(
                `Anthropic thinking_delta at index ${index} has ` +
                  'non-string thinking',
              );
            }
            if (thinking.length === 0) {
              break;
            }

            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: block.messageId,
              delta: thinking,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (deltaType !== 'signature_delta') {
            throw new Error(
              `Anthropic thinking block at index ${index} cannot receive ` +
                deltaType,
            );
          }

          const signature = delta['signature'];
          if (typeof signature !== 'string') {
            throw new Error(
              `Anthropic signature_delta at index ${index} has ` +
                'non-string signature',
            );
          }
          if (block.signatureDelta !== undefined) {
            throw new Error(
              `Anthropic thinking block at index ${index} received more than ` +
                'one signature_delta',
            );
          }

          activeBlocks.set(index, {
            ...block,
            signatureDelta: signature,
          });
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

          if (block.kind === 'server_tool' || block.kind === 'raw_terminal') {
            yield rawEvent(event);
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (block.kind === 'thinking') {
            const signature = block.signatureDelta ?? block.initialSignature;
            if (signature.length === 0) {
              throw new Error(
                `Anthropic thinking block at index ${index} has an empty ` +
                  'final signature',
              );
            }

            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'message',
              entityId: block.messageId,
              encryptedValue: signature,
            };
            if (options.signal?.aborted) {
              return;
            }

            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: block.messageId,
            };
            if (options.signal?.aborted) {
              return;
            }
            break;
          }

          if (block.kind === 'redacted_thinking') {
            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: block.messageId,
            };
            if (options.signal?.aborted) {
              return;
            }
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

        default:
          assertNever(event);
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
