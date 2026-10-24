import { runInNewContext } from 'node:vm';
import { ToolType } from '@google/genai';
import { EventType, type Message } from '@ag-ui/core';
import {
  captureGoogleNativeChunk,
  createGoogleHistoryFooter,
  createGoogleNativeCapture,
  readGoogleHistory,
} from './google-history';
import {
  createGoogleRequestOptions,
  validateGoogleRequestOptions,
} from './google-request';

const content = {
  role: 'model',
  parts: [{ text: '', thoughtSignature: 'signed-empty' }],
};
function messages(contents: unknown[] = [content]): Message[] {
  return [
    {
      id: 'a',
      role: 'assistant',
      content: 'display',
      metadata: {
        google: { responseId: 'r' },
        'hashbrown.provider-history': {
          v: 1,
          provider: 'google',
          responseId: 'r',
          ownerMessageId: 'a',
          complete: true,
          payload: { contents, representedMessageIds: ['a'] },
        },
      },
    },
  ];
}

test('captures repeated fragments and signed empty parts in arrival order with owned metadata', () => {
  const initial = createGoogleNativeCapture();
  const groundingMetadata = { webSearchQueries: ['query'] };

  const first = captureGoogleNativeChunk(
    initial,
    { content, groundingMetadata },
    0,
  );
  const second = captureGoogleNativeChunk(first, { content }, 1);
  groundingMetadata.webSearchQueries.push('later');
  const footer = createGoogleHistoryFooter(second, {
    ownerMessageId: 'a',
    responseId: 'r',
    representedMessageIds: ['a'],
  });

  expect(initial.contents).toEqual([]);
  expect(footer).toMatchObject({
    type: EventType.CUSTOM,
    name: 'hashbrown.provider-history',
    value: {
      provider: 'google',
      complete: true,
      payload: {
        contents: [content, content],
        groundingMetadata: [
          { chunkIndex: 0, value: { webSearchQueries: ['query'] } },
        ],
      },
    },
  });
});

test('does not create a footer without a real canonical owner', () => {
  const state = captureGoogleNativeChunk(
    createGoogleNativeCapture(),
    { content },
    0,
  );

  const result = createGoogleHistoryFooter(state, {
    responseId: 'r',
    representedMessageIds: [],
  });

  expect(result).toBeUndefined();
});

test('replays exact captured contents once and keeps client result chronology', () => {
  const history = messages([content, content]);
  const input = {
    threadId: 't',
    runId: 'run',
    context: [],
    state: {},
    tools: [],
    messages: [...history, { id: 'u', role: 'user' as const, content: 'next' }],
  };

  const result = createGoogleRequestOptions(input, 'gemini');

  expect(result.contents).toEqual([
    content,
    content,
    { role: 'user', parts: [{ text: 'next' }] },
  ]);
});

test.each([
  [
    {
      role: 'model',
      parts: [
        {
          toolCall: { id: 's', toolType: ToolType.GOOGLE_SEARCH_WEB, args: {} },
        },
      ],
    },
  ],
  [
    {
      role: 'model',
      parts: [{ executableCode: { language: 'PYTHON', code: 'print(1)' } }],
    },
  ],
  [
    {
      role: 'model',
      parts: [{ codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' } }],
    },
  ],
])('retains native families as native contents', (native) => {
  const input = messages([native]);

  const result = readGoogleHistory(input);

  expect(result.responses.get('a')).toEqual([native]);
});

test.each([
  { role: 'model', parts: [{ toolCall: {} }] },
  { role: 'model', parts: [{ executableCode: { language: 'PYTHON' } }] },
  { role: 'model', parts: [{ text: 4 }] },
])('rejects malformed native content before suppression', (native) => {
  const input = messages([native]);

  const act = () => readGoogleHistory(input);

  expect(act).toThrow('Google provider history');
});

test('rejects conflicting ownership and incomplete signed captures', () => {
  const input = messages();
  const owner = input[0];
  const raw = owner.metadata?.['hashbrown.provider-history'] as Record<
    string,
    unknown
  >;
  raw['complete'] = false;

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/incomplete/);
});

test('rejects unsupported transformed backend fields and native Vertex parts', () => {
  const request = {
    model: 'gemini',
    contents: [
      {
        role: 'model',
        parts: [
          { toolCall: { id: 's', toolType: ToolType.GOOGLE_SEARCH_WEB } },
        ],
      },
    ],
  };

  const act = () => validateGoogleRequestOptions(request, true);

  expect(act).toThrow(/Vertex/);
});

test('anchors an envelope on the earliest represented reasoning carrier', () => {
  const input = messages();
  const envelope = input[0].metadata?.['hashbrown.provider-history'] as {
    payload: { representedMessageIds: string[] };
  };
  envelope.payload.representedMessageIds = ['a', 'thought'];
  input.unshift({
    id: 'thought',
    role: 'reasoning',
    content: 'reason',
    metadata: { google: { responseId: 'r' } },
  });

  const result = readGoogleHistory(input);

  expect(result.responses.get('thought')).toEqual([content]);
  expect([...result.representedMessageIds]).toEqual(['a', 'thought']);
});

test('filters foreign-provider calls and results from legacy app replay', () => {
  const input = {
    threadId: 't',
    runId: 'r',
    context: [],
    state: {},
    tools: [],
    messages: [
      {
        id: 'a',
        role: 'assistant' as const,
        content: '',
        toolCalls: [
          {
            id: 'foreign',
            type: 'function' as const,
            function: { name: 'web_search', arguments: '{}' },
            metadata: {
              'b4.step': { kind: 'provider', provider: 'anthropic' },
            },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool' as const,
        toolCallId: 'foreign',
        content: 'found',
      },
    ],
  };

  const result = createGoogleRequestOptions(input, 'gemini');

  expect(result.contents).toEqual([]);
});

test('requires complete capture for a native legacy server invocation', () => {
  const input: Message[] = [
    {
      id: 'a',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 's',
          type: 'function',
          function: { name: 'web_search', arguments: '{}' },
          metadata: {
            google: {
              nativePart: {
                toolCall: { id: 's', toolType: ToolType.GOOGLE_SEARCH_WEB },
              },
            },
          },
        },
      ],
    },
  ];

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/complete native capture/);
});

