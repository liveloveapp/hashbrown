import { Chat } from '../models';
import { s } from '../schema';
import { executeToolTurn, type ToolCallExecution } from './tool-turn-executor';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createToolCall(
  overrides: Partial<Chat.Internal.ToolCall> = {},
): Chat.Internal.ToolCall {
  return {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{"query":"weather"}',
    status: 'pending',
    ...overrides,
  };
}

function createTool(
  handler: Chat.Internal.Tool['handler'],
  schema: Chat.Internal.Tool['schema'] = {},
): Chat.Internal.Tool {
  return {
    name: 'lookup',
    description: 'Looks up a value',
    schema,
    handler,
  };
}

function createExecution(
  input: Partial<ToolCallExecution> = {},
): ToolCallExecution {
  return {
    toolCall: createToolCall(),
    tool: createTool(async () => 'result'),
    signal: new AbortController().signal,
    ...input,
  };
}

function flushTaskBoundary(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('executes handlers concurrently and returns results in input order', async () => {
  const firstResult = createDeferred<string>();
  const secondResult = createDeferred<string>();
  const firstStarted = createDeferred<void>();
  const secondStarted = createDeferred<void>();
  const executions = [
    createExecution({
      toolCall: createToolCall({ id: 'first-call', name: 'first' }),
      tool: createTool(async () => {
        firstStarted.resolve();
        return firstResult.promise;
      }),
    }),
    createExecution({
      toolCall: createToolCall({ id: 'second-call', name: 'second' }),
      tool: createTool(async () => {
        secondStarted.resolve();
        return secondResult.promise;
      }),
    }),
  ];

  const resultPromise = executeToolTurn(executions);
  await Promise.all([firstStarted.promise, secondStarted.promise]);
  secondResult.resolve('second result');
  firstResult.resolve('first result');
  const results = await resultPromise;

  expect(results).toEqual([
    { status: 'fulfilled', value: 'first result' },
    { status: 'fulfilled', value: 'second result' },
  ]);
});

test('decodes an ordinary JSON object before invoking the handler', async () => {
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    toolCall: createToolCall({ arguments: '{"query":"weather"}' }),
    tool: createTool(handler),
  });

  const results = await executeToolTurn([execution]);

  expect(handler).toHaveBeenCalledWith({ query: 'weather' }, execution.signal);
  expect(results).toEqual([{ status: 'fulfilled', value: 'result' }]);
});

test('decodes a double-encoded JSON object before invoking the handler', async () => {
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    toolCall: createToolCall({
      arguments: JSON.stringify(JSON.stringify({ query: 'weather' })),
    }),
    tool: createTool(handler),
  });

  const results = await executeToolTurn([execution]);

  expect(handler).toHaveBeenCalledWith({ query: 'weather' }, execution.signal);
  expect(results).toEqual([{ status: 'fulfilled', value: 'result' }]);
});

test('retains an inner non-JSON string when the second parse fails', async () => {
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    toolCall: createToolCall({ arguments: JSON.stringify('plain text') }),
    tool: createTool(handler),
  });

  const results = await executeToolTurn([execution]);

  expect(handler).toHaveBeenCalledWith('plain text', execution.signal);
  expect(results).toEqual([{ status: 'fulfilled', value: 'result' }]);
});

test('records malformed outer JSON without invoking the handler', async () => {
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    toolCall: createToolCall({ arguments: '{malformed' }),
    tool: createTool(handler),
  });

  const results = await executeToolTurn([execution]);

  expect(handler).not.toHaveBeenCalled();
  expect(results).toHaveLength(1);
  expect(results[0]?.status).toBe('rejected');
  if (results[0]?.status === 'rejected') {
    expect(results[0].reason).toBeInstanceOf(SyntaxError);
  }
});

test('records Hashbrown schema validation failure without invoking the handler', async () => {
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    toolCall: createToolCall({ arguments: '{}' }),
    tool: createTool(
      handler,
      s.object('lookup arguments', { query: s.string('query') }),
    ),
  });

  const results = await executeToolTurn([execution]);

  expect(handler).not.toHaveBeenCalled();
  expect(results).toHaveLength(1);
  expect(results[0]?.status).toBe('rejected');
  if (results[0]?.status === 'rejected') {
    expect(results[0].reason).toBeInstanceOf(Error);
  }
});

test('records a missing tool', async () => {
  const execution = createExecution({ tool: undefined });

  const results = await executeToolTurn([execution]);

  expect(results).toEqual([
    { status: 'rejected', reason: new Error('Tool lookup not found') },
  ]);
});

test('reports a missing tool before parsing malformed arguments', async () => {
  const execution = createExecution({
    toolCall: createToolCall({ name: 'missing', arguments: '{malformed' }),
    tool: undefined,
  });

  const results = await executeToolTurn([execution]);

  expect(results).toEqual([
    { status: 'rejected', reason: new Error('Tool missing not found') },
  ]);
});

test('records a synchronous handler throw', async () => {
  const error = new Error('sync failure');
  const handler = jest.fn(() => {
    throw error;
  });
  const execution = createExecution({ tool: createTool(handler) });

  const results = await executeToolTurn([execution]);

  expect(results).toEqual([{ status: 'rejected', reason: error }]);
});

test('records an asynchronous handler rejection', async () => {
  const error = new Error('async failure');
  const handler = jest.fn(async () => {
    throw error;
  });
  const execution = createExecution({ tool: createTool(handler) });

  const results = await executeToolTurn([execution]);

  expect(results).toEqual([{ status: 'rejected', reason: error }]);
});

