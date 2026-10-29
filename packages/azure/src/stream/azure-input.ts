import type { Message } from '@ag-ui/core';
import { ɵTOOL_STEP_METADATA_KEY } from '@hashbrownai/core';
import type OpenAI from 'openai';

type InputItem = OpenAI.Responses.ResponseInputItem;
type AssistantMessage = Extract<Message, { role: 'assistant' }>;
type ReasoningMessage = Extract<Message, { role: 'reasoning' }>;
type ToolCall = NonNullable<AssistantMessage['toolCalls']>[number];

/**
 * One unit of history: an assistant message with the reasoning messages
 * directly before it, or any other message on its own.
 */
type Segment =
  | {
      readonly kind: 'turn';
      readonly reasoning: readonly ReasoningMessage[];
      readonly assistant: AssistantMessage;
    }
  | { readonly kind: 'message'; readonly message: Message };

/**
 * The validated `metadata.azure` marker of a message or tool call.
 */
type AzureMarker = {
  readonly itemId?: string;
  readonly reasoningItemIds: readonly string[];
};

/**
 * Maps AG-UI message history to Azure OpenAI Responses API input items.
 *
 * Azure OpenAI reasoning messages (those carrying `metadata.azure` and a non-empty
 * `encryptedValue`) are replayed as `reasoning` items directly before the
 * assistant turn they preceded. Reasoning from other providers (including the
 * OpenAI provider's `metadata.openai`), reasoning without an encrypted value, reasoning not followed by an assistant message,
 * and activity messages are dropped.
 *
 * Item ids and reasoning are all or nothing per turn: a turn's assistant
 * message and `function_call` items carry their OpenAI item ids, and its
 * reasoning items are replayed, only when every reasoning item the turn
 * recorded in `reasoningItemIds` can be replayed.
 *
 * @param messages - The AG-UI conversation history.
 * @returns The Responses `input` items, in history order.
 * @throws When user or tool content is not text, or when `metadata.azure`
 * is malformed.
 */
export function mapInput(messages: readonly Message[]): InputItem[] {
  return groupSegments(dropProviderResults(messages)).flatMap(mapSegment);
}

/**
 * Drops the tool results of provider-run calls. Requests use `store: false`,
 * so the provider keeps no item to reference, and a replayed `function_call`
 * for a tool the request never declared is rejected.
 */
function dropProviderResults(messages: readonly Message[]): Message[] {
  const providerIds = new Set(
    messages.flatMap((message) =>
      message.role === 'assistant'
        ? (message.toolCalls ?? []).filter(isProviderCall).map((c) => c.id)
        : [],
    ),
  );

  return messages.filter(
    (message) =>
      !(message.role === 'tool' && providerIds.has(message.toolCallId)),
  );
}

function isProviderCall(toolCall: ToolCall): boolean {
  const metadata = toolCall.metadata;
  if (!isRecord(metadata)) {
    return false;
  }

  const marker = metadata['azure'];
  return (
    (isRecord(marker) &&
      (marker['itemType'] === 'web_search_call' ||
        marker['itemType'] === 'code_interpreter_call')) ||
    isProviderStep(metadata[ɵTOOL_STEP_METADATA_KEY])
  );
}

/**
 * Whether a raw `b4.step` (v1 or legacy) says the provider ran the call. It
 * reads `kind` even when the step has no readable `status`, so a malformed
 * provider step is still never replayed as a function call.
 */
function isProviderStep(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['v'] === undefined || value['v'] === 1) &&
    value['kind'] === 'provider'
  );
}

function groupSegments(messages: readonly Message[]): Segment[] {
  const { segments } = messages.reduce<{
    readonly segments: readonly Segment[];
    readonly pending: readonly ReasoningMessage[];
  }>(
    (state, message) => {
      if (message.role === 'reasoning') {
        return { ...state, pending: [...state.pending, message] };
      }

      if (message.role === 'assistant') {
        return {
          segments: [
            ...state.segments,
            { kind: 'turn', reasoning: state.pending, assistant: message },
          ],
          pending: [],
        };
      }

      return {
        segments: [...state.segments, { kind: 'message', message }],
        pending: [],
      };
    },
    { segments: [], pending: [] },
  );

  return [...segments];
}

function mapSegment(segment: Segment): InputItem[] {
  return segment.kind === 'turn'
    ? mapTurn(segment.reasoning, segment.assistant)
    : mapMessage(segment.message);
}

function mapMessage(message: Message): InputItem[] {
  switch (message.role) {
    case 'developer':
    case 'system':
      return [{ role: message.role, content: message.content }];
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error(
          'Azure OpenAI provider currently requires text user content',
        );
      }

      return [{ role: 'user', content: message.content }];
    case 'tool':
      if (typeof message.content !== 'string') {
        throw new Error(
          'Azure OpenAI provider currently requires text tool result content',
        );
      }

      return [
        {
          type: 'function_call_output',
          call_id: message.toolCallId,
          // Like the Google provider, a failed tool sends its error instead.
          output:
            message.error === undefined
              ? message.content
              : JSON.stringify({ error: message.error }),
        },
      ];
    case 'assistant':
      return mapTurn([], message);
    case 'activity':
    case 'reasoning':
      return [];
  }
}

