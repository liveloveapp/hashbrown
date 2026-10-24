import type { RunAgentInput } from '@ag-ui/core';
import {
  FunctionCallingConfigMode,
  type GenerateContentParameters,
} from '@google/genai';
import type {
  GoogleDeveloperBuiltInTools,
  GoogleVertexBuiltInTools,
} from '../index';
import {
  createGoogleRequestOptions,
  validateGoogleRequestOptions,
} from './google-request';

function createInput(): RunAgentInput & {
  forwardedProps: { hashbrown: { responseSchema: object } };
} {
  return {
    threadId: 'thread-google',
    runId: 'run-google',
    messages: [
      { id: 'system-google', role: 'system', content: 'System prompt.' },
      {
        id: 'developer-google',
        role: 'developer',
        content: 'Developer prompt.',
      },
      { id: 'user-google', role: 'user', content: 'Look it up.' },
      {
        id: 'reasoning-google',
        role: 'reasoning',
        content: 'I need a lookup.',
        encryptedValue: 'reasoning-signature',
        metadata: { google: { thought: true } },
      },
      {
        id: 'assistant-google',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-google',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
            encryptedValue: 'tool-signature',
            metadata: { google: { functionCall: true } },
          },
        ],
      },
      {
        id: 'tool-google',
        role: 'tool',
        toolCallId: 'call-google',
        content: '{"result":"fixture"}',
      },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Lookup a value.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    context: [],
    state: {},
    forwardedProps: {
      hashbrown: {
        responseSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
    },
  };
}

test('maps AG-UI messages, tools, signatures, and structured output to Google', () => {
  const controller = new AbortController();
  const input = createInput();

  const result = createGoogleRequestOptions(
    input,
    'gemini-3-flash',
    controller.signal,
  );

  expect(result).toEqual({
    model: 'gemini-3-flash',
    contents: [
      { role: 'user', parts: [{ text: 'Look it up.' }] },
      {
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
          { text: 'Checking.' },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-google',
              name: 'lookup',
              response: { result: 'fixture' },
            },
          },
        ],
      },
    ],
    config: {
      abortSignal: controller.signal,
      systemInstruction: {
        parts: [{ text: 'System prompt.' }, { text: 'Developer prompt.' }],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'lookup',
              description: 'Lookup a value.',
              parametersJsonSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
      },
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    },
  });
});

test('rejects structured tool result content', () => {
  const input = createInput();
  input.messages = input.messages.map((message) =>
    message.role === 'tool'
      ? { ...message, content: [{ type: 'text', text: 'Structured result.' }] }
      : message,
  );

  const act = () => createGoogleRequestOptions(input, 'gemini-3-flash');

  expect(act).toThrow(
    'Google provider currently requires text tool result content',
  );
});

test('ignores a top-level hashbrown key', () => {
  const { forwardedProps, ...standard } = createInput();
  const legacy = {
    ...standard,
    forwardedProps: {},
    hashbrown: forwardedProps.hashbrown,
  };
  const bare = { ...standard, forwardedProps: {} };

  const result = createGoogleRequestOptions(
    legacy,
    'gemini-3-flash',
    new AbortController().signal,
  );

  expect(result).toEqual(
    createGoogleRequestOptions(
      bare,
      'gemini-3-flash',
      new AbortController().signal,
    ),
  );
});

test('enables immutable built-in defaults and validated Developer circulation with app tools', () => {
  const input = createInput();
  const builtInTools = {
    webSearch: true,
    webFetch: true,
    codeExecution: true,
  } as const;

  const result = createGoogleRequestOptions(input, 'gemini', undefined, {
    builtInTools,
  });

  expect(result.config?.tools).toEqual([
    { functionDeclarations: expect.any(Array) },
    { googleSearch: {} },
    { urlContext: {} },
    { codeExecution: {} },
  ]);
  expect(result.config?.toolConfig).toEqual({
    includeServerSideToolInvocations: true,
    functionCallingConfig: { mode: 'VALIDATED' },
  });
  expect(builtInTools).toEqual({
    webSearch: true,
    webFetch: true,
    codeExecution: true,
  });
});

test('clones native configuration and omits unsupported Vertex circulation', () => {
  const input = { ...createInput(), tools: [] };
  const webSearch = { excludeDomains: ['example.com'] };

  const result = createGoogleRequestOptions(input, 'gemini', undefined, {
    builtInTools: { webSearch },
    vertexai: true,
  });
  webSearch.excludeDomains.push('later.com');

  expect(result.config?.tools).toEqual([
    { googleSearch: { excludeDomains: ['example.com'] } },
  ]);
  expect(result.config?.toolConfig).toBeUndefined();
});

test.each([
  [false, { excludeDomains: ['example.com'] }, 'Developer'],
  [false, { blockingConfidence: 'BLOCK_LOW_AND_ABOVE' }, 'Developer'],
  [
    true,
    { timeRangeFilter: { startTime: '2026-01-01', endTime: '2026-02-01' } },
    'Vertex',
  ],
])(
  'validates transformed search settings for backend %s',
  (vertexai, googleSearch, label) => {
    const request = {
      model: 'gemini',
      contents: [],
      config: { tools: [{ googleSearch }] },
    };

    const act = () =>
      validateGoogleRequestOptions(
        request as GenerateContentParameters,
        vertexai,
      );

    expect(act).toThrow(label);
  },
);

test('retains an explicit supported transformed function calling setting', () => {
  const request = {
    model: 'gemini',
    contents: [],
    config: {
      tools: [{ functionDeclarations: [{ name: 'lookup' }] }],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
      },
    },
  };

  validateGoogleRequestOptions(request, false);

  expect(request.config.toolConfig.functionCallingConfig.mode).toBe(
    FunctionCallingConfigMode.NONE,
  );
});

test('requires validated mode for explicit transformed Developer circulation mixed with app tools', () => {
  const request = {
    model: 'gemini',
    contents: [],
    config: {
      tools: [{ functionDeclarations: [{ name: 'lookup' }] }],
      toolConfig: {
        includeServerSideToolInvocations: true,
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
      },
    },
  };

  const act = () => validateGoogleRequestOptions(request, false);

  expect(act).toThrow('VALIDATED');
});

test('exports backend-specific built-in tool signatures', () => {
  const developer: GoogleDeveloperBuiltInTools = {
    webSearch: { timeRangeFilter: {} },
    webFetch: true,
    codeExecution: true,
  };
  const vertex: GoogleVertexBuiltInTools = {
    webSearch: { excludeDomains: ['example.com'] },
  };
  const invalidDeveloper: GoogleDeveloperBuiltInTools = {
    // @ts-expect-error Developer search cannot configure Vertex-only excluded domains.
    webSearch: { excludeDomains: [] },
  };
  const invalidVertex: GoogleVertexBuiltInTools = {
    // @ts-expect-error Vertex search cannot configure Developer-only time ranges.
    webSearch: { timeRangeFilter: {} },
  };

  expect([developer, vertex, invalidDeveloper, invalidVertex]).toHaveLength(4);
});

test('validates Vertex native server parts supplied through the SDK Part union after a transform', () => {
  const request: GenerateContentParameters = {
    model: 'gemini',
    contents: [{ toolCall: { id: 's' } }],
  };

  const act = () => validateGoogleRequestOptions(request, true);

  expect(act).toThrow(/Vertex/);
});
