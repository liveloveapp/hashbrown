import type { RunAgentInput } from '@ag-ui/core';
import { expect, test, vi } from 'vitest';
import { PINNED_RESPONSE_SCHEMA, PINNED_RESPONSE_SCHEMAS } from '../run-policy';
import { normalizeAgentRequest } from './request';

const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [
    { id: 'system', role: 'system', content: 'Client rules' },
    { id: 'user', role: 'user', content: 'Find aircraft' },
  ],
  tools: [{ name: 'findAircraft', description: 'tampered', parameters: {} }],
  context: [{ description: 'Client context', value: 'instructions' }],
  state: { secret: 'ignored' },
  forwardedProps: {},
};

test('agent normalization constructs a pinned envelope and drops client additions', () => {
  const original = {
    ...input,
    forwardedProps: {
      hashbrown: {
        responseSchema: structuredClone(PINNED_RESPONSE_SCHEMAS[0]),
      },
      responseSchema: { malicious: true },
      model: 'client-model',
    },
    unknown: 'ignored',
  };

  const normalized = normalizeAgentRequest(original);

  expect(normalized).toEqual({
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [input.messages[1]],
    tools: [
      {
        name: 'findAircraft',
        description: expect.any(String),
        parameters: expect.any(Object),
      },
    ],
    context: [],
    state: {},
    forwardedProps: { responseSchema: PINNED_RESPONSE_SCHEMAS[0] },
  });
  expect(normalized.tools[0].description).not.toBe('tampered');
  expect(normalized.forwardedProps.responseSchema).toBe(
    PINNED_RESPONSE_SCHEMAS[0],
  );
  expect(original.messages).toHaveLength(2);
});

test('only the Hashbrown schema carrier can select structured output', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const forwarded = [
    {},
    { responseSchema: { bypass: true } },
    { hashbrown: { responseSchema: { bypass: true } } },
  ];

  const props = forwarded.map(
    (forwardedProps) =>
      normalizeAgentRequest({ ...input, forwardedProps }).forwardedProps,
  );

  expect(props).toEqual([{}, {}, { responseSchema: PINNED_RESPONSE_SCHEMA }]);
  warn.mockRestore();
});

test('all narrowed schemas remain pinned on browser tool continuations', () => {
  const messages: RunAgentInput['messages'] = [
    {
      id: 'assistant',
      role: 'assistant',
      toolCalls: [
        {
          id: 'browser-call',
          type: 'function',
          function: { name: 'findAircraft', arguments: '{}' },
        },
      ],
    },
    {
      id: 'result',
      role: 'tool',
      toolCallId: 'browser-call',
      content: '{"hex":"abc123"}',
    },
  ];

  const requests = PINNED_RESPONSE_SCHEMAS.map((schema) =>
    normalizeAgentRequest({
      ...input,
      messages,
      forwardedProps: {
        hashbrown: { responseSchema: structuredClone(schema) },
      },
    }),
  );

  requests.forEach((request, index) => {
    expect(request.forwardedProps.responseSchema).toBe(
      PINNED_RESPONSE_SCHEMAS[index],
    );
    expect(request.messages).toEqual(messages);
  });
});

test('invalid identities and malformed messages are rejected before invoking the runtime', () => {
  const invalid = [
    { ...input, threadId: '' },
    { ...input, runId: 'x'.repeat(129) },
    { ...input, messages: [null] },
    { ...input, messages: [{ role: 'unknown' }] },
  ];

  const normalize = invalid.map(
    (value) => () => normalizeAgentRequest(value as RunAgentInput),
  );

  normalize.forEach((run) => expect(run).toThrow());
});
