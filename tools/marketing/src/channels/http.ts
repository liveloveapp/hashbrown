/**
 * A create call failed in a way that leaves its outcome unknown: it timed out,
 * the connection broke, the server answered 5xx, or it answered 2xx without
 * the result. The post may already be live, so the caller must not retry.
 */
export class OutcomeUnknownError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OutcomeUnknownError';
  }
}

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
   * The request creates something (a post, a comment, an article). A
   * timeout, network error, 5xx or unreadable 2xx then throws
   * {@link OutcomeUnknownError}, because it may have been created. A 4xx is a
   * definite rejection and throws an ordinary error.
   */
  creates?: boolean;
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

/** A non-2xx answer below 500: the server definitely did not act on it. */
class DefiniteHttpError extends Error {}

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
 * @throws When the response is not 2xx or not JSON; with `creates`, an
 *   {@link OutcomeUnknownError} when the request may have taken effect.
 */
export async function http<T = unknown>(opts: HttpOpts): Promise<T> {
  if (!opts.creates) return request<T>(opts);
  try {
    return await request<T>(opts);
  } catch (error) {
    if (error instanceof DefiniteHttpError) throw error;
    if (error instanceof OutcomeUnknownError) throw error;
    throw new OutcomeUnknownError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

async function request<T>(opts: HttpOpts): Promise<T> {
  // Repeating a create could make it twice.
  const retryOn5xx = !opts.creates && opts.retryOn5xx !== false;
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
      // Thrown by the hook (a failed refresh) before anything else is sent.
      let result;
      try {
        result = await opts.on401();
      } catch (error) {
        throw definite(error);
      }
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

function definite(error: unknown): Error {
  if (error instanceof DefiniteHttpError) return error;
  return new DefiniteHttpError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
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
  const message = `HTTP ${res.status}: ${body.slice(0, 500)}`;
  return res.status < 500 ? new DefiniteHttpError(message) : new Error(message);
}
