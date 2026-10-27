import { HttpTransport, HttpTransportOptions } from './http-transport';
import { TransportRequest } from './transport';

const request = (): TransportRequest => ({
  input: {
    threadId: 'thread',
    runId: 'run',
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  },
  signal: new AbortController().signal,
  attempt: 1,
  maxAttempts: 1,
  requestId: 'request',
});
const accepted = () =>
  new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
const rejected = (body = 'busy', hint = '0') =>
  new Response(body, { status: 409, headers: { 'Retry-After': hint } });
async function consume(transport: HttpTransport, input = request()) {
  const response = await transport.send(input);
  for await (const event of response.events) {
    void event;
  }
}
const options = (
  fetchImpl: typeof fetch,
  retry: unknown,
): HttpTransportOptions => ({ fetchImpl, retry }) as HttpTransportOptions;

test('retries an explicitly selected HTTP conflict before streaming', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(rejected())
    .mockResolvedValueOnce(accepted());
  const shouldRetry = jest.fn(() => true);
  const transport = new HttpTransport(
    options(fetchImpl, { maxRetries: 1, maxElapsedMs: 1000, shouldRetry }),
  );

  await consume(transport);

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(shouldRetry).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 409,
      bodyText: 'busy',
      bodyTruncated: false,
      retryCount: 0,
      retryAfterMs: 0,
    }),
  );
});

test('snapshots middleware request bytes and headers once for every retry', async () => {
  const headers = new Headers({ Authorization: 'original' });
  const middleware = jest.fn(async (init: RequestInit) => ({
    ...init,
    headers,
    credentials: 'include' as const,
  }));
  const seen: RequestInit[] = [];
  const fetchImpl = jest.fn(async (_url, init) => {
    seen.push(init);
    return seen.length === 1 ? rejected() : accepted();
  });
  const shouldRetry = () => {
    headers.set('Authorization', 'changed');
    seen[0].headers = new Headers();
    return true;
  };
  const transport = new HttpTransport({
    ...options(fetchImpl, { maxRetries: 1, maxElapsedMs: 1000, shouldRetry }),
    middleware: [middleware],
  });

  await consume(transport);

  expect(middleware).toHaveBeenCalledTimes(1);
  expect(seen[1].body).toBe(JSON.stringify(request().input));
  expect(new Headers(seen[1].headers).get('Authorization')).toBe('original');
  expect(seen[1].signal).toBe(seen[0].signal);
  expect(seen[1].credentials).toBe('include');
});

test.each([16383, 16384, 16385])(
  'bounds snapshots to 16 KiB with exact EOF detection for %i bytes',
  async (length) => {
    const shouldRetry = jest.fn(() => false);
    const fetchImpl = jest.fn(async () => rejected('x'.repeat(length)));
    const transport = new HttpTransport(
      options(fetchImpl, { maxRetries: 1, maxElapsedMs: 1000, shouldRetry }),
    );

    await expect(consume(transport)).rejects.toMatchObject({
      status: 409,
      retryable: false,
    });

    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: 'x'.repeat(Math.min(length, 16384)),
        bodyTruncated: length > 16384,
      }),
    );
  },
);

test.each([false, undefined, 'yes', new Error('predicate failure')])(
  'requires explicit true from classifier (%s)',
  async (decision) => {
    const fetchImpl = jest.fn(async () => rejected());
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 2,
        maxElapsedMs: 1000,
        shouldRetry: () => {
          if (decision instanceof Error) throw decision;
          return decision;
        },
      }),
    );

    await expect(consume(transport)).rejects.toMatchObject({
      status: 409,
      retryable: false,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);

test('stops at additional request limit', async () => {
  const fetchImpl = jest.fn(async () => rejected());
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 2,
      maxElapsedMs: 1000,
      shouldRetry: () => true,
    }),
  );

  await expect(consume(transport)).rejects.toMatchObject({ status: 409 });

  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test('disposal is available while a retry predicate is pending', async () => {
  let classify: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    classify = resolve;
  });
  const fetchImpl = jest.fn(async () => rejected());
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 2,
      maxElapsedMs: 1000,
      shouldRetry: () => {
        classify?.();
        return new Promise(() => undefined);
      },
    }),
  );

  const response = await transport.send(request());
  await entered;
  await response.dispose?.();
  const result = await response.events[Symbol.asyncIterator]().next();

  expect(result.done).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test.each([
  { maxRetries: -1 },
  { maxRetries: 0.5 },
  { maxRetries: Number.MAX_SAFE_INTEGER + 1 },
  { maxElapsedMs: 0 },
  { maxElapsedMs: Infinity },
  { maxElapsedMs: 2147483648 },
  { delayMs: -1 },
  { delayMs: Infinity },
  { delayMs: 2147483648 },
])('rejects invalid retry options before fetching (%j)', (invalid) => {
  const fetchImpl = jest.fn();

  expect(
    () =>
      new HttpTransport(
        options(fetchImpl, {
          maxRetries: 1,
          maxElapsedMs: 1000,
          shouldRetry: () => true,
          ...invalid,
        }),
      ),
  ).toThrow();

  expect(fetchImpl).not.toHaveBeenCalled();
});