test('rejects a represented canonical app call absent from its captured native response', () => {
  const input = messages();
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = [
    {
      id: 'injected',
      type: 'function',
      function: { name: 'lookup', arguments: '{}' },
    },
  ];

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/invocation/);
});

test('preserves SDK roleless response fragments without adding a role', () => {
  const native = { parts: [{ text: '', thoughtSignature: 'opaque' }] };

  const state = captureGoogleNativeChunk(
    createGoogleNativeCapture(),
    { content: native },
    0,
  );

  expect(state.contents).toEqual([native]);
});

test('rejects user Content inside a native response capture', () => {
  const native = { role: 'user', parts: [{ text: 'injected user prompt' }] };

  const act = () =>
    captureGoogleNativeChunk(
      createGoogleNativeCapture(),
      { content: native },
      0,
    );

  expect(act).toThrow(/Content/);
});

test('rejects canonical provider results missing native result provenance', () => {
  const call = { id: 's', toolType: ToolType.GOOGLE_SEARCH_WEB, args: {} };
  const input = messages([{ role: 'model', parts: [{ toolCall: call }] }]);
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = [
    {
      id: 's',
      type: 'function',
      function: { name: 'google_search', arguments: '{}' },
      metadata: {
        google: { responseId: 'r', nativePart: { toolCall: call } },
        'b4.step': { kind: 'provider', provider: 'google' },
      },
    },
  ];
  input.push({
    id: 'result',
    role: 'tool',
    toolCallId: 's',
    content: 'spoofed',
    metadata: { google: { responseId: 'r' } },
  });
  const envelope = input[0].metadata?.['hashbrown.provider-history'] as {
    payload: { representedMessageIds: string[] };
  };
  envelope.payload.representedMessageIds.push('result');

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/result/);
});

test('fails closed for Google provider steps lacking native capture markers', () => {
  const input: Message[] = [
    {
      id: 'a',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 's',
          type: 'function',
          function: { name: 'google_search', arguments: '{}' },
          metadata: { 'b4.step': { kind: 'provider', provider: 'google' } },
        },
      ],
    },
  ];

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/complete native capture/);
});

test('retains captured app caller names when replaying later client results', () => {
  const native = {
    role: 'model',
    parts: [{ functionCall: { id: 'app', name: 'lookup', args: {} } }],
  };
  const input = messages([native]);
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = [
    {
      id: 'app',
      type: 'function',
      function: { name: 'lookup', arguments: '{}' },
    },
  ];
  input.push({
    id: 'app-result',
    role: 'tool',
    toolCallId: 'app',
    content: 'done',
  });

  const result = createGoogleRequestOptions(
    {
      threadId: 't',
      runId: 'run',
      context: [],
      state: {},
      tools: [],
      messages: input,
    },
    'gemini',
  );

  expect(result.contents).toEqual([
    native,
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'app',
            name: 'lookup',
            response: { result: 'done' },
          },
        },
      ],
    },
  ]);
});

