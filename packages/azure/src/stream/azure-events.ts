import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type FinishReason,
  ɵANSWER_METADATA_KEY,
  type ɵAnswerAnnotations,
  ɵbuiltInToolLabel,
  ɵcreateTokenUsage,
  type ɵRunFinish,
  ɵTOOL_STEP_METADATA_KEY,
  type ɵToolStep,
  type ɵToolStepSource,
} from '@hashbrownai/core';
import type OpenAI from 'openai';
import {
  type CodeExecutionState,
  mapCodeExecution,
} from './azure-code-execution';

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;
type WebSearchCall = OpenAI.Responses.ResponseFunctionWebSearch;

/** The provider name written on steps and the metadata key for item ids. */
const PROVIDER = 'azure';
const WEB_SEARCH = 'web_search';

/** A `url_citation`, with its span resolved against the whole message. */
interface CitationState {
  readonly url: string;
  readonly title: string;
  readonly start: number;
  readonly end: number;
}

interface ReasoningItemState {
  readonly summaryIndex?: number;
  readonly hasContent: boolean;
}

interface ToolCallState {
  readonly toolCallId: string;
  readonly hasArgs: boolean;
}

interface MapperState {
  readonly codeCalls: ReadonlyMap<string, CodeExecutionState>;
  readonly textStarted: boolean;
  readonly firstMessageItemId?: string;
  readonly reasoningItemIds: readonly string[];
  readonly openReasoning: ReadonlyMap<string, ReasoningItemState>;
  readonly toolCalls: ReadonlyMap<string, ToolCallState>;
  /** Start times of open `web_search_call` items, by item id. */
  readonly webSearches: ReadonlyMap<string, number>;
  /** All text written to the assistant message so far. */
  readonly text: string;
  /** Where each output text part (`<itemId>:<contentIndex>`) starts in `text`. */
  readonly partOffsets: ReadonlyMap<string, number>;
  /** `url_citation` annotations collected for the assistant message. */
  readonly annotations: readonly CitationState[];
  /** Source id by url, for every web search source seen so far. */
  readonly sourceIndex: ReadonlyMap<string, string>;
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
  codeCalls: new Map(),
  textStarted: false,
  reasoningItemIds: [],
  openReasoning: new Map(),
  toolCalls: new Map(),
  webSearches: new Map(),
  text: '',
  partOffsets: new Map(),
  annotations: [],
  sourceIndex: new Map(),
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

function partKey(itemId: string, contentIndex: number): string {
  return `${itemId}:${contentIndex}`;
}

function mapTextDelta(
  previous: MapperState,
  messageId: string,
  itemId: string,
  contentIndex: number,
  delta: string,
): MapperStep {
  if (!delta) {
    return { state: previous, events: [] };
  }

  const key = partKey(itemId, contentIndex);
  const state: MapperState = {
    ...previous,
    text: previous.text + delta,
    partOffsets: previous.partOffsets.has(key)
      ? previous.partOffsets
      : withEntry(previous.partOffsets, key, previous.text.length),
  };
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

function webSearchStep(
  status: 'running' | 'completed' | 'failed',
  fields: Omit<ɵToolStep, 'v' | 'kind' | 'builtin' | 'provider' | 'status'>,
): ɵToolStep {
  return {
    v: 1,
    kind: 'provider',
    builtin: WEB_SEARCH,
    provider: PROVIDER,
    status,
    ...fields,
  };
}

function searchQueries(action: WebSearchCall['action']): string[] {
  if (action?.type !== 'search') {
    return [];
  }
  const queries = [
    ...(action.query ? [action.query] : []),
    ...(action.queries ?? []),
  ];
  return [...new Set(queries.filter((query) => query.length > 0))];
}

function searchSources(item: WebSearchCall): ɵToolStepSource[] {
  if (item.action?.type !== 'search') {
    return [];
  }
  return (item.action.sources ?? [])
    .filter((source) => typeof source.url === 'string')
    .map((source, index) => ({
      id: `${item.id}:${index}`,
      kind: 'url',
      title: source.url,
      href: source.url,
    }));
}

function mapWebSearchAdded(
  state: MapperState,
  messageId: string,
  item: WebSearchCall,
): MapperStep {
  const startedAt = Date.now();
  return {
    state: {
      ...state,
      webSearches: withEntry(state.webSearches, item.id, startedAt),
    },
    events: [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: item.id,
        toolCallName: WEB_SEARCH,
        parentMessageId: messageId,
        metadata: {
          [PROVIDER]: { itemId: item.id, itemType: item.type },
          [ɵTOOL_STEP_METADATA_KEY]: webSearchStep('running', {
            label: ɵbuiltInToolLabel(WEB_SEARCH, 'running', {}),
            startedAt,
          }),
        },
      },
    ],
  };
}

function mapWebSearchDone(state: MapperState, item: WebSearchCall): MapperStep {
  const startedAt = state.webSearches.get(item.id);
  if (startedAt === undefined) {
    return { state, events: [] };
  }

  const settledAt = Date.now();
  const queries = searchQueries(item.action);
  const query = queries.length > 0 ? { queries } : {};
  const step =
    item.status === 'failed'
      ? webSearchStep('failed', {
          label: ɵbuiltInToolLabel(WEB_SEARCH, 'failed', {}),
          ...query,
          startedAt,
          settledAt,
          error: { message: 'Web search failed' },
        })
      : completedWebSearch(item, queries, startedAt, settledAt);
  const sources = step.sources ?? [];
  return {
    state: {
      ...state,
      webSearches: withoutEntry(state.webSearches, item.id),
      sourceIndex: sources.reduce(
        (index, source) =>
          source.href === undefined
            ? index
            : urlKeys(source.href).reduce(
                (keyed, key) =>
                  keyed.has(key) ? keyed : withEntry(keyed, key, source.id),
                index,
              ),
        state.sourceIndex,
      ),
    },
    events: [
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: item.id,
        delta: JSON.stringify(item.action),
      },
      { type: EventType.TOOL_CALL_END, toolCallId: item.id },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: `${item.id}:result`,
        toolCallId: item.id,
        content: JSON.stringify({ action: item.action, status: item.status }),
        metadata: { [ɵTOOL_STEP_METADATA_KEY]: step },
      },
    ],
  };
}

