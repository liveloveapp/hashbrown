/** A JSON `Response` for a mocked `fetch`. */
export function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** The parsed JSON body of the Nth `fetch` call. */
export function bodyOf(
  fetchMock: { mock: { calls: unknown[][] } },
  call: number,
): unknown {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

/** The `[url, init]` of each `fetch` call, typed. */
export function callsOf(fetchMock: {
  mock: { calls: unknown[][] };
}): Array<[string, RequestInit]> {
  return fetchMock.mock.calls as Array<[string, RequestInit]>;
}

/** The header map of the Nth `fetch` call. */
export function headersOf(
  fetchMock: { mock: { calls: unknown[][] } },
  call: number,
): Record<string, string> {
  return callsOf(fetchMock)[call][1].headers as Record<string, string>;
}

/** A `fetch` that never answers and rejects once its request is aborted. */
export function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });
}

/** The ways a create call can fail after the request may have been sent. */
export const UNKNOWN_OUTCOME_FAILURES: Array<
  [string, () => Promise<Response>]
> = [
  ['a 503', async () => new Response('boom', { status: 503 })],
  [
    'a network error',
    async () => {
      throw new TypeError('fetch failed: socket hang up');
    },
  ],
];
