import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';

const ABORTED = Symbol('aborted');

interface ToolState {
  readonly kind: 'tool';
  readonly id: string;
  receivedInput: boolean;
}

interface ReasoningState {
  readonly kind: 'reasoning';
  readonly messageId: string;
  readonly blockType: 'reasoning_text' | 'redacted_content';
  readonly redactedContent: Uint8Array[];
  signature: string;
}

type BlockState = ToolState | ReasoningState;

/**
 * Inputs for mapping Bedrock ConverseStream output to AG-UI events.
 *
 * @internal
 */
export interface MapBedrockEventsOptions {
  readonly events: AsyncIterable<ConverseStreamOutput>;
  readonly messageId: string;
  readonly signal?: AbortSignal;
}

function rawEvent(event: ConverseStreamOutput): AGUIEvent {
  return {
    type: EventType.RAW,
    source: 'bedrock',
    event: structuredClone(event),
  };
}

function providerError(event: ConverseStreamOutput): Error | undefined {
  const value =
    event.internalServerException ??
    event.modelStreamErrorException ??
    event.validationException ??
    event.throttlingException ??
    event.serviceUnavailableException;
  if (!value) {
    return undefined;
  }

  return new Error(value.message ?? value.name ?? 'Bedrock stream failed');
}

function reasoningEncryptedValue(block: ReasoningState): AGUIEvent | undefined {
  if (block.blockType === 'reasoning_text') {
    return block.signature
      ? {
          type: EventType.REASONING_ENCRYPTED_VALUE,
          subtype: 'message',
          entityId: block.messageId,
          encryptedValue: block.signature,
        }
      : undefined;
  }

  const byteLength = block.redactedContent.reduce(
    (total, value) => total + value.byteLength,
    0,
  );
  if (byteLength === 0) {
    return undefined;
  }
  const value = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of block.redactedContent) {
    value.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: block.messageId,
    encryptedValue: Buffer.from(value).toString('base64'),
  };
}

async function nextWithCancellation(
  iterator: AsyncIterator<ConverseStreamOutput>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<ConverseStreamOutput> | typeof ABORTED> {
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
 * Maps Bedrock ConverseStream output to canonical AG-UI events.
 *
 * @param options - Bedrock stream, stable assistant ID, and cancellation signal.
 * @returns Canonical AG-UI message, tool, reasoning, and raw events.
 *
 * @internal
 */
export async function* mapBedrockEvents(
  options: MapBedrockEventsOptions,
): AsyncIterable<AGUIEvent> {
  const iterator = options.events[Symbol.asyncIterator]();
  const activeBlocks = new Map<number, BlockState>();
  let textStarted = false;
  let reasoningIndex = 0;
  let completed = false;
  let mappingFailed = false;
  let mappingError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;

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

      const event = next.value;
      const error = providerError(event);
      if (error) {
        throw error;
      }

      if (event.contentBlockStart) {
        const index = event.contentBlockStart.contentBlockIndex;
        const toolUse = event.contentBlockStart.start?.toolUse;
        if (index !== undefined && toolUse?.toolUseId && toolUse.name) {
          activeBlocks.set(index, {
            kind: 'tool',
            id: toolUse.toolUseId,
            receivedInput: false,
          });
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: toolUse.toolUseId,
            toolCallName: toolUse.name,
            parentMessageId: options.messageId,
          };
        } else {
          yield rawEvent(event);
        }
        continue;
      }

      if (event.contentBlockDelta) {
        const index = event.contentBlockDelta.contentBlockIndex;
        const delta = event.contentBlockDelta.delta;
        if (delta?.text !== undefined) {
          if (!textStarted) {
            textStarted = true;
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: options.messageId,
              role: 'assistant',
            };
          }
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: options.messageId,
            delta: delta.text,
          };
          continue;
        }

        if (delta?.toolUse && index !== undefined) {
          const block = activeBlocks.get(index);
          if (block?.kind === 'tool' && delta.toolUse.input !== undefined) {
            block.receivedInput = true;
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: block.id,
              delta: delta.toolUse.input,
            };
          } else {
            yield rawEvent(event);
          }
          continue;
        }

        if (delta?.reasoningContent && index !== undefined) {
          let block = activeBlocks.get(index);
          if (block?.kind !== 'reasoning') {
            const messageId = `${options.messageId}:reasoning:${reasoningIndex}`;
            const blockType =
              delta.reasoningContent.redactedContent === undefined
                ? 'reasoning_text'
                : 'redacted_content';
            reasoningIndex += 1;
            block = {
              kind: 'reasoning',
              messageId,
              blockType,
              signature: '',
              redactedContent: [],
            };
            activeBlocks.set(index, block);
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId,
              role: 'reasoning',
              metadata: {
                bedrock: {
                  blockType,
                },
              },
            };
          }

          if (delta.reasoningContent.text !== undefined) {
            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: block.messageId,
              delta: delta.reasoningContent.text,
            };
          } else if (delta.reasoningContent.signature !== undefined) {
            block.signature += delta.reasoningContent.signature;
          } else if (delta.reasoningContent.redactedContent !== undefined) {
            block.redactedContent.push(delta.reasoningContent.redactedContent);
          } else {
            yield rawEvent(event);
          }
          continue;
        }

        yield rawEvent(event);
        continue;
      }

      if (event.contentBlockStop) {
        const index = event.contentBlockStop.contentBlockIndex;
        const block = index === undefined ? undefined : activeBlocks.get(index);
        if (block?.kind === 'tool') {
          if (!block.receivedInput) {
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: block.id,
              delta: '{}',
            };
          }
          yield { type: EventType.TOOL_CALL_END, toolCallId: block.id };
          activeBlocks.delete(index as number);
        } else if (block?.kind === 'reasoning') {
          const encryptedValue = reasoningEncryptedValue(block);
          if (encryptedValue) {
            yield encryptedValue;
          }
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: block.messageId,
          };
          activeBlocks.delete(index as number);
        }
        continue;
      }

      if (event.messageStop) {
        if (textStarted) {
          textStarted = false;
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: options.messageId,
          };
        }
        if (event.messageStop.additionalModelResponseFields !== undefined) {
          yield rawEvent(event);
        }
        continue;
      }

      if (event.metadata) {
        yield rawEvent(event);
        continue;
      }

      if (!event.messageStart) {
        yield rawEvent(event);
      }
    }

    if (!completed || options.signal?.aborted) {
      return;
    }

    for (const block of activeBlocks.values()) {
      if (block.kind === 'tool') {
        if (!block.receivedInput) {
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: '{}',
          };
        }
        yield { type: EventType.TOOL_CALL_END, toolCallId: block.id };
      } else {
        const encryptedValue = reasoningEncryptedValue(block);
        if (encryptedValue) {
          yield encryptedValue;
        }
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: block.messageId,
        };
      }
    }
    if (textStarted) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: options.messageId,
      };
    }
  } catch (error) {
    mappingFailed = true;
    mappingError = error;
  } finally {
    try {
      await iterator.return?.();
    } catch (error) {
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