function mapTurn(
  reasoning: readonly ReasoningMessage[],
  assistant: AssistantMessage,
): InputItem[] {
  const allReasoningItems = reasoning.flatMap(mapReasoningMessage);
  const replayedIds = new Set(allReasoningItems.map((item) => item.id));
  const assistantMarker = readMarker(
    assistant.metadata,
    `Azure OpenAI assistant message "${assistant.id}"`,
  );
  const allToolCalls = assistant.toolCalls ?? [];
  const toolCalls = allToolCalls.filter(
    (toolCall) => !isProviderCall(toolCall),
  );
  const toolCallMarkers = toolCalls.map((toolCall) =>
    readMarker(toolCall.metadata, `Azure OpenAI tool call "${toolCall.id}"`),
  );
  const keepIds = [assistantMarker, ...toolCallMarkers].every((marker) =>
    marker.reasoningItemIds.every((id) => replayedIds.has(id)),
  );

  // Reasoning that only a dropped provider call referenced has no item left to
  // pair with, and an unpaired reasoning item can be rejected.
  const referencedIds = new Set(
    [assistantMarker, ...toolCallMarkers].flatMap(
      (marker) => marker.reasoningItemIds,
    ),
  );
  const reasoningItems =
    toolCalls.length === allToolCalls.length
      ? allReasoningItems
      : allReasoningItems.filter((item) => referencedIds.has(item.id));

  const turnItems = [
    ...mapAssistantText(
      assistant.content,
      keepIds ? assistantMarker.itemId : undefined,
    ),
    ...toolCalls.map((toolCall, index) =>
      mapToolCall(
        toolCall,
        keepIds ? toolCallMarkers[index]?.itemId : undefined,
      ),
    ),
  ];

  // A turn whose ids were stripped replays none of its reasoning, and
  // reasoning must be followed by an assistant item, so a turn with nothing
  // to send drops its whole reasoning group too.
  if (turnItems.length === 0) {
    return [];
  }

  return keepIds ? [...reasoningItems, ...turnItems] : turnItems;
}

function mapAssistantText(
  content: string | undefined,
  itemId: string | undefined,
): InputItem[] {
  if (!content) {
    return [];
  }

  if (itemId === undefined) {
    return [{ role: 'assistant', content }];
  }

  return [
    {
      type: 'message',
      id: itemId,
      role: 'assistant',
      content: [{ type: 'output_text', text: content, annotations: [] }],
      status: 'completed',
    },
  ];
}

function mapToolCall(
  toolCall: ToolCall,
  itemId: string | undefined,
): OpenAI.Responses.ResponseFunctionToolCall {
  return {
    type: 'function_call',
    ...(itemId === undefined ? {} : { id: itemId }),
    call_id: toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
  };
}

function mapReasoningMessage(
  message: ReasoningMessage,
): OpenAI.Responses.ResponseReasoningItem[] {
  const metadata = message.metadata;
  if (!isRecord(metadata) || !Object.hasOwn(metadata, 'azure')) {
    return [];
  }

  const messageReference = `Azure OpenAI reasoning message "${message.id}"`;
  const marker = metadata['azure'];
  if (!isRecord(marker)) {
    throw new Error(`${messageReference} metadata.azure must be an object`);
  }

  const itemId = marker['itemId'];
  if (itemId !== undefined && typeof itemId !== 'string') {
    throw new Error(
      `${messageReference} metadata.azure.itemId must be a string`,
    );
  }

  const encryptedValue: unknown = message.encryptedValue;
  if (encryptedValue !== undefined && typeof encryptedValue !== 'string') {
    throw new Error(`${messageReference} encryptedValue must be a string`);
  }

  if (!encryptedValue) {
    return [];
  }

  return [
    {
      type: 'reasoning',
      id: itemId ?? message.id,
      summary: message.content
        ? [{ type: 'summary_text', text: message.content }]
        : [],
      encrypted_content: encryptedValue,
    },
  ];
}

function readMarker(metadata: unknown, reference: string): AzureMarker {
  if (!isRecord(metadata) || !Object.hasOwn(metadata, 'azure')) {
    return { reasoningItemIds: [] };
  }

  const marker = metadata['azure'];
  if (!isRecord(marker)) {
    throw new Error(`${reference} metadata.azure must be an object`);
  }

  const itemId = marker['itemId'];
  if (itemId !== undefined && typeof itemId !== 'string') {
    throw new Error(`${reference} metadata.azure.itemId must be a string`);
  }

  const reasoningItemIds = marker['reasoningItemIds'] ?? [];
  if (
    !Array.isArray(reasoningItemIds) ||
    !reasoningItemIds.every((id) => typeof id === 'string')
  ) {
    throw new Error(
      `${reference} metadata.azure.reasoningItemIds must be an array of strings`,
    );
  }

  return { itemId, reasoningItemIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
