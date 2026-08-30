import type { RunAgentInput } from '@ag-ui/core';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicRequestOptions } from './anthropic-request';

type TestRunAgentInput = RunAgentInput & {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
};

function createInput(
  overrides: Partial<TestRunAgentInput> = {},
): TestRunAgentInput {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    state: {},
    messages: [],
    tools: [],
    context: [],
    forwardedProps: {},
    ...overrides,
  };
}

function requireClientTool(
  tool: Anthropic.Messages.ToolUnion | undefined,
): Anthropic.Messages.Tool {
  if (!tool || !('input_schema' in tool)) {
    throw new Error('Expected an Anthropic client tool');
  }

  return tool;
}

test('creates fresh streaming options with the server-owned model', () => {
  const input = createInput({
    messages: [{ id: 'user-1', role: 'user', content: 'Hello, Claude.' }],
    forwardedProps: { model: 'client-model' },
  });

  const result = createAnthropicRequestOptions(input, 'server-model');

  expect(result).toEqual({
    stream: true,
    model: 'server-model',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'Hello, Claude.' }],
  });
  expect(result).not.toBe(input);
});

test('extracts system and developer messages in transcript order', () => {
  const input = createInput({
    messages: [
      { id: 'system-1', role: 'system', content: 'System one.' },
      { id: 'user-1', role: 'user', content: 'First question.' },
      { id: 'developer-1', role: 'developer', content: 'Developer two.' },
      { id: 'system-2', role: 'system', content: 'System three.' },
      { id: 'user-2', role: 'user', content: 'Second question.' },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.system).toBe('System one.\n\nDeveloper two.\n\nSystem three.');
  expect(result.messages).toEqual([
    { role: 'user', content: 'First question.' },
    { role: 'user', content: 'Second question.' },
  ]);
});

test('omits the system field when the transcript has no instructions', () => {
  const input = createInput();

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result).not.toHaveProperty('system');
});

test('rejects structured user content', () => {
  const input = createInput({
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: [{ type: 'text', text: 'Structured text.' }],
      },
    ],
  });

  const act = () => createAnthropicRequestOptions(input, 'claude-test');

  expect(act).toThrow(
    'Anthropic provider currently requires text user content',
  );
});

test('maps assistant text and tool calls to Anthropic content blocks', () => {
  const input = createInput({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'I will use two tools.',
        toolCalls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
          },
          {
            id: 'tool-call-2',
            type: 'function',
            function: { name: 'broken', arguments: '{not-json' },
          },
        ],
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'I will use two tools.' },
        {
          type: 'tool_use',
          id: 'tool-call-1',
          name: 'lookup',
          input: { query: 'hashbrown' },
        },
        {
          type: 'tool_use',
          id: 'tool-call-2',
          name: 'broken',
          input: '{not-json',
        },
      ],
    },
  ]);
});

test('keeps a tool-only assistant message valid', () => {
  const input = createInput({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        toolCalls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tool-call-1',
          name: 'lookup',
          input: {},
        },
      ],
    },
  ]);
});

test('keeps an empty assistant message valid', () => {
  const input = createInput({
    messages: [{ id: 'assistant-1', role: 'assistant' }],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([{ role: 'assistant', content: '' }]);
});

test('maps successful AG-UI tool messages to Anthropic tool results', () => {
  const input = createInput({
    messages: [
      {
        id: 'tool-1',
        role: 'tool',
        toolCallId: 'tool-call-1',
        content: '{"temperature":72}',
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-call-1',
          content: '{"temperature":72}',
        },
      ],
    },
  ]);
});

test('marks AG-UI tool errors as Anthropic tool result errors', () => {
  const input = createInput({
    messages: [
      {
        id: 'tool-1',
        role: 'tool',
        toolCallId: 'tool-call-1',
        content: 'Lookup failed.',
        error: '',
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-call-1',
          content: 'Lookup failed.',
          is_error: true,
        },
      ],
    },
  ]);
});

