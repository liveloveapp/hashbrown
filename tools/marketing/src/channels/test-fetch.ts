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
