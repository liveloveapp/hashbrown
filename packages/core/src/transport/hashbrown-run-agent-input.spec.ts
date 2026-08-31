import { type Message, RunAgentInputSchema, type Tool } from '@ag-ui/core';
import { Chat } from '../models';
import { createHashbrownRunAgentInput } from './hashbrown-run-agent-input';

const threadId = 'thread-1';
const runId = 'run-1';

function createInput(
  overrides: Partial<Parameters<typeof createHashbrownRunAgentInput>[0]> = {},
) {
  return createHashbrownRunAgentInput({
    threadId,
    runId,
    system: undefined,
    messages: [],
    tools: [],
    ui: false,
    ...overrides,
  });
}

test('omits the system message when no system prompt is provided', () => {
  const input = createInput();

  expect(input.messages).toEqual([] satisfies Message[]);
  expect(input.context).toEqual([]);
  expect(input.state).toEqual({});
  expect(input.forwardedProps).toEqual({});
});

test('prepends a standard AG-UI system message to the full history', () => {
  const input = createInput({
    system: 'You are concise.',
    messages: [{ role: 'user', content: 'Hello' }],
  });

  expect(input.messages).toEqual([
    {
      id: expect.any(String),
      role: 'system',
      content: 'You are concise.',
    },
    {
      id: expect.any(String),
      role: 'user',
      content: 'Hello',
    },
  ] satisfies Message[]);
});

test('omits absent assistant and tool-call encrypted values', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: 'Checking.',
      toolCalls: [
        {
          index: 0,
          id: 'call-weather',
          type: 'provider-specific',
          function: {
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
          },
        },
      ],
    },
  ];

  const input = createInput({ messages });

  expect(input.messages).toEqual([
    {
      id: expect.any(String),
      role: 'assistant',
      content: 'Checking.',
      toolCalls: [
        {
          id: 'call-weather',
          type: 'function',
          function: {
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
          },
        },
      ],
    },
  ] satisfies Message[]);
});

test('clones assistant and tool-call metadata into the next run input', () => {
  const metadata = { google: { steps: [{ index: 1 }] } };
  const messages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: 'Checking.',
      metadata,
      reasoningDetails: [
        {
          id: 'reasoning-1',
          role: 'reasoning',
          content: 'Need a lookup.',
        },
      ],
      toolCalls: [
        {
          index: 0,
          id: 'call-lookup',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
          metadata,
        },
      ],
    },
  ];

  const input = createInput({ messages });
  metadata.google.steps[0]!.index = 99;
  const assistant = input.messages.find(
    (message): message is Extract<Message, { role: 'assistant' }> =>
      message.role === 'assistant',
  );
  const assistantMetadata = assistant?.metadata as {
    google: { steps: { index: number }[] };
  };
  const toolMetadata = assistant?.toolCalls?.[0]?.metadata as {
    google: { steps: { index: number }[] };
  };
  if (assistantMetadata) {
    assistantMetadata.google.steps[0]!.index = 100;
  }

  expect(input.messages.map((message) => message.role)).toEqual([
    'reasoning',
    'assistant',
  ]);
  expect(assistantMetadata).toEqual({ google: { steps: [{ index: 100 }] } });
  expect(toolMetadata).toEqual({ google: { steps: [{ index: 1 }] } });
});

test('omits absent assistant and tool-call metadata from the next run input', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          index: 0,
          id: 'call-lookup',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ];

  const input = createInput({ messages });
  const assistant = input.messages.find(
    (message): message is Extract<Message, { role: 'assistant' }> =>
      message.role === 'assistant',
  );

  expect(assistant).not.toHaveProperty('metadata');
  expect(assistant?.toolCalls?.[0]).not.toHaveProperty('metadata');
});

