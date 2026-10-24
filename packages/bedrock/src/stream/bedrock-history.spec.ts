import type { Message } from '@ag-ui/core';
import { ɵPROVIDER_HISTORY_METADATA_KEY } from '@hashbrownai/core';
import { readBedrockHistory } from './bedrock-history';
import { encodeBedrockNative } from './bedrock-native';

function history(
  content: unknown[],
  messages: Message[],
  ids = messages.map((message) => message.id),
): Message[] {
  return messages.map((message, index) => ({
    ...message,
    metadata: {
      ...message.metadata,
      bedrock: {
        ...(message.metadata?.['bedrock'] as object),
        responseId: 'response',
      },
      ...(index === messages.length - 1
        ? {
            [ɵPROVIDER_HISTORY_METADATA_KEY]: {
              v: 1,
              provider: 'bedrock',
              ownerMessageId: message.id,
              responseId: 'response',
              complete: true,
              payload: {
                content: encodeBedrockNative(content),
                representedMessageIds: ids,
              },
            },
          }
        : {}),
    },
  }));
}

test('anchors exact native content once at earliest represented carrier', () => {
  const content = [
    { reasoningContent: { redactedContent: new Uint8Array([1, 2]) } },
    { text: 'answer' },
  ];
  const messages = history(content, [
    { id: 'reason', role: 'reasoning', content: '', encryptedValue: 'AQI=' },
    { id: 'answer', role: 'assistant', content: 'answer' },
  ]);

  const replay = readBedrockHistory(JSON.parse(JSON.stringify(messages)));

  expect([...replay.responses]).toEqual([['reason', content]]);
  expect([...replay.representedMessageIds]).toEqual(['reason', 'answer']);
});

test('rejects missing native capture for provider invocation and canonical result without provenance', () => {
  const invocation: Message = {
    id: 'a',
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call',
        type: 'function',
        function: { name: 'nova_grounding', arguments: '{}' },
        metadata: {
          bedrock: {
            responseId: 'response',
            nativeBlock: encodeBedrockNative({
              toolUse: {
                toolUseId: 'call',
                name: 'nova_grounding',
                type: 'server_tool_use',
                input: {},
              },
            }),
          },
          'b4.step': { kind: 'provider', provider: 'bedrock' },
        },
      },
    ],
  };

  const messages = history(
    [
      {
        toolUse: {
          toolUseId: 'call',
          name: 'nova_grounding',
          type: 'server_tool_use',
          input: {},
        },
      },
      { toolResult: { toolUseId: 'call', content: [{ text: 'ok' }] } },
    ],
    [invocation, { id: 'r', role: 'tool', toolCallId: 'call', content: 'ok' }],
  );

  expect(() => readBedrockHistory([invocation])).toThrow(
    /complete native capture/,
  );
  expect(() => readBedrockHistory(messages)).toThrow(/provenance/);
});

test('validates owner, roles, response markers and unique represented ids', () => {
  const valid = history(
    [{ text: 'a' }],
    [{ id: 'a', role: 'assistant', content: 'a' }],
  );
  const invalid = [
    history([{ text: 'a' }], [{ id: 'a', role: 'user', content: 'a' }]),
    history(
      [{ text: 'a' }],
      [{ id: 'a', role: 'assistant', content: 'a' }],
      ['a', 'a'],
    ),
    valid.map((message) => ({
      ...message,
      metadata: { ...message.metadata, bedrock: { responseId: 'wrong' } },
    })),
  ];

  const acts = invalid.map((messages) => () => readBedrockHistory(messages));

  for (const act of acts) expect(act).toThrow(/Bedrock provider history/);
});

test('rejects malformed native union members, result documents and signed reasoning', () => {
  const blocks = [
    { toolUse: 42 },
    { toolResult: 'bad' },
    { reasoningContent: { reasoningText: { text: 3, signature: 's' } } },
    { citationsContent: 4 },
    {
      toolResult: {
        toolUseId: 'c',
        content: [{ json: undefined }],
        status: 'broken',
      },
    },
    { image: { format: 'png', source: { bytes: 'bad' } } },
  ];

  const acts = blocks.map(
    (block) => () =>
      readBedrockHistory(
        history([block], [{ id: 'a', role: 'assistant', content: '' }]),
      ),
  );

  for (const act of acts) expect(act).toThrow();
});

