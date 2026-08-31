import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import type { GenerateContentResponse } from '@google/genai';
import { mapGoogleEvents } from './google-events';

async function* source(
  responses: GenerateContentResponse[],
): AsyncIterable<GenerateContentResponse> {
  yield* responses;
}

async function collectEvents(
  responses: GenerateContentResponse[],
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of mapGoogleEvents({
    events: source(responses),
    messageId: 'run-google:assistant',
  })) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('maps streamed Google text into one AG-UI assistant lifecycle', async () => {
  const responses = [
    {
      candidates: [
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'Hello ' }] },
        },
      ],
    },
    {
      candidates: [
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'world.' }] },
          finishReason: 'STOP',
        },
      ],
    },
  ] as GenerateContentResponse[];

  const events = await collectEvents(responses);

  expect(events).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-google:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-google:assistant',
      delta: 'Hello ',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-google:assistant',
      delta: 'world.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-google:assistant',
    },
  ]);
});

test('maps candidate index zero when Google candidates are not ordered', async () => {
  const responses = [
    {
      candidates: [
        {
          index: 1,
          content: { role: 'model', parts: [{ text: 'Alternative.' }] },
        },
        {
          index: 0,
          content: { role: 'model', parts: [{ text: 'Selected.' }] },
        },
      ],
    },
  ] as GenerateContentResponse[];

  const events = await collectEvents(responses);

  expect(events).toContainEqual({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'run-google:assistant',
    delta: 'Selected.',
  });
  expect(events).not.toContainEqual(
    expect.objectContaining({ delta: 'Alternative.' }),
  );
});

test('maps Google thought and function-call parts with continuation signatures', async () => {
  const responses = [
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [
              {
                text: 'I need a lookup.',
                thought: true,
                thoughtSignature: 'reasoning-signature',
              },
              {
                functionCall: {
                  id: 'call-google',
                  name: 'lookup',
                  args: { query: 'hashbrown' },
                },
                thoughtSignature: 'tool-signature',
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    },
  ] as GenerateContentResponse[];

  const events = await collectEvents(responses);

  expect(events).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'run-google:assistant:reasoning:0',
      role: 'reasoning',
      metadata: { google: { thought: true } },
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'run-google:assistant:reasoning:0',
      delta: 'I need a lookup.',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'run-google:assistant:reasoning:0',
      encryptedValue: 'reasoning-signature',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'run-google:assistant:reasoning:0',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-google',
      toolCallName: 'lookup',
      parentMessageId: 'run-google:assistant',
      metadata: { google: { functionCall: true } },
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-google',
      delta: '{"query":"hashbrown"}',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: 'call-google',
      encryptedValue: 'tool-signature',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call-google' },
  ]);
});

test('attaches a later signature-only Google part to the preceding tool call', async () => {
  const responses = [
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'call-google',
                  name: 'lookup',
                  args: { query: 'hashbrown' },
                },
              },
            ],
          },
        },
      ],
    },
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ thoughtSignature: 'late-tool-signature' }],
          },
          finishReason: 'STOP',
        },
      ],
    },
  ] as GenerateContentResponse[];

  const events = await collectEvents(responses);

  expect(events.at(-1)).toEqual({
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'tool-call',
    entityId: 'call-google',
    encryptedValue: 'late-tool-signature',
  });
});

test('attaches a later signature-only Google part to active reasoning', async () => {
  const responses = [
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ text: 'I need to think.', thought: true }],
          },
        },
      ],
    },
    {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ thoughtSignature: 'late-reasoning-signature' }],
          },
          finishReason: 'STOP',
        },
      ],
    },
  ] as GenerateContentResponse[];

  const events = await collectEvents(responses);
  const encryptedIndex = events.findIndex(
    (event) => event.type === EventType.REASONING_ENCRYPTED_VALUE,
  );
  const endIndex = events.findIndex(
    (event) => event.type === EventType.REASONING_MESSAGE_END,
  );

  expect(events[encryptedIndex]).toEqual({
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: 'run-google:assistant:reasoning:0',
    encryptedValue: 'late-reasoning-signature',
  });
  expect(encryptedIndex).toBeLessThan(endIndex);
});

test('preserves a Google source failure when iterator cleanup also fails', async () => {
  const sourceError = new Error('Google source failed');
  const events = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<GenerateContentResponse>> {
          throw sourceError;
        },
        async return(): Promise<IteratorResult<GenerateContentResponse>> {
          throw new Error('Google cleanup failed');
        },
      };
    },
  };

  const result = (async () => {
    for await (const event of mapGoogleEvents({
      events,
      messageId: 'run-google:assistant',
    })) {
      void event;
    }
  })();

  await expect(result).rejects.toBe(sourceError);
});