test('emits ordered reasoning details before the assistant and its tool results', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: 'Checking.',
      encryptedValue: 'assistant-opaque',
      reasoning: 'Stale display reasoning.',
      reasoningDetails: [
        {
          id: 'reasoning-readable',
          role: 'reasoning',
          content: 'I need the weather.',
          encryptedValue: 'encrypted-readable',
          subagentRunId: 'subagent-1',
          metadata: { provider: { cache: ['hit'] } },
        },
        {
          id: 'reasoning-opaque',
          role: 'reasoning',
          content: '',
          encryptedValue: 'encrypted-opaque',
          subagentRunId: 'subagent-2',
          metadata: { provider: { cache: ['opaque'] } },
        },
      ],
      toolCalls: [
        {
          index: 0,
          id: 'call-weather',
          type: 'function',
          encryptedValue: 'tool-opaque',
          function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
        },
      ],
    },
    {
      role: 'tool',
      toolCallId: 'call-weather',
      toolName: 'getWeather',
      content: { status: 'fulfilled', value: 'Sunny' },
    },
  ];

  const input = createInput({ messages });

  expect(input.messages).toEqual([
    {
      id: 'reasoning-readable',
      role: 'reasoning',
      content: 'I need the weather.',
      encryptedValue: 'encrypted-readable',
      subagentRunId: 'subagent-1',
      metadata: { provider: { cache: ['hit'] } },
    },
    {
      id: 'reasoning-opaque',
      role: 'reasoning',
      content: '',
      encryptedValue: 'encrypted-opaque',
      subagentRunId: 'subagent-2',
      metadata: { provider: { cache: ['opaque'] } },
    },
    {
      id: 'thread-1:message:0',
      role: 'assistant',
      content: 'Checking.',
      encryptedValue: 'assistant-opaque',
      toolCalls: [
        {
          id: 'call-weather',
          type: 'function',
          encryptedValue: 'tool-opaque',
          function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
        },
      ],
    },
    {
      id: 'call-weather',
      role: 'tool',
      toolCallId: 'call-weather',
      content: 'Sunny',
    },
  ] satisfies Message[]);
});

test('emits metadata-free display reasoning with a deterministic ID', () => {
  const input = createInput({
    messages: [
      {
        role: 'assistant',
        content: 'Answer.',
        reasoning: 'Visible reasoning.',
      },
    ],
  });

  expect(input.messages).toEqual([
    {
      id: 'thread-1:message:0:reasoning',
      role: 'reasoning',
      content: 'Visible reasoning.',
    },
    {
      id: 'thread-1:message:0',
      role: 'assistant',
      content: 'Answer.',
    },
  ] satisfies Message[]);
});

test('emits display-only empty reasoning', () => {
  const input = createInput({
    messages: [{ role: 'assistant', content: 'Answer.', reasoning: '' }],
  });

  expect(input.messages).toEqual([
    {
      id: 'thread-1:message:0:reasoning',
      role: 'reasoning',
      content: '',
    },
    {
      id: 'thread-1:message:0',
      role: 'assistant',
      content: 'Answer.',
    },
  ] satisfies Message[]);
});

test('prefers empty reasoning details over stale display reasoning', () => {
  const input = createInput({
    messages: [
      {
        role: 'assistant',
        content: 'Answer.',
        reasoning: 'Stale display reasoning.',
        reasoningDetails: [],
      },
    ],
  });

  expect(input.messages).toEqual([
    {
      id: 'thread-1:message:0',
      role: 'assistant',
      content: 'Answer.',
    },
  ] satisfies Message[]);
});

test('emits no reasoning record for an assistant without reasoning fields', () => {
  const input = createInput({
    messages: [{ role: 'assistant', content: 'Answer.' }],
  });

  expect(input.messages).toEqual([
    {
      id: 'thread-1:message:0',
      role: 'assistant',
      content: 'Answer.',
    },
  ] satisfies Message[]);
});

test('isolates reasoning detail metadata from source and sibling output records', () => {
  const metadata = { provider: { cache: ['original'] } };
  const messages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: 'Answer.',
      reasoningDetails: [
        { id: 'reasoning-1', role: 'reasoning', content: 'First.', metadata },
        { id: 'reasoning-2', role: 'reasoning', content: 'Second.', metadata },
      ],
    },
  ];

  const input = createInput({ messages });
  metadata.provider.cache[0] = 'source-mutated';
  const output = input.messages.filter(
    (message): message is Extract<Message, { role: 'reasoning' }> =>
      message.role === 'reasoning',
  );
  const firstMetadata = output[0]?.metadata as {
    provider: { cache: string[] };
  };
  firstMetadata.provider.cache[0] = 'output-mutated';

  expect(output).toEqual([
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: 'First.',
      metadata: { provider: { cache: ['output-mutated'] } },
    },
    {
      id: 'reasoning-2',
      role: 'reasoning',
      content: 'Second.',
      metadata: { provider: { cache: ['original'] } },
    },
  ]);
});