test('filters activity and reasoning messages', () => {
  const input = createInput({
    messages: [
      {
        id: 'activity-1',
        role: 'activity',
        activityType: 'progress',
        content: { label: 'Working' },
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Display-only reasoning.',
      },
      { id: 'user-1', role: 'user', content: 'Visible message.' },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    { role: 'user', content: 'Visible message.' },
  ]);
});

test('maps tools and supplies an empty object schema when parameters are absent', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
  };
  const input = createInput({
    tools: [
      {
        name: 'weather',
        description: 'Get the weather.',
        parameters: schema,
      },
      {
        name: 'clock',
        description: 'Get the time.',
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.tools).toEqual([
    {
      name: 'weather',
      description: 'Get the weather.',
      input_schema: schema,
    },
    {
      name: 'clock',
      description: 'Get the time.',
      input_schema: { type: 'object', properties: {} },
    },
  ]);
});

test('rejects null, array, and non-object tool parameters', () => {
  const invalidParameters = [null, [], 'not-a-schema'];

  const actions = invalidParameters.map(
    (parameters) => () =>
      createAnthropicRequestOptions(
        createInput({
          tools: [
            {
              name: 'invalid',
              description: 'Invalid tool.',
              parameters,
            },
          ],
        }),
        'claude-test',
      ),
  );

  for (const act of actions) {
    expect(act).toThrow(
      'Anthropic tool "invalid" at index 0 parameters must be a non-null, non-array object',
    );
  }
});

test('rejects tool parameters whose root type is not object', () => {
  const input = createInput({
    tools: [
      {
        name: 'invalid',
        description: 'Invalid tool.',
        parameters: { type: 'array', items: { type: 'string' } },
      },
    ],
  });

  const act = () => createAnthropicRequestOptions(input, 'claude-test');

  expect(act).toThrow(
    'Anthropic tool "invalid" at index 0 parameters must have type "object"',
  );
});

test('does not perform full JSON Schema validation', () => {
  const minimallyValidSchema = {
    type: 'object' as const,
    properties: 'Anthropic accepts this field as unknown',
    required: 42,
  };
  const input = createInput({
    tools: [
      {
        name: 'minimal',
        description: 'Minimally valid root schema.',
        parameters: minimallyValidSchema,
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  const mappedTool = requireClientTool(result.tools?.[0]);

  expect(mappedTool.input_schema).toEqual(minimallyValidSchema);
  expect(mappedTool.input_schema).not.toBe(minimallyValidSchema);
});

test('isolates mapped tool schemas from later source mutations', () => {
  const schema = {
    type: 'object' as const,
    properties: { city: { type: 'string' } },
  };
  const input = createInput({
    tools: [
      {
        name: 'weather',
        description: 'Get the weather.',
        parameters: schema,
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');
  const mappedSchema = requireClientTool(result.tools?.[0])
    .input_schema as typeof schema;
  schema.properties.city.type = 'number';

  expect(mappedSchema.properties.city.type).toBe('string');
});

test('isolates source tool schemas from later request mutations', () => {
  const schema = {
    type: 'object' as const,
    properties: { city: { type: 'string' } },
  };
  const input = createInput({
    tools: [
      {
        name: 'weather',
        description: 'Get the weather.',
        parameters: schema,
      },
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');
  const mappedSchema = requireClientTool(result.tools?.[0])
    .input_schema as typeof schema;
  mappedSchema.properties.city.type = 'number';

  expect(schema.properties.city.type).toBe('string');
});

test('identifies the tool when its parameters cannot be cloned', () => {
  const input = createInput({
    tools: [
      {
        name: 'unclonable',
        description: 'Contains a non-cloneable schema value.',
        parameters: {
          type: 'object',
          customKeyword: () => undefined,
        },
      },
    ],
  });

  const act = () => createAnthropicRequestOptions(input, 'claude-test');

  expect(act).toThrow(
    'Failed to clone parameters for Anthropic tool "unclonable" at index 0',
  );
});

test('maps Hashbrown response metadata to native JSON schema output without changing prompts or tools', () => {
  const responseSchema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  };
  const input = createInput({
    messages: [
      { id: 'system-1', role: 'system', content: 'Be concise.' },
      { id: 'user-1', role: 'user', content: 'Give an answer.' },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Look up an answer.',
        parameters: { type: 'object', properties: {} },
      },
    ],
    hashbrown: { responseSchema, ui: true },
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.output_config).toEqual({
    format: { type: 'json_schema', schema: responseSchema },
  });
  expect(result.system).toBe('Be concise.');
  expect(result.messages).toEqual([
    { role: 'user', content: 'Give an answer.' },
  ]);
  expect(result.tools).toHaveLength(1);
});

test('isolates the native response schema from result and source mutations', () => {
  const responseSchema = {
    type: 'object',
    metadata: { source: 'input' },
    properties: { answer: { type: 'string' } },
  };
  const input = createInput({
    hashbrown: { responseSchema, ui: true },
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');
  const mappedSchema = result.output_config?.format
    ?.schema as typeof responseSchema;

  expect(mappedSchema).toBeDefined();
  if (!mappedSchema) {
    return;
  }

  mappedSchema.properties.answer.type = 'number';
  mappedSchema.metadata.source = 'transform';
  expect(responseSchema.properties.answer.type).toBe('string');
  expect(responseSchema.metadata.source).toBe('input');

  responseSchema.properties.answer.type = 'boolean';
  responseSchema.metadata.source = 'source';
  expect(mappedSchema.properties.answer.type).toBe('number');
  expect(mappedSchema.metadata.source).toBe('transform');
});

test('does not mutate the input, messages, tool calls, schemas, or metadata', () => {
  const schema = {
    type: 'object' as const,
    properties: { query: { type: 'string' } },
  };
  const responseSchema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
  };
  const input = createInput({
    messages: [
      { id: 'system-1', role: 'system', content: 'Be concise.' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Looking it up.',
        toolCalls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"value"}' },
          },
        ],
      },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Look up a value.',
        parameters: schema,
      },
    ],
    hashbrown: { responseSchema, ui: true },
  });
  const snapshot = structuredClone(input);

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(input).toEqual(snapshot);
  expect(input.tools[0]?.parameters).toBe(schema);
  expect(input.hashbrown?.responseSchema).toBe(responseSchema);
  expect(result.messages).not.toBe(input.messages);
  expect(result.messages[0]).not.toBe(input.messages[1]);
  expect(result.tools).not.toBe(input.tools);
  expect(result.tools?.[0]).not.toBe(input.tools[0]);
  expect(result.output_config?.format?.schema).not.toBe(responseSchema);
});