test('disabled policy preserves full legacy body reading and skips replay validation', async () => {
  const shouldRetry = jest.fn();
  const fetchImpl = jest.fn(async () => rejected('x'.repeat(20000)));
  const transport = new HttpTransport({
    ...options(fetchImpl, {
      maxRetries: 0,
      maxElapsedMs: NaN,
      delayMs: -1,
      shouldRetry,
    }),
    middleware: [async (init) => ({ ...init, body: new Uint8Array([1]) })],
  });

  await expect(consume(transport)).rejects.toMatchObject({
    message: `HTTP error (409): ${'x'.repeat(500)}…`,
  });

  expect(shouldRetry).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('enabled policy rejects non-string middleware bodies before fetching', async () => {
  const fetchImpl = jest.fn();
  const transport = new HttpTransport({
    ...options(fetchImpl, {
      maxRetries: 1,
      maxElapsedMs: 1000,
      shouldRetry: () => true,
    }),
    middleware: [async (init) => ({ ...init, body: new Uint8Array([1]) })],
  });

  await expect(transport.send(request())).rejects.toThrow(
    'string request body',
  );

  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  '2147484',
  '99999999999999999999999999999999999999',
  'Fri, 01 Jan 9999 00:00:00 GMT',
])('never falls back or retries oversized Retry-After %s', async (hint) => {
  const fetchImpl = jest.fn(async () => rejected('busy', hint));
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 1,
      maxElapsedMs: 1000,
      delayMs: 0,
      shouldRetry: () => true,
    }),
  );

  await expect(consume(transport)).rejects.toMatchObject({ status: 409 });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each(['0.1', '-1', 'nonsense', ''])(
  'uses fallback for invalid Retry-After %s',
  async (hint) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(rejected('busy', hint))
      .mockResolvedValueOnce(accepted());
    const shouldRetry = jest.fn(() => true);
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 1000,
        delayMs: 0,
        shouldRetry,
      }),
    );

    await consume(transport);

    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: undefined }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  },
);

