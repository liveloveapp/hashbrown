import { type AGUIEvent, EventSchemas } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import { mapAnthropicEvents } from './anthropic-events';

/** Raw Anthropic stream event used at the mapper test boundary. */
export type RawEvent = Anthropic.Messages.RawMessageStreamEvent;

/** Casts intentionally malformed values into the native event test boundary. */
export function rawEvent(value: unknown): RawEvent {
  return value as RawEvent;
}

/** Creates a complete native message-start fixture. */
export function messageStart(): RawEvent {
  return {
    type: 'message_start',
    message: {
      id: 'anthropic-message-1',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-test',
      container: null,
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: {
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        inference_geo: null,
        input_tokens: 1,
        output_tokens: 0,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
      },
    },
  };
}

/** Creates a complete native message-delta fixture. */
export function messageDelta(): RawEvent {
  return {
    type: 'message_delta',
    delta: {
      container: null,
      stop_details: null,
      stop_reason: 'end_turn',
      stop_sequence: null,
    },
    usage: {
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      input_tokens: null,
      output_tokens: 1,
      output_tokens_details: null,
      server_tool_use: null,
    },
  };
}

/** Creates a native message-stop fixture. */
export function messageStop(): RawEvent {
  return { type: 'message_stop' };
}

/** Creates a native content-block-stop fixture. */
export function contentStop(index: number): RawEvent {
  return { type: 'content_block_stop', index };
}

/** Exposes a deterministic array as an asynchronous native event source. */
export async function* toAsyncIterable(
  events: readonly RawEvent[],
): AsyncIterable<RawEvent> {
  for (const event of events) {
    yield event;
  }
}

/** Collects and validates mapped AG-UI events from native fixtures. */
export async function collectEvents(
  events: readonly RawEvent[],
  signal?: AbortSignal,
): Promise<AGUIEvent[]> {
  return collectIterable(toAsyncIterable(events), signal);
}

/** Collects and validates mapped AG-UI events from a custom native source. */
export async function collectIterable(
  events: AsyncIterable<RawEvent>,
  signal?: AbortSignal,
): Promise<AGUIEvent[]> {
  const result: AGUIEvent[] = [];

  for await (const event of mapAnthropicEvents({
    events,
    messageId: 'assistant-message-1',
    signal,
  })) {
    result.push(EventSchemas.parse(event));
  }

  return result;
}

/** Recursively freezes JSON-like fixtures to detect source mutation. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value;
}
