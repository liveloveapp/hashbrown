import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import { mapBedrockEvents } from './bedrock-events';

async function* source(
  events: ConverseStreamOutput[],
): AsyncIterable<ConverseStreamOutput> {
  yield* events;
}

async function collectEvents(
  events: ConverseStreamOutput[],
): Promise<AGUIEvent[]> {
  const result: AGUIEvent[] = [];

  for await (const event of mapBedrockEvents({
    events: source(events),
    messageId: 'run-bedrock:assistant',
  })) {
    result.push(EventSchemas.parse(event));
  }

  return result;
}

test('maps streamed Bedrock text into one AG-UI assistant lifecycle', async () => {
  const events = await collectEvents([
    { messageStart: { role: 'assistant' } },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Hello ' },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'world.' },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-bedrock:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-bedrock:assistant',
      delta: 'Hello ',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-bedrock:assistant',
      delta: 'world.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-bedrock:assistant',
    },
  ]);
});

test('maps fragmented Bedrock tool input into one AG-UI tool lifecycle', async () => {
  const events = await collectEvents([
    {
      contentBlockStart: {
        contentBlockIndex: 1,
        start: {
          toolUse: { toolUseId: 'call-bedrock', name: 'lookup' },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '{"query":' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '"hashbrown"}' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
  ]);

  expect(events).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-bedrock',
      toolCallName: 'lookup',
      parentMessageId: 'run-bedrock:assistant',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-bedrock',
      delta: '{"query":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-bedrock',
      delta: '"hashbrown"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call-bedrock' },
  ]);
});

test('supplies an empty object when Bedrock emits no tool input', async () => {
  const events = await collectEvents([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'call-empty', name: 'now' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
  ]);

  expect(events).toContainEqual({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call-empty',
    delta: '{}',
  });
});

test('maps Bedrock reasoning text, signature, and redacted content', async () => {
  const events = await collectEvents([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Thinking.' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'signature' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([1, 2, 3]) },
        },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
  ]);

  expect(events).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'run-bedrock:assistant:reasoning:0',
      role: 'reasoning',
      metadata: { bedrock: { blockType: 'reasoning_text' } },
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'run-bedrock:assistant:reasoning:0',
      delta: 'Thinking.',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-bedrock:assistant:reasoning:0',
      encryptedValue: 'signature',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'run-bedrock:assistant:reasoning:0',
    },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'run-bedrock:assistant:reasoning:1',
      role: 'reasoning',
      metadata: { bedrock: { blockType: 'redacted_content' } },
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-bedrock:assistant:reasoning:1',
      encryptedValue: 'AQID',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'run-bedrock:assistant:reasoning:1',
    },
  ]);
});

test('reassembles fragmented Bedrock reasoning continuation values', async () => {
  const events = await collectEvents([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Thinking.' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'sig-' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'value' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([1, 2]) },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([3, 4]) },
        },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
  ]);
  const encryptedValues = events.filter(
    (event) => event.type === EventType.REASONING_ENCRYPTED_VALUE,
  );

  expect(encryptedValues).toEqual([
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-bedrock:assistant:reasoning:0',
      encryptedValue: 'sig-value',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-bedrock:assistant:reasoning:1',
      encryptedValue: 'AQIDBA==',
    },
  ]);
});

test('preserves metadata and noncanonical deltas as Bedrock raw events', async () => {
  const metadata = {
    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    metrics: { latencyMs: 10 },
  };
  const citation = { source: 'https://example.com' };

  const events = await collectEvents([
    { metadata },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { citation },
      },
    },
  ]);

  expect(events).toEqual([
    {
      type: EventType.RAW,
      source: 'bedrock',
      event: { metadata },
    },
    {
      type: EventType.RAW,
      source: 'bedrock',
      event: {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { citation },
        },
      },
    },
  ]);
});

test('throws Bedrock stream exception events', async () => {
  const result = collectEvents([
    {
      throttlingException: {
        name: 'ThrottlingException',
        $fault: 'client',
        $metadata: {},
        message: 'rate limited',
      },
    },
  ]);

  await expect(result).rejects.toThrow('rate limited');
});

test('closes the Bedrock iterator when mapping is cancelled', async () => {
  const controller = new AbortController();
  const iteratorReturn = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const events = {
    [Symbol.asyncIterator]() {
      let emitted = false;
      return {
        async next(): Promise<IteratorResult<ConverseStreamOutput>> {
          if (!emitted) {
            emitted = true;
            return {
              done: false,
              value: {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { text: 'First.' },
                },
              },
            };
          }
          return new Promise(() => undefined);
        },
        return: iteratorReturn,
      };
    },
  };
  const iterator = mapBedrockEvents({
    events,
    messageId: 'run-bedrock:assistant',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.next();
  controller.abort();
  const done = await iterator.next();

  expect(done).toEqual({ done: true, value: undefined });
  expect(iteratorReturn).toHaveBeenCalledTimes(1);
});

test('preserves a Bedrock source failure when iterator cleanup also fails', async () => {
  const sourceError = new Error('Bedrock source failed');
  const events = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<ConverseStreamOutput>> {
          throw sourceError;
        },
        async return(): Promise<IteratorResult<ConverseStreamOutput>> {
          throw new Error('Bedrock cleanup failed');
        },
      };
    },
  };

  const result = (async () => {
    for await (const event of mapBedrockEvents({
      events,
      messageId: 'run-bedrock:assistant',
    })) {
      void event;
    }
  })();

  await expect(result).rejects.toBe(sourceError);
});