test.each([
  '2',
  'Mon, 26 Oct 2026 12:00:02 GMT',
  'Sun, 25 Oct 2026 12:00:00 GMT',
])('honors delta/date Retry-After %s', async (hint) => {
  jest.useFakeTimers({ now: new Date('2026-10-26T12:00:00Z') });
  try {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(rejected('busy', hint))
      .mockResolvedValueOnce(accepted());
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 5000,
        delayMs: 4500,
        shouldRetry: () => true,
      }),
    );
    const pending = consume(transport);

    await jest.advanceTimersByTimeAsync(0);
    if (!hint.startsWith('Sun')) {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
    }
    await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('a body read failure preserves HTTP status without classification', async () => {
  const shouldRetry = jest.fn(() => true);
  const fetchImpl = jest.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('read failed'));
          },
        }),
        { status: 503 },
      ),
  );
  const transport = new HttpTransport(
    options(fetchImpl, { maxRetries: 1, maxElapsedMs: 1000, shouldRetry }),
  );

  await expect(consume(transport)).rejects.toMatchObject({
    status: 503,
    retryable: false,
  });

  expect(shouldRetry).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each([200, 409])(
  'issued fetch may resolve after retry budget with status %i',
  async (status) => {
    jest.useFakeTimers();
    try {
      let resolveFetch: (response: Response) => void = () => undefined;
      const fetchImpl = jest.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
      const shouldRetry = jest.fn(() => true);
      const transport = new HttpTransport(
        options(fetchImpl, { maxRetries: 1, maxElapsedMs: 100, shouldRetry }),
      );
      const pending = consume(transport).then(
        () => 'accepted',
        (error) => error.status,
      );

      await jest.advanceTimersByTimeAsync(200);
      resolveFetch(status === 200 ? accepted() : rejected());
      expect(await pending).toBe(status === 200 ? 'accepted' : 409);

      expect(shouldRetry).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  },
);

test('accepted event stream outlives retry deadline without replay', async () => {
  jest.useFakeTimers();
  try {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(value) {
              controller = value;
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    );
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 100,
        shouldRetry: () => true,
      }),
    );
    const pending = consume(transport);

    await jest.advanceTimersByTimeAsync(1000);
    controller?.close();
    await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('deadline settles hung response cleanup without starting another fetch', async () => {
  jest.useFakeTimers();
  try {
    const cancel = jest.fn(() => new Promise<void>(() => undefined));
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(16385));
            },
            cancel,
          }),
          { status: 409 },
        ),
    );
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 100,
        shouldRetry: () => true,
      }),
    );
    const pending = consume(transport).catch((error) => error);

    await jest.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ status: 409 });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('abort cancels a pending rejected body read and releases its lock', async () => {
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const fetchImpl = jest.fn(async () => new Response(body, { status: 409 }));
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 1,
      maxElapsedMs: 1000,
      shouldRetry: () => true,
    }),
  );
  const response = await transport.send(request());
  await flush();

  await response.dispose?.();
  await flush();

  expect(cancel).toHaveBeenCalledTimes(1);
  expect(body.locked).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('abort during retry wait clears timers and prevents another fetch', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn(async () => rejected('busy', '1'));
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 5000,
        shouldRetry: () => true,
      }),
    );
    const response = await transport.send(request());
    await jest.advanceTimersByTimeAsync(0);

    await response.dispose?.();
    await jest.advanceTimersByTimeAsync(5000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('late fetch completion cancels its body after disposal', async () => {
  let resolveFetch: (response: Response) => void = () => undefined;
  const fetchImpl = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  );
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 1,
      maxElapsedMs: 1000,
      shouldRetry: () => true,
    }),
  );
  const cancel = jest.fn();
  const response = await transport.send(request());

  await response.dispose?.();
  resolveFetch(new Response(new ReadableStream({ cancel }), { status: 409 }));
  await flush();

  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('concurrent sends own independent retry cancellation', async () => {
  let calls = 0;
  const fetchImpl = jest.fn(async () =>
    ++calls <= 2 ? rejected('busy', '0') : accepted(),
  );
  let entered: (() => void) | undefined;
  const classified = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const transport = new HttpTransport(
    options(fetchImpl, {
      maxRetries: 1,
      maxElapsedMs: 1000,
      shouldRetry: (context: { signal: AbortSignal }) => {
        if (calls === 1) {
          entered?.();
          return new Promise<boolean>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(true)),
          );
        }
        return true;
      },
    }),
  );
  const first = await transport.send(request());
  await classified;

  await consume(transport);
  await first.dispose?.();
  await flush();

  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test('deadline removes every owned abort listener even when predicate never settles', async () => {
  jest.useFakeTimers();
  try {
    const { createHttpResponseRetryFetch } =
      await import('./http-response-retry');
    const signal = new AbortController().signal;
    const add = jest.spyOn(signal, 'addEventListener');
    const remove = jest.spyOn(signal, 'removeEventListener');
    const execute = createHttpResponseRetryFetch(
      jest.fn(async () => rejected()),
      '/run',
      { body: '{}' },
      {
        maxRetries: 1,
        maxElapsedMs: 100,
        shouldRetry: () => new Promise(() => undefined),
      },
      signal,
    );
    const pending = execute().catch((error) => error);

    await jest.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ status: 409 });

    expect(remove.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(
      add.mock.calls.filter(([type]) => type === 'abort').length,
    );
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  'Monday, October 26, 2026 12:00:02 GMT',
  'Mon, 26 Oct 2026 12:00:02 UTC',
])('treats non-HTTP date %s as malformed', async (hint) => {
  jest.useFakeTimers({ now: new Date('2026-10-26T12:00:00Z') });
  try {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(rejected('busy', hint))
      .mockResolvedValueOnce(accepted());
    const shouldRetry = jest.fn(() => true);
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 1000,
        delayMs: 0,
        shouldRetry,
      }),
    );

    const result = consume(transport).then(
      () => 'accepted',
      () => 'rejected',
    );
    await jest.advanceTimersByTimeAsync(0);

    expect(await result).toBe('accepted');
    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: undefined }),
    );
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  'Mon, 31 Feb 2026 12:00:02 GMT',
  'Monday, 31-Feb-26 12:00:02 GMT',
  'Mon Feb 31 12:00:02 2026',
  'Mon, 29 Feb 2026 12:00:02 GMT',
  'Mon, 26 Oct 2026 24:00:00 GMT',
])('uses fallback for impossible HTTP calendar date %s', async (hint) => {
  jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
  try {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(rejected('busy', hint))
      .mockResolvedValueOnce(accepted());
    const shouldRetry = jest.fn(() => true);
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 1000,
        delayMs: 0,
        shouldRetry,
      }),
    );

    const result = consume(transport).then(
      () => 'accepted',
      () => 'rejected',
    );
    await jest.advanceTimersByTimeAsync(0);

    expect(await result).toBe('accepted');
    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: undefined }),
    );
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  'Mon, 26 Oct 2026 12:00:02 GMT',
  'Monday, 26-Oct-26 12:00:02 GMT',
  'Mon Oct 26 12:00:02 2026',
  'Thu, 29 Feb 2024 12:00:02 GMT',
])('preserves valid HTTP calendar date %s', async (hint) => {
  const date = new Date(
    hint.includes('2024') ? '2024-02-29T12:00:00Z' : '2026-10-26T12:00:00Z',
  );
  jest.useFakeTimers({ now: date });
  try {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(rejected('busy', hint))
      .mockResolvedValueOnce(accepted());
    const shouldRetry = jest.fn(() => true);
    const transport = new HttpTransport(
      options(fetchImpl, {
        maxRetries: 1,
        maxElapsedMs: 5000,
        delayMs: 0,
        shouldRetry,
      }),
    );
    const result = consume(transport);

    await jest.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await result;

    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: 2000 }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  ['Monday, 26-Oct-70 12:00:02 GMT', false],
  ['Monday, 26-Oct-77 12:00:02 GMT', true],
])(
  'interprets RFC850 year relative to the current 50-year window (%s)',
  async (hint, past) => {
    jest.useFakeTimers({ now: new Date('2026-10-26T12:00:00Z') });
    try {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(rejected('busy', hint))
        .mockResolvedValueOnce(accepted());
      const transport = new HttpTransport(
        options(fetchImpl, {
          maxRetries: 1,
          maxElapsedMs: 1000,
          delayMs: 0,
          shouldRetry: () => true,
        }),
      );

      const result = consume(transport).then(
        () => 'accepted',
        () => 'rejected',
      );
      await jest.advanceTimersByTimeAsync(0);

      expect(await result).toBe(past ? 'accepted' : 'rejected');
      expect(fetchImpl).toHaveBeenCalledTimes(past ? 2 : 1);
    } finally {
      jest.useRealTimers();
    }
  },
);

test('reader acquisition failure remains a nonretryable HTTP failure', async () => {
  const response = rejected();
  const owner = response.body?.getReader();
  const shouldRetry = jest.fn(() => true);
  const fetchImpl = jest.fn(async () => response);
  const transport = new HttpTransport(
    options(fetchImpl, { maxRetries: 1, maxElapsedMs: 1000, shouldRetry }),
  );
  try {
    await expect(consume(transport)).rejects.toMatchObject({
      status: 409,
      retryable: false,
    });

    expect(shouldRetry).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally {
    owner?.releaseLock();
  }
});

test('releases a settled reader even when truncated response cancellation never settles', async () => {
  jest.useFakeTimers();
  try {
    const cancel = jest.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16385));
      },
      cancel,
    });
    const shouldRetry = jest.fn(() => true);
    const fetchImpl = jest.fn(async () => new Response(body, { status: 409 }));
    const transport = new HttpTransport(
      options(fetchImpl, { maxRetries: 1, maxElapsedMs: 20, shouldRetry }),
    );
    const pending = consume(transport).catch((error) => error);

    await jest.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ status: 409, retryable: false });

    expect(body.locked).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
