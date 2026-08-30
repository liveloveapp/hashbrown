import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import { mapAnthropicEvents } from './anthropic-events';
import {
  collectEvents,
  contentStop,
  deepFreeze,
  messageDelta,
  messageStart,
  messageStop,
  rawEvent,
  type RawEvent,
  toAsyncIterable,
} from './anthropic-events.test-utils';

function thinkingStart(
  index: number,
  thinking = '',
  signature = 'initial-signature',
): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: { type: 'thinking', thinking, signature },
  });
}

function redactedThinkingStart(
  index: number,
  data = 'redacted-data',
): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: { type: 'redacted_thinking', data },
  });
}

function thinkingDelta(index: number, thinking: string): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'thinking_delta', thinking },
  });
}

function signatureDelta(index: number, signature: string): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'signature_delta', signature },
  });
}

function textStart(index: number, text: string): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text },
  });
}

function toolStart(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      id: 'tool-1',
      name: 'search',
      input: {},
    },
  });
}

function reasoningStartEvent(messageId: string, blockType: string): AGUIEvent {
  return {
    type: EventType.REASONING_MESSAGE_START,
    messageId,
    role: 'reasoning',
    metadata: { anthropic: { blockType } },
  };
}

function reasoningContentEvent(messageId: string, delta: string): AGUIEvent {
  return {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId,
    delta,
  };
}

function reasoningEncryptedEvent(
  entityId: string,
  encryptedValue: string,
): AGUIEvent {
  return {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId,
    encryptedValue,
  };
}

function reasoningEndEvent(messageId: string): AGUIEvent {
  return { type: EventType.REASONING_MESSAGE_END, messageId };
}

test('maps initial thinking and thinking deltas in arrival order', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, 'Initial'),
    thinkingDelta(0, ' delta'),
    thinkingDelta(0, '!'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
    reasoningContentEvent('assistant-message-1:reasoning:0', 'Initial'),
    reasoningContentEvent('assistant-message-1:reasoning:0', ' delta'),
    reasoningContentEvent('assistant-message-1:reasoning:0', '!'),
    reasoningEncryptedEvent(
      'assistant-message-1:reasoning:0',
      'initial-signature',
    ),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
  ]);
});

test('uses a signature delta instead of the initial signature', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, '', 'initial'),
    signatureDelta(0, 'streamed-signature'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
    reasoningEncryptedEvent(
      'assistant-message-1:reasoning:0',
      'streamed-signature',
    ),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
  ]);
});

test('rejects duplicate signature deltas', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, '', 'initial'),
    signatureDelta(0, 'first'),
    signatureDelta(0, 'second'),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic thinking block at index 0 received more than one signature_delta',
  );
});

test('allows thinking deltas after signature deltas', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, 'Initial', 'initial'),
    signatureDelta(0, 'first'),
    thinkingDelta(0, ' later'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
    reasoningContentEvent('assistant-message-1:reasoning:0', 'Initial'),
    reasoningContentEvent('assistant-message-1:reasoning:0', ' later'),
    reasoningEncryptedEvent('assistant-message-1:reasoning:0', 'first'),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
  ]);
});

test('uses the initial signature only when no signature deltas occur', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, '', 'initial'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
    reasoningEncryptedEvent('assistant-message-1:reasoning:0', 'initial'),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
  ]);
});

test('rejects an empty initial signature with no signature deltas', async () => {
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      thinkingStart(0, '', ''),
      contentStop(0),
    ]),
    messageId: 'assistant-message-1',
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  const act = iterator.next();

  expect(EventSchemas.parse(start.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
  );
  await expect(act).rejects.toThrow(
    'Anthropic thinking block at index 0 has an empty final signature',
  );
});

test('rejects an empty signature assembled from signature deltas', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, '', 'initial'),
    signatureDelta(0, ''),
    contentStop(0),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic thinking block at index 0 has an empty final signature',
  );
});

test('maps multiple reasoning blocks with stable IDs in source order', async () => {
  const events = [
    messageStart(),
    thinkingStart(2, 'First', 'signature-1'),
    contentStop(2),
    thinkingStart(4, 'Second', 'signature-2'),
    contentStop(4),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:2', 'thinking'),
    reasoningContentEvent('assistant-message-1:reasoning:2', 'First'),
    reasoningEncryptedEvent('assistant-message-1:reasoning:2', 'signature-1'),
    reasoningEndEvent('assistant-message-1:reasoning:2'),
    reasoningStartEvent('assistant-message-1:reasoning:4', 'thinking'),
    reasoningContentEvent('assistant-message-1:reasoning:4', 'Second'),
    reasoningEncryptedEvent('assistant-message-1:reasoning:4', 'signature-2'),
    reasoningEndEvent('assistant-message-1:reasoning:4'),
  ]);
});

test('maps redacted thinking through its native start-stop lifecycle', async () => {
  const events = [
    messageStart(),
    redactedThinkingStart(0, 'encrypted-redacted-data'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'redacted_thinking'),
    reasoningEncryptedEvent(
      'assistant-message-1:reasoning:0',
      'encrypted-redacted-data',
    ),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
  ]);
});

