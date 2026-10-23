import type Anthropic from '@anthropic-ai/sdk';
import { EventType } from '@ag-ui/core';
import {
  ɵPROVIDER_HISTORY_EVENT_NAME,
  type ɵProviderHistory,
  ɵreadProviderHistory,
} from '@hashbrownai/core';

type NativeBlock =
  Anthropic.Messages.RawContentBlockStartEvent['content_block'];

/** Provider-native capture, independent of joined display text. @internal */
export interface AnthropicNativeCapture {
  readonly blocks: ReadonlyMap<number, NativeBlock>;
  readonly jsonDeltas: ReadonlyMap<number, string>;
  readonly container?: Anthropic.Messages.Container | null;
}

/** Starts an empty immutable native response capture. @internal */
export function createAnthropicNativeCapture(): AnthropicNativeCapture {
  return { blocks: new Map(), jsonDeltas: new Map() };
}

function clone<T>(value: T): T {
  try {
    const owned = ɵreadProviderHistory({
      v: 1,
      provider: 'anthropic',
      ownerMessageId: 'capture',
      responseId: 'capture',
      complete: false,
      payload: { value },
    });
    if (!owned) throw new TypeError('Native content must be JSON-compatible');
    return owned.payload['value'] as T;
  } catch (cause) {
    const error = new Error('Failed to clone Anthropic native stream event');
    Object.defineProperty(error, 'cause', { value: cause });
    throw error;
  }
}

/** Folds already validated native events without changing the source or earlier capture. @internal */
export function captureAnthropicNativeEvent(
  state: AnthropicNativeCapture,
  event: Anthropic.Messages.RawMessageStreamEvent,
): AnthropicNativeCapture {
  if (event.type === 'message_start' || event.type === 'message_delta') {
    const value =
      event.type === 'message_start'
        ? event.message.container
        : event.delta.container;
    return value === undefined ? state : { ...state, container: clone(value) };
  }
  if (event.type === 'content_block_start') {
    return {
      ...state,
      blocks: new Map([
        ...state.blocks,
        [event.index, clone(event.content_block)],
      ]),
    };
  }
  if (event.type === 'content_block_stop') {
    const partial = state.jsonDeltas.get(event.index);
    const block = state.blocks.get(event.index);
    if (
      !partial?.trim() ||
      !block ||
      (block.type !== 'tool_use' && block.type !== 'server_tool_use')
    )
      return state;
    let input: unknown;
    try {
      input = JSON.parse(partial);
    } catch {
      throw new Error(
        `Anthropic native input at index ${event.index} is not valid JSON`,
      );
    }
    return {
      ...state,
      blocks: new Map([...state.blocks, [event.index, { ...block, input }]]),
    };
  }
  if (event.type !== 'content_block_delta') return state;
  const block = state.blocks.get(event.index);
  if (!block) return state;
  const delta = event.delta;
  if (
    delta.type === 'input_json_delta' &&
    (block.type === 'tool_use' || block.type === 'server_tool_use')
  ) {
    return {
      ...state,
      jsonDeltas: new Map([
        ...state.jsonDeltas,
        [
          event.index,
          (state.jsonDeltas.get(event.index) ?? '') + delta.partial_json,
        ],
      ]),
    };
  }
  let next: NativeBlock = block;
  if (delta.type === 'text_delta' && block.type === 'text')
    next = { ...block, text: block.text + delta.text };
  if (delta.type === 'thinking_delta' && block.type === 'thinking')
    next = { ...block, thinking: block.thinking + delta.thinking };
  if (delta.type === 'signature_delta' && block.type === 'thinking')
    next = { ...block, signature: delta.signature };
  if (delta.type === 'citations_delta' && block.type === 'text')
    next = {
      ...block,
      citations: [...(block.citations ?? []), clone(delta.citation)],
    };
  return next === block
    ? state
    : { ...state, blocks: new Map([...state.blocks, [event.index, next]]) };
}

/** Complete native response content claimed by its canonical owner. @internal */
export interface AnthropicCapturedPayload extends Record<string, unknown> {
  readonly blocks: readonly NativeBlock[];
  readonly representedMessageIds: readonly string[];
  readonly container?: Anthropic.Messages.Container | null;
}

/** Creates a persistable footer after native completion, without a fabricated display owner. @internal */
export function createAnthropicHistoryFooter(
  state: AnthropicNativeCapture,
  options: {
    readonly ownerMessageId?: string;
    readonly responseId: string;
    readonly representedMessageIds: readonly string[];
  },
):
  | {
      type: EventType.CUSTOM;
      name: string;
      value: ɵProviderHistory & { payload: AnthropicCapturedPayload };
    }
  | undefined {
  if (options.representedMessageIds.length === 0) return undefined;
  if (
    !options.ownerMessageId ||
    !options.representedMessageIds.includes(options.ownerMessageId)
  )
    throw new Error(
      'Anthropic native history requires a represented canonical owner',
    );
  const value = ɵreadProviderHistory({
    v: 1,
    provider: 'anthropic',
    ownerMessageId: options.ownerMessageId,
    responseId: options.responseId,
    complete: true,
    payload: {
      blocks: [...state.blocks]
        .sort(([left], [right]) => left - right)
        .map(([, block]) => block),
      representedMessageIds: [...options.representedMessageIds],
      ...(state.container === undefined ? {} : { container: state.container }),
    },
  });
  if (!value) throw new Error('Anthropic native history is not valid JSON');
  return {
    type: EventType.CUSTOM,
    name: ɵPROVIDER_HISTORY_EVENT_NAME,
    value: value as ɵProviderHistory & { payload: AnthropicCapturedPayload },
  };
}
