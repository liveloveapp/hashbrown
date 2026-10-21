/**
 * Builds a `fetch` stand-in that serves canned responses and records every
 * call. Routes are keyed `"<METHOD> <path+search>"`; a route is either
 * `{ status?, body? }` or a function returning one. Unknown routes answer 404.
 *
 * @param {Record<string, object | (() => object)>} routes Canned responses.
 * @returns {{ fetchImpl: typeof fetch, calls: Array<{ method: string, path: string, body: unknown }> }}
 */
export function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: path } }),
        { status: 404 },
      );
    }
    const { status = 200, body = {} } =
      typeof handler === 'function' ? handler() : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}
