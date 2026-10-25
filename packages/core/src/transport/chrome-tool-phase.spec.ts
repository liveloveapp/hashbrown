import { prepareChromeToolMessages } from './chrome-tool-messages';
import {
  type ChromeToolsTurnContext,
  selectChromeToolPhase,
} from './chrome-tool-phase';
import type { RunAgentInput } from '@ag-ui/core';

function input(): RunAgentInput {
  return {
    threadId: 'thread',
    runId: 'run',
    context: [],
    state: {},
    tools: [
      { name: 'lookup', description: 'Lookup', parameters: { type: 'object' } },
    ],
    messages: [
      { id: 'old', role: 'user', content: 'old' },
      {
        id: 'a',
        role: 'assistant',
        toolCalls: [
          {
            id: 'old-call',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { id: 'b', role: 'tool', toolCallId: 'old-call', content: 'old result' },
      { id: 'current', role: 'user', content: 'current' },
      {
        id: 'c',
        role: 'assistant',
        toolCalls: [
          {
            id: 'call',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"nested":{"values":[1]}}',
            },
          },
        ],
      },
      {
        id: 'd',
        role: 'tool',
        toolCallId: 'call',
        content: '{"error":"raw"}',
        error: 'failed',
      },
    ],
  };
}

test('owns and deeply freezes current original user turn and raw error results', () => {
  const source = input();
  const selector = jest.fn((context: ChromeToolsTurnContext) => {
    void context;
    return { type: 'finalize' as const };
  });

  const phase = selectChromeToolPhase(
    source,
    prepareChromeToolMessages(source),
    selector,
  );

  expect(phase).toEqual({ type: 'finalize' });
  expect(selector).toHaveBeenCalledTimes(1);
  const context = selector.mock.calls[0]?.[0];
  expect(context).toEqual({
    threadId: 'thread',
    runId: 'run',
    userMessage: { id: 'current', content: 'current' },
    completedCalls: [
      {
        callId: 'call',
        name: 'lookup',
        arguments: { nested: { values: [1] } },
        result: { type: 'error', text: '{"error":"raw"}' },
      },
    ],
  });
  const frozen = (value: unknown): void => {
    if (value && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    }
  };
  frozen(context);
  expect(Object.isFrozen(source.messages)).toBe(false);
});

test.each([
  null,
  undefined,
  {},
  { type: 'tool' },
  { type: 'tool', name: 'unknown' },
  { type: 'other' },
])('rejects malformed or unknown decisions %p', (decision) => {
  const source = input();

  expect(() =>
    selectChromeToolPhase(
      source,
      prepareChromeToolMessages(source),
      (() => decision) as never,
    ),
  ).toThrow();
});

test('requires an actual canonical user and propagates selector errors', () => {
  const source = input();
  source.messages = [];
  const selector = jest.fn((context: ChromeToolsTurnContext) => {
    void context;
    return { type: 'finalize' as const };
  });

  expect(() =>
    selectChromeToolPhase(source, prepareChromeToolMessages(source), selector),
  ).toThrow();
  expect(selector).not.toHaveBeenCalled();
  const valid = input();
  const error = new Error('application policy');
  expect(() =>
    selectChromeToolPhase(valid, prepareChromeToolMessages(valid), () => {
      throw error;
    }),
  ).toThrow(error);
});

test('success text remains raw even when its JSON claims an error and decisions are owned', () => {
  const source = input();
  source.messages[source.messages.length - 1] = {
    id: 'd',
    role: 'tool',
    toolCallId: 'call',
    content: '{"error":true}',
  };
  const decision = { type: 'tool' as const, name: 'lookup' };
  const selector = jest.fn((context: ChromeToolsTurnContext) => {
    void context;
    return decision;
  });

  const result = selectChromeToolPhase(
    source,
    prepareChromeToolMessages(source),
    selector,
  );
  decision.name = 'changed';

  expect(selector.mock.calls[0][0].completedCalls[0].result).toEqual({
    type: 'success',
    text: '{"error":true}',
  });
  expect(result).toEqual({ type: 'tool', name: 'lookup' });
  expect(Object.isFrozen(result)).toBe(true);
});
