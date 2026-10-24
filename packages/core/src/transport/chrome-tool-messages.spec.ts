import {
  prepareChromeToolMessages,
  validateChromeToolCalls,
} from './chrome-tool-messages';
import type { RunAgentInput } from '@ag-ui/core';

const input = (messages: RunAgentInput['messages'] = []): RunAgentInput => ({
  threadId: 't',
  runId: 'r',
  state: {},
  context: [],
  forwardedProps: {},
  tools: [
    { name: 'lookup', description: 'Lookup', parameters: { type: 'object' } },
  ],
  messages,
});

test('translates immutable canonical calls and exact success and error associations', () => {
  const source = input([
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'id',
          type: 'function',
          function: { name: 'lookup', arguments: '{"key":"x"}' },
        },
      ],
    },
    { id: 'b', role: 'tool', toolCallId: 'id', content: 'secret' },
  ]);
  const before = JSON.stringify(source);

  const result = prepareChromeToolMessages(source);

  expect(result.messages).toEqual([
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          value: { callId: 'id', name: 'lookup', arguments: { key: 'x' } },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool-response',
          value: {
            callId: 'id',
            name: 'lookup',
            result: [{ type: 'text', value: 'secret' }],
          },
        },
      ],
    },
  ]);
  expect(result.tools[0]).toEqual({
    name: 'lookup',
    description: 'Lookup',
    inputSchema: { type: 'object' },
  });
  expect(JSON.stringify(source)).toBe(before);
});

test.each(['orphan', 'duplicate'])(
  'rejects %s history result associations',
  (kind) => {
    const source = input([
      {
        id: 'a',
        role: 'assistant',
        toolCalls: [
          {
            id: 'id',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      {
        id: 'b',
        role: 'tool',
        toolCallId: kind === 'orphan' ? 'missing' : 'id',
        content: 'ok',
      },
      ...(kind === 'duplicate'
        ? [
            {
              id: 'c',
              role: 'tool' as const,
              toolCallId: 'id',
              content: 'again',
            },
          ]
        : []),
    ]);

    expect(() => prepareChromeToolMessages(source)).toThrow();
  },
);

test.each([null, [], 'x', { x: undefined }, { x: Infinity }])(
  'rejects non-object or non-JSON arguments %p',
  (args) => {
    expect(() =>
      validateChromeToolCalls(
        [{ callID: 'id', name: 'lookup', arguments: args }],
        ['lookup'],
        [],
      ),
    ).toThrow();
  },
);

test('normalizes a lone empty native ID but rejects an ambiguous batch', () => {
  const call = { callID: '', name: 'lookup', arguments: {} };

  const result = validateChromeToolCalls([call], ['lookup'], []);

  expect(result[0].callId).toMatch(/^[a-f0-9-]{36}$/);
  expect(() =>
    validateChromeToolCalls(
      [call, { ...call, callID: 'other' }],
      ['lookup'],
      [],
    ),
  ).toThrow();
});

test.each([
  { callID: null },
  { callID: ' ' },
  {},
  { callID: 'id', callId: 'other' },
  { callID: 'id', name: 'unknown' },
])('rejects malformed incoming call %p', (fields) => {
  expect(() =>
    validateChromeToolCalls(
      [{ name: 'lookup', arguments: {}, ...fields }],
      ['lookup'],
      [],
    ),
  ).toThrow();
});

test('rejects response-schema and UI composition', () => {
  const source = input();
  source.forwardedProps = { hashbrown: { responseSchema: { type: 'object' } } };

  expect(() => prepareChromeToolMessages(source)).toThrow(
    expect.objectContaining({ code: 'FEATURE_UNSUPPORTED', retryable: false }),
  );
});

test('preserves an explicitly present empty error as a native error', () => {
  const source = input([
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'id',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { id: 'b', role: 'tool', toolCallId: 'id', content: '', error: '' },
  ]);

  const result = prepareChromeToolMessages(source);

  expect(result.messages[1].content).toEqual([
    {
      type: 'tool-response',
      value: { callId: 'id', name: 'lookup', errorMessage: '' },
    },
  ]);
});

test('rejects empty native tool descriptions', () => {
  const source = input();
  source.tools[0].description = '';

  expect(() => prepareChromeToolMessages(source)).toThrow();
});

test.each(['null', '[]', '"string"', '{', ' '.repeat(1024 * 1024) + '{}'])(
  'rejects malformed or oversized history arguments',
  (args) => {
    const source = input([
      {
        id: 'a',
        role: 'assistant',
        toolCalls: [
          {
            id: 'id',
            type: 'function',
            function: { name: 'lookup', arguments: args },
          },
        ],
      },
      { id: 'b', role: 'tool', toolCallId: 'id', content: 'ok' },
    ]);

    expect(() => prepareChromeToolMessages(source)).toThrow();
  },
);

test.each([null, undefined, '', ' ', 'bad'])(
  'rejects malformed or undeclared historical tool names and IDs %p',
  (id) => {
    const source = input([
      {
        id: 'a',
        role: 'assistant',
        toolCalls: [
          {
            id: id as string,
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { id: 'b', role: 'tool', toolCallId: id as string, content: 'ok' },
    ]);
    if (id === 'bad') source.tools = [];

    expect(() => prepareChromeToolMessages(source)).toThrow();
  },
);

test('rejects duplicate historical call IDs before native translation', () => {
  const call = {
    id: 'id',
    type: 'function' as const,
    function: { name: 'lookup', arguments: '{}' },
  };
  const source = input([
    { id: 'a', role: 'assistant', toolCalls: [call, call] },
    { id: 'b', role: 'tool', toolCallId: 'id', content: 'ok' },
  ]);

  expect(() => prepareChromeToolMessages(source)).toThrow();
});

test('bounds incoming call count and JSON argument size', () => {
  const call = {
    callID: 'id',
    name: 'lookup',
    arguments: { text: 'x'.repeat(1024 * 1024) },
  };

  expect(() => validateChromeToolCalls([call], ['lookup'], [])).toThrow();
  expect(() =>
    validateChromeToolCalls(
      Array.from({ length: 65 }, (_, i) => ({
        ...call,
        callID: `${i}`,
        arguments: {},
      })),
      ['lookup'],
      [],
    ),
  ).toThrow();
});
