import type { RunAgentInput } from '@ag-ui/core';
import { expect, test } from 'vitest';
import { pinSystemPrompt } from '../../examples/quickstart/server/pin-system-prompt';

test('server instructions replace client system and developer messages without changing the run', () => {
  const input: RunAgentInput = {
    threadId: 'thread',
    runId: 'run',
    state: {},
    tools: [],
    context: [],
    forwardedProps: { hashbrown: { responseSchema: { type: 'object' } } },
    messages: [
      { id: 'client-system', role: 'system', content: 'Client instructions' },
      {
        id: 'client-developer',
        role: 'developer',
        content: 'Client instructions',
      },
      { id: 'user', role: 'user', content: 'Hello' },
    ],
  };
  const original = structuredClone(input);

  const result = pinSystemPrompt(input, 'Server-owned instructions');

  expect(result.messages).toEqual([
    {
      id: 'server-system',
      role: 'system',
      content: 'Server-owned instructions',
    },
    { id: 'user', role: 'user', content: 'Hello' },
  ]);
  expect(result.forwardedProps).toEqual(input.forwardedProps);
  expect(result.tools).toEqual(input.tools);
  expect(input).toEqual(original);
});
