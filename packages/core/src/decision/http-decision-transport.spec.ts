import { TransportError } from '../transport/transport-error';
import { createHttpDecisionTransport } from './http-decision-transport';
import type { Request } from './decision.types';

const request = { questions: {} } as unknown as Request;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function catchError(promise: Promise<unknown>): Promise<TransportError> {
  try {
    await promise;
  } catch (error) {
    return error as TransportError;
  }
  throw new Error('expected rejection');
}

test('POSTs JSON to the default url and returns the body unchanged', async () => {
  const body = { answers: { a: 1 } };
  const fetch = jest.fn().mockResolvedValue(jsonResponse(body));
  const transport = createHttpDecisionTransport({ fetch });

  const result = await transport(request, new AbortController().signal);

  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/decide');
  expect(init.method).toBe('POST');
  expect(new Headers(init.headers).get('Content-Type')).toBe(
    'application/json',
  );
  expect(init.body).toBe(JSON.stringify(request));
  expect(result).toEqual(body);
});

test('uses a custom url', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({ url: '/x', fetch });

  await transport(request, new AbortController().signal);

  expect(fetch.mock.calls[0][0]).toBe('/x');
});

test('applies middleware in declaration order', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const seen: unknown[] = [];
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [
      (init) => ({ ...init, headers: { ...(init.headers as object), A: '1' } }),
      async (init) => {
        seen.push((init.headers as Record<string, string>)['A']);
        return { ...init, headers: { ...(init.headers as object), B: '2' } };
      },
    ],
  });

  await transport(request, new AbortController().signal);

  expect(seen).toEqual(['1']);
  const headers = new Headers(fetch.mock.calls[0][1].headers);
  expect(headers.get('A')).toBe('1');
  expect(headers.get('B')).toBe('2');
});

test('passes the abort signal to fetch', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [(init) => ({ ...init, signal: undefined })],
  });
  const controller = new AbortController();

  await transport(request, controller.signal);
  controller.abort();

  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test('rejects with the abort reason when aborted', async () => {
  const fetch = jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      }),
  );
  const transport = createHttpDecisionTransport({ fetch: fetch as never });
  const controller = new AbortController();
  const reason = new Error('stop');

  const pending = catchError(transport(request, controller.signal));
  controller.abort(reason);

  expect(await pending).toBe(reason);
});

test('non-2xx maps to TransportError with retryability', async () => {
  const cases: [number, boolean][] = [
    [400, false],
    [429, true],
    [500, true],
    [503, true],
  ];

  for (const [status, retryable] of cases) {
    const fetch = jest.fn().mockResolvedValue(jsonResponse({}, status));
    const transport = createHttpDecisionTransport({ fetch });

    const error = await catchError(
      transport(request, new AbortController().signal),
    );

    expect(error).toBeInstanceOf(TransportError);
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(retryable);
  }
});

test('network errors are retryable TransportErrors', async () => {
  const fetch = jest.fn().mockRejectedValue(new TypeError('failed'));
  const transport = createHttpDecisionTransport({ fetch });

  const error = await catchError(
    transport(request, new AbortController().signal),
  );

  expect(error).toBeInstanceOf(TransportError);
  expect(error.retryable).toBe(true);
});

test('a 2xx body that is not JSON is a non-retryable TransportError', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue(new Response('nope', { status: 200 }));
  const transport = createHttpDecisionTransport({ fetch });

  const error = await catchError(
    transport(request, new AbortController().signal),
  );

  expect(error).toBeInstanceOf(TransportError);
  expect(error.retryable).toBe(false);
  expect(error.status).toBe(200);
});

test('keeps Content-Type when middleware replaces headers', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [(init) => ({ ...init, headers: { Authorization: 'x' } })],
  });

  await transport(request, new AbortController().signal);

  const headers = new Headers(fetch.mock.calls[0][1].headers);
  expect(headers.get('Authorization')).toBe('x');
  expect(headers.get('Content-Type')).toBe('application/json');
});

test('keeps Content-Type when middleware drops headers', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [(init) => ({ ...init, headers: undefined })],
  });

  await transport(request, new AbortController().signal);

  const headers = new Headers(fetch.mock.calls[0][1].headers);
  expect(headers.get('Content-Type')).toBe('application/json');
});

test('merges a Headers instance returned by middleware', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [
      (init) => ({ ...init, headers: new Headers({ 'X-Trace': '1' }) }),
    ],
  });

  await transport(request, new AbortController().signal);

  const headers = new Headers(fetch.mock.calls[0][1].headers);
  expect(headers.get('X-Trace')).toBe('1');
  expect(headers.get('Content-Type')).toBe('application/json');
});

test('abort during slow middleware rejects with the reason without fetching', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  const transport = createHttpDecisionTransport({
    fetch,
    middleware: [() => new Promise<RequestInit>(() => undefined)],
  });
  const controller = new AbortController();
  const reason = new Error('stop');

  const pending = catchError(transport(request, controller.signal));
  controller.abort(reason);

  expect(await pending).toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});