test('rejects invented canonical text and overlapping native ownership', () => {
  const text = history(
    [{ text: 'native' }],
    [{ id: 'a', role: 'assistant', content: 'invented' }],
  );
  const overlap = history(
    [{ text: 'native' }],
    [
      { id: 'a', role: 'assistant', content: 'native' },
      { id: 'b', role: 'assistant', content: '' },
    ],
  );
  overlap[0].metadata = {
    ...overlap[0].metadata,
    [ɵPROVIDER_HISTORY_METADATA_KEY]: {
      v: 1,
      provider: 'bedrock',
      ownerMessageId: 'a',
      responseId: 'other',
      complete: true,
      payload: {
        content: encodeBedrockNative([{ text: 'native' }]),
        representedMessageIds: ['a'],
      },
    },
  };

  const acts = [
    () => readBedrockHistory(text),
    () => readBedrockHistory(overlap),
  ];

  for (const act of acts) expect(act).toThrow(/Bedrock provider history/);
});

test('leaves incomplete text-only captures available to legacy reconstruction', () => {
  const messages = history(
    [{ text: 'answer' }],
    [{ id: 'a', role: 'assistant', content: 'answer' }],
  );
  (
    (messages[0].metadata ?? {})[ɵPROVIDER_HISTORY_METADATA_KEY] as {
      complete: boolean;
    }
  ).complete = false;

  const result = readBedrockHistory(messages);

  expect(result.responses.size).toBe(0);
  expect(result.representedMessageIds.size).toBe(0);
});

test('replays a later native interpreter result after an intervening client result', () => {
  const toolUse = {
    toolUseId: 'server',
    name: 'nova_code_interpreter',
    type: 'server_tool_use',
    input: { code: '1+1' },
  };
  const toolResult = {
    toolUseId: 'server',
    type: 'nova_code_interpreter_result',
    content: [{ json: { exitCode: 0, stdout: '2' } }],
  };
  const first = history(
    [
      { toolUse },
      { toolUse: { toolUseId: 'client', name: 'lookup', input: {} } },
    ],
    [
      {
        id: 'a',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'server',
            type: 'function',
            function: {
              name: toolUse.name,
              arguments: JSON.stringify(toolUse.input),
            },
            metadata: {
              bedrock: {
                responseId: 'response',
                blockIndex: 0,
                nativeBlock: encodeBedrockNative({ toolUse }),
              },
              'b4.step': { kind: 'provider', provider: 'bedrock' },
            },
          },
          {
            id: 'client',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
    ],
  );
  const second = history(
    [{ toolResult }],
    [
      {
        id: 'r',
        role: 'tool',
        toolCallId: 'server',
        content: '2',
        metadata: {
          bedrock: {
            responseId: 'response',
            blockIndex: 0,
            nativeBlock: encodeBedrockNative({ toolResult }),
          },
        },
      },
    ],
  ).map((message) => ({
    ...message,
    metadata: {
      ...message.metadata,
      bedrock: {
        ...(message.metadata?.['bedrock'] as object),
        responseId: 'later',
      },
      [ɵPROVIDER_HISTORY_METADATA_KEY]: {
        ...((message.metadata ?? {})[ɵPROVIDER_HISTORY_METADATA_KEY] as object),
        responseId: 'later',
      },
    },
  }));
  const messages: Message[] = [
    ...first,
    {
      id: 'client-result',
      role: 'tool',
      toolCallId: 'client',
      content: 'lookup',
    },
    ...second,
  ];

  const result = readBedrockHistory(JSON.parse(JSON.stringify(messages)));

  expect([...result.responses.keys()]).toEqual(['a', 'r']);
  expect(result.responses.get('r')).toEqual([{ toolResult }]);
  expect(result.representedMessageIds.has('client-result')).toBe(false);
});

test('preserves unknown native invocation types in complete captures and fails closed without them', () => {
  const toolUse = {
    toolUseId: 'future',
    name: 'future_tool',
    type: 'future_server_kind',
    input: {},
  };
  const message: Message = {
    id: 'future-a',
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'future',
        type: 'function',
        function: { name: 'future_tool', arguments: '{}' },
        metadata: {
          bedrock: {
            responseId: 'response',
            nativeBlock: encodeBedrockNative({ toolUse }),
          },
        },
      },
    ],
  };

  const result = () => readBedrockHistory(history([{ toolUse }], [message]));

  expect(result().responses.get('future-a')).toEqual([{ toolUse }]);
  expect(() => readBedrockHistory([message])).toThrow(
    /complete native capture/,
  );
});

