import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { HttpTransport } from './http-transport';
import type { TransportRequest } from './transport';
import { TransportError } from './transport-error';

const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

function createRequest(
  overrides: Partial<TransportRequest> = {},
): TransportRequest {
  return {
    input,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'test-request',
    ...overrides,
  };
}

function encodeSse(events: unknown[]): Uint8Array {
  return new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  );
}

function splitBytes(bytes: Uint8Array, splitPoints: number[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const end of splitPoints) {
    chunks.push(bytes.slice(start, end));
    start = end;
  }
  chunks.push(bytes.slice(start));
  return chunks;
}

function createSseResponse(
  chunks: Uint8Array[],
  options: { close?: boolean; contentType?: string } = {},
) {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      for (const chunk of chunks) {
        nextController.enqueue(chunk);
      }
      if (options.close ?? true) {
        nextController.close();
      }
    },
    cancel,
  });
  const response = new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': options.contentType ?? 'text/event-stream',
    },
  });

  return { response, controller, cancel };
}

function createPullDrivenSseResponse(chunks: Uint8Array[]) {
  let chunkIndex = 0;
  let resolveExhausted: (value: 'exhausted') => void = () => undefined;
  const exhausted = new Promise<'exhausted'>((resolve) => {
    resolveExhausted = resolve;
  });
  const waitForCancellation = new Promise<void>(() => undefined);
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[chunkIndex];
        if (chunk) {
          chunkIndex += 1;
          controller.enqueue(chunk);
          return;
        }

        resolveExhausted('exhausted');
        return waitForCancellation;
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const response = new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

  return { response, exhausted, cancel };
}

function successfulResponse(): Response {
  return createSseResponse([], { close: true }).response;
}

async function collectEvents(
  events: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const values: AGUIEvent[] = [];
  for await (const event of events) {
    values.push(event);
  }
  return values;
}