test('records cancellation without invoking the handler when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const handler = jest.fn(async () => 'result');
  const execution = createExecution({
    tool: createTool(handler),
    signal: controller.signal,
  });

  const results = await executeToolTurn([execution]);

  expect(handler).not.toHaveBeenCalled();
  expect(results).toHaveLength(1);
  expect(results[0]?.status).toBe('rejected');
  if (results[0]?.status === 'rejected') {
    expect(results[0].reason).toMatchObject({
      name: 'AbortError',
      message: 'Tool execution cancelled',
    });
    expect(results[0].reason).toBeInstanceOf(Error);
  }
});

test('cancellation wins against a handler that ignores its signal', async () => {
  const controller = new AbortController();
  const handlerStarted = createDeferred<void>();
  const handlerResult = createDeferred<string>();
  const handler = jest.fn((_input: unknown, signal: AbortSignal) => {
    expect(signal).toBe(controller.signal);
    handlerStarted.resolve();
    return handlerResult.promise;
  });
  const execution = createExecution({
    tool: createTool(handler),
    signal: controller.signal,
  });

  const resultPromise = executeToolTurn([execution]);
  await handlerStarted.promise;
  controller.abort();
  const results = await resultPromise;

  expect(handler).toHaveBeenCalledTimes(1);
  expect(results).toHaveLength(1);
  expect(results[0]?.status).toBe('rejected');
  if (results[0]?.status === 'rejected') {
    expect(results[0].reason).toMatchObject({
      name: 'AbortError',
      message: 'Tool execution cancelled',
    });
  }
});

test('removes the same abort listener exactly once after normal completion', async () => {
  const controller = new AbortController();
  const addEventListener = jest.spyOn(controller.signal, 'addEventListener');
  const removeEventListener = jest.spyOn(
    controller.signal,
    'removeEventListener',
  );
  const execution = createExecution({ signal: controller.signal });

  const results = await executeToolTurn([execution]);

  const abortAdds = addEventListener.mock.calls.filter(
    ([eventName]) => eventName === 'abort',
  );
  const abortRemovals = removeEventListener.mock.calls.filter(
    ([eventName]) => eventName === 'abort',
  );
  expect(results).toEqual([{ status: 'fulfilled', value: 'result' }]);
  expect(abortAdds).toHaveLength(1);
  expect(abortRemovals).toHaveLength(1);
  expect(abortRemovals[0]?.[1]).toBe(abortAdds[0]?.[1]);

  addEventListener.mockRestore();
  removeEventListener.mockRestore();
});

test('removes the same abort listener exactly once after cancellation', async () => {
  const controller = new AbortController();
  const addEventListener = jest.spyOn(controller.signal, 'addEventListener');
  const removeEventListener = jest.spyOn(
    controller.signal,
    'removeEventListener',
  );
  const handlerStarted = createDeferred<void>();
  const execution = createExecution({
    tool: createTool(async () => {
      handlerStarted.resolve();
      return new Promise(() => undefined);
    }),
    signal: controller.signal,
  });

  const resultPromise = executeToolTurn([execution]);
  await handlerStarted.promise;
  controller.abort();
  const results = await resultPromise;

  const abortAdds = addEventListener.mock.calls.filter(
    ([eventName]) => eventName === 'abort',
  );
  const abortRemovals = removeEventListener.mock.calls.filter(
    ([eventName]) => eventName === 'abort',
  );
  expect(results[0]?.status).toBe('rejected');
  expect(abortAdds).toHaveLength(1);
  expect(abortRemovals).toHaveLength(1);
  expect(abortRemovals[0]?.[1]).toBe(abortAdds[0]?.[1]);

  addEventListener.mockRestore();
  removeEventListener.mockRestore();
});

test('owns a late handler resolution after cancellation without settling twice', async () => {
  const controller = new AbortController();
  const handlerStarted = createDeferred<void>();
  const handlerResult = createDeferred<string>();
  const onResult = jest.fn();
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  const execution = createExecution({
    tool: createTool(async () => {
      handlerStarted.resolve();
      return handlerResult.promise;
    }),
    signal: controller.signal,
  });

  const resultPromise = executeToolTurn([execution]).then((results) => {
    onResult(results);
    return results;
  });
  await handlerStarted.promise;
  controller.abort();
  const results = await resultPromise;
  handlerResult.resolve('late result');
  await flushTaskBoundary();

  expect(results[0]?.status).toBe('rejected');
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(unhandledRejections).toEqual([]);

  process.removeListener('unhandledRejection', onUnhandledRejection);
});

test('owns a late handler rejection after cancellation without settling twice', async () => {
  const controller = new AbortController();
  const handlerStarted = createDeferred<void>();
  const handlerResult = createDeferred<string>();
  const onResult = jest.fn();
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  const execution = createExecution({
    tool: createTool(async () => {
      handlerStarted.resolve();
      return handlerResult.promise;
    }),
    signal: controller.signal,
  });

  const resultPromise = executeToolTurn([execution]).then((results) => {
    onResult(results);
    return results;
  });
  await handlerStarted.promise;
  controller.abort();
  const results = await resultPromise;
  handlerResult.reject(new Error('late failure'));
  await flushTaskBoundary();

  expect(results[0]?.status).toBe('rejected');
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(unhandledRejections).toEqual([]);

  process.removeListener('unhandledRejection', onUnhandledRejection);
});
