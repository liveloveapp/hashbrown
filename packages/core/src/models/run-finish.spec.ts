import { EventType } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  ɵcreateRunFinishedEvent,
  ɵcreateTokenUsage,
  ɵreadFinishReason,
  ɵreadTokenUsage,
} from './run-finish';

test('builds a RUN_FINISHED with usage and the normalized and raw reasons', () => {
  const usage = ɵcreateTokenUsage({
    provider: 'anthropic',
    model: 'claude-test',
    inputTokens: 12,
    outputTokens: 3,
  });

  const event = ɵcreateRunFinishedEvent({
    threadId: 'thread-1',
    runId: 'run-1',
    finishReason: 'length',
    provider: 'anthropic',
    providerMetadata: { stopReason: 'max_tokens' },
    usage,
  });

  expect(event).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
    usage: [
      {
        provider: 'anthropic',
        model: 'claude-test',
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
      },
    ],
    metadata: {
      hashbrown: { finishReason: 'length' },
      anthropic: { stopReason: 'max_tokens' },
    },
  });
  expect(EventSchemas.parse(event)).toEqual(event);
});

test('omits usage and provider metadata the provider did not report', () => {
  const event = ɵcreateRunFinishedEvent({
    threadId: 'thread-1',
    runId: 'run-1',
    finishReason: 'stop',
    provider: 'ollama',
  });

  expect(event).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
    metadata: { hashbrown: { finishReason: 'stop' } },
  });
});

test('drops absent and invalid counts and totals only what it has', () => {
  const partial = ɵcreateTokenUsage({
    provider: 'google',
    inputTokens: 7,
    outputTokens: undefined,
    reasoningTokens: Number.NaN,
  });
  const empty = ɵcreateTokenUsage({ provider: 'google' });

  expect(partial).toEqual({ provider: 'google', inputTokens: 7 });
  expect(empty).toBeUndefined();
});

test('reads a known finish reason and treats an unknown one as other', () => {
  const known = { metadata: { hashbrown: { finishReason: 'tool_calls' } } };
  const unknown = { metadata: { hashbrown: { finishReason: 'paused' } } };
  const absent = { metadata: { anthropic: { stopReason: 'end_turn' } } };

  expect(ɵreadFinishReason(known)).toBe('tool_calls');
  expect(ɵreadFinishReason(unknown)).toBe('other');
  expect(ɵreadFinishReason(absent)).toBeUndefined();
  expect(ɵreadFinishReason({})).toBeUndefined();
});

test('reads usage entries and skips malformed ones', () => {
  const event = {
    usage: [
      { provider: 'openai', inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      'not usage',
      { provider: 'openai', inputTokens: 'four' },
    ],
  };

  const usage = ɵreadTokenUsage(event);

  expect(usage).toEqual([
    { provider: 'openai', inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    { provider: 'openai' },
  ]);
  expect(Object.isFrozen(usage)).toBe(true);
  expect(Object.isFrozen(usage?.[0])).toBe(true);
  expect(ɵreadTokenUsage({})).toBeUndefined();
  expect(ɵreadTokenUsage({ usage: [] })).toBeUndefined();
});
