import { type PosthogEnv, env as readEnv } from './env.ts';

/** The subset of `fetch` the client needs; injectable for tests. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Query string values; `undefined` entries are omitted. */
export type QueryParams = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/**
 * A minimal PostHog project API client. Paths are relative to
 * `/api/projects/<id>` and start with `/`. Responses are parsed JSON with no
 * generated types; callers narrow what they read.
 */
export interface PosthogClient {
  /** GET a path, with an optional query string. */
  get<T = unknown>(path: string, query?: QueryParams): Promise<T>;
  /** POST a JSON body. */
  post<T = unknown>(path: string, body: unknown): Promise<T>;
  /** PATCH a JSON body. */
  patch<T = unknown>(path: string, body: unknown): Promise<T>;
}

/** Options for {@link createPosthogClient}. */
export interface PosthogClientOptions {
  /** Environment to use; defaults to the parsed process environment. */
  env?: PosthogEnv;
  /** Fetch implementation; defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Delay implementation; defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

/** Statuses retried with backoff: rate limiting and gateway failures. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  429, 502, 503, 504,
]);
/** Retries after the first attempt. */
export const MAX_RETRIES = 3;
/** First backoff delay; doubles per retry. */
export const BASE_BACKOFF_MS = 500;
/** Upper bound for any single delay, including a server `Retry-After`. */
export const MAX_BACKOFF_MS = 2000;

function backoffMs(retry: number, response: Response): number {
  const exponential = BASE_BACKOFF_MS * 2 ** retry;
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  const requested =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
  return Math.min(MAX_BACKOFF_MS, Math.max(exponential, requested));
}

function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function failureDetail(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/g, ' ').trim();
    return text ? `: ${text.slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

/**
 * Creates a PostHog client with Bearer auth that retries 429/502/503/504
 * {@link MAX_RETRIES} times with doubling, capped backoff. Error messages
 * carry the method, path, status and a truncated body, never the key.
 *
 * @param options - Injected environment, fetch and sleep.
 * @returns The client.
 */
export function createPosthogClient(
  options: PosthogClientOptions = {},
): PosthogClient {
  const environment = options.env ?? readEnv();
  const fetchFn: FetchLike =
    options.fetch ?? ((input, init) => fetch(input, init));
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const base = `${environment.POSTHOG_HOST}/api/projects/${environment.POSTHOG_PROJECT_ID}`;

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body: unknown,
    query?: QueryParams,
  ): Promise<T> {
    const url = `${base}${path}${buildQuery(query)}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${environment.POSTHOG_PERSONAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };

    let response = await fetchFn(url, init);
    for (
      let retry = 0;
      retry < MAX_RETRIES && RETRYABLE_STATUSES.has(response.status);
      retry += 1
    ) {
      await sleep(backoffMs(retry, response));
      response = await fetchFn(url, init);
    }

    if (!response.ok) {
      throw new Error(
        `PostHog ${method} ${path} failed with ${response.status}${await failureDetail(response)}`,
      );
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    get: (path, query) => request('GET', path, undefined, query),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
  };
}
