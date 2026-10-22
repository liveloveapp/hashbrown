import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type FinishReason,
  ɵcreateTokenUsage,
  type ɵRunFinish,
} from '@hashbrownai/core';
import type OpenAI from 'openai';

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

interface ReasoningItemState {
  readonly summaryIndex?: number;
  readonly hasContent: boolean;
}

interface ToolCallState {
  readonly toolCallId: string;
  readonly hasArgs: boolean;
}

interface MapperState {
  readonly textStarted: boolean;
  readonly firstMessageItemId?: string;
  readonly reasoningItemIds: readonly string[];
  readonly openReasoning: ReadonlyMap<string, ReasoningItemState>;
  readonly toolCalls: ReadonlyMap<string, ToolCallState>;
  readonly calledTools: boolean;
  readonly refused: boolean;
  readonly finish?: ɵRunFinish;
}

interface MapperStep {
  readonly state: MapperState;
  readonly events: readonly AGUIEvent[];
}

/** Inputs for mapping Azure OpenAI Responses stream events to AG-UI events. */
export interface MapAzureEventsOptions {
  /** The Responses API stream. */
  readonly events: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
  /** The id of the run's single assistant AG-UI message. */
  readonly messageId: string;
  /** Stops mapping once aborted. */
  readonly signal?: AbortSignal;
}

const initialState: MapperState = {
  textStarted: false,
  reasoningItemIds: [],
  openReasoning: new Map(),
  toolCalls: new Map(),
  calledTools: false,
  refused: false,
};

function withEntry<V>(
  map: ReadonlyMap<string, V>,
  key: string,
  value: V,
): ReadonlyMap<string, V> {
  return new Map(map).set(key, value);
}

function withoutEntry<V>(
  map: ReadonlyMap<string, V>,
  key: string,
): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

function mapTextDelta(
  state: MapperState,
  messageId: string,
  itemId: string,
  delta: string,
): MapperStep {
  if (!delta) {
    return { state, events: [] };
  }

  const content: AGUIEvent = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
  };
  if (state.textStarted) {
    return { state, events: [content] };
  }

  return {
    state: { ...state, textStarted: true },
    events: [
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        metadata: {
          azure: {
            itemId: state.firstMessageItemId ?? itemId,
            reasoningItemIds: [...state.reasoningItemIds],
          },
        },
      },
      content,
    ],
  };
}

function mapItemAdded(
  state: MapperState,
  messageId: string,
  item: OpenAI.Responses.ResponseOutputItem,
): MapperStep {
  switch (item.type) {
    case 'reasoning':
      return {
        state: {
          ...state,
          reasoningItemIds: [...state.reasoningItemIds, item.id],
          openReasoning: withEntry(state.openReasoning, item.id, {
            hasContent: false,
          }),
        },
        events: [
          {
            type: EventType.REASONING_MESSAGE_START,
            messageId: item.id,
            role: 'reasoning',
            metadata: { azure: { itemId: item.id } },
          },
        ],
      };
    case 'message':
      return {
        state: {
          ...state,
          firstMessageItemId: state.firstMessageItemId ?? item.id,
        },
        events: [],
      };
    case 'function_call':
      return {
        state: {
          ...state,
          calledTools: true,
          toolCalls: withEntry(state.toolCalls, item.id ?? item.call_id, {
            toolCallId: item.call_id,
            hasArgs: false,
          }),
        },
        events: [
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: item.call_id,
            toolCallName: item.name,
            parentMessageId: messageId,
            metadata: {
              azure: {
                ...(item.id === undefined ? {} : { itemId: item.id }),
                reasoningItemIds: [...state.reasoningItemIds],
              },
            },
          },
        ],
      };
    default:
      return { state, events: [] };
  }
}

function mapItemDone(
  state: MapperState,
  item: OpenAI.Responses.ResponseOutputItem,
): MapperStep {
  if (item.type === 'reasoning') {
    if (!state.openReasoning.has(item.id)) {
      return { state, events: [] };
    }
    return {
      state: {
        ...state,
        openReasoning: withoutEntry(state.openReasoning, item.id),
      },
      events: [
        ...(item.encrypted_content
          ? [
              {
                type: EventType.REASONING_ENCRYPTED_VALUE,
                subtype: 'message',
                entityId: item.id,
                encryptedValue: item.encrypted_content,
              } as const,
            ]
          : []),
        { type: EventType.REASONING_MESSAGE_END, messageId: item.id },
      ],
    };
  }

  if (item.type === 'function_call') {
    const key = item.id ?? item.call_id;
    const toolCall = state.toolCalls.get(key);
    if (!toolCall) {
      return { state, events: [] };
    }
    // A call that streamed no argument deltas sends its arguments here.
    const args: readonly AGUIEvent[] =
      !toolCall.hasArgs && item.arguments
        ? [
            {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: item.call_id,
              delta: item.arguments,
            },
          ]
        : [];
    return {
      state: { ...state, toolCalls: withoutEntry(state.toolCalls, key) },
      events: [
        ...args,
        { type: EventType.TOOL_CALL_END, toolCallId: item.call_id },
      ],
    };
  }

  return { state, events: [] };
}

