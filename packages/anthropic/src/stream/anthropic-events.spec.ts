import { type AGUIEvent, EventType } from '@ag-ui/core';
import { mapAnthropicEvents } from './anthropic-events';
import {
  collectEvents,
  collectIterable,
  contentStop,
  deepFreeze,
  messageDelta,
  messageStart,
  messageStop,
  rawEvent,
  type RawEvent,
} from './anthropic-events.test-utils';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
}

function withFailureTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for deterministic test operation'));
    }, 1000);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function textStart(index: number, text = ''): RawEvent {
  return {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text, citations: null },
  };
}

function toolStart(
  index: number,
  id: string,
  name: string,
  input: unknown,
): RawEvent {
  return {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      id,
      name,
      input,
      caller: { type: 'direct' },
    },
  };
}

function textDelta(index: number, text: string): RawEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  };
}

function inputJsonDelta(index: number, partialJson: string): RawEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: partialJson },
  };
}

function createTrackedSource(events: readonly RawEvent[]) {
  const state = {
    nextCalls: 0,
    returnCalls: 0,
    returnCompleted: false,
  };
  let index = 0;
  const iterable: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<RawEvent>> {
          state.nextCalls += 1;
          if (index >= events.length) {
            return { done: true, value: undefined };
          }

          const value = events[index];
          index += 1;
          return { done: false, value };
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          state.returnCalls += 1;
          await Promise.resolve();
          state.returnCompleted = true;
          return { done: true, value: undefined };
        },
      };
    },
  };

  return { iterable, state };
}

