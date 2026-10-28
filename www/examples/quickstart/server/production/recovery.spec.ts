import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { expect, test } from 'vitest';
import { projectInterrupts, projectMessages } from './recovery';

test('projects original message and tool identities without inventing provenance', () => {
  const messages = [
    new HumanMessage({ id: 'u1', content: 'Plan' }),
    new AIMessage({
      id: 'a1',
      content: '',
      tool_calls: [{ id: 't1', name: 'acceptPlan', args: {} }],
    }),
    new ToolMessage({ id: 'r1', content: 'accepted', tool_call_id: 't1' }),
  ];

  const result = projectMessages(messages);

  expect(result).toEqual([
    { id: 'u1', role: 'user', content: 'Plan' },
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'acceptPlan', arguments: '{}' },
        },
      ],
    },
    { id: 'r1', role: 'tool', content: 'accepted', toolCallId: 't1' },
  ]);
  expect(() => projectMessages([new HumanMessage('missing id')])).toThrow();
  expect(() =>
    projectMessages([
      new AIMessage({
        id: 'x',
        content: [{ type: 'image_url', image_url: 'x' }],
      }),
    ]),
  ).toThrow();
});

test('preserves native approval envelope and rejects unsupported pending writes', () => {
  const value = {
    interruptId: 'i1',
    type: 'permission-request',
    kind: 'tool',
    toolCallId: 't1',
    grant: 'opaque-grant',
    allowAlways: false,
    detail: { tool: 'acceptPlan' },
  };

  const interrupts = projectInterrupts([
    ['task', '__interrupt__', { id: 'a'.repeat(32), value }],
  ]);

  expect(interrupts[0].metadata).toEqual(value);
  expect(interrupts[0].responseSchema).toEqual({
    type: 'string',
    enum: ['once', 'deny'],
  });
  expect(() => projectInterrupts([['task', 'messages', []]])).toThrow();
});

test('refuses native malformed resume keys and duplicate parked identities', () => {
  const envelope = {
    interruptId: 'i1',
    type: 'permission-request',
    kind: 'tool',
    toolCallId: 't1',
    grant: 'opaque-grant',
    allowAlways: false,
  };
  const park = [
    'task',
    '__interrupt__',
    { id: 'a'.repeat(32), value: envelope },
  ];

  expect(() =>
    projectInterrupts([
      ['task', '__interrupt__', { id: 'malformed', value: envelope }],
    ]),
  ).toThrow();
  expect(() => projectInterrupts([park, park])).toThrow();
  expect(() =>
    projectMessages([
      new AIMessage({
        id: 'a1',
        content: '',
        tool_calls: [
          { id: 'duplicate', name: 'acceptPlan', args: {} },
          { id: 'duplicate', name: 'acceptPlan', args: {} },
        ],
      }),
    ]),
  ).toThrow();
});