function mapSummaryDelta(
  state: MapperState,
  event: OpenAI.Responses.ResponseReasoningSummaryTextDeltaEvent,
): MapperStep {
  const reasoning = state.openReasoning.get(event.item_id);
  if (!reasoning || !event.delta) {
    return { state, events: [] };
  }

  const separate =
    reasoning.hasContent && reasoning.summaryIndex !== event.summary_index;
  return {
    state: {
      ...state,
      openReasoning: withEntry(state.openReasoning, event.item_id, {
        summaryIndex: event.summary_index,
        hasContent: true,
      }),
    },
    events: [...(separate ? ['\n\n'] : []), event.delta].map((delta) => ({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: event.item_id,
      delta,
    })),
  };
}

const INCOMPLETE_REASONS: Readonly<Record<string, FinishReason>> = {
  max_output_tokens: 'length',
  content_filter: 'content_filter',
};

function readFinish(
  state: MapperState,
  response: OpenAI.Responses.Response,
): ɵRunFinish {
  const incompleteReason =
    response.status === 'incomplete'
      ? response.incomplete_details?.reason
      : undefined;
  const finishReason: FinishReason = incompleteReason
    ? (INCOMPLETE_REASONS[incompleteReason] ?? 'other')
    : state.refused
      ? 'refusal'
      : state.calledTools
        ? 'tool_calls'
        : 'stop';
  const usage = ɵcreateTokenUsage({
    provider: 'azure',
    model: response.model,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    totalTokens: response.usage?.total_tokens,
    reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens,
  });
  return {
    finishReason,
    providerMetadata: {
      ...(response.status ? { status: response.status } : {}),
      ...(incompleteReason ? { incompleteReason } : {}),
    },
    ...(usage ? { usage } : {}),
  };
}

function finishResponse(
  state: MapperState,
  messageId: string,
  response: OpenAI.Responses.Response,
): MapperStep {
  const step = endText(state, messageId);
  return {
    state: { ...step.state, finish: readFinish(state, response) },
    events: step.events,
  };
}

function endText(state: MapperState, messageId: string): MapperStep {
  return state.textStarted
    ? {
        state: { ...state, textStarted: false },
        events: [{ type: EventType.TEXT_MESSAGE_END, messageId }],
      }
    : { state, events: [] };
}

function mapEvent(
  state: MapperState,
  messageId: string,
  event: StreamEvent,
): MapperStep {
  switch (event.type) {
    case 'response.output_item.added':
      return mapItemAdded(state, messageId, event.item);
    case 'response.output_item.done':
      return mapItemDone(state, event.item);
    case 'response.reasoning_summary_text.delta':
      return mapSummaryDelta(state, event);
    case 'response.output_text.delta':
      return mapTextDelta(state, messageId, event.item_id, event.delta);
    case 'response.refusal.delta':
      return mapTextDelta(
        { ...state, refused: true },
        messageId,
        event.item_id,
        event.delta,
      );
    case 'response.function_call_arguments.delta': {
      const toolCall = state.toolCalls.get(event.item_id);
      if (!toolCall || !event.delta) {
        return { state, events: [] };
      }
      return {
        state: {
          ...state,
          toolCalls: withEntry(state.toolCalls, event.item_id, {
            ...toolCall,
            hasArgs: true,
          }),
        },
        events: [
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: toolCall.toolCallId,
            delta: event.delta,
          },
        ],
      };
    }
    case 'response.completed':
    case 'response.incomplete':
      return finishResponse(state, messageId, event.response);
    case 'response.failed':
      throw new Error(
        event.response.error?.message ?? 'Azure OpenAI response failed',
      );
    case 'error':
      throw new Error(event.message);
    default:
      return { state, events: [] };
  }
}

/**
 * Maps Azure OpenAI Responses stream events to AG-UI message, reasoning and tool
 * call events.
 *
 * The mapper does not emit `RUN_STARTED`, `RUN_FINISHED` or `RUN_ERROR`; it
 * throws on `response.failed` and `error` so the caller can emit
 * `RUN_ERROR`. All text goes into one assistant message, which stays open
 * across tool calls and ends at `response.completed` or
 * `response.incomplete`. A stream that ends without either also throws.
 *
 * @param options - Responses stream and AG-UI message identity.
 * @returns AG-UI events for the provider response; the generator's return
 * value is how the model stopped and the response's token usage, or
 * `undefined` when mapping stopped on abort.
 *
 * @internal
 */
export async function* mapAzureEvents(
  options: MapAzureEventsOptions,
): AsyncGenerator<AGUIEvent, ɵRunFinish | undefined> {
  let state = initialState;
  let completed = false;

  for await (const event of options.events) {
    if (options.signal?.aborted) {
      return;
    }

    completed =
      completed ||
      event.type === 'response.completed' ||
      event.type === 'response.incomplete';

    const step = mapEvent(state, options.messageId, event);
    state = step.state;
    for (const output of step.events) {
      yield output;
      if (options.signal?.aborted) {
        return;
      }
    }
  }

  if (options.signal?.aborted) {
    return;
  }

  if (!completed) {
    throw new Error('Azure OpenAI stream ended before response.completed');
  }

  return state.finish;
}