test('maps one text block to one AG-UI text lifecycle', async () => {
  const events = [
    messageStart(),
    textStart(0),
    textDelta(0, 'Hello'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'Hello',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('emits no text lifecycle for an empty text block without deltas', async () => {
  const events = [messageStart(), textStart(0), contentStop(0), messageStop()];

  const result = await collectEvents(events);

  expect(result).toEqual([]);
});

test('emits nonempty initial text before later text deltas', async () => {
  const events = [
    messageStart(),
    textStart(0, 'Hello'),
    textDelta(0, ', '),
    textDelta(0, 'world'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'Hello',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: ', ',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'world',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('shares one AG-UI text lifecycle across multiple text blocks', async () => {
  const events = [
    messageStart(),
    textStart(0, 'First'),
    contentStop(0),
    textStart(1),
    textDelta(1, ' second'),
    contentStop(1),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'First',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: ' second',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('maps streamed tool arguments to an AG-UI tool lifecycle', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', {}),
    inputJsonDelta(0, '{"query":'),
    inputJsonDelta(0, '"hashbrown"}'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"query":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '"hashbrown"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('emits initial tool input as fallback when no deltas arrive', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', { query: 'initial' }),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"query":"initial"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('emits an empty initial tool input as fallback', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', {}),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('uses streamed tool deltas instead of initial input without duplication', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', { query: 'initial' }),
    inputJsonDelta(0, '{"query":'),
    inputJsonDelta(0, '"streamed"}'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);
  const argumentsValue = result
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');

  expect(argumentsValue).toBe('{"query":"streamed"}');
  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"query":',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '"streamed"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('maps interleaved text and multiple tools by content index', async () => {
  const events = [
    messageStart(),
    textStart(0, 'A'),
    toolStart(1, 'tool-1', 'first', {}),
    toolStart(2, 'tool-2', 'second', {}),
    inputJsonDelta(2, '{"second":true}'),
    textDelta(0, 'B'),
    inputJsonDelta(1, '{"first":true}'),
    contentStop(1),
    contentStop(0),
    contentStop(2),
    messageDelta(),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'A',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'first',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-2',
      toolCallName: 'second',
      parentMessageId: 'assistant-message-1',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-2',
      delta: '{"second":true}',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'B',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"first":true}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-2' },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('does not mutate source events or nested content blocks', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', {
      query: 'hashbrown',
      filters: { active: true },
    }),
    inputJsonDelta(0, '{"query":"streamed"}'),
    contentStop(0),
    messageStop(),
  ];
  const expected = structuredClone(events);
  deepFreeze(events);

  await collectEvents(events);

  expect(events).toEqual(expected);
});

test('allows multiple message_delta events when no content block is open', async () => {
  const events = [
    messageStart(),
    messageDelta(),
    messageDelta(),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([]);
});

test('rejects an event before message_start', async () => {
  const events = [textStart(0), messageStart(), contentStop(0), messageStop()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic event content_block_start received before message_start',
  );
});

test('rejects duplicate message_start events', async () => {
  const events = [messageStart(), messageStart(), messageStop()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic stream received duplicate message_start',
  );
});

test('rejects an event after message_stop', async () => {
  const events = [messageStart(), messageStop(), messageDelta()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic event message_delta received after message_stop',
  );
});

test('rejects a duplicate active content index', async () => {
  const events = [messageStart(), textStart(0), textStart(0)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content index 0 started more than once',
  );
});

test('rejects a reused stopped content index', async () => {
  const events = [
    messageStart(),
    textStart(0),
    contentStop(0),
    toolStart(0, 'tool-1', 'search', {}),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content index 0 started more than once',
  );
});

test('rejects a delta for an unknown content index', async () => {
  const events = [messageStart(), textDelta(3, 'unknown')];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_delta references unknown or stopped index 3',
  );
});

test('rejects a stop for an unknown content index', async () => {
  const events = [messageStart(), contentStop(3)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_stop references unknown or stopped index 3',
  );
});

test('rejects a delta for an already-stopped content index', async () => {
  const events = [
    messageStart(),
    textStart(0),
    contentStop(0),
    textDelta(0, 'late'),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_delta references unknown or stopped index 0',
  );
});

test('rejects a second stop for an already-stopped content index', async () => {
  const events = [messageStart(), textStart(0), contentStop(0), contentStop(0)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_stop references unknown or stopped index 0',
  );
});

test('rejects text deltas for tool blocks', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', {}),
    textDelta(0, 'wrong'),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool block at index 0 cannot receive text_delta',
  );
});

test('rejects input JSON deltas for text blocks', async () => {
  const events = [messageStart(), textStart(0), inputJsonDelta(0, '{}')];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic text block at index 0 cannot receive input_json_delta',
  );
});

test('rejects tool blocks with an empty ID', async () => {
  const events = [messageStart(), toolStart(0, '', 'search', {})];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool block at index 0 has an empty id',
  );
});

test('rejects tool blocks with an empty name', async () => {
  const events = [messageStart(), toolStart(0, 'tool-1', '', {})];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool block at index 0 has an empty name',
  );
});

test('rejects message_delta while a content block is open', async () => {
  const events = [messageStart(), textStart(0), messageDelta()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic message_delta received while content blocks are open',
  );
});

test('rejects message_stop while a content block is open', async () => {
  const events = [messageStart(), textStart(0), messageStop()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic message_stop received while content blocks are open',
  );
});

test('rejects stream completion with an open content block', async () => {
  const events = [messageStart(), textStart(0)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic stream ended with open content blocks',
  );
});

test('rejects stream completion without message_stop', async () => {
  const events = [messageStart(), messageDelta()];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic stream ended before message_stop',
  );
});

test('rejects stream completion without message_start', async () => {
  const events: RawEvent[] = [];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic stream ended before message_start',
  );
});

test('returns quietly without requesting source events when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const source = createTrackedSource([messageStart(), messageStop()]);

  const result: AGUIEvent[] = [];
  for await (const event of mapAnthropicEvents({
    events: source.iterable,
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })) {
    result.push(event);
  }

  expect(result).toEqual([]);
  expect(source.state).toEqual({
    nextCalls: 0,
    returnCalls: 1,
    returnCompleted: true,
  });
});

test('aborts after text start without emitting initial content or an end event', async () => {
  const controller = new AbortController();
  const source = createTrackedSource([
    messageStart(),
    textStart(0, 'must not be emitted'),
    contentStop(0),
    messageStop(),
  ]);
  const iterator = mapAnthropicEvents({
    events: source.iterable,
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const first = await iterator.next();
  controller.abort();
  const second = await iterator.next();

  expect(first).toEqual({
    done: false,
    value: {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
  });
  expect(second).toEqual({ done: true, value: undefined });
  expect(source.state).toEqual({
    nextCalls: 2,
    returnCalls: 1,
    returnCompleted: true,
  });
});

test('aborts after tool arguments without emitting later tool or text ends', async () => {
  const controller = new AbortController();
  const source = createTrackedSource([
    messageStart(),
    toolStart(0, 'tool-1', 'search', {}),
    inputJsonDelta(0, '{}'),
    contentStop(0),
    messageStop(),
  ]);
  const iterator = mapAnthropicEvents({
    events: source.iterable,
    messageId: 'assistant-message-1',
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  const start = await iterator.next();
  const args = await iterator.next();
  controller.abort();
  const end = await iterator.next();

  expect(start.value).toEqual({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tool-1',
    toolCallName: 'search',
    parentMessageId: 'assistant-message-1',
  });
  expect(args.value).toEqual({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tool-1',
    delta: '{}',
  });
  expect(end).toEqual({ done: true, value: undefined });
  expect(source.state).toEqual({
    nextCalls: 3,
    returnCalls: 1,
    returnCompleted: true,
  });
});

test('awaits source iterator closure when the consumer returns early', async () => {
  const source = createTrackedSource([
    messageStart(),
    textStart(0, 'Hello'),
    contentStop(0),
    messageStop(),
  ]);
  const iterator = mapAnthropicEvents({
    events: source.iterable,
    messageId: 'assistant-message-1',
  })[Symbol.asyncIterator]();

  const first = await iterator.next();
  const returned = await iterator.return?.();

  expect(first.done).toBe(false);
  expect(returned).toEqual({ done: true, value: undefined });
  expect(source.state.returnCalls).toBe(1);
  expect(source.state.returnCompleted).toBe(true);
});

test('cancels a permanently pending source read and awaits iterator closure', async () => {
  const controller = new AbortController();
  const nextStarted = createDeferred<void>();
  const pendingNext = createDeferred<IteratorResult<RawEvent>>();
  const returnStarted = createDeferred<void>();
  const releaseReturn = createDeferred<void>();
  const state = { returnCalls: 0, returnCompleted: false };
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<RawEvent>> {
          nextStarted.resolve(undefined);
          return pendingNext.promise;
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          state.returnCalls += 1;
          returnStarted.resolve(undefined);
          await releaseReturn.promise;
          state.returnCompleted = true;
          return { done: true, value: undefined };
        },
      };
    },
  };

  const act = collectIterable(source, controller.signal);
  await withFailureTimeout(nextStarted.promise);
  controller.abort();
  await withFailureTimeout(returnStarted.promise);
  let settled = false;
  void act.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  const settledBeforeRelease = settled;
  releaseReturn.resolve(undefined);
  const result = await withFailureTimeout(act);

  expect(settledBeforeRelease).toBe(false);
  expect(result).toEqual([]);
  expect(state).toEqual({ returnCalls: 1, returnCompleted: true });
});

test('returns quietly when the pending source rejects from its abort listener', async () => {
  const controller = new AbortController();
  const nextStarted = createDeferred<void>();
  const state = { returnCalls: 0, returnCompleted: false };
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<RawEvent>> {
          nextStarted.resolve(undefined);
          return new Promise<IteratorResult<RawEvent>>((_, reject) => {
            controller.signal.addEventListener(
              'abort',
              () => reject(new Error('source aborted pending read')),
              { once: true },
            );
          });
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          state.returnCalls += 1;
          await Promise.resolve();
          state.returnCompleted = true;
          return { done: true, value: undefined };
        },
      };
    },
  };

  const act = collectIterable(source, controller.signal);
  await withFailureTimeout(nextStarted.promise);
  controller.abort();
  const result = await withFailureTimeout(act);

  expect(result).toEqual([]);
  expect(state).toEqual({ returnCalls: 1, returnCompleted: true });
});

test('consumes a late rejection from a source read that loses cancellation', async () => {
  const controller = new AbortController();
  const nextStarted = createDeferred<void>();
  const pendingNext = createDeferred<IteratorResult<RawEvent>>();
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<RawEvent>> {
          nextStarted.resolve(undefined);
          return pendingNext.promise;
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          return { done: true, value: undefined };
        },
      };
    },
  };

  const act = collectIterable(source, controller.signal);
  await withFailureTimeout(nextStarted.promise);
  controller.abort();
  await withFailureTimeout(act);
  pendingNext.reject(new Error('late source rejection'));
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(controller.signal.aborted).toBe(true);
});

