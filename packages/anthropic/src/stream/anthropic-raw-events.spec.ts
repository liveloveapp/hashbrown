import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import { mapAnthropicEvents } from './anthropic-events';
import {
  collectEvents,
  contentStop,
  deepFreeze,
  messageStart,
  messageStop,
  rawEvent,
  type RawEvent,
  toAsyncIterable,
} from './anthropic-events.test-utils';

const RAW_TERMINAL_BLOCK_TYPES = [
  'web_search_tool_result',
  'web_fetch_tool_result',
  'code_execution_tool_result',
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'tool_search_tool_result',
  'container_upload',
] as const;

type RawTerminalBlockType = (typeof RAW_TERMINAL_BLOCK_TYPES)[number];

function textStartWithCitations(index: number, text: string): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'text',
      text,
      citations: [
        {
          type: 'char_location',
          cited_text: 'source',
          document_index: 0,
          document_title: 'Reference',
          start_char_index: 0,
          end_char_index: 6,
        },
      ],
    },
  });
}

function citationsDelta(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'char_location',
        cited_text: 'source',
        document_index: 0,
        document_title: 'Reference',
        start_char_index: 0,
        end_char_index: 6,
      },
    },
  });
}

function textDelta(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text: 'text' },
  });
}

function inputJsonDelta(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: '{"query":"test"}' },
  });
}

function thinkingDelta(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'thinking_delta', thinking: 'thinking' },
  });
}

function signatureDelta(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_delta',
    index,
    delta: { type: 'signature_delta', signature: 'signature' },
  });
}

function serverToolStart(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'server_tool_use',
      id: `server-tool-${index}`,
      name: 'web_search',
      input: {},
      caller: { type: 'direct' },
    },
  });
}

function clientToolStart(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      id: `client-tool-${index}`,
      name: 'search',
      input: {},
      caller: { type: 'direct' },
    },
  });
}

function thinkingStart(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'thinking',
      thinking: '',
      signature: 'initial-signature',
    },
  });
}

function redactedThinkingStart(index: number): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: { type: 'redacted_thinking', data: 'redacted-data' },
  });
}

function terminalBlockStart(
  index: number,
  blockType: RawTerminalBlockType,
): RawEvent {
  return rawEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: blockType,
      tool_use_id: `server-tool-${index}`,
      file_id: `file-${index}`,
      content: { type: 'fixture-result', nested: { value: 'original' } },
    },
  });
}

function rawAGUIEvent(event: RawEvent): AGUIEvent {
  return {
    type: EventType.RAW,
    source: 'anthropic',
    event: structuredClone(event),
  };
}