test('does not mutate frozen reasoning source events', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, 'Initial', 'signature'),
    thinkingDelta(0, ' delta'),
    signatureDelta(0, '-updated'),
    contentStop(0),
    redactedThinkingStart(1, 'encrypted'),
    contentStop(1),
    messageStop(),
  ];
  const eventSnapshot = structuredClone(events);

  await collectEvents(deepFreeze(events));

  expect(events).toEqual(eventSnapshot);
});

test('maps reasoning before a client tool block', async () => {
  const events = [
    messageStart(),
    thinkingStart(0, 'Plan', 'signature'),
    contentStop(0),
    toolStart(1),
    contentStop(1),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
    reasoningContentEvent('assistant-message-1:reasoning:0', 'Plan'),
    reasoningEncryptedEvent('assistant-message-1:reasoning:0', 'signature'),
    reasoningEndEvent('assistant-message-1:reasoning:0'),
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tool-1', delta: '{}' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('rejects reasoning starts after assistant text has begun', async () => {
  const events = [
    messageStart(),
    textStart(0, 'text'),
    contentStop(0),
    thinkingStart(1),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic reasoning block at index 1 cannot start after assistant text or a client tool block',
  );
});

test('rejects reasoning starts after an empty native text block', async () => {
  const events = [
    messageStart(),
    textStart(0, ''),
    contentStop(0),
    thinkingStart(1),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic reasoning block at index 1 cannot start after assistant text or a client tool block',
  );
});

test('does not emit AG-UI text events for an empty native text block', async () => {
  const events = [
    messageStart(),
    textStart(0, ''),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([]);
});

test('rejects reasoning starts after a client tool block has begun', async () => {
  const events = [
    messageStart(),
    toolStart(0),
    contentStop(0),
    redactedThinkingStart(1),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic reasoning block at index 1 cannot start after assistant text or a client tool block',
  );
});

test('rejects thinking and signature deltas on text blocks', async () => {
  const thinkingEvents = [
    messageStart(),
    textStart(0, ''),
    thinkingDelta(0, 'wrong'),
  ];
  const signatureEvents = [
    messageStart(),
    textStart(0, ''),
    signatureDelta(0, 'wrong'),
  ];

  await expect(collectEvents(thinkingEvents)).rejects.toThrow(
    'Anthropic text block at index 0 cannot receive thinking_delta',
  );
  await expect(collectEvents(signatureEvents)).rejects.toThrow(
    'Anthropic text block at index 0 cannot receive signature_delta',
  );
});

test('rejects thinking and signature deltas on tool blocks', async () => {
  const thinkingEvents = [
    messageStart(),
    toolStart(0),
    thinkingDelta(0, 'wrong'),
  ];
  const signatureEvents = [
    messageStart(),
    toolStart(0),
    signatureDelta(0, 'wrong'),
  ];

  await expect(collectEvents(thinkingEvents)).rejects.toThrow(
    'Anthropic tool block at index 0 cannot receive thinking_delta',
  );
  await expect(collectEvents(signatureEvents)).rejects.toThrow(
    'Anthropic tool block at index 0 cannot receive signature_delta',
  );
});

test('rejects text and input deltas on thinking blocks', async () => {
  const textEvents = [
    messageStart(),
    thinkingStart(0),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'wrong' },
    }),
  ];
  const inputEvents = [
    messageStart(),
    thinkingStart(0),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    }),
  ];

  await expect(collectEvents(textEvents)).rejects.toThrow(
    'Anthropic thinking block at index 0 cannot receive text_delta',
  );
  await expect(collectEvents(inputEvents)).rejects.toThrow(
    'Anthropic thinking block at index 0 cannot receive input_json_delta',
  );
});

test('rejects text and input deltas on redacted thinking blocks', async () => {
  const textEvents = [
    messageStart(),
    redactedThinkingStart(0),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'wrong' },
    }),
  ];
  const inputEvents = [
    messageStart(),
    redactedThinkingStart(0),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    }),
  ];

  await expect(collectEvents(textEvents)).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 cannot receive text_delta',
  );
  await expect(collectEvents(inputEvents)).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 cannot receive input_json_delta',
  );
});

test('rejects thinking deltas on redacted thinking blocks', async () => {
  const events = [
    messageStart(),
    redactedThinkingStart(0),
    thinkingDelta(0, 'late'),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 cannot receive thinking_delta',
  );
});

test('rejects signature deltas on redacted thinking blocks', async () => {
  const events = [
    messageStart(),
    redactedThinkingStart(0),
    signatureDelta(0, 'late'),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 cannot receive signature_delta',
  );
});