test('keeps unrelated system, user, and tool messages unchanged without reasoning', () => {
  const input = createInput({
    system: 'System prompt.',
    messages: [
      { role: 'user', content: 'Hello.' },
      { role: 'assistant', content: 'Calling a tool.' },
      {
        role: 'tool',
        toolCallId: 'call-1',
        toolName: 'echo',
        content: { status: 'fulfilled', value: { greeting: 'Hello.' } },
      },
    ],
  });

  expect(input.messages).toEqual([
    {
      id: 'thread-1:system',
      role: 'system',
      content: 'System prompt.',
    },
    {
      id: 'thread-1:message:0',
      role: 'user',
      content: 'Hello.',
    },
    {
      id: 'thread-1:message:1',
      role: 'assistant',
      content: 'Calling a tool.',
    },
    {
      id: 'call-1',
      role: 'tool',
      toolCallId: 'call-1',
      content: '{"greeting":"Hello."}',
    },
  ] satisfies Message[]);
});

test('maps fulfilled tool results without losing strings', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'tool',
      toolCallId: 'call-string',
      toolName: 'stringResult',
      content: { status: 'fulfilled', value: 'already serialized' },
    },
    {
      role: 'tool',
      toolCallId: 'call-object',
      toolName: 'objectResult',
      content: { status: 'fulfilled', value: { temperature: 21 } },
    },
  ];

  const input = createInput({ messages });

  expect(input.messages).toEqual([
    {
      id: 'call-string',
      role: 'tool',
      toolCallId: 'call-string',
      content: 'already serialized',
    },
    {
      id: 'call-object',
      role: 'tool',
      toolCallId: 'call-object',
      content: '{"temperature":21}',
    },
  ] satisfies Message[]);
});

test('normalizes rejected tool results into content and error', () => {
  const messages: Chat.Api.Message[] = [
    {
      role: 'tool',
      toolCallId: 'call-error',
      toolName: 'failingTool',
      content: { status: 'rejected', reason: new Error('tool failed') },
    },
    {
      role: 'tool',
      toolCallId: 'call-reason',
      toolName: 'rejectedValue',
      content: { status: 'rejected', reason: { code: 503 } },
    },
  ];

  const input = createInput({ messages });

  expect(input.messages).toEqual([
    {
      id: 'call-error',
      role: 'tool',
      toolCallId: 'call-error',
      content: 'tool failed',
      error: 'tool failed',
    },
    {
      id: 'call-reason',
      role: 'tool',
      toolCallId: 'call-reason',
      content: '{"code":503}',
      error: '{"code":503}',
    },
  ] satisfies Message[]);
});

