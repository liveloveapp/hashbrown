import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import type {
  TokenUsage as BedrockTokenUsage,
  ContentBlock,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import {
  type FinishReason,
  type ɵAnswerAnnotations,
  ɵcreateTokenUsage,
  type ɵRunFinish,
} from '@hashbrownai/core';

import {
  captureBedrockEvent,
  createBedrockCapture,
  encodeBedrockNative,
  readBedrockCaptureBlock,
} from './bedrock-native';
import {
  bedrockMarker,
  createBedrockHistoryFooter,
  readBedrockNativeContent,
} from './bedrock-history';
import {
  type BedrockProviderCall,
  bedrockRunningStep,
  matchBedrockProviderResult,
  readBedrockProviderCall,
  readBedrockProviderResult,
} from './bedrock-tools';
import {
  addBedrockToolSources,
  createBedrockAnnotationState,
  foldBedrockCitation,
} from './bedrock-annotations';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function pendingCalls(
  options: MapBedrockEventsOptions,
): Map<string, BedrockProviderCall> {
  const calls = new Map<string, BedrockProviderCall>();
  const canonical = (options.inputMessages ?? []).flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
  );
  const settled = new Set(
    (options.inputMessages ?? []).flatMap((message) =>
      message.role === 'tool' ? [message.toolCallId] : [],
    ),
  );
  for (const message of options.requestOptions?.messages ?? []) {
    for (const block of message.content ?? []) {
      if (block.toolResult?.toolUseId) calls.delete(block.toolResult.toolUseId);
      if (!block.toolUse) continue;
      const invocation = canonical.find(
        (call) => call.id === block.toolUse?.toolUseId,
      );
      const step = invocation?.metadata?.['b4.step'];
      if (
        !invocation ||
        settled.has(invocation.id) ||
        !record(step) ||
        step['status'] !== 'running' ||
        step['kind'] !== 'provider' ||
        step['provider'] !== 'bedrock'
      )
        continue;
      const native = bedrockMarker(invocation.metadata)?.['nativeBlock'];
      if (
        native === undefined ||
        JSON.stringify(encodeBedrockNative(block, true)) !==
          JSON.stringify(native)
      )
        continue;
      const call = readBedrockProviderCall(
        block,
        typeof step['startedAt'] === 'number' ? step['startedAt'] : undefined,
      );
      if (call) calls.set(call.id, call);
    }
  }
  return calls;
}

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

interface ProviderState {
  readonly kind: 'provider';
  readonly call: BedrockProviderCall;
  receivedInput: boolean;
}
interface ResultState {
  readonly kind: 'result';
}
type BlockState = ToolState | ReasoningState | ProviderState | ResultState;

/**
 * Inputs for mapping Bedrock ConverseStream output to AG-UI events.
 *
 * @internal
 */
export interface MapBedrockEventsOptions {
  readonly events: AsyncIterable<ConverseStreamOutput>;
  readonly messageId: string;
  /** The request's model ID, reported with the token usage. */
  readonly model?: string;
  /** Canonical context for pending native calls. */
  readonly inputMessages?: readonly Message[];
  /** Actual transformed request used for this stream. */
  readonly requestOptions?: ConverseStreamCommandInput;
  readonly signal?: AbortSignal;
}

const STOP_REASONS: Readonly<Record<string, FinishReason>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  guardrail_intervened: 'content_filter',
  content_filtered: 'content_filter',
};

function sumCounts(
  ...values: readonly (number | undefined)[]
): number | undefined {
  const counts = values.filter(
    (value): value is number => typeof value === 'number',
  );
  return counts.length
    ? counts.reduce((total, value) => total + value, 0)
    : undefined;
}

/**
 * Builds the run's finish from the `messageStop` reason and the trailing
 * `metadata` usage. Converse's `inputTokens` counts only the uncached prompt
 * tokens, so cache reads and writes are added to it to match AG-UI's
 * accounting; the total is recomputed from input and output.
 */
