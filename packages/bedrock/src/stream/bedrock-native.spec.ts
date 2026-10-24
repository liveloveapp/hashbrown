import {
  captureBedrockEvent,
  createBedrockCapture,
  decodeBedrockNative,
  encodeBedrockNative,
  readBedrockCaptureBlock,
  readBedrockCaptureContent,
} from './bedrock-native';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';

function capture(events: unknown[]) {
  return events.reduce<ReturnType<typeof createBedrockCapture>>(
    (state, event) => captureBedrockEvent(state, event as ConverseStreamOutput),
    createBedrockCapture(),
  );
}

test('round trips owned bytes and tag-shaped JSON without collisions', () => {
  const input = {
    bytes: new Uint8Array([0, 255, 1]),
    json: { tag: 'bytes', value: 'AA==' },
    nested: [null, true, 2],
  };

  const restored = decodeBedrockNative(
    JSON.parse(JSON.stringify(encodeBedrockNative(input))),
  ) as typeof input;

  expect(restored).toEqual(input);
  expect(restored.bytes).not.toBe(input.bytes);
});

test('rejects unsafe values and strict persisted undefined', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  const getter = Object.defineProperty({}, 'secret', {
    get() {
      throw new Error('read');
    },
    enumerable: true,
  });

  const values = [
    cyclic,
    getter,
    new Date(),
    NaN,
    Infinity,
    undefined,
    { optional: undefined },
  ];

  for (const value of values)
    expect(() => encodeBedrockNative(value)).toThrow(/Bedrock native/);
  expect(() => decodeBedrockNative(['bytes', '!'])).toThrow(/Bedrock native/);
});

