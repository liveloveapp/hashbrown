import { EventType } from '@ag-ui/core';
import type { ChatResponse } from 'ollama';
import { mapOllamaEvents } from './ollama-events';

function createChunk(
  overrides: Omit<Partial<ChatResponse>, 'message'> & {
    message?: Partial<ChatResponse['message']>;
  } = {},
): ChatResponse {
  const { message = {}, ...response } = overrides;

  return {
    model: 'qwen3',
    created_at: new Date('2026-08-31T00:00:00.000Z'),
    message: {
      ...message,
      role: message.role ?? 'assistant',
      content: message.content ?? '',
    },
    done: false,
    done_reason: '',
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: 0,
    eval_duration: 0,
    ...response,
  };
}

async function* chunks(values: ChatResponse[]): AsyncIterable<ChatResponse> {
  for (const value of values) {
    yield value;
  }
}

async function collect(values: ChatResponse[]) {
  return Array.fromAsync(
    mapOllamaEvents({
      events: chunks(values),
      messageId: 'run-ollama:assistant',
    }),
  );
}

test('maps text chunks and preserves terminal metrics as a raw event', async () => {
  const terminal = createChunk({
    done: true,
    done_reason: 'stop',
    total_duration: 120,
    eval_count: 4,
  });

  const result = await collect([
    createChunk({ message: { content: 'Hello ' } }),
    createChunk({ message: { content: 'world.' } }),
    terminal,
  ]);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-ollama:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-ollama:assistant',
      delta: 'Hello ',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-ollama:assistant',
      delta: 'world.',
    },
    {
      type: EventType.RAW,
      source: 'ollama',
      event: terminal,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-ollama:assistant',
    },
  ]);
});

test('maps thinking to an Ollama reasoning record before text', async () => {
  const result = await collect([
    createChunk({ message: { thinking: 'I should reason. ' } }),
    createChunk({
      message: { thinking: 'Then answer.', content: 'The answer.' },
    }),
  ]);

  expect(result).toEqual([
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'run-ollama:assistant:reasoning:0',
      role: 'reasoning',
      metadata: { ollama: { thinking: true } },
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'run-ollama:assistant:reasoning:0',
      delta: 'I should reason. ',
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'run-ollama:assistant:reasoning:0',
      delta: 'Then answer.',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'run-ollama:assistant:reasoning:0',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-ollama:assistant',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-ollama:assistant',
      delta: 'The answer.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-ollama:assistant',
    },
  ]);
});

test('maps multiple Ollama tool calls with deterministic AG-UI IDs', async () => {
  const result = await collect([
    createChunk({
      message: {
        tool_calls: [
          { function: { name: 'lookup', arguments: { query: 'one' } } },
          { function: { name: 'lookup', arguments: { query: 'two' } } },
        ],
      },
    }),
  ]);

  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'run-ollama:assistant:tool:0',
      toolCallName: 'lookup',
      parentMessageId: 'run-ollama:assistant',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'run-ollama:assistant:tool:0',
      delta: '{"query":"one"}',
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'run-ollama:assistant:tool:0',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'run-ollama:assistant:tool:1',
      toolCallName: 'lookup',
      parentMessageId: 'run-ollama:assistant',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'run-ollama:assistant:tool:1',
      delta: '{"query":"two"}',
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'run-ollama:assistant:tool:1',
    },
  ]);
});

test('preserves nonterminal log probabilities as a raw event', async () => {
  const native = createChunk({
    logprobs: [{ token: 'Hello', logprob: -0.1 }],
  });

  const result = await collect([native]);

  expect(result).toEqual([
    {
      type: EventType.RAW,
      source: 'ollama',
      event: native,
    },
  ]);
});

test('rejects malformed Ollama tool calls', async () => {
  const malformed = createChunk({
    message: {
      tool_calls: [
        { function: { name: '', arguments: { query: 'hashbrown' } } },
      ],
    },
  });

  await expect(collect([malformed])).rejects.toThrow(
    'Ollama returned a tool call without a name',
  );
});

test('aborts and closes the provider iterator when the signal is cancelled', async () => {
  const abort = jest.fn();
  const close = jest.fn().mockResolvedValue({ done: true, value: undefined });
  let nextCount = 0;
  const provider = {
    abort,
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          nextCount += 1;
          if (nextCount === 1) {
            return Promise.resolve({
              done: false as const,
              value: createChunk({ message: { content: 'Hello' } }),
            });
          }
          return new Promise<IteratorResult<ChatResponse>>(() => undefined);
        },
        return: close,
      };
    },
  };
  const controller = new AbortController();
  const iterator = mapOllamaEvents({
    events: provider,
    messageId: 'run-ollama:assistant',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.next();
  const pending = iterator.next();
  controller.abort();
  const result = await pending;

  expect(result.done).toBe(true);
  expect(abort).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test('aborts and closes the provider iterator when the consumer returns early', async () => {
  const abort = jest.fn();
  const close = jest.fn().mockResolvedValue({ done: true, value: undefined });
  const provider = {
    abort,
    [Symbol.asyncIterator]() {
      return {
        next: jest.fn().mockResolvedValue({
          done: false,
          value: createChunk({ message: { content: 'Hello' } }),
        }),
        return: close,
      };
    },
  };
  const iterator = mapOllamaEvents({
    events: provider,
    messageId: 'run-ollama:assistant',
  })[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.return?.();

  expect(abort).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