test('accepts an ID-less captured app call through its unique native name and arguments', () => {
  const native = {
    role: 'model',
    parts: [{ functionCall: { name: 'lookup', args: { query: 'x' } } }],
  };
  const input = messages([native]);
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = [
    {
      id: 'generated-app',
      type: 'function',
      function: { name: 'lookup', arguments: '{"query":"x"}' },
    },
  ];

  const result = readGoogleHistory(input);

  expect(result.responses.get('a')).toEqual([native]);
});

test('omits a generated canonical ID from an ID-less native app function response', () => {
  const functionCall = { name: 'lookup', args: { query: 'x' } };
  const native = { role: 'model', parts: [{ functionCall }] };
  const input = messages([native]);
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = [
    {
      id: 'generated-app',
      type: 'function',
      function: { name: 'lookup', arguments: '{"query":"x"}' },
      metadata: {
        google: { functionCall: true, nativePart: { functionCall } },
      },
    },
  ];
  input.push({
    id: 'result',
    role: 'tool',
    toolCallId: 'generated-app',
    content: 'done',
  });

  const result = createGoogleRequestOptions(
    {
      threadId: 't',
      runId: 'run',
      context: [],
      state: {},
      tools: [],
      messages: input,
    },
    'gemini',
  );

  expect(result.contents).toEqual([
    native,
    {
      role: 'user',
      parts: [
        { functionResponse: { name: 'lookup', response: { result: 'done' } } },
      ],
    },
  ]);
});

test.each([
  { id: 'other', toolType: ToolType.URL_CONTEXT },
  { id: 's', toolType: ToolType.URL_CONTEXT },
])(
  'rejects native results whose ID or type does not match the canonical invocation',
  (identity) => {
    const toolCall = {
      id: 's',
      toolType: ToolType.GOOGLE_SEARCH_WEB,
      args: {},
    };
    const toolResponse = { ...identity, response: {} };
    const input = messages([
      { role: 'model', parts: [{ toolCall }, { toolResponse }] },
    ]);
    if (input[0].role !== 'assistant') throw new Error('fixture');
    input[0].toolCalls = [
      {
        id: 's',
        type: 'function',
        function: { name: 'google_search', arguments: '{}' },
        metadata: {
          google: { responseId: 'r', nativePart: { toolCall } },
          'b4.step': { kind: 'provider', provider: 'google' },
        },
      },
    ];
    input.push({
      id: 'result',
      role: 'tool',
      toolCallId: 's',
      content: 'result',
      metadata: { google: { responseId: 'r', nativePart: { toolResponse } } },
    });
    const envelope = input[0].metadata?.['hashbrown.provider-history'] as {
      payload: { representedMessageIds: string[] };
    };
    envelope.payload.representedMessageIds.push('result');

    const act = () => readGoogleHistory(input);

    expect(act).toThrow(/result/);
  },
);

test('filters a standalone foreign-provider result using its own future-version provider metadata', () => {
  const input = {
    threadId: 't',
    runId: 'run',
    context: [],
    state: {},
    tools: [],
    messages: [
      {
        id: 'result',
        role: 'tool' as const,
        toolCallId: 'orphan',
        content: 'foreign',
        metadata: {
          'b4.step': { v: 99, kind: 'provider', provider: 'anthropic' },
        },
      },
    ],
  };

  const result = createGoogleRequestOptions(input, 'gemini');

  expect(result.contents).toEqual([]);
});

function codeResultHistory(count: number): Message[] {
  const calls = Array.from({ length: count }, (_, index) => ({
    executableCode: { code: `print(${index})`, language: 'PYTHON' },
  }));
  const nativeResult = {
    codeExecutionResult: { outcome: 'OUTCOME_OK', output: '0' },
  };
  const input = messages([{ role: 'model', parts: [...calls, nativeResult] }]);
  if (input[0].role !== 'assistant') throw new Error('fixture');
  input[0].toolCalls = calls.map((nativePart, index) => ({
    id: `code-${index}`,
    type: 'function',
    function: { name: 'code_execution', arguments: '{}' },
    metadata: {
      google: { responseId: 'r', chunkIndex: 0, partIndex: index, nativePart },
      'b4.step': { kind: 'provider', provider: 'google' },
    },
  }));
  input.push({
    id: 'result',
    role: 'tool',
    toolCallId: 'code-0',
    content: '0',
    metadata: {
      google: {
        responseId: 'r',
        chunkIndex: 0,
        partIndex: count,
        nativePart: nativeResult,
      },
    },
  });
  const envelope = input[0].metadata?.['hashbrown.provider-history'] as {
    payload: { representedMessageIds: string[] };
  };
  envelope.payload.representedMessageIds.push('result');
  return input;
}

