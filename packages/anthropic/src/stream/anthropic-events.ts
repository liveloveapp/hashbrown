import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import {
  type FinishReason,
  ɵANSWER_METADATA_KEY,
  type ɵAnswerAnnotations,
  ɵcreateTokenUsage,
  type ɵRunFinish,
  ɵTOOL_STEP_METADATA_KEY,
} from '@hashbrownai/core';

import {
  captureAnthropicNativeEvent,
  createAnthropicHistoryFooter,
  createAnthropicNativeCapture,
} from './anthropic-history-capture';
import {
  anthropicRunningStep,
  type AnthropicServerToolCall,
  readAnthropicServerToolCall,
  readAnthropicServerToolResult,
} from './anthropic-tools';

import {
  addAnthropicToolSources,
  createAnthropicSourceContext,
  resolveAnthropicCitation,
} from './anthropic-sources';

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
  readonly call?: AnthropicServerToolCall;
  readonly receivedDelta: boolean;
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

interface UsageCounts {
  readonly inputTokens?: number | null;
  readonly cacheWriteInputTokens?: number | null;
  readonly cachedInputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly reasoningTokens?: number | null;
}

type NativeUsage = Partial<
  Pick<
    Anthropic.Messages.MessageDeltaUsage,
    | 'input_tokens'
    | 'cache_creation_input_tokens'
    | 'cache_read_input_tokens'
    | 'output_tokens'
    | 'output_tokens_details'
  >
>;

function latest(
  next: number | null | undefined,
  previous: number | null | undefined,
): number | null | undefined {
  return typeof next === 'number' ? next : previous;
}

/**
 * Folds a native usage report into the counts seen so far. Anthropic repeats
 * cumulative counts, so the latest non-null value wins.
 */
function mergeUsage(
  previous: UsageCounts,
  usage: NativeUsage | null | undefined,
): UsageCounts {
  if (!isRecord(usage)) {
    return previous;
  }

  return {
    inputTokens: latest(usage.input_tokens, previous.inputTokens),
    cacheWriteInputTokens: latest(
      usage.cache_creation_input_tokens,
      previous.cacheWriteInputTokens,
    ),
    cachedInputTokens: latest(
      usage.cache_read_input_tokens,
      previous.cachedInputTokens,
    ),
    outputTokens: latest(usage.output_tokens, previous.outputTokens),
    reasoningTokens: latest(
      usage.output_tokens_details?.thinking_tokens,
      previous.reasoningTokens,
    ),
  };
}

function count(value: number | null | undefined): number {
  return typeof value === 'number' ? value : 0;
}

const STOP_REASONS: Readonly<Record<string, FinishReason>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  refusal: 'refusal',
  pause_turn: 'other',
};

interface StopFields {
  readonly stopReason?: string | null;
  readonly stopSequence?: string | null;
  readonly refusalCategory?: string | null;
}

function readStopFields(
  delta: Partial<Anthropic.Messages.RawMessageDeltaEvent['delta']> | undefined,
): StopFields {
  if (!isRecord(delta)) {
    return {};
  }

  return {
    stopReason: delta.stop_reason,
    stopSequence: delta.stop_sequence,
    refusalCategory: isRecord(delta.stop_details)
      ? delta.stop_details.category
      : undefined,
  };
}

/**
 * Builds the run's finish from the message's stop fields and token counts.
 * AG-UI's `inputTokens` counts every prompt token, so it sums Anthropic's
 * uncached input with its cache writes and cache reads.
 */
