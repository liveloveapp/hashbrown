import { type AGUIEvent, EventType } from '@ag-ui/core';
import type OpenAI from 'openai';

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;

interface ReasoningItemState {
  readonly summaryIndex?: number;
  readonly hasContent: boolean;
}

interface MapperState {
  readonly textStarted: boolean;
  readonly firstMessageItemId?: string;
  readonly reasoningItemIds: readonly string[];
  readonly openReasoning: ReadonlyMap<string, ReasoningItemState>;
  readonly toolCallIds: ReadonlyMap<string, string>;
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
  toolCallIds: new Map(),
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
          openai: {
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
            metadata: { openai: { itemId: item.id } },
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
          toolCallIds: withEntry(
            state.toolCallIds,
            item.id ?? item.call_id,
            item.call_id,
          ),
        },
        events: [
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: item.call_id,
            toolCallName: item.name,
            parentMessageId: messageId,
            metadata: {
              openai: {
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
    if (!state.toolCallIds.has(key)) {
      return { state, events: [] };
    }
    return {
      state: { ...state, toolCallIds: withoutEntry(state.toolCallIds, key) },
      events: [{ type: EventType.TOOL_CALL_END, toolCallId: item.call_id }],
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
    case 'response.refusal.delta':
      return mapTextDelta(state, messageId, event.item_id, event.delta);
    case 'response.function_call_arguments.delta': {
      const toolCallId = state.toolCallIds.get(event.item_id);
      return {
        state,
        events:
          toolCallId && event.delta
            ? [
                {
                  type: EventType.TOOL_CALL_ARGS,
                  toolCallId,
                  delta: event.delta,
                },
              ]
            : [],
      };
    }
    case 'response.completed':
      return endText(state, messageId);
    case 'response.failed':
      throw new Error(
        event.response.error?.message ?? 'Azure OpenAI response failed',
      );
    case 'error':
      throw new Error(event.message);
    case 'response.incomplete':
      throw new Error(
        `Azure OpenAI response incomplete: ${event.response.incomplete_details?.reason}`,
      );
    default:
      return { state, events: [] };
  }
}

/**
 * Maps Azure OpenAI Responses stream events to AG-UI message, reasoning and tool
 * call events.
 *
 * The mapper does not emit `RUN_STARTED`, `RUN_FINISHED` or `RUN_ERROR`; it
 * throws on `response.failed`, `error` and `response.incomplete` so the
 * caller can emit `RUN_ERROR`. All text goes into one assistant message,
 * which stays open across tool calls and ends at `response.completed`. A
 * stream that ends without `response.completed` also throws.
 *
 * @param options - Responses stream and AG-UI message identity.
 * @returns AG-UI events for the provider response.
 *
 * @internal
 */
export async function* mapAzureEvents(
  options: MapAzureEventsOptions,
): AsyncIterable<AGUIEvent> {
  let state = initialState;
  let completed = false;

  for await (const event of options.events) {
    if (options.signal?.aborted) {
      return;
    }

    completed = completed || event.type === 'response.completed';

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
}