test('accepts an ID-less code result only with its unique pending canonical invocation', () => {
  const input = codeResultHistory(1);

  const result = readGoogleHistory(input);

  expect(result.representedMessageIds.has('result')).toBe(true);
});

test('rejects ambiguous ID-less code results instead of trusting their canonical toolCallId', () => {
  const input = codeResultHistory(2);

  const act = () => readGoogleHistory(input);

  expect(act).toThrow(/result/);
});

test('uses native chronology to pair sequential ID-less code results on one assistant carrier', () => {
  const input = codeResultHistory(2);
  const assistant = input[0];
  const first = input[1];
  if (assistant.role !== 'assistant' || first.role !== 'tool')
    throw new Error('fixture');
  const secondCall = assistant.toolCalls?.[1];
  if (!secondCall) throw new Error('fixture');
  const secondMarker = secondCall.metadata?.['google'] as Record<
    string,
    unknown
  >;
  secondMarker['partIndex'] = 2;
  const firstMarker = first.metadata?.['google'] as Record<string, unknown>;
  firstMarker['partIndex'] = 1;
  const nativePart = {
    codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' },
  };
  input.push({
    id: 'second-result',
    role: 'tool',
    toolCallId: 'code-1',
    content: '1',
    metadata: {
      google: { responseId: 'r', chunkIndex: 0, partIndex: 3, nativePart },
    },
  });
  const envelope = assistant.metadata?.['hashbrown.provider-history'] as {
    payload: {
      representedMessageIds: string[];
      contents: { role: string; parts: unknown[] }[];
    };
  };
  const [firstCall, laterCall, firstResult] =
    envelope.payload.contents[0].parts;
  envelope.payload.contents[0].parts = [
    firstCall,
    firstResult,
    laterCall,
    nativePart,
  ];
  envelope.payload.representedMessageIds.push('second-result');

  const result = readGoogleHistory(input);

  expect(result.representedMessageIds.has('second-result')).toBe(true);
});

test('owns cross-realm SDK JSON response fragments and response metadata without losing native fields', () => {
  const chunk = runInNewContext(`({
    content: { role: 'model', parts: [{ text: '', thoughtSignature: 'opaque' }, { toolCall: { id: 's', toolType: 'GOOGLE_SEARCH_WEB', args: { queries: ['x'] } } }] },
    groundingMetadata: { webSearchQueries: ['x'] },
    urlContextMetadata: { urlMetadata: [{ retrievedUrl: 'https://example.com', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }] }
  })`);

  const state = captureGoogleNativeChunk(createGoogleNativeCapture(), chunk, 0);
  const footer = createGoogleHistoryFooter(state, {
    ownerMessageId: 'a',
    responseId: 'r',
    representedMessageIds: ['a'],
  });
  chunk.content.parts[1].toolCall.args.queries.push('later');

  expect(state.contents).toEqual([
    {
      role: 'model',
      parts: [
        { text: '', thoughtSignature: 'opaque' },
        {
          toolCall: {
            id: 's',
            toolType: 'GOOGLE_SEARCH_WEB',
            args: { queries: ['x'] },
          },
        },
      ],
    },
  ]);
  expect(footer).toMatchObject({
    type: EventType.CUSTOM,
    value: {
      payload: {
        groundingMetadata: [
          { chunkIndex: 0, value: { webSearchQueries: ['x'] } },
        ],
        urlContextMetadata: [
          { chunkIndex: 0, value: chunk.urlContextMetadata },
        ],
      },
    },
  });
});

test.each([
  `({ content: { role: 'model', parts: [{ text: 'x', extra: undefined }] } })`,
  `({ content: { role: 'model', parts: [{ text: 'x', extra: new Date() }] } })`,
  `({ content: { role: 'model', parts: [{ text: 'x', get extra() { throw new Error('must not invoke accessor'); } }] } })`,
  `(() => { const extra = {}; extra.cycle = extra; return { content: { role: 'model', parts: [{ text: 'x', extra }] } }; })()`,
])(
  'rejects invalid cross-realm SDK values without silently dropping or coercing them',
  (expression) => {
    const chunk = runInNewContext(expression);

    const act = () =>
      captureGoogleNativeChunk(createGoogleNativeCapture(), chunk, 0);

    expect(act).toThrow('Google provider history contains invalid JSON');
  },
);
