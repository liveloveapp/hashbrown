/// <reference types="vitest" />

import { afterEach, beforeEach, vi } from 'vitest';

type FetchLike = typeof fetch;

const DEFAULT_ENV: Record<string, string> = {
  OPENAI_API_KEY: 'test-openai-key',
  CHROMA_URL: 'http://localhost:8000',
  CHROMA_EMBED_MODEL: 'text-embedding-3-small',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(DEFAULT_ENV)) {
    vi.stubEnv(key, value);
  }

  const mockedFetch = vi.fn();
  globalThis.fetch = mockedFetch as unknown as FetchLike;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

export function useFetchMock() {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as FetchLike;
  return fetchMock;
}

export function createJsonResponse<T>(
  body: T,
  init: ResponseInit = { status: 200, statusText: 'OK' },
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });
}

export function createTextResponse(
  body: string,
  init: ResponseInit = { status: 200, statusText: 'OK' },
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      ...(init.headers ?? {}),
    },
    ...init,
  });
}