test('rejects malformed reasoning starts', async () => {
  const malformedEvents = [
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', signature: 'sig' },
    }),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: 42 },
    }),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'redacted_thinking', data: '' },
    }),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'redacted_thinking' },
    }),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'redacted_thinking', data: 42 },
    }),
  ];

  await expect(
    collectEvents([messageStart(), malformedEvents[0]]),
  ).rejects.toThrow(
    'Anthropic thinking block at index 0 has non-string thinking',
  );
  await expect(
    collectEvents([messageStart(), malformedEvents[1]]),
  ).rejects.toThrow(
    'Anthropic thinking block at index 0 has non-string signature',
  );
  await expect(
    collectEvents([messageStart(), malformedEvents[2]]),
  ).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 has empty data',
  );
  await expect(
    collectEvents([messageStart(), malformedEvents[3]]),
  ).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 has non-string data',
  );
  await expect(
    collectEvents([messageStart(), malformedEvents[4]]),
  ).rejects.toThrow(
    'Anthropic redacted_thinking block at index 0 has non-string data',
  );
});

test('rejects malformed reasoning deltas', async () => {
  const malformedThinkingDelta = rawEvent({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 42 },
  });
  const malformedSignatureDelta = rawEvent({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 42 },
  });

  await expect(
    collectEvents([messageStart(), thinkingStart(0), malformedThinkingDelta]),
  ).rejects.toThrow(
    'Anthropic thinking_delta at index 0 has non-string thinking',
  );
  await expect(
    collectEvents([messageStart(), thinkingStart(0), malformedSignatureDelta]),
  ).rejects.toThrow(
    'Anthropic signature_delta at index 0 has non-string signature',
  );
});

test('rejects duplicate, stopped, and unknown reasoning lifecycles', async () => {
  await expect(
    collectEvents([messageStart(), thinkingStart(0), thinkingStart(0)]),
  ).rejects.toThrow('Anthropic content index 0 started more than once');
  await expect(
    collectEvents([
      messageStart(),
      thinkingStart(0),
      contentStop(0),
      signatureDelta(0, 'late'),
    ]),
  ).rejects.toThrow(
    'Anthropic content_block_delta references unknown or stopped index 0',
  );
  await expect(
    collectEvents([
      messageStart(),
      thinkingStart(0),
      contentStop(0),
      contentStop(0),
    ]),
  ).rejects.toThrow(
    'Anthropic content_block_stop references unknown or stopped index 0',
  );
  await expect(collectEvents([messageStart(), contentStop(3)])).rejects.toThrow(
    'Anthropic content_block_stop references unknown or stopped index 3',
  );
});

test('rejects message lifecycle events and source exhaustion with active reasoning blocks', async () => {
  await expect(
    collectEvents([messageStart(), thinkingStart(0), messageDelta()]),
  ).rejects.toThrow(
    'Anthropic message_delta received while content blocks are open',
  );
  await expect(
    collectEvents([messageStart(), thinkingStart(0), messageStop()]),
  ).rejects.toThrow(
    'Anthropic message_stop received while content blocks are open',
  );
  await expect(
    collectEvents([messageStart(), thinkingStart(0)]),
  ).rejects.toThrow('Anthropic stream ended with open content blocks');
});

test('does not synthesize reasoning events after cancellation following reasoning start', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      thinkingStart(0, 'Initial'),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const first = await iterator.next();
  controller.abort();
  const second = await iterator.next();

  expect(EventSchemas.parse(first.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
  );
  expect(second).toEqual({ done: true, value: undefined });
});

test('does not synthesize reasoning end after cancellation following reasoning content', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      thinkingStart(0, 'Initial'),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  const content = await iterator.next();
  controller.abort();
  const next = await iterator.next();

  expect(EventSchemas.parse(start.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
  );
  expect(EventSchemas.parse(content.value)).toEqual(
    reasoningContentEvent('assistant-message-1:reasoning:0', 'Initial'),
  );
  expect(next).toEqual({ done: true, value: undefined });
});

test('does not synthesize encrypted or end events after cancellation following a redacted reasoning start', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      redactedThinkingStart(0, 'encrypted'),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  controller.abort();
  const next = await iterator.next();

  expect(EventSchemas.parse(start.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'redacted_thinking'),
  );
  expect(next).toEqual({ done: true, value: undefined });
});

test('does not synthesize reasoning end after cancellation following encrypted redacted thinking', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      redactedThinkingStart(0, 'encrypted'),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  const encrypted = await iterator.next();
  controller.abort();
  const next = await iterator.next();

  expect(EventSchemas.parse(start.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'redacted_thinking'),
  );
  expect(EventSchemas.parse(encrypted.value)).toEqual(
    reasoningEncryptedEvent('assistant-message-1:reasoning:0', 'encrypted'),
  );
  expect(next).toEqual({ done: true, value: undefined });
});

test('does not synthesize reasoning end after cancellation following a thinking encrypted value', async () => {
  const controller = new AbortController();
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      thinkingStart(0, '', 'signature'),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  const encrypted = await iterator.next();
  controller.abort();
  const next = await iterator.next();

  expect(EventSchemas.parse(start.value)).toEqual(
    reasoningStartEvent('assistant-message-1:reasoning:0', 'thinking'),
  );
  expect(EventSchemas.parse(encrypted.value)).toEqual(
    reasoningEncryptedEvent('assistant-message-1:reasoning:0', 'signature'),
  );
  expect(next).toEqual({ done: true, value: undefined });
});