test('rejects a non-object stream event with a contextual error', async () => {
  const events = [messageStart(), rawEvent(null)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow('Anthropic stream event must be an object');
});

test('rejects an unsupported stream event type', async () => {
  const events = [messageStart(), rawEvent({ type: 'ping' })];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic stream received unsupported event type "ping"',
  );
});

test('rejects a negative content block start index', async () => {
  const events = [messageStart(), textStart(-1)];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_start has invalid content index -1',
  );
});

test('rejects a noninteger content block delta index', async () => {
  const events = [messageStart(), textStart(0), textDelta(0.5, 'invalid')];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_delta has invalid content index 0.5',
  );
});

test('rejects a nonnumeric content block stop index', async () => {
  const events = [
    messageStart(),
    textStart(0),
    rawEvent({ type: 'content_block_stop', index: '0' }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content_block_stop has invalid content index "0"',
  );
});

test('rejects a non-object content block with index context', async () => {
  const events = [
    messageStart(),
    rawEvent({ type: 'content_block_start', index: 0, content_block: null }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content block at index 0 must be an object',
  );
});

test('rejects an unsupported content block discriminant', async () => {
  const events = [
    messageStart(),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'image' },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content block at index 0 has unsupported type "image"',
  );
});

test('rejects a text block with non-string text', async () => {
  const events = [
    messageStart(),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: 42 },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic text block at index 0 has non-string text',
  );
});