function completedWebSearch(
  item: WebSearchCall,
  queries: readonly string[],
  startedAt: number,
  settledAt: number,
): ɵToolStep {
  const sources = searchSources(item);
  return webSearchStep('completed', {
    label: ɵbuiltInToolLabel(WEB_SEARCH, 'completed', {
      query: queries[0],
      sourceCount: sources.length > 0 ? sources.length : undefined,
    }),
    ...(queries.length > 0 ? { queries: [...queries] } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    startedAt,
    settledAt,
  });
}

function isUrlCitation(
  annotation: unknown,
): annotation is OpenAI.Responses.ResponseOutputText.URLCitation {
  if (typeof annotation !== 'object' || annotation === null) {
    return false;
  }
  const value = annotation as Record<string, unknown>;
  return (
    value['type'] === 'url_citation' &&
    typeof value['url'] === 'string' &&
    typeof value['start_index'] === 'number' &&
    typeof value['end_index'] === 'number'
  );
}

function mapAnnotation(
  state: MapperState,
  event: OpenAI.Responses.ResponseOutputTextAnnotationAddedEvent,
): MapperStep {
  const annotation = event.annotation;
  if (!isUrlCitation(annotation)) {
    return { state, events: [] };
  }

  const offset = state.partOffsets.get(
    partKey(event.item_id, event.content_index),
  );
  if (offset === undefined) {
    return { state, events: [] };
  }

  return {
    state: {
      ...state,
      annotations: [
        ...state.annotations,
        {
          url: annotation.url,
          title:
            typeof annotation.title === 'string' && annotation.title
              ? annotation.title
              : annotation.url,
          start: offset + annotation.start_index,
          end: offset + annotation.end_index,
        },
      ],
    },
    events: [],
  };
}

/**
 * OpenAI can append `utm_source=openai` to urls. In a live capture both the
 * citations and the listed sources carry it, but either side may carry it
 * alone, so sources are indexed and citations looked up under every key
 * from {@link urlKeys}.
 */
function withoutOpenAITracking(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('utm_source') !== 'openai') {
      return url;
    }
    parsed.searchParams.delete('utm_source');
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The keys a url matches under: the raw url, then the url without
 * `utm_source=openai`, then that without a trailing slash (`URL` adds one to
 * a bare origin).
 */
function urlKeys(url: string): readonly string[] {
  const bare = withoutOpenAITracking(url);
  return [...new Set([url, bare, bare.replace(/\/$/, '')])];
}

function findSourceId(
  sourceIndex: ReadonlyMap<string, string>,
  url: string,
): string | undefined {
  return urlKeys(url)
    .map((key) => sourceIndex.get(key))
    .find((id) => id !== undefined);
}

function answerAnnotations(
  state: MapperState,
  messageId: string,
): ɵAnswerAnnotations | undefined {
  if (state.annotations.length === 0) {
    return undefined;
  }

  const result = state.annotations.reduce<{
    readonly citations: NonNullable<ɵAnswerAnnotations['citations']>;
    readonly sources: readonly ɵToolStepSource[];
  }>(
    (acc, citation, index) => {
      const known = findSourceId(state.sourceIndex, citation.url);
      const existing = acc.sources.find(
        (source) => source.href === citation.url,
      );
      const source: ɵToolStepSource | undefined =
        known === undefined && existing === undefined
          ? {
              id: `${messageId}:cite:${index}`,
              kind: 'url',
              title: citation.title,
              href: citation.url,
            }
          : undefined;
      const sourceId = known ?? existing?.id ?? source?.id ?? '';
      return {
        citations: [
          ...acc.citations,
          {
            sourceId,
            quote: state.text.slice(citation.start, citation.end),
            block: 0,
            start: citation.start,
            end: citation.end,
          },
        ],
        sources: source ? [...acc.sources, source] : acc.sources,
      };
    },
    { citations: [], sources: [] },
  );

  return {
    v: 1,
    citations: result.citations,
    ...(result.sources.length > 0 ? { sources: [...result.sources] } : {}),
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
    case 'web_search_call':
      return mapWebSearchAdded(state, messageId, item);
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

  if (item.type === 'web_search_call') {
    return mapWebSearchDone(state, item);
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
  if (!state.textStarted) {
    return { state, events: [] };
  }

  const answer = answerAnnotations(state, messageId);
  return {
    state: { ...state, textStarted: false },
    events: [
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        ...(answer ? { metadata: { [ɵANSWER_METADATA_KEY]: answer } } : {}),
      },
    ],
  };
}

function mapEvent(
  state: MapperState,
  messageId: string,
  event: StreamEvent,
): MapperStep {
  const code = mapCodeExecution(state.codeCalls, event, messageId);
  if (code) {
    const next = { ...state, codeCalls: code.calls };
    if (
      event.type === 'response.completed' ||
      event.type === 'response.incomplete'
    ) {
      const finished = finishResponse(next, messageId, event.response);
      return {
        state: finished.state,
        events: [...code.events, ...finished.events],
      };
    }
    return { state: next, events: code.events };
  }
  switch (event.type) {
    case 'response.output_item.added':
      return mapItemAdded(state, messageId, event.item);
    case 'response.output_item.done':
      return mapItemDone(state, event.item);
    case 'response.reasoning_summary_text.delta':
      return mapSummaryDelta(state, event);
    case 'response.output_text.delta':
      return mapTextDelta(
        state,
        messageId,
        event.item_id,
        event.content_index,
        event.delta,
      );
    case 'response.refusal.delta':
      return mapTextDelta(
        { ...state, refused: true },
        messageId,
        event.item_id,
        event.content_index,
        event.delta,
      );
    case 'response.output_text.annotation.added':
      return mapAnnotation(state, event);
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
 * A `web_search_call` becomes a tool call that runs on the provider: its
 * `TOOL_CALL_START` and `TOOL_CALL_RESULT` carry a `b4.step` with the
 * queries, sources and label, and the answer's `url_citation` annotations
 * become `b4.answer` citations on `TEXT_MESSAGE_END`.
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
    if (event.type === 'response.failed') {
      throw new Error(
        event.response.error?.message ?? 'Azure OpenAI response failed',
      );
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