test('emits canonical text before a raw citation-bearing start frame', async () => {
  const start = textStartWithCitations(0, 'Hello');
  const events = [messageStart(), start, contentStop(0), messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'Hello',
    },
    rawAGUIEvent(start),
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('emits citation deltas as raw events at their native position', async () => {
  const start = rawEvent({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '', citations: null },
  });
  const delta = citationsDelta(0);
  const events = [messageStart(), start, delta, contentStop(0), messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual([rawAGUIEvent(delta)]);
});

test('emits a citation-bearing start even when its initial text is empty', async () => {
  const start = textStartWithCitations(0, '');
  const events = [messageStart(), start, contentStop(0), messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual([rawAGUIEvent(start)]);
});

test('emits every server tool frame as raw without entering the client tool loop', async () => {
  const start = serverToolStart(0);
  const delta = inputJsonDelta(0);
  const stop = contentStop(0);
  const events = [messageStart(), start, delta, stop, messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual([
    rawAGUIEvent(start),
    rawAGUIEvent(delta),
    rawAGUIEvent(stop),
  ]);
  expect(result).not.toContainEqual(
    expect.objectContaining({ type: EventType.TOOL_CALL_START }),
  );
});

test('emits start and stop raw frames for every native result and upload block', async () => {
  const nativeFrames = RAW_TERMINAL_BLOCK_TYPES.flatMap((blockType, index) => [
    terminalBlockStart(index, blockType),
    contentStop(index),
  ]);
  const events = [messageStart(), ...nativeFrames, messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual(nativeFrames.map(rawAGUIEvent));
});

test('raw events own deep clones of their native fixtures', async () => {
  const start = terminalBlockStart(0, 'code_execution_tool_result');
  const events = [messageStart(), start, contentStop(0), messageStop()];

  const result: AGUIEvent[] = [];
  for await (const event of mapAnthropicEvents({
    events: toAsyncIterable(events),
    messageId: 'assistant-message-1',
  })) {
    result.push(event);
  }
  const raw = result[0] as Extract<AGUIEvent, { type: EventType.RAW }>;
  const sourceContent = (
    start as unknown as {
      content_block: { content: { nested: { value: string } } };
    }
  ).content_block.content;
  sourceContent.nested.value = 'mutated';

  expect(raw.event).not.toBe(start);
  expect(
    (
      raw.event as {
        content_block: { content: { nested: { value: string } } };
      }
    ).content_block.content.nested.value,
  ).toBe('original');
});

test('raw mapping never mutates frozen native fixtures', async () => {
  const start = terminalBlockStart(0, 'code_execution_tool_result');
  const events = [messageStart(), start, contentStop(0), messageStop()];
  deepFreeze(events);

  const result = await collectEvents(events);

  expect(result).toEqual([rawAGUIEvent(start), rawAGUIEvent(contentStop(0))]);
});

test('wraps native event clone failures with context', async () => {
  const start = rawEvent({
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'server_tool_use',
      id: 'server-tool-0',
      name: 'web_search',
      input: { callback: () => undefined },
      caller: { type: 'direct' },
    },
  });

  const act = collectEvents([messageStart(), start]);

  await expect(act).rejects.toMatchObject({
    message: 'Failed to clone Anthropic native stream event',
    cause: expect.objectContaining({ name: 'DataCloneError' }),
  });
});

test('rejects future unknown content blocks and deltas explicitly', async () => {
  const unknownBlock = rawEvent({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'future_block' },
  });
  const unknownDelta = rawEvent({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'future_delta' },
  });

  await expect(collectEvents([messageStart(), unknownBlock])).rejects.toThrow(
    'Anthropic content block at index 0 has unsupported type "future_block"',
  );
  await expect(
    collectEvents([messageStart(), serverToolStart(0), unknownDelta]),
  ).rejects.toThrow(
    'Anthropic content delta at index 0 has unsupported type "future_delta"',
  );
});

test('accepts citations only on text blocks', async () => {
  const starts = [
    clientToolStart(0),
    serverToolStart(0),
    thinkingStart(0),
    redactedThinkingStart(0),
  ];
  const blockTypes = [
    'tool',
    'server_tool_use',
    'thinking',
    'redacted_thinking',
  ];

  for (const [index, start] of starts.entries()) {
    await expect(
      collectEvents([messageStart(), start, citationsDelta(0)]),
    ).rejects.toThrow(
      `Anthropic ${blockTypes[index]} block at index 0 cannot receive citations_delta`,
    );
  }
});

test('server tool blocks accept only JSON input deltas', async () => {
  const rejectedDeltas = [
    ['text_delta', textDelta(0)],
    ['citations_delta', citationsDelta(0)],
    ['thinking_delta', thinkingDelta(0)],
    ['signature_delta', signatureDelta(0)],
  ] as const;

  for (const [deltaType, delta] of rejectedDeltas) {
    await expect(
      collectEvents([messageStart(), serverToolStart(0), delta]),
    ).rejects.toThrow(
      `Anthropic server_tool_use block at index 0 cannot receive ${deltaType}`,
    );
  }
});

test('result and upload blocks reject every native delta type', async () => {
  const deltas = [
    ['text_delta', textDelta(0)],
    ['input_json_delta', inputJsonDelta(0)],
    ['citations_delta', citationsDelta(0)],
    ['thinking_delta', thinkingDelta(0)],
    ['signature_delta', signatureDelta(0)],
  ] as const;

  for (const blockType of RAW_TERMINAL_BLOCK_TYPES) {
    for (const [deltaType, delta] of deltas) {
      await expect(
        collectEvents([
          messageStart(),
          terminalBlockStart(0, blockType),
          delta,
        ]),
      ).rejects.toThrow(
        `Anthropic ${blockType} block at index 0 cannot receive ${deltaType}`,
      );
    }
  }
});

test('cancellation after a raw frame does not synthesize later raw frames', async () => {
  const controller = new AbortController();
  const start = serverToolStart(0);
  const iterator = mapAnthropicEvents({
    events: toAsyncIterable([
      messageStart(),
      start,
      inputJsonDelta(0),
      contentStop(0),
      messageStop(),
    ]),
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const first = await iterator.next();
  controller.abort();
  const next = await iterator.next();

  expect(EventSchemas.parse(first.value)).toEqual(rawAGUIEvent(start));
  expect(next).toEqual({ done: true, value: undefined });
});