test('rejects a tool block with a non-string ID', async () => {
  const events = [
    messageStart(),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 42, name: 'search', input: {} },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool block at index 0 has a non-string id',
  );
});

test('rejects a tool block with a non-string name', async () => {
  const events = [
    messageStart(),
    rawEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-1', name: 42, input: {} },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool block at index 0 has a non-string name',
  );
});

test('rejects duplicate tool IDs across content indexes', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'first', {}),
    contentStop(0),
    toolStart(1, 'tool-1', 'second', {}),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic tool id "tool-1" started more than once at index 1',
  );
});

test('rejects a non-object content delta with index context', async () => {
  const events = [
    messageStart(),
    textStart(0),
    rawEvent({ type: 'content_block_delta', index: 0, delta: null }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic content delta at index 0 must be an object',
  );
});

test('rejects a text delta with non-string text', async () => {
  const events = [
    messageStart(),
    textStart(0),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 42 },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic text_delta at index 0 has non-string text',
  );
});

test('rejects an input JSON delta with non-string partial JSON', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', {}),
    rawEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: 42 },
    }),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toThrow(
    'Anthropic input_json_delta at index 0 has non-string partial_json',
  );
});

test('treats an empty input JSON delta as authoritative', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', { query: 'initial' }),
    inputJsonDelta(0, ''),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'search',
      parentMessageId: 'assistant-message-1',
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tool-1', delta: '' },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
  ]);
});

test('allows content blocks after message_delta', async () => {
  const events = [
    messageStart(),
    messageDelta(),
    textStart(0, 'after delta'),
    contentStop(0),
    messageStop(),
  ];

  const result = await collectEvents(events);

  expect(result).toEqual([
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-message-1',
      delta: 'after delta',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-message-1',
    },
  ]);
});

test('wraps circular initial tool input serialization errors with context', async () => {
  const input: { self?: unknown } = {};
  input.self = input;
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', input),
    contentStop(0),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toMatchObject({
    message:
      'Anthropic tool "tool-1" at index 0 has non-serializable initial input',
    cause: expect.any(TypeError),
  });
});

test('wraps BigInt initial tool input serialization errors with context', async () => {
  const events = [
    messageStart(),
    toolStart(0, 'tool-1', 'search', { value: BigInt(1) }),
    contentStop(0),
  ];

  const act = collectEvents(events);

  await expect(act).rejects.toMatchObject({
    message:
      'Anthropic tool "tool-1" at index 0 has non-serializable initial input',
    cause: expect.any(TypeError),
  });
});

test('preserves a primary mapping error when iterator cleanup rejects', async () => {
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<RawEvent>> {
          return { done: false, value: messageDelta() };
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          throw new Error('cleanup failed');
        },
      };
    },
  };

  const act = collectIterable(source);

  await expect(act).rejects.toThrow(
    'Anthropic event message_delta received before message_start',
  );
});

test('preserves a primary source error when iterator cleanup rejects', async () => {
  const sourceError = new Error('source failed');
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<RawEvent>> {
          throw sourceError;
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          throw new Error('cleanup failed');
        },
      };
    },
  };

  const act = collectIterable(source);

  await expect(act).rejects.toBe(sourceError);
});

test('surfaces iterator cleanup rejection when there is no primary error', async () => {
  const controller = new AbortController();
  controller.abort();
  const cleanupError = new Error('cleanup failed');
  const source: AsyncIterable<RawEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<RawEvent>> {
          return { done: true, value: undefined };
        },
        async return(): Promise<IteratorResult<RawEvent>> {
          throw cleanupError;
        },
      };
    },
  };

  const act = collectIterable(source, controller.signal);

  await expect(act).rejects.toBe(cleanupError);
});
