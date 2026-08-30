import type { RunAgentInput } from '@ag-ui/core';
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

function createClaimedReasoning(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reasoning-1',
    role: 'reasoning' as const,
    content: 'Visible reasoning.',
    encryptedValue: 'encrypted-value',
    metadata: { anthropic: { blockType: 'thinking' } },
    ...overrides,
  };
}

test('replays claimed Anthropic reasoning blocks before assistant text and tool use', () => {
  const input = createInput({
    messages: [
      {
        id: 'neutral-reasoning',
        role: 'reasoning',
        content: 'Display only.',
      },
      {
        id: 'other-provider-reasoning',
        role: 'reasoning',
        content: 'Other provider.',
        encryptedValue: 'other-encrypted-value',
        metadata: { openai: { blockType: 'reasoning' } },
      },
      createClaimedReasoning({
        id: 'thinking-reasoning',
        content: '',
        encryptedValue: 'thinking-signature',
      }),
      createClaimedReasoning({
        id: 'redacted-reasoning',
        content: '',
        encryptedValue: 'redacted-data',
        metadata: { anthropic: { blockType: 'redacted_thinking' } },
      }),
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'I will use a tool.',
        toolCalls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"hashbrown"}' },
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
        { type: 'thinking', thinking: '', signature: 'thinking-signature' },
        { type: 'redacted_thinking', data: 'redacted-data' },
        { type: 'text', text: 'I will use a tool.' },
        {
          type: 'tool_use',
          id: 'tool-call-1',
          name: 'lookup',
          input: { query: 'hashbrown' },
        },
      ],
    },
  ]);
});

test('uses only the maximal immediately preceding reasoning run for each assistant', () => {
  const input = createInput({
    messages: [
      createClaimedReasoning({
        id: 'orphaned-reasoning',
        metadata: { anthropic: null },
      }),
      { id: 'user-1', role: 'user', content: 'Interrupt the reasoning run.' },
      createClaimedReasoning({
        id: 'attached-reasoning',
        content: 'Attached reasoning.',
        encryptedValue: 'attached-signature',
      }),
      { id: 'assistant-1', role: 'assistant', content: 'First answer.' },
      createClaimedReasoning({
        id: 'trailing-reasoning',
        content: 'No following assistant.',
      }),
    ],
  });

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(result.messages).toEqual([
    { role: 'user', content: 'Interrupt the reasoning run.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'Attached reasoning.',
          signature: 'attached-signature',
        },
        { type: 'text', text: 'First answer.' },
      ],
    },
  ]);
});

test('rejects malformed claimed Anthropic reasoning markers', () => {
  const invalidMarkers = [
    null,
    [],
    'not-an-object',
    {},
    { blockType: 'unknown' },
  ];

  for (const marker of invalidMarkers) {
    const input = createInput({
      messages: [
        createClaimedReasoning({ metadata: { anthropic: marker } }),
        { id: 'assistant-1', role: 'assistant', content: 'Answer.' },
      ],
    });

    const act = () => createAnthropicRequestOptions(input, 'claude-test');

    expect(act).toThrow('Anthropic reasoning message "reasoning-1"');
  }
});

test('rejects incomplete claimed Anthropic continuation blocks', () => {
  const invalidReasoning = [
    createClaimedReasoning({ content: 42 }),
    createClaimedReasoning({ encryptedValue: undefined }),
    createClaimedReasoning({ encryptedValue: 42 }),
    createClaimedReasoning({ encryptedValue: '' }),
    createClaimedReasoning({
      content: 'Redacted content is not permitted.',
      metadata: { anthropic: { blockType: 'redacted_thinking' } },
    }),
  ];

  for (const reasoning of invalidReasoning) {
    const input = createInput({
      messages: [
        reasoning,
        { id: 'assistant-1', role: 'assistant', content: 'Answer.' },
      ],
    });

    const act = () => createAnthropicRequestOptions(input, 'claude-test');

    expect(act).toThrow('Anthropic reasoning message "reasoning-1"');
  }
});

test('does not mutate claimed reasoning history', () => {
  const input = createInput({
    messages: [
      createClaimedReasoning({
        content: '',
        encryptedValue: 'thinking-signature',
      }),
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Answer.',
      },
    ],
  });
  const snapshot = structuredClone(input);

  const result = createAnthropicRequestOptions(input, 'claude-test');

  expect(input).toEqual(snapshot);
  expect(result.messages[0]).not.toBe(input.messages[1]);
  expect((result.messages[0]?.content as unknown[])[0]).not.toBe(
    input.messages[0],
  );
});