test('normalizes unusual rejected values without throwing', () => {
  const circular: Record<string, unknown> = {};
  circular['self'] = circular;
  const coercionFailure = {
    toJSON() {
      throw new Error('cannot serialize');
    },
    toString() {
      throw new Error('cannot coerce');
    },
  };
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot access properties');
      },
      getPrototypeOf() {
        throw new Error('cannot access prototype');
      },
    },
  );
  const hostileErrorProxy = new Proxy(new Error('hidden'), {
    get(target, property, receiver) {
      if (property === 'message') {
        throw new Error('cannot access message');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const reasons = [
    undefined,
    null,
    BigInt(42),
    circular,
    coercionFailure,
    hostileErrorProxy,
    hostileProxy,
  ];
  const messages: Chat.Api.Message[] = reasons.map((reason, index) => ({
    role: 'tool',
    toolCallId: `call-${index}`,
    toolName: 'unusualRejection',
    content: { status: 'rejected', reason },
  }));

  const input = createInput({ messages });

  expect(
    input.messages.map((message: Message) => ({
      content: message.content,
      error: message.role === 'tool' ? message.error : undefined,
    })),
  ).toEqual([
    { content: '', error: '' },
    { content: '', error: '' },
    { content: '42', error: '42' },
    { content: '[object Object]', error: '[object Object]' },
    { content: '', error: '' },
    { content: '{}', error: '{}' },
    { content: '', error: '' },
  ]);
});

test('normalizes unusual fulfilled values without throwing', () => {
  const circular: Record<string, unknown> = {};
  circular['self'] = circular;
  const coercionFailure = {
    toJSON() {
      throw new Error('cannot serialize');
    },
    toString() {
      throw new Error('cannot coerce');
    },
  };
  const values = [undefined, null, BigInt(42), circular, coercionFailure];
  const messages: Chat.Api.Message[] = values.map((value, index) => ({
    role: 'tool',
    toolCallId: `call-${index}`,
    toolName: 'unusualResult',
    content: { status: 'fulfilled', value },
  }));

  const input = createInput({ messages });

  expect(input.messages.map((message: Message) => message.content)).toEqual([
    '',
    '',
    '42',
    '[object Object]',
    '',
  ]);
});

test('omits Hashbrown error messages without renumbering later history', () => {
  const withError = createInput({
    messages: [
      { role: 'user', content: 'First' },
      { role: 'error', content: 'Internal failure' },
      { role: 'user', content: 'Second' },
    ],
  });
  const withoutError = createInput({
    messages: [
      { role: 'user', content: 'First' },
      { role: 'user', content: 'Second' },
    ],
  });

  expect(withError.messages).toHaveLength(2);
  expect(withError.messages.map((message: Message) => message.content)).toEqual(
    ['First', 'Second'],
  );
  expect(withError.messages[1]?.id).not.toBe(withoutError.messages[1]?.id);
});

test('maps tools to standard AG-UI declarations', () => {
  const tools: Chat.Api.Tool[] = [
    {
      name: 'getWeather',
      description: 'Get the current weather.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  ];

  const input = createInput({ tools });

  expect(input.tools).toEqual([
    {
      name: 'getWeather',
      description: 'Get the current weather.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  ] satisfies Tool[]);
});

test('adds the Hashbrown extension only for framework semantics', () => {
  const responseSchema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
  };

  const standard = createInput();
  const structured = createInput({ responseSchema });
  const ui = createInput({ ui: true });
  const structuredUi = createInput({ responseSchema, ui: true });

  expect(standard).not.toHaveProperty('hashbrown');
  expect(structured.hashbrown).toEqual({ responseSchema });
  expect(ui.hashbrown).toEqual({ ui: true });
  expect(structuredUi.hashbrown).toEqual({ responseSchema, ui: true });
});

test('creates deterministic IDs scoped by thread and original position', () => {
  const messages: Chat.Api.Message[] = [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'Second' },
  ];

  const first = createInput({ system: 'System', messages });
  const repeated = createInput({ system: 'System', messages });
  const otherThread = createInput({
    threadId: 'thread-2',
    system: 'System',
    messages,
  });

  expect(first.messages.map((message: Message) => message.id)).toEqual(
    repeated.messages.map((message: Message) => message.id),
  );
  expect(first.messages.map((message: Message) => message.id)).not.toEqual(
    otherThread.messages.map((message: Message) => message.id),
  );
  expect(
    new Set(first.messages.map((message: Message) => message.id)).size,
  ).toBe(3);
});

test('produces a standard portion accepted by RunAgentInputSchema', () => {
  const input = createInput({
    system: 'System',
    messages: [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'Calling tools.',
        toolCalls: [
          {
            index: 0,
            id: 'call-success',
            type: 'function',
            function: { name: 'echo', arguments: '{"value":"Hello"}' },
          },
          {
            index: 1,
            id: 'call-failure',
            type: 'function',
            function: { name: 'echo', arguments: '{"value":"Fail"}' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-success',
        toolName: 'echo',
        content: { status: 'fulfilled', value: 'Hello' },
      },
      {
        role: 'tool',
        toolCallId: 'call-failure',
        toolName: 'echo',
        content: { status: 'rejected', reason: new Error('Echo failed') },
      },
    ],
    tools: [
      {
        name: 'echo',
        description: 'Echo a value.',
        parameters: { type: 'object' },
      },
    ],
    responseSchema: { type: 'string' },
    ui: true,
  });
  const { hashbrown, ...standard } = input;

  const result = RunAgentInputSchema.safeParse(standard);

  expect(hashbrown).toBeDefined();
  expect(standard.messages.slice(-2).map((message) => message.id)).toEqual([
    'call-success',
    'call-failure',
  ]);
  expect(result.success).toBe(true);
});

test('does not emit legacy or provider-specific wire keys', () => {
  const input = createInput({
    responseSchema: { type: 'string' },
    ui: true,
  });
  const wire = JSON.stringify(input);

  expect(input).toMatchObject({
    threadId,
    runId,
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  });
  expect(wire).not.toContain('model');
  expect(wire).not.toContain('providerOptions');
  expect(wire).not.toContain('emulateStructuredOutput');
});