function readFinish(options: {
  readonly model: string | undefined;
  readonly stop: StopFields;
  readonly usage: UsageCounts;
  readonly calledClientTool: boolean;
}): ɵRunFinish {
  const { stop, usage } = options;
  const stopReason = stop.stopReason ?? undefined;
  const normalized: FinishReason = stopReason
    ? (STOP_REASONS[stopReason] ?? 'other')
    : 'other';
  const finishReason: FinishReason =
    normalized === 'stop' && options.calledClientTool
      ? 'tool_calls'
      : normalized;
  const hasInput =
    typeof usage.inputTokens === 'number' ||
    typeof usage.cacheWriteInputTokens === 'number' ||
    typeof usage.cachedInputTokens === 'number';
  const tokenUsage = ɵcreateTokenUsage({
    provider: 'anthropic',
    model: options.model,
    inputTokens: hasInput
      ? count(usage.inputTokens) +
        count(usage.cacheWriteInputTokens) +
        count(usage.cachedInputTokens)
      : undefined,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteInputTokens: usage.cacheWriteInputTokens,
  });

  return {
    finishReason,
    providerMetadata: {
      ...(stopReason ? { stopReason } : {}),
      ...(stop.stopSequence ? { stopSequence: stop.stopSequence } : {}),
      ...(stop.refusalCategory
        ? { refusalCategory: stop.refusalCategory }
        : {}),
    },
    ...(tokenUsage ? { usage: tokenUsage } : {}),
  };
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
  /** Canonical context supplies original identity and execution timing. */
  readonly inputMessages?: readonly Message[];
  /** Actual transformed request supplies native pending calls and sources. */
  readonly requestOptions?: Anthropic.Messages.MessageCreateParamsStreaming;
}

/**
 * Maps raw Anthropic message events to canonical AG-UI message and tool events.
 *
 * @param options - Raw event source, stable assistant message ID, and cancellation
 * signal.
 * @returns An asynchronous stream of AG-UI message and tool events; the
 * generator's return value is how the model stopped and the message's token
 * usage, or `undefined` when mapping stopped on abort.
 *
 * @internal
 */
