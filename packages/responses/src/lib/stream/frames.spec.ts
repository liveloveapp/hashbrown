import { mapSseEventToFrame } from './frames';
import type { SseEvent } from './sse';

test('maps lifecycle events with response payloads', () => {
  const event: SseEvent = {
    event: 'response.created',
    data: JSON.stringify({
      response: { id: 'resp_1' },
      sequence_number: 12,
    }),
  };

  const frame = mapSseEventToFrame(event);

  expect(frame).toEqual({
    type: 'response.created',
    response: { id: 'resp_1' },
    sequenceNumber: 12,
  });
});

test('maps output text deltas with camel-cased fields', () => {
  const event: SseEvent = {
    event: 'response.output_text.delta',
    data: JSON.stringify({
      item_id: 'item-1',
      output_index: 0,
      content_index: 1,
      delta: 'Hello',
      logprobs: [{ token: 'Hello', logprob: -0.1 }],
    }),
  };

  const frame = mapSseEventToFrame(event);

  expect(frame).toEqual({
    type: 'response.output_text.delta',
    itemId: 'item-1',
    outputIndex: 0,
    contentIndex: 1,
    delta: 'Hello',
    logprobs: [{ token: 'Hello', logprob: -0.1 }],
  });
});

test('maps refusal and reasoning deltas', () => {
  const refusalEvent: SseEvent = {
    event: 'response.refusal.delta',
    data: JSON.stringify({
      item_id: 'item-2',
      output_index: 0,
      content_index: 0,
      delta: 'nope',
    }),
  };
  const reasoningEvent: SseEvent = {
    event: 'response.reasoning.delta',
    data: JSON.stringify({
      item_id: 'item-3',
      output_index: 1,
      content_index: 2,
      delta: 'thinking',
      obfuscation: 'mask',
    }),
  };

  const refusalFrame = mapSseEventToFrame(refusalEvent);
  const reasoningFrame = mapSseEventToFrame(reasoningEvent);

  expect(refusalFrame).toEqual({
    type: 'response.refusal.delta',
    itemId: 'item-2',
    outputIndex: 0,
    contentIndex: 0,
    delta: 'nope',
  });
  expect(reasoningFrame).toEqual({
    type: 'response.reasoning.delta',
    itemId: 'item-3',
    outputIndex: 1,
    contentIndex: 2,
    delta: 'thinking',
    obfuscation: 'mask',
  });
});

test('maps function call argument deltas', () => {
  const event: SseEvent = {
    event: 'response.function_call_arguments.delta',
    data: JSON.stringify({
      item_id: 'item-4',
      output_index: 2,
      delta: '{"city":"Seattle"}',
    }),
  };

  const frame = mapSseEventToFrame(event);

  expect(frame).toEqual({
    type: 'response.function_call_arguments.delta',
    itemId: 'item-4',
    outputIndex: 2,
    delta: '{"city":"Seattle"}',
  });
});

test('emits error frames for invalid JSON', () => {
  const event: SseEvent = {
    event: 'response.output_text.delta',
    data: '{bad-json',
  };

  const frame = mapSseEventToFrame(event);

  expect(frame).toMatchObject({
    type: 'error',
    error: {
      type: 'invalid_json',
    },
  });
});
