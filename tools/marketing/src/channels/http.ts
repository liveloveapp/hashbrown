export interface HttpOpts {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  retryOn5xx?: boolean;
  /**
   * Called on a 401. Returning `retry: true` repeats the request once, with
   * `headers` merged over the originals so a refreshed token can replace the
   * stale one.
   */
  on401?: () => Promise<
    { retry: true; headers?: Record<string, string> } | { retry: false }
  >;
  /** Called with the response headers of a successful (2xx) response. */
  onHeaders?: (headers: Headers) => void;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function doFetch(opts: HttpOpts): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    return await (opts.fetch ?? fetch)(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON over HTTP with a timeout, retries on 5xx and a hook for 401.
 *
 * @throws When the response is not 2xx or not JSON.
 */
export async function http<T = unknown>(opts: HttpOpts): Promise<T> {
  const retryOn5xx = opts.retryOn5xx !== false;
  let lastError: Error | undefined;

  // Initial attempt + retries on 5xx
  const maxAttempts = retryOn5xx ? RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await doFetch(opts);
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw lastError;
    }

    if (res.status === 401 && opts.on401) {
      const result = await opts.on401();
      if (result.retry) {
        const retryRes = await doFetch({
          ...opts,
          headers: { ...opts.headers, ...result.headers },
        });
        return await parseOrThrow<T>(retryRes, opts.onHeaders);
      }
      throw await toError(res);
    }

    if (res.status >= 500 && retryOn5xx && attempt < maxAttempts - 1) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      lastError = await toError(res);
      continue;
    }

    return await parseOrThrow<T>(res, opts.onHeaders);
  }

  throw lastError ?? new Error('http: exhausted retries without an error');
}

async function parseOrThrow<T>(
  res: Response,
  onHeaders?: (headers: Headers) => void,
): Promise<T> {
  if (res.status >= 200 && res.status < 300) {
    onHeaders?.(res.headers);
    const text = await res.text();
    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `HTTP ${res.status}: non-JSON response: ${text.slice(0, 200)}`,
      );
    }
  }
  throw await toError(res);
}

async function toError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
}
