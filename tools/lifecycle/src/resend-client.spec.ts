import { expect, test, vi } from 'vitest';

import {
  classifyResendProviderError,
  type RecipientEmailProviderPayload,
} from './growth.ts';
import { createResendFetchClient } from './resend-client.ts';

const API_KEY = 're_secret_api_key_value';

const PAYLOAD: RecipientEmailProviderPayload = {
  from: 'Brian at Hashbrown <brian@hashbrown.dev>',
  to: 'someone@example.com',
  replyTo: 'Brian at Hashbrown <brian@hashbrown.dev>',
  subject: 'Hello',
  text: 'Body',
  html: '<p>Body</p>',
  headers: {
    'List-Unsubscribe': '<https://hashbrown.dev/u>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Hashbrown-Job-ID': 'job-1',
  },
  tags: [{ name: 'environment', value: 'test' }],
};

function respondWith(response: () => Response | Promise<Response>) {
  return vi.fn<typeof globalThis.fetch>(async () => response());
}

test('emails.send posts to /emails with bearer, JSON and Idempotency-Key headers and REST field names', async () => {
  const fetch = respondWith(() => Response.json({ id: 'em_1' }));
  const client = createResendFetchClient({ apiKey: API_KEY, fetch });

  await client.emails.send(PAYLOAD, { idempotencyKey: 'send_step:job-1' });

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(init?.method).toBe('POST');
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
  expect(headers.get('content-type')).toBe('application/json');
  expect(headers.get('idempotency-key')).toBe('send_step:job-1');
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(String(init?.body))).toEqual({
    from: PAYLOAD.from,
    to: PAYLOAD.to,
    reply_to: PAYLOAD.replyTo,
    subject: PAYLOAD.subject,
    text: PAYLOAD.text,
    html: PAYLOAD.html,
    headers: PAYLOAD.headers,
    tags: PAYLOAD.tags,
  });
});

test('emails.send omits reply_to and html when the payload has none', async () => {
  const fetch = respondWith(() => Response.json({ id: 'em_2' }));
  const client = createResendFetchClient({ apiKey: API_KEY, fetch });

  await client.emails.send(
    {
      from: PAYLOAD.from,
      to: 'founder@hashbrown.dev',
      subject: 'Digest',
      text: 'Body',
      tags: [],
    },
    { idempotencyKey: 'internal:1' },
  );

  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    from: PAYLOAD.from,
    to: 'founder@hashbrown.dev',
    subject: 'Digest',
    text: 'Body',
    tags: [],
  });
});

test('a 200 with an id maps to data', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() => Response.json({ id: 'em_1' })),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result).toEqual({ data: { id: 'em_1' }, error: null });
});

test('a 422 with a Resend error body maps to that error and status', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() =>
      Response.json(
        {
          name: 'validation_error',
          message: 'Invalid `to` field.',
          statusCode: 422,
        },
        { status: 422 },
      ),
    ),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result).toEqual({
    data: null,
    error: {
      name: 'validation_error',
      message: 'Invalid `to` field.',
      statusCode: 422,
    },
  });
});

test('an error body without statusCode takes the HTTP status', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() =>
      Response.json(
        { name: 'rate_limit_exceeded', message: 'Too many requests' },
        { status: 429 },
      ),
    ),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result.error).toEqual({
    name: 'rate_limit_exceeded',
    message: 'Too many requests',
    statusCode: 429,
  });
});

test('an HTTP 503 keeps its status even when the body claims a 4xx, so it is classified unknown', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() =>
      Response.json(
        { statusCode: 422, name: 'validation_error', message: 'x' },
        { status: 503 },
      ),
    ),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result.error).toEqual({
    name: 'validation_error',
    message: 'x',
    statusCode: 503,
  });
  expect(result.error && classifyResendProviderError(result.error)).toBe(
    'unknown',
  );
});

test('a 500 maps to an error with status 500', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() =>
      Response.json(
        { name: 'internal_server_error', message: 'Oops' },
        { status: 500 },
      ),
    ),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result.data).toBeNull();
  expect(result.error?.statusCode).toBe(500);
});

test('a thrown fetch, a timeout, a non-JSON body and a 2xx without id map to statusCode null application_error', async () => {
  const thrown = createResendFetchClient({
    apiKey: API_KEY,
    fetch: vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError(`fetch failed for Bearer ${API_KEY}`);
    }),
  });
  const timedOut = createResendFetchClient({
    apiKey: API_KEY,
    timeoutMs: 5,
    fetch: vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    ),
  });
  const html = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    ),
  });
  const okNotJson = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() => new Response('accepted', { status: 200 })),
  });
  const noId = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() => Response.json({ object: 'email' })),
  });
  const huge = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(
      () => new Response(`{"id":"${'x'.repeat(70 * 1024)}"}`, { status: 200 }),
    ),
  });

  const results = await Promise.all(
    [thrown, timedOut, html, okNotJson, noId, huge].map((client) =>
      client.emails.send(PAYLOAD, { idempotencyKey: 'k' }),
    ),
  );

  for (const result of results) {
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      name: 'application_error',
      statusCode: null,
    });
    expect(typeof result.error?.message).toBe('string');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain('someone@example.com');
  }
});

test('the API key never appears in a returned error message even when Resend echoes it', async () => {
  const client = createResendFetchClient({
    apiKey: API_KEY,
    fetch: respondWith(() =>
      Response.json(
        { name: 'invalid_api_key', message: `API key ${API_KEY} is invalid` },
        { status: 403 },
      ),
    ),
  });

  const result = await client.emails.send(PAYLOAD, { idempotencyKey: 'k' });

  expect(result.error?.statusCode).toBe(403);
  expect(result.error?.name).toBe('invalid_api_key');
  expect(JSON.stringify(result)).not.toContain(API_KEY);
});
