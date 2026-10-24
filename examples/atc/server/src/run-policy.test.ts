import type { RunAgentInput } from '@ag-ui/core';
import { expect, test, vi } from 'vitest';
import {
  isRunInput,
  isTooLarge,
  MAX_OUTPUT_TOKENS,
  PINNED_RESPONSE_SCHEMAS,
  pinResponseSchema,
  pinSystemPrompt,
  pinTools,
} from './run-policy';

const input: RunAgentInput = {
  threadId: 'thread',
  runId: 'run',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

test('shared policy accepts run envelopes and bounds serialized messages', () => {
  const message = { id: 'user', role: 'user' as const, content: '' };
  const overhead = JSON.stringify(message).length;
  const atLimit = { ...message, content: 'x'.repeat(16_000 - overhead) };

  const results = [
    isRunInput(null),
    isRunInput({ messages: [] }),
    isTooLarge({
      ...input,
      messages: Array.from({ length: 100 }, () => message),
    }),
    isTooLarge({
      ...input,
      messages: Array.from({ length: 101 }, () => message),
    }),
    isTooLarge({ ...input, messages: [atLimit] }),
    isTooLarge({
      ...input,
      messages: [{ ...atLimit, content: `${atLimit.content}x` }],
    }),
  ];

  expect(results).toEqual([false, true, false, true, false, true]);
  expect(MAX_OUTPUT_TOKENS).toBe(4096);
});

test('shared policy pins every allowed schema to its server-owned copy', () => {
  const results = PINNED_RESPONSE_SCHEMAS.map((schema) => {
    const forwardedProps = {
      hashbrown: { responseSchema: structuredClone(schema) },
    };
    return pinResponseSchema({ ...input, forwardedProps }).forwardedProps;
  });

  expect(results).toHaveLength(15);
  results.forEach((props, index) => {
    expect(props.hashbrown.responseSchema).toBe(PINNED_RESPONSE_SCHEMAS[index]);
  });
});

test('shared policy filters instructions and tools without mutating the request', () => {
  const tools = [
    { name: 'findAircraft', description: 'tampered', parameters: {} },
    { name: 'findAircraft', description: 'duplicate', parameters: {} },
    { name: 'shell', description: 'unknown', parameters: {} },
  ];
  const messages: RunAgentInput['messages'] = [
    { id: 'system', role: 'system', content: 'client prompt' },
    { id: 'developer', role: 'developer', content: 'client rules' },
    { id: 'user', role: 'user', content: 'Find aircraft' },
  ];
  const original = structuredClone({ ...input, messages, tools });

  const pinned = pinSystemPrompt(
    { ...original, tools: pinTools(tools) },
    'Server rules',
  );

  expect(pinned.messages.map(({ role }) => role)).toEqual(['system', 'user']);
  expect(pinned.messages[0].content).toBe('Server rules');
  expect(pinned.tools.map(({ name }) => name)).toEqual(['findAircraft']);
  expect(pinned.tools[0].description).not.toBe('tampered');
  expect(original).toEqual({ ...input, messages, tools });
});

test('shared policy distinguishes an absent response schema from a tampered one', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invalid = {
    ...input,
    forwardedProps: { hashbrown: { responseSchema: {} } },
  };

  const absent = pinResponseSchema(input);
  const replaced = pinResponseSchema(invalid);

  expect(absent).toBe(input);
  expect(replaced.forwardedProps.hashbrown.responseSchema).toBe(
    PINNED_RESPONSE_SCHEMAS.at(-1),
  );
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