test('rejects native results ordered before their represented invocation', () => {
  const toolUse = {
    toolUseId: 'c',
    name: 'nova_grounding',
    type: 'server_tool_use',
    input: {},
  };
  const toolResult = { toolUseId: 'c', content: [{ text: 'ok' }] };
  const messages = history(
    [{ toolResult }, { toolUse }],
    [
      {
        id: 'a',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'c',
            type: 'function',
            function: { name: 'nova_grounding', arguments: '{}' },
            metadata: {
              bedrock: {
                responseId: 'response',
                nativeBlock: encodeBedrockNative({ toolUse }),
              },
            },
          },
        ],
      },
      {
        id: 'r',
        role: 'tool',
        toolCallId: 'c',
        content: 'ok',
        metadata: {
          bedrock: {
            responseId: 'response',
            nativeBlock: encodeBedrockNative({ toolResult }),
          },
        },
      },
    ],
  );

  const act = () => readBedrockHistory(messages);

  expect(act).toThrow(/precedes invocation/);
});

test('rejects represented reasoning signatures that differ from native capture', () => {
  const messages = history(
    [
      {
        reasoningContent: {
          reasoningText: { text: 'think', signature: 'native-signature' },
        },
      },
    ],
    [
      {
        id: 'reason',
        role: 'reasoning',
        content: 'think',
        encryptedValue: 'invented-signature',
      },
    ],
  );

  const act = () => readBedrockHistory(messages);

  expect(act).toThrow(/reasoning/);
});

test('rejects unrepresented native application calls and mismatched native provider ownership', () => {
  const fabricated = history(
    [
      { toolUse: { toolUseId: 'app', name: 'lookup', input: {} } },
      { toolResult: { toolUseId: 'app', content: [{ text: 'fabricated' }] } },
    ],
    [{ id: 'a', role: 'assistant', content: '' }],
  );
  const mismatch = history(
    [
      {
        toolUse: {
          toolUseId: 'server',
          name: 'nova_grounding',
          type: 'server_tool_use',
          input: {},
        },
      },
    ],
    [
      {
        id: 'a',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'server',
            type: 'function',
            function: { name: 'nova_grounding', arguments: '{}' },
          },
        ],
      },
    ],
  );

  const acts = [
    () => readBedrockHistory(fabricated),
    () => readBedrockHistory(mismatch),
  ];

  for (const act of acts) expect(act).toThrow(/native invocation/);
});

test('rejects duplicate native result identities even after the invocation settles', () => {
  const toolResult = {
    toolUseId: 'c',
    type: 'server_tool_result',
    content: [{ text: 'ok' }],
  };
  const messages = history(
    [{ toolResult }, { toolResult }],
    [{ id: 'a', role: 'assistant', content: '' }],
  );

  const act = () => readBedrockHistory(messages);

  expect(act).toThrow(/duplicate native result/);
});

test('ignores incomplete plain-text claims without requiring a native payload', () => {
  const messages = history(
    [{ text: 'answer' }],
    [{ id: 'a', role: 'assistant', content: 'answer' }],
  );
  messages[0].metadata = {
    bedrock: { responseId: 'response' },
    [ɵPROVIDER_HISTORY_METADATA_KEY]: {
      v: 1,
      provider: 'bedrock',
      ownerMessageId: 'a',
      responseId: 'response',
      complete: false,
      payload: {},
    },
  };

  const result = readBedrockHistory(messages);

  expect(result.representedMessageIds.size).toBe(0);
});

test('rejects captures that reorder content across intervening client results', () => {
  const messages = history(
    [{ text: 'beforeafter' }],
    [
      { id: 'before', role: 'assistant', content: 'before' },
      { id: 'after', role: 'assistant', content: 'after' },
    ],
  );
  messages.splice(1, 0, {
    id: 'client-result',
    role: 'tool',
    toolCallId: 'client',
    content: 'app',
  });

  const act = () => readBedrockHistory(messages);

  expect(act).toThrow(/chronology/);
});

test('rejects assistant-native results for canonical application calls', () => {
  const invocation: Message = {
    id: 'a',
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'app',
        type: 'function',
        function: { name: 'lookup', arguments: '{}' },
      },
    ],
  };
  const messages = history(
    [
      { toolUse: { toolUseId: 'app', name: 'lookup', input: {} } },
      { toolResult: { toolUseId: 'app', content: [{ text: 'fabricated' }] } },
    ],
    [invocation],
  );

  const act = () => readBedrockHistory(messages);

  expect(act).toThrow(/application call/);
});