export async function* mapAnthropicEvents(
  options: MapAnthropicEventsOptions,
): AsyncGenerator<AGUIEvent, ɵRunFinish | undefined> {
  const iterator = options.events[Symbol.asyncIterator]();
  const seenIndexes = new Set<number>();
  const seenToolIds = new Set<string>();
  const activeBlocks = new Map<number, ContentBlockState>();
  let capture = createAnthropicNativeCapture();
  let responseId = `${options.messageId}:response`;
  let sources = createAnthropicSourceContext(
    options.requestOptions,
    options.inputMessages,
    responseId,
  );
  let annotations: ɵAnswerAnnotations | undefined;
  const represented = new Set<string>();
  const resultIds: string[] = [];
  const reasoningIds: string[] = [];
  const serverCalls = new Map<string, AnthropicServerToolCall>();
  for (const message of options.requestOptions?.messages ?? []) {
    if (!Array.isArray(message.content)) continue;
    for (const native of message.content) {
      const call = readAnthropicServerToolCall(native);
      if (!call) continue;
      let startedAt: number | undefined;
      for (const canonical of options.inputMessages ?? []) {
        if (canonical.role !== 'assistant') continue;
        const invocation = canonical.toolCalls?.find(
          (tool) => tool.id === call.id,
        );
        const step = invocation?.metadata?.[ɵTOOL_STEP_METADATA_KEY];
        if (isRecord(step) && typeof step['startedAt'] === 'number')
          startedAt = step['startedAt'];
      }
      serverCalls.set(call.id, {
        ...call,
        ...(startedAt === undefined ? {} : { startedAt }),
      });
    }
  }
  for (const message of options.inputMessages ?? []) {
    if (message.role !== 'assistant') continue;
    for (const invocation of message.toolCalls ?? []) {
      const nativeMetadata = invocation.metadata?.['anthropic'];
      const step = invocation.metadata?.[ɵTOOL_STEP_METADATA_KEY];
      if (!isRecord(nativeMetadata)) continue;
      const startedAt =
        isRecord(step) && typeof step['startedAt'] === 'number'
          ? step['startedAt']
          : undefined;
      const call = readAnthropicServerToolCall(
        nativeMetadata['nativeBlock'],
        startedAt,
      );
      if (call && call.id === invocation.id) serverCalls.set(call.id, call);
    }
  }
  const metadata = (index?: number) => {
    const nativeBlock =
      index === undefined ? undefined : capture.blocks.get(index);
    const caller =
      nativeBlock?.type === 'tool_use' ? nativeBlock.caller : undefined;
    const parentToolCallId =
      caller &&
      caller.type.startsWith('code_execution_') &&
      'tool_id' in caller &&
      typeof caller.tool_id === 'string' &&
      caller.tool_id.length > 0
        ? caller.tool_id
        : undefined;
    return {
      anthropic: {
        responseId,
        ...(index === undefined
          ? {}
          : { blockIndex: index, blockType: nativeBlock?.type, nativeBlock }),
      },
      ...(parentToolCallId === undefined
        ? {}
        : {
            [ɵTOOL_STEP_METADATA_KEY]: {
              v: 1,
              kind: 'server',
              status: 'running',
              parentToolCallId,
            },
          }),
    };
  };
  let messageStarted = false;
  let messageStopped = false;
  let textStarted = false;
  let sourceCompleted = false;
  let hasPrimaryError = false;
  let model: string | undefined;
  let usage: UsageCounts = {};
  let stop: StopFields = {};

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
        const message: Partial<Anthropic.Messages.Message> | undefined =
          isRecord(event.message) ? event.message : undefined;
        model = typeof message?.model === 'string' ? message.model : undefined;
        usage = mergeUsage(usage, message?.usage);
        responseId =
          typeof message?.id === 'string' && message.id
            ? message.id
            : responseId;
        capture = captureAnthropicNativeEvent(capture, event);
        sources = createAnthropicSourceContext(
          options.requestOptions,
          options.inputMessages,
          responseId,
        );
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

          try {
            capture = captureAnthropicNativeEvent(capture, event);
          } catch (error) {
            if (contentBlock.type === 'tool_use')
              serializeInitialInput(
                {
                  kind: 'tool',
                  id: contentBlock.id,
                  initialInput: contentBlock.input,
                  receivedDelta: false,
                },
                index,
              );
            rawEvent(event);
            throw error;
          }
          seenIndexes.add(index);
          if (blockType === 'thinking' || blockType === 'redacted_thinking') {
            // Interleaved thinking can follow text, server tools, or client
            // tools in the same message, so reasoning may start anywhere.
            const messageId = `${options.messageId}:reasoning:${index}`;
            represented.add(messageId);
            reasoningIds.push(messageId);
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
                metadata: {
                  anthropic: {
                    ...metadata(index).anthropic,
                    blockType: 'thinking',
                  },
                },
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
              metadata: {
                anthropic: {
                  ...metadata(index).anthropic,
                  blockType: 'redacted_thinking',
                },
              },
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

            activeBlocks.set(index, { kind: 'text' });
            if (text.length > 0) {
              if (!textStarted) {
                textStarted = true;
                represented.add(options.messageId);
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId: options.messageId,
                  role: 'assistant',
                  metadata: metadata(index),
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
              for (const citation of contentBlock.citations) {
                const resolved = resolveAnthropicCitation(
                  sources,
                  citation,
                  index,
                );
                sources = resolved.context;
                annotations = resolved.annotations ?? annotations;
              }
              yield rawEvent(event);
              if (options.signal?.aborted) {
                return;
              }
            }
            break;
          }

          if (blockType === 'server_tool_use') {
            for (const field of ['id', 'name'] as const) {
              if (typeof contentBlock[field] !== 'string')
                throw new Error(
                  `Anthropic server tool block at index ${index} has a non-string ${field}`,
                );
              if (contentBlock[field].length === 0)
                throw new Error(
                  `Anthropic server tool block at index ${index} has an empty ${field}`,
                );
            }
            const call = readAnthropicServerToolCall(contentBlock, Date.now());
            if (call) {
              if (seenToolIds.has(call.id) || serverCalls.has(call.id))
                throw new Error(
                  `Anthropic tool id "${call.id}" started more than once at index ${index}`,
                );
              serverCalls.set(call.id, call);
              represented.add(options.messageId);
            }
            activeBlocks.set(index, {
              kind: 'server_tool',
              call,
              receivedDelta: false,
            });
            if (call) {
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: call.id,
                toolCallName: call.name,
                parentMessageId: options.messageId,
                metadata: {
                  ...metadata(index),
                  [ɵTOOL_STEP_METADATA_KEY]: anthropicRunningStep(call),
                },
              };
              if (options.signal?.aborted) return;
            }
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

          if (serverCalls.has(id))
            throw new Error(
              `Anthropic tool id "${id}" started more than once at index ${index}`,
            );
          seenToolIds.add(id);
          represented.add(options.messageId);
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
            metadata: metadata(index),
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
          capture = captureAnthropicNativeEvent(capture, event);

          if (block.kind === 'text') {
            if (deltaType === 'citations_delta') {
              const resolved = resolveAnthropicCitation(
                sources,
                delta.citation,
                index,
              );
              sources = resolved.context;
              annotations = resolved.annotations ?? annotations;
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
              represented.add(options.messageId);
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: options.messageId,
                role: 'assistant',
                metadata: metadata(index),
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

            activeBlocks.set(index, {
              ...block,
              receivedDelta: block.receivedDelta || partialJson.length > 0,
            });
            if (block.call) {
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: block.call.id,
                delta: partialJson,
              };
              if (options.signal?.aborted) return;
            }
            yield rawEvent(event);
            if (options.signal?.aborted) return;
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

          capture = captureAnthropicNativeEvent(capture, event);
          activeBlocks.delete(index);
          if (block.kind === 'text') {
            break;
          }

          if (block.kind === 'server_tool') {
            if (block.call) {
              const call =
                readAnthropicServerToolCall(
                  capture.blocks.get(index),
                  block.call.startedAt,
                ) ?? block.call;
              serverCalls.set(call.id, call);
              if (!block.receivedDelta) {
                yield {
                  type: EventType.TOOL_CALL_ARGS,
                  toolCallId: call.id,
                  delta: serializeInitialInput(
                    {
                      kind: 'tool',
                      id: call.id,
                      initialInput: call.input,
                      receivedDelta: false,
                    },
                    index,
                  ),
                };
                if (options.signal?.aborted) return;
              }
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: call.id,
                metadata: {
                  ...metadata(index),
                  [ɵTOOL_STEP_METADATA_KEY]: anthropicRunningStep(call),
                },
              };
              if (options.signal?.aborted) return;
            }
            yield rawEvent(event);
            if (options.signal?.aborted) return;
            break;
          }
          if (block.kind === 'raw_terminal') {
            const native = capture.blocks.get(index);
            const nativeRecord = native as unknown as
              Record<string, unknown> | undefined;
            const call =
              typeof nativeRecord?.['tool_use_id'] === 'string'
                ? serverCalls.get(nativeRecord['tool_use_id'])
                : undefined;
            if (
              call &&
              block.nativeType !== 'tool_search_tool_result' &&
              block.nativeType !== 'container_upload'
            ) {
              const result = readAnthropicServerToolResult(call, native);
              if (!result)
                throw new Error(
                  `Anthropic ${block.nativeType} result for ${call.id} is malformed or incompatible`,
                );
              sources = addAnthropicToolSources(
                sources,
                result.step.sources,
                index,
                native,
              );
              const messageId = `${options.messageId}:provider-result:${index}`;
              represented.add(messageId);
              resultIds.push(messageId);
              yield {
                type: EventType.TOOL_CALL_RESULT,
                messageId,
                toolCallId: call.id,
                content: result.content,
                metadata: {
                  ...metadata(index),
                  [ɵTOOL_STEP_METADATA_KEY]: result.step,
                },
              };
              if (options.signal?.aborted) return;
            }
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
              metadata: metadata(index),
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
              metadata: metadata(index),
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
            metadata: metadata(index),
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
          capture = captureAnthropicNativeEvent(capture, event);
          stop = { ...stop, ...readStopFields(event.delta) };
          usage = mergeUsage(usage, event.usage);
          break;

        case 'message_stop': {
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
              metadata: {
                ...metadata(),
                ...(annotations ? { [ɵANSWER_METADATA_KEY]: annotations } : {}),
              },
            };
            if (options.signal?.aborted) {
              return;
            }
          }
          const footer = createAnthropicHistoryFooter(capture, {
            ownerMessageId: represented.has(options.messageId)
              ? options.messageId
              : (resultIds[0] ?? reasoningIds[0]),
            responseId,
            representedMessageIds: [...represented],
          });
          if (footer) {
            yield footer;
            if (options.signal?.aborted) return;
          }
          break;
        }

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

    return readFinish({
      model,
      stop,
      usage,
      calledClientTool: seenToolIds.size > 0,
    });
  } catch (error) {
    hasPrimaryError = true;
    throw error;
  } finally {
    if (!sourceCompleted) {
      await closeIterator(iterator, hasPrimaryError);
    }
  }
}