test('captures indexed interleaved blocks and atomic ordered result documents without mutating inputs', () => {
  const events = [
    {
      contentBlockStart: {
        contentBlockIndex: 1,
        start: {
          toolUse: {
            toolUseId: 'call',
            name: 'nova_grounding',
            type: 'server_tool_use',
            optional: undefined,
          },
        },
      },
    },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Before' } } },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '{"query":"x"}' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockStart: {
        contentBlockIndex: 2,
        start: {
          toolResult: {
            toolUseId: 'call',
            type: 'nova_grounding',
            status: 'success',
          },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 2,
        delta: {
          toolResult: [
            { text: 'A' },
            { json: '{"literal":true}' },
            { json: { x: 1 } },
          ],
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 2,
        delta: { toolResult: [{ json: { y: 2 } }, { text: 'B' }] },
      },
    },
    { contentBlockStop: { contentBlockIndex: 2 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 3,
        delta: { reasoningContent: { redactedContent: new Uint8Array([1]) } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 3,
        delta: { reasoningContent: { redactedContent: new Uint8Array([2]) } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 3 } },
    { messageStop: { stopReason: 'end_turn' } },
  ];
  const before = structuredClone(events);

  const state = capture(events);
  const content = readBedrockCaptureContent(state, true);

  expect(content).toEqual([
    { text: 'Before' },
    {
      toolUse: {
        toolUseId: 'call',
        name: 'nova_grounding',
        type: 'server_tool_use',
        input: { query: 'x' },
      },
    },
    {
      toolResult: {
        toolUseId: 'call',
        type: 'nova_grounding',
        status: 'success',
        content: [
          { text: 'A' },
          { json: '{"literal":true}' },
          { json: { x: 1 } },
          { json: { y: 2 } },
          { text: 'B' },
        ],
      },
    },
    { reasoningContent: { redactedContent: new Uint8Array([1, 2]) } },
  ]);
  expect(events).toEqual(before);
  expect(readBedrockCaptureContent(state)).toBeUndefined();
});

test('requires messageStop and explicit closure of implicit text and citation blocks', () => {
  const closed = capture([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'c', name: 'x' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { toolUse: { input: '{}' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
  ]);

  const unfinished = ['text', 'citation'].map((kind) =>
    capture([
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { [kind]: kind === 'text' ? 'x' : { title: 't' } },
        },
      },
      { messageStop: { stopReason: 'end_turn' } },
    ]),
  );

  expect(readBedrockCaptureContent(closed, true)).toBeUndefined();
  for (const state of unfinished)
    expect(readBedrockCaptureContent(state, true)).toBeUndefined();
});

test('retains citation occurrence order and signed reasoning', () => {
  const citation = {
    title: 't',
    source: 'https://example.com',
    sourceContent: [{ text: 'quote' }],
  };
  const state = capture([
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'answer' } } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { citation } } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { citation } } },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { reasoningContent: { text: 'think' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { reasoningContent: { signature: 'signed' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const result = readBedrockCaptureContent(state, true);

  expect(result).toEqual([
    {
      citationsContent: {
        content: [{ text: 'answer' }],
        citations: [citation, citation],
      },
    },
    {
      reasoningContent: {
        reasoningText: { text: 'think', signature: 'signed' },
      },
    },
  ]);
});

test('marks unknown blocks and invalid invocation JSON unusable', () => {
  const unknown = capture([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { $unknown: ['future', { bytes: new Uint8Array([1]) }] },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const invalid = capture([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'c', name: 'x' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { toolUse: { input: '{' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  expect(readBedrockCaptureContent(unknown, true)).toBeUndefined();
  expect(readBedrockCaptureContent(invalid, true)).toBeUndefined();
});

test('accepts SDK plain objects and typed bytes from another realm and Buffer', () => {
  const foreign = require('node:vm').runInNewContext(
    '({ bytes: new Uint8Array([1, 255]), plain: { x: 1 } })',
  );
  const buffer = Buffer.from([2, 3]);

  const restored = decodeBedrockNative(
    encodeBedrockNative({ foreign, buffer }),
  );

  expect(restored).toEqual({
    foreign: { bytes: new Uint8Array([1, 255]), plain: { x: 1 } },
    buffer: new Uint8Array([2, 3]),
  });
});

test('rejects conflicting delta families without losing capture provenance', () => {
  const events = [
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'c', name: 'x' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'wrong family' },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ];

  const state = capture(events);

  expect(readBedrockCaptureContent(state, true)).toBeUndefined();
  expect(state.events).toHaveLength(events.length);
});

test('rejects byte subclasses, byte accessors, sparse arrays and noncanonical byte claims', () => {
  class CustomBytes extends Uint8Array {}
  const bytes = Object.defineProperty(new Uint8Array([1]), 'secret', {
    get() {
      throw new Error('accessor');
    },
  });
  const sparse = Object.assign(new Array(1), { extra: 'x' });

  const acts = [
    () => encodeBedrockNative(new CustomBytes([1])),
    () => encodeBedrockNative(bytes),
    () => encodeBedrockNative(sparse),
    () => decodeBedrockNative(['bytes', 'AB==']),
  ];

  for (const act of acts) expect(act).toThrow(/Bedrock native/);
});

test('rejects array subclasses without executing overridden traversal', () => {
  let traversed = false;
  class CustomArray extends Array {
    override map() {
      traversed = true;
      return [];
    }
  }
  const input = CustomArray.of(1, 2);

  const act = () => encodeBedrockNative(input);

  expect(act).toThrow(/Bedrock native/);
  expect(traversed).toBe(false);
});

test('marks unknown top level payloads, orphan stops and mixed reasoning unusable', () => {
  const endings = [
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ];
  const streams = [
    [
      { $unknown: ['future', { opaque: true }] },
      { messageStop: { stopReason: 'end_turn' } },
    ],
    endings,
    [
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { text: 'signed thought' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { redactedContent: new Uint8Array([1]) } },
        },
      },
      ...endings,
    ],
  ];

  const states = streams.map(capture);

  for (const state of states)
    expect(readBedrockCaptureContent(state, true)).toBeUndefined();
});

test('assembles image bytes and returns isolated blocks and complete content', () => {
  const state = capture([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { image: { format: 'png' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { image: { source: { bytes: new Uint8Array([1, 2]) } } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { image: { source: { bytes: new Uint8Array([3]) } } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const block = readBedrockCaptureBlock(state, 0);
  const content = readBedrockCaptureContent(state, true);
  const bytes = block?.image?.source?.bytes;
  if (bytes) bytes[0] = 255;
  const contentBytes = content?.[0]?.image?.source?.bytes;
  if (contentBytes) contentBytes[1] = 255;

  expect(readBedrockCaptureContent(state, true)).toEqual([
    { image: { format: 'png', source: { bytes: new Uint8Array([1, 2, 3]) } } },
  ]);
});

test('retains repeated signature fragment order and rejects unreconstructable images', () => {
  const signed = capture([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'think' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'first-' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'last' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);
  const image = capture([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { image: { format: 'png' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: {
          image: { source: { s3Location: { uri: 's3://bucket/key' } } },
        },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const content = readBedrockCaptureContent(signed, true);

  expect(content).toEqual([
    {
      reasoningContent: {
        reasoningText: { text: 'think', signature: 'first-last' },
      },
    },
  ]);
  expect(readBedrockCaptureContent(image, true)).toBeUndefined();
});

test('keeps text, invocation and image families distinct from later reasoning deltas', () => {
  const beginnings = [
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'answer' } } },
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'c', name: 'lookup' } },
      },
    },
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { image: { format: 'png' } },
      },
    },
  ];

  const states = beginnings.map((beginning) =>
    capture([
      beginning,
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { text: 'replaced' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
    ]),
  );

  for (const state of states)
    expect(readBedrockCaptureContent(state, true)).toBeUndefined();
});

test('does not invent an absent optional reasoning signature', () => {
  const state = capture([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'unsigned' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const content = readBedrockCaptureContent(state, true);

  expect(content).toEqual([
    { reasoningContent: { reasoningText: { text: 'unsigned' } } },
  ]);
});

test('closes an invocation with no input fragments as an empty document', () => {
  const started = captureBedrockEvent(createBedrockCapture(), {
    contentBlockStart: {
      contentBlockIndex: 0,
      start: {
        toolUse: {
          toolUseId: 'empty',
          name: 'nova_grounding',
          type: 'server_tool_use',
        },
      },
    },
  });

  const closed = captureBedrockEvent(started, {
    contentBlockStop: { contentBlockIndex: 0 },
  });

  expect(readBedrockCaptureBlock(closed, 0)).toEqual({
    toolUse: {
      toolUseId: 'empty',
      name: 'nova_grounding',
      type: 'server_tool_use',
      input: {},
    },
  });
});

test('accepts an empty start as the placeholder for a streamed text block', () => {
  const state = capture([
    { contentBlockStart: { contentBlockIndex: 0, start: {} } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello ' } } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'again' } } },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const content = readBedrockCaptureContent(state, true);

  expect(content).toEqual([{ text: 'Hello again' }]);
  expect(readBedrockCaptureBlock(state, 0)).toEqual({ text: 'Hello again' });
});

test('an explicit unknown start remains unusable even when followed by valid text', () => {
  const state = capture([
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { $unknown: ['future', {}] },
      },
    },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello' } } },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const content = readBedrockCaptureContent(state, true);

  expect(content).toBeUndefined();
  expect(readBedrockCaptureBlock(state, 0)).toBeUndefined();
});
