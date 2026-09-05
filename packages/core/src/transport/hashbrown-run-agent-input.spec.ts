import { type Message, RunAgentInputSchema, type Tool } from '@ag-ui/core';
import { Chat } from '../models';
import { createCanonicalRunAgentInput } from './hashbrown-run-agent-input';

const threadId = 'thread-1';
const runId = 'run-1';

function createInput(
  overrides: Partial<Parameters<typeof createCanonicalRunAgentInput>[0]> = {},
) {
  return createCanonicalRunAgentInput({
    threadId,
    runId,
    messages: [],
    state: undefined,
    tools: [],
    ui: false,
    ...overrides,
  });
}

test('passes the owned canonical message checkpoint through unchanged', () => {
  const metadata = Object.freeze({ provider: Object.freeze({ turn: 7 }) });
  const messages = Object.freeze([
    Object.freeze({
      id: 'configured-system',
      role: 'system' as const,
      content: 'Use the canonical history.',
      metadata,
    }),
    Object.freeze({
      id: 'developer-policy',
      role: 'developer' as const,
      content: 'Retain protocol fields.',
    }),
    Object.freeze({
      id: 'reasoning-from-agent',
      role: 'reasoning' as const,
      content: 'Need a lookup.',
      encryptedValue: 'opaque-reasoning',
      metadata,
    }),
    Object.freeze({
      id: 'user-from-agent',
      role: 'user' as const,
      content: 'Continue.',
    }),
    Object.freeze({
      id: 'assistant-from-agent',
      role: 'assistant' as const,
      content: 'Working.',
      metadata,
      toolCalls: [
        {
          id: 'call-from-agent',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
          metadata,
        },
      ],
    }),
    Object.freeze({
      id: 'result-from-agent',
      role: 'tool' as const,
      toolCallId: 'call-from-agent',
      content: 'done',
      metadata,
    }),
    Object.freeze({
      id: 'activity-from-agent',
      role: 'activity' as const,
      activityType: 'lookup-progress',
      content: { stage: 'complete' },
      metadata,
    }),
  ]) satisfies readonly Readonly<Message>[];

  const input = createInput({ messages });

  expect(input.messages).toBe(messages);
  expect(input.messages).toEqual(messages);
  expect(input.messages.map((message) => message.id)).toEqual([
    'configured-system',
    'developer-policy',
    'reasoning-from-agent',
    'user-from-agent',
    'assistant-from-agent',
    'result-from-agent',
    'activity-from-agent',
  ]);
  expect(input.messages.map((message) => message.role)).toEqual([
    'system',
    'developer',
    'reasoning',
    'user',
    'assistant',
    'tool',
    'activity',
  ]);
  expect(input.messages[0]?.metadata).toBe(metadata);
  expect(input.messages[2]?.metadata).toBe(metadata);
});

test.each([
  { label: 'string', state: 'ready' },
  { label: 'number', state: 42 },
  { label: 'boolean', state: true },
  { label: 'null', state: null },
  { label: 'array', state: ['ready', 42] },
  {
    label: 'object',
    state: { phase: 'ready', nested: [1, 2] },
  },
])('passes an owned $label state checkpoint through unchanged', ({ state }) => {
  const input = createInput({ state });

  expect(input.state).toBe(state);
});

test('retains undefined state in memory and omits it from JSON', () => {
  const input = createInput({ state: undefined });
  const serialized = JSON.parse(JSON.stringify(input)) as Record<
    string,
    unknown
  >;

  expect(input.state).toBeUndefined();
  expect(Object.hasOwn(serialized, 'state')).toBe(false);
});

test('maps tools to standard AG-UI declarations', () => {
  const tools: Chat.Api.Tool[] = [
    {
      name: 'lookup',
      description: 'Look up a value.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    },
  ];

  const input = createInput({ tools });

  expect(input.tools).toEqual([
    {
      name: 'lookup',
      description: 'Look up a value.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
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

test('produces a standard portion accepted by RunAgentInputSchema', () => {
  const input = createInput({
    messages: [
      { id: 'user-1', role: 'user', content: 'Hello' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Calling a tool.',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'echo', arguments: '{"value":"Hello"}' },
          },
        ],
      },
      {
        id: 'tool-result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: 'Hello',
      },
    ],
    state: { phase: 'ready' },
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
    state: undefined,
    forwardedProps: {},
  });
  expect(wire).not.toContain('model');
  expect(wire).not.toContain('providerOptions');
  expect(wire).not.toContain('emulateStructuredOutput');
});