test('rejects missing input before calling fetch', async () => {
  const fetchMock = jest.fn(async () => successfulResponse());
  const transport = new HttpTransport({
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  const request = {
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'test-request',
  } as unknown as TransportRequest;

  const sendPromise = transport.send(request);

  await expect(sendPromise).rejects.toMatchObject({
    name: 'TransportError',
    retryable: false,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('cleans up the request listener when JSON serialization fails', async () => {
  const circularValue: { self?: unknown } = {};
  circularValue.self = circularValue;
  const requestController = new AbortController();
  const addListener = jest.spyOn(requestController.signal, 'addEventListener');
  const removeListener = jest.spyOn(
    requestController.signal,
    'removeEventListener',
  );
  const abort = jest.spyOn(AbortController.prototype, 'abort');
  const fetchMock = jest.fn(async () => successfulResponse());
  const transport = new HttpTransport({
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  try {
    const sendPromise = transport.send(
      createRequest({
        input: {
          ...input,
          forwardedProps: circularValue,
        },
        signal: requestController.signal,
      }),
    );

    await expect(sendPromise).rejects.toBeInstanceOf(TypeError);
    const abortListener = addListener.mock.calls[0][1];
    expect(removeListener).toHaveBeenCalledWith('abort', abortListener);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    addListener.mockRestore();
    removeListener.mockRestore();
    abort.mockRestore();
  }
});

test('cleans up the request listener when async middleware fails', async () => {
  const middlewareError = new Error('middleware failed');
  const requestController = new AbortController();
  const addListener = jest.spyOn(requestController.signal, 'addEventListener');
  const removeListener = jest.spyOn(
    requestController.signal,
    'removeEventListener',
  );
  const fetchMock = jest.fn(async () => successfulResponse());
  let internalSignal: AbortSignal | null | undefined;
  const transport = new HttpTransport({
    middleware: [
      async (init) => {
        internalSignal = init.signal;
        await Promise.resolve();
        throw middlewareError;
      },
    ],
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  try {
    const sendPromise = transport.send(
      createRequest({ signal: requestController.signal }),
    );

    await expect(sendPromise).rejects.toBe(middlewareError);
    const abortListener = addListener.mock.calls[0][1];
    expect(removeListener).toHaveBeenCalledWith('abort', abortListener);
    expect(internalSignal?.aborted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    addListener.mockRestore();
    removeListener.mockRestore();
  }
});

test.each([undefined, '', '  \n'])(
  'uses /run for a missing or blank base URL',
  async (baseUrl) => {
    const fetchMock = jest.fn(async () => successfulResponse());
    const transport = new HttpTransport({
      baseUrl,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await transport.send(createRequest());

    expect(fetchMock).toHaveBeenCalledWith('/run', expect.any(Object));
  },
);

test('preserves a non-whitespace explicit URL byte-for-byte', async () => {
  const fetchMock = jest.fn(async () => successfulResponse());
  const endpoint = '  https://example.com/ag-ui?x=1  ';
  const transport = new HttpTransport({
    baseUrl: endpoint,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await transport.send(createRequest());

  expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.any(Object));
});

test('posts the AG-UI input with exact default headers', async () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => successfulResponse(),
  );
  const transport = new HttpTransport({
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await transport.send(createRequest());

  const [, init] = fetchMock.mock.calls[0];
  expect(init).toMatchObject({
    method: 'POST',
    body: JSON.stringify(input),
  });
  expect(new Headers(init?.headers)).toEqual(
    new Headers({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    }),
  );
});

test('applies middleware in order and restores the authoritative signal', async () => {
  const calls: string[] = [];
  const replacementSignal = new AbortController().signal;
  const requestController = new AbortController();
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => successfulResponse(),
  );
  const transport = new HttpTransport({
    middleware: [
      (init) => {
        calls.push('first');
        const headers = new Headers(init.headers);
        headers.set('x-first', '1');
        return {
          ...init,
          headers,
        };
      },
      (init) => {
        calls.push(new Headers(init.headers).get('x-first') ?? 'missing');
        return { ...init, signal: replacementSignal };
      },
    ],
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await transport.send(
    createRequest({
      signal: requestController.signal,
    }),
  );
  const [, init] = fetchMock.mock.calls[0];
  requestController.abort('cancelled');

  expect(calls).toEqual(['first', '1']);
  expect(init?.signal).not.toBe(replacementSignal);
  expect(init?.signal?.aborted).toBe(true);
});

test('parses and validates canonical RUN, TEXT, and TOOL events across byte splits', async () => {
  const expectedEvents: AGUIEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'hello',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"query":"weather"}',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
    },
  ];
  const bytes = encodeSse(expectedEvents);
  const chunks = splitBytes(bytes, [1, 7, 31, 79, 143, bytes.length - 3]);
  const { response } = createSseResponse(chunks, {
    contentType: 'Text/Event-Stream; Charset=UTF-8',
  });
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });

  const result = await transport.send(createRequest());

  await expect(collectEvents(result.events)).resolves.toEqual(expectedEvents);
});

test('preserves buffered events when a single SSE chunk completes normally', async () => {
  const expectedEvents: AGUIEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'hello',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-1',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
    },
  ];
  const { response } = createSseResponse([encodeSse(expectedEvents)]);
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });

  const result = await transport.send(createRequest());
  const events = await collectEvents(result.events);

  expect(events).toEqual(expectedEvents);
});

test('emits CRLF-delimited SSE before an open connection closes', async () => {
  const expectedEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify(expectedEvent)}\r\n\r\n`,
  );
  const carriageReturns = Array.from(bytes.keys()).filter(
    (index) => bytes[index] === 13,
  );
  const chunks = splitBytes(
    bytes,
    carriageReturns.map((index) => index + 1),
  );
  const { response, exhausted, cancel } = createPullDrivenSseResponse(chunks);
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());
  const iterator = result.events[Symbol.asyncIterator]();

  const outcome = await Promise.race([
    iterator.next().then((event) => ({ type: 'event' as const, event })),
    exhausted.then(() => ({ type: 'exhausted' as const })),
  ]);

  expect(outcome).toEqual({
    type: 'event',
    event: { done: false, value: expectedEvent },
  });
  await result.dispose?.();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('preserves non-2xx TransportError formatting, status, and truncation', async () => {
  const body = 'x'.repeat(501);
  const transport = new HttpTransport({
    fetchImpl: jest.fn(
      async () => new Response(body, { status: 429, statusText: 'Too Many' }),
    ) as unknown as typeof fetch,
  });
  const response = await transport.send(createRequest());

  const nextPromise = response.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toEqual(
    new TransportError(`Too Many (429): ${'x'.repeat(500)}…`, {
      status: 429,
      retryable: false,
    }),
  );
});

test('rejects a successful response with a null body as nonretryable', async () => {
  const transport = new HttpTransport({
    fetchImpl: jest.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ) as unknown as typeof fetch,
  });
  const response = await transport.send(createRequest());

  const nextPromise = response.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toMatchObject({
    name: 'TransportError',
    message: 'Response body is null',
    status: 200,
    retryable: false,
  });
});

test.each([undefined, 'application/json'])(
  'rejects a missing or wrong SSE content type',
  async (contentType) => {
    const headers = contentType ? { 'Content-Type': contentType } : undefined;
    const transport = new HttpTransport({
      fetchImpl: jest.fn(
        async () => new Response('data: {}\n\n', { status: 200, headers }),
      ) as unknown as typeof fetch,
    });
    const response = await transport.send(createRequest());

    const nextPromise = response.events[Symbol.asyncIterator]().next();

    await expect(nextPromise).rejects.toMatchObject({
      name: 'TransportError',
      status: 200,
      retryable: false,
    });
  },
);

test('leaves network errors ordinary and retryable', async () => {
  const networkError = new Error('network unavailable');
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () =>
      Promise.reject(networkError),
    ) as unknown as typeof fetch,
  });
  const response = await transport.send(createRequest());

  const nextPromise = response.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toBe(networkError);
  expect(networkError).not.toBeInstanceOf(TransportError);
});

test('leaves malformed SSE JSON as an ordinary iterator error', async () => {
  const { response } = createSseResponse([
    new TextEncoder().encode('data: {not-json}\n\n'),
  ]);
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());

  const nextPromise = result.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toBeInstanceOf(SyntaxError);
});

test('leaves schema-invalid SSE JSON as an ordinary iterator error', async () => {
  const { response, cancel } = createSseResponse(
    [encodeSse([{ type: EventType.RUN_STARTED }])],
    { close: false },
  );
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());

  const nextPromise = result.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.not.toBeInstanceOf(TransportError);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('request abort settles pending reads and cancels the reader', async () => {
  const firstEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const { response, cancel } = createSseResponse([encodeSse([firstEvent])], {
    close: false,
  });
  const requestController = new AbortController();
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(
    createRequest({ signal: requestController.signal }),
  );
  const iterator = result.events[Symbol.asyncIterator]();
  await iterator.next();
  const pendingNext = iterator.next();

  requestController.abort('cancelled');

  await expect(pendingNext).resolves.toEqual({ done: true, value: undefined });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('iterator return settles pending reads and cancels the reader', async () => {
  const firstEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const { response, cancel } = createSseResponse([encodeSse([firstEvent])], {
    close: false,
  });
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());
  const iterator = result.events[Symbol.asyncIterator]();
  await iterator.next();
  const pendingNext = iterator.next();

  await iterator.return?.();

  await expect(pendingNext).resolves.toEqual({ done: true, value: undefined });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('iterator throw rejects pending reads and cancels the reader idempotently', async () => {
  const firstEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const { response, cancel } = createSseResponse([encodeSse([firstEvent])], {
    close: false,
  });
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());
  const iterator = result.events[Symbol.asyncIterator]();
  await iterator.next();
  const firstPendingNext = iterator.next();
  const secondPendingNext = iterator.next();
  const iteratorError = new Error('iterator failed');

  const throwPromise = iterator.throw?.(iteratorError);

  await expect(throwPromise).rejects.toBe(iteratorError);
  await expect(firstPendingNext).rejects.toBe(iteratorError);
  await expect(secondPendingNext).rejects.toBe(iteratorError);
  await expect(iterator.next()).rejects.toBe(iteratorError);
  await result.dispose?.();
  await result.dispose?.();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('dispose settles pending reads and cancels the reader idempotently', async () => {
  const firstEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const { response, cancel } = createSseResponse([encodeSse([firstEvent])], {
    close: false,
  });
  const requestController = new AbortController();
  const addListener = jest.spyOn(requestController.signal, 'addEventListener');
  const removeListener = jest.spyOn(
    requestController.signal,
    'removeEventListener',
  );
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });

  try {
    const result = await transport.send(
      createRequest({ signal: requestController.signal }),
    );
    const iterator = result.events[Symbol.asyncIterator]();
    await iterator.next();
    const pendingNext = iterator.next();

    await result.dispose?.();
    await result.dispose?.();

    await expect(pendingNext).resolves.toEqual({
      done: true,
      value: undefined,
    });
    const abortListener = addListener.mock.calls[0][1];
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith('abort', abortListener);
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    addListener.mockRestore();
    removeListener.mockRestore();
  }
});

test('dispose before fetch resolves cancels an eventual invalid response body', async () => {
  let resolveResponse: (response: Response) => void = () => undefined;
  const responsePromise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  const cancel = jest.fn();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      cancel,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const transport = new HttpTransport({
    fetchImpl: jest.fn(() => responsePromise) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());

  await result.dispose?.();
  resolveResponse(response);
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(cancel).toHaveBeenCalledTimes(1);
});

test('cancellation failures do not escape detached AG-UI teardown', async () => {
  const firstEvent = {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
  } satisfies AGUIEvent;
  const cancelError = new Error('cancel failed');
  const cancel = jest.fn(async () => Promise.reject(cancelError));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSse([firstEvent]));
    },
    cancel,
  });
  const response = new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const unhandledRejections: unknown[] = [];
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handleUnhandledRejection);

  try {
    const result = await transport.send(createRequest());
    const iterator = result.events[Symbol.asyncIterator]();
    await iterator.next();
    const pendingNext = iterator.next();

    await Promise.all([iterator.return?.(), result.dispose?.()]);
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(pendingNext).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toEqual([]);
  } finally {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  }
});

test('read failures reject once without escaping detached teardown', async () => {
  const readError = new Error('read failed');
  const stream = new ReadableStream<Uint8Array>({
    pull: () => Promise.reject(readError),
  });
  const response = new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const body = response.body;
  if (!body) {
    throw new Error('Expected response body');
  }
  const reader = body.getReader();
  const cancel = jest.spyOn(reader, 'cancel');
  const getReader = jest.spyOn(body, 'getReader').mockReturnValue(reader);
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const unhandledRejections: unknown[] = [];
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handleUnhandledRejection);

  try {
    const result = await transport.send(createRequest());
    const iterator = result.events[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toBe(readError);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toEqual([]);
  } finally {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
    getReader.mockRestore();
    cancel.mockRestore();
  }
});

test('parser errors cancel the active reader', async () => {
  const { response, cancel } = createSseResponse(
    [new TextEncoder().encode('data: {not-json}\n\n')],
    { close: false },
  );
  const transport = new HttpTransport({
    fetchImpl: jest.fn(async () => response) as unknown as typeof fetch,
  });
  const result = await transport.send(createRequest());

  const nextPromise = result.events[Symbol.asyncIterator]().next();

  await expect(nextPromise).rejects.toBeInstanceOf(SyntaxError);
  expect(cancel).toHaveBeenCalledTimes(1);
});