function readFinish(
  stopReason: string | undefined,
  calledTools: boolean,
  usage: BedrockTokenUsage | undefined,
  model: string | undefined,
): ɵRunFinish {
  const mapped =
    stopReason === undefined ? 'other' : (STOP_REASONS[stopReason] ?? 'other');
  const finishReason: FinishReason =
    mapped === 'stop' && calledTools ? 'tool_calls' : mapped;
  const tokenUsage = usage
    ? ɵcreateTokenUsage({
        provider: 'bedrock',
        model,
        inputTokens: sumCounts(
          usage.inputTokens,
          usage.cacheReadInputTokens,
          usage.cacheWriteInputTokens,
        ),
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cacheReadInputTokens,
        cacheWriteInputTokens: usage.cacheWriteInputTokens,
      })
    : undefined;
  return {
    finishReason,
    providerMetadata: stopReason === undefined ? {} : { stopReason },
    ...(tokenUsage ? { usage: tokenUsage } : {}),
  };
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
 * @param options - Bedrock stream, stable assistant ID, model ID, and
 * cancellation signal.
 * @returns Canonical AG-UI message, tool, reasoning, and raw events; the
 * generator's return value is how the model stopped and the call's token
 * usage, or `undefined` when mapping stopped on abort.
 *
 * @internal
 */
export async function* mapBedrockEvents(
  options: MapBedrockEventsOptions,
): AsyncGenerator<AGUIEvent, ɵRunFinish | undefined> {
  const iterator = options.events[Symbol.asyncIterator]();
  const activeBlocks = new Map<number, BlockState>();
  let capture = createBedrockCapture();
  const calls = pendingCalls(options);
  const seenCalls = new Set(calls.keys());
  const settledCalls = new Set<string>();
  const represented = new Set<string>();
  const resultIds: string[] = [];
  const reasoningIds: string[] = [];
  let assistantExists = false;
  let nativeProviderSeen = false;
  let assistantBlock: ContentBlock | undefined;
  let annotationState = createBedrockAnnotationState(options.messageId);
  let annotations: ɵAnswerAnnotations | undefined;
  const metadata = (index?: number, block?: ContentBlock) => ({
    bedrock: {
      responseId: options.messageId,
      ...(index === undefined ? {} : { blockIndex: index }),
      ...(block ? { nativeBlock: encodeBedrockNative(block, true) } : {}),
    },
  });
  let textStarted = false;
  let reasoningIndex = 0;
  let completed = false;
  let calledTools = false;
  let stopReason: string | undefined;
  let usage: BedrockTokenUsage | undefined;
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

      capture = captureBedrockEvent(capture, event);

      if (event.contentBlockStart) {
        const index = event.contentBlockStart.contentBlockIndex;
        const toolUse = event.contentBlockStart.start?.toolUse;
        if (toolUse?.toolUseId) {
          if (seenCalls.has(toolUse.toolUseId))
            throw new Error('Bedrock conflicting invocation identity');
          seenCalls.add(toolUse.toolUseId);
        }
        const resultStart = event.contentBlockStart.start?.toolResult;
        if (index !== undefined && resultStart) {
          nativeProviderSeen = true;
          activeBlocks.set(index, { kind: 'result' });
          yield rawEvent(event);
          continue;
        }
        if (toolUse?.type) nativeProviderSeen = true;
        if (index !== undefined && toolUse?.type === 'server_tool_use') {
          const call = readBedrockProviderCall(
            { toolUse: { ...toolUse, input: {} } },
            Date.now(),
          );
          if (!call) {
            yield rawEvent(event);
            continue;
          }
          activeBlocks.set(index, {
            kind: 'provider',
            call,
            receivedInput: false,
          });
          assistantExists = true;
          represented.add(options.messageId);
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: call.id,
            toolCallName: call.name,
            parentMessageId: options.messageId,
            metadata: {
              ...metadata(index, call.nativeBlock),
              'b4.step': bedrockRunningStep(call),
            },
          };
          continue;
        }
        if (
          index !== undefined &&
          toolUse?.toolUseId &&
          toolUse.name &&
          !toolUse.type
        ) {
          activeBlocks.set(index, {
            kind: 'tool',
            id: toolUse.toolUseId,
            receivedInput: false,
          });
          calledTools = true;
          assistantExists = true;
          represented.add(options.messageId);
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
            assistantExists = true;
            represented.add(options.messageId);
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: options.messageId,
              role: 'assistant',
              metadata: metadata(
                index,
                index === undefined
                  ? undefined
                  : (capture.blocks[index]?.value as unknown as ContentBlock),
              ),
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
          if (
            (block?.kind === 'tool' || block?.kind === 'provider') &&
            delta.toolUse.input !== undefined
          ) {
            block.receivedInput = true;
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: block.kind === 'provider' ? block.call.id : block.id,
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
            reasoningIds.push(messageId);
            represented.add(messageId);
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
                  responseId: options.messageId,
                  blockIndex: index,
                  ...(capture.blocks[index]
                    ? {
                        nativeBlock: encodeBedrockNative(
                          capture.blocks[index].value,
                          true,
                        ),
                      }
                    : {}),
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
            block.redactedContent.push(
              Uint8Array.from(delta.reasoningContent.redactedContent),
            );
          } else {
            yield rawEvent(event);
          }
          continue;
        }

        if (delta?.citation) {
          const folded = foldBedrockCitation(annotationState, delta.citation);
          annotationState = folded.state;
          annotations = folded.annotations;
        }
        if (
          delta?.toolResult &&
          index !== undefined &&
          activeBlocks.get(index)?.kind === 'result'
        ) {
          yield rawEvent(event);
          continue;
        }
        yield rawEvent(event);
        continue;
      }

      if (event.contentBlockStop) {
        const index = event.contentBlockStop.contentBlockIndex;
        const block = index === undefined ? undefined : activeBlocks.get(index);
        const native =
          index === undefined
            ? undefined
            : readBedrockCaptureBlock(capture, index);
        if (native && (native.text !== undefined || native.citationsContent))
          assistantBlock = native;
        if (block?.kind === 'provider') {
          const call = native
            ? readBedrockProviderCall(native, block.call.startedAt)
            : undefined;
          const current = call ?? block.call;
          if (call) calls.set(call.id, call);
          if (!block.receivedInput)
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: current.id,
              delta: '{}',
            };
          if (native) assistantBlock = native;
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: current.id,
            metadata: {
              ...metadata(index, native ?? current.nativeBlock),
              'b4.step': bedrockRunningStep(current),
            },
          };
          activeBlocks.delete(index as number);
        } else if (block?.kind === 'result') {
          if (native) {
            // Validate the closed block before normalizing any settled step.
            readBedrockNativeContent(encodeBedrockNative([native], true));
            const id = native.toolResult?.toolUseId;
            if (id && settledCalls.has(id))
              throw new Error('Bedrock duplicate result identity');
            const call = matchBedrockProviderResult(native, [
              ...calls.values(),
            ]);
            const result =
              call && readBedrockProviderResult(call, native, Date.now());
            if (call && result) {
              calls.delete(call.id);
              settledCalls.add(call.id);
              const messageId = `${options.messageId}:provider-result:${index}`;
              represented.add(messageId);
              resultIds.push(messageId);
              const folded = addBedrockToolSources(
                annotationState,
                result.step.sources ?? [],
              );
              annotationState = folded.state;
              annotations = folded.annotations;
              yield {
                type: EventType.TOOL_CALL_RESULT,
                messageId,
                toolCallId: call.id,
                content: result.content,
                ...(result.step.status === 'failed'
                  ? { error: result.step.error?.message }
                  : {}),
                metadata: {
                  ...metadata(index, result.nativeBlock),
                  'b4.step': result.step,
                },
              };
            } else yield rawEvent(event);
          } else yield rawEvent(event);
          activeBlocks.delete(index as number);
        } else if (block?.kind === 'tool') {
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
            metadata: {
              ...metadata(index, native),
              bedrock: {
                ...metadata(index, native).bedrock,
                blockType: block.blockType,
              },
            },
          };
          activeBlocks.delete(index as number);
        }
        continue;
      }

      if (event.messageStop) {
        stopReason = event.messageStop.stopReason ?? stopReason;
        if (event.messageStop.additionalModelResponseFields !== undefined) {
          yield rawEvent(event);
        }
        continue;
      }

      if (event.metadata) {
        usage = event.metadata.usage ?? usage;
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
  if (options.signal?.aborted || !completed) return;
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
    } else if (block.kind === 'provider') {
      if (!block.receivedInput)
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: block.call.id,
          delta: '{}',
        };
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId: block.call.id,
        metadata: {
          ...metadata(undefined, block.call.nativeBlock),
          'b4.step': bedrockRunningStep(block.call),
        },
      };
    } else if (block.kind === 'reasoning') {
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
  if (
    assistantExists &&
    (textStarted || nativeProviderSeen || capture.messageStopped)
  ) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: options.messageId,
      metadata: {
        ...metadata(undefined, assistantBlock),
        ...(annotations ? { 'b4.answer': annotations } : {}),
      },
    };
  }
  if (options.signal?.aborted) return;
  const footer = createBedrockHistoryFooter(
    capture,
    {
      responseId: options.messageId,
      representedMessageIds: [...represented],
      ownerMessageId: assistantExists
        ? options.messageId
        : (resultIds[0] ?? reasoningIds[0]),
    },
    true,
  );
  if (footer) yield footer;
  const finish: ɵRunFinish = {
    ...readFinish(
      stopReason === 'tool_use' && !calledTools && nativeProviderSeen
        ? 'end_turn'
        : stopReason,
      calledTools,
      usage,
      options.model,
    ),
    providerMetadata: stopReason === undefined ? {} : { stopReason },
  };
  return options.signal?.aborted ? undefined : finish;
}
