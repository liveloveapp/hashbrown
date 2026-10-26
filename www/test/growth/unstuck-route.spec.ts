import {
  acceptFormSubmission,
  FormRateLimitError,
  FormSubmissionConflictError,
  type SqlExecutor,
} from '@hashbrownai-internal/growth';
import { expect, test, vi } from 'vitest';

import { createUnstuckRoute } from '../../src/app/%5F/forms/unstuck/handler';
import { nudgeLifecycle } from '../../src/lib/growth/lifecycle-client';

const URL_ = 'https://hashbrown.dev/_/forms/unstuck';
const SUBMISSION_ID = '5b0d3f5e-3f55-4a9b-8d0a-0f8b3d5c1a11';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const EMAIL = 'Jordan@Acme.dev';
const MESSAGE = 'I cannot get streaming tool calls to render.';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    submission_id: SUBMISSION_ID,
    email: EMAIL,
    message: MESSAGE,
    ...overrides,
  };
}

function post(
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): Request {
  return new Request(URL_, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function harness(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const close = vi.fn(async () => {
    events.push('close');
  });
  const database = { close } as unknown as SqlExecutor;
  const accept = vi.fn<typeof acceptFormSubmission>(async () => {
    events.push('accept');
    return {
      accepted: true as const,
      approved: true,
      contactId: 'c1',
      submissionId: SUBMISSION_ID,
    };
  });
  const nudge = vi.fn<typeof nudgeLifecycle>(async () => {
    events.push('nudge');
  });
  const deps = {
    enabled: () => true,
    accept,
    createDatabase: () => database,
    loadKeyring: () => ({ active: { version: 1, secret: 'k'.repeat(48) } }),
    now: () => NOW,
    nudge,
    ...overrides,
  };
  return {
    route: createUnstuckRoute(deps as never),
    accept,
    nudge,
    close,
    events,
  };
}

test('switch off answers 503 before reading the body', async () => {
  const { route, accept, nudge } = harness({ enabled: () => false });
  const request = post(validBody());

  const response = await route.POST(request);

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(request.bodyUsed).toBe(false);
  expect(accept).not.toHaveBeenCalled();
  expect(nudge).not.toHaveBeenCalled();
});

test('commits, closes the database, then nudges, and answers 200', async () => {
  vi.stubEnv('VERCEL', '1');
  const { route, accept, events } = harness();
  const request = post(validBody({ message: `  ${MESSAGE}  ` }), {
    'content-type': 'application/json; charset=utf-8',
    'x-vercel-forwarded-for': '203.0.113.7',
  });

  const response = await route.POST(request);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(events).toEqual(['accept', 'close', 'nudge']);
  const input = accept.mock.calls[0][1];
  expect(input).toMatchObject({
    submissionId: SUBMISSION_ID,
    email: 'jordan@acme.dev',
    form: { message: MESSAGE },
    occurredAt: NOW,
    trustedClientIp: '203.0.113.7',
  });
});

test('the honeypot is passed to the library, not decided by the route', async () => {
  const { route, accept } = harness();

  const response = await route.POST(
    post(validBody({ website_url: 'http://spam' })),
  );

  expect(response.status).toBe(200);
  expect(accept.mock.calls[0][1].honeypot).toBe('http://spam');
});

test('nudge failure still answers 200', async () => {
  const nudge = vi.fn(async () => {
    throw new Error('lifecycle down');
  });
  const { route } = harness({ nudge });

  const response = await route.POST(post(validBody()));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(nudge).toHaveBeenCalledTimes(1);
});

test('a body from a page opened before the deploy still answers 200 and drops the legacy keys', async () => {
  const { route, accept } = harness();
  const body = validBody({
    message: `  ${MESSAGE}  `,
    policy_version: 'unstuck_v1.2026-10-22',
    framework: 'react',
  });

  const response = await route.POST(post(body));

  expect(response.status).toBe(200);
  expect(accept).toHaveBeenCalledTimes(1);
  const input = accept.mock.calls[0][1];
  expect(input).not.toHaveProperty('noticeText');
  expect(input).not.toHaveProperty('noticeVersion');
  expect(input).not.toHaveProperty('policyVersion');
  expect(input.form).toEqual({ message: MESSAGE });
});

test('an unknown extra key still answers 400', async () => {
  const { route, accept } = harness();

  const response = await route.POST(post(validBody({ colour: 'blue' })));

  expect(response.status).toBe(400);
  expect(accept).not.toHaveBeenCalled();
});

test('non-JSON, oversized, wrong content type and schema failures answer 400 without echoing values', async () => {
  const { route, accept } = harness();
  const secret = 'leaky-value-123';
  const cases = [
    post('{nope'),
    post('[]'),
    post('x'.repeat(9_000)),
    post(validBody(), { 'content-type': 'text/plain' }),
    post(validBody({ extra: secret })),
    post(validBody({ submission_id: 'not-a-uuid' })),
    post(validBody({ website_url: secret.repeat(20) })),
    post(validBody({ email: `${secret}${'a'.repeat(260)}@acme.dev` })),
  ];

  const responses = await Promise.all(cases.map((c) => route.POST(c)));

  for (const response of responses) {
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain(secret);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(accept).not.toHaveBeenCalled();
});

test('a short message and a bad email each answer 400', async () => {
  const { route, accept } = harness();

  const short = await route.POST(post(validBody({ message: 'too short' })));
  const email = await route.POST(post(validBody({ email: 'not an email' })));

  expect(short.status).toBe(400);
  expect(email.status).toBe(400);
  expect(await email.json()).toEqual({ error: 'Valid email required' });
  expect(accept).not.toHaveBeenCalled();
});

test('the message is measured like the library: trimmed UTF-16 units, 20 to 1000 inclusive', async () => {
  const { route } = harness();
  const bodyFor = (length: number) =>
    validBody({ message: ` ${'a'.repeat(length)} ` });

  const statuses = [19, 20, 1000, 1001].map(
    async (length) => (await route.POST(post(bodyFor(length)))).status,
  );

  expect(await Promise.all(statuses)).toEqual([400, 200, 200, 400]);
});

test('rate limit answers 429 with Retry-After and no nudge', async () => {
  const { route, nudge, close } = harness({
    accept: vi.fn(async () => {
      throw new FormRateLimitError(1_234);
    }),
  });

  const response = await route.POST(post(validBody()));

  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('1234');
  expect(await response.json()).toMatchObject({ retryable: true });
  expect(nudge).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test('a changed payload on a reused submission id answers 422 without retryable', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { route, nudge, close } = harness({
    accept: vi.fn(async () => {
      throw new FormSubmissionConflictError(
        'Form submission identity conflict',
      );
    }),
  });

  const response = await route.POST(post(validBody()));

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: 'This submission changed. Please send it again.',
  });
  expect(nudge).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  expect(error.mock.calls).toEqual([
    [
      '[unstuck-form-failed]',
      { stage: 'accept', name: 'FormSubmissionConflictError' },
    ],
  ]);
  error.mockRestore();
});

test('a byte-identical retry still answers 200', async () => {
  const { route, accept, nudge } = harness();

  const first = await route.POST(post(validBody()));
  const retry = await route.POST(post(validBody()));

  expect(first.status).toBe(200);
  expect(retry.status).toBe(200);
  expect(accept).toHaveBeenCalledTimes(2);
  expect(nudge).toHaveBeenCalledTimes(2);
});

test('a suppressed submission answers a silent 200 without nudging', async () => {
  const { route, nudge } = harness({
    accept: vi.fn(async () => ({
      accepted: true as const,
      approved: false,
      contactId: 'c1',
      submissionId: SUBMISSION_ID,
      deliverySuppressed: true as const,
    })),
  });

  const response = await route.POST(post(validBody()));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(nudge).not.toHaveBeenCalled();
});

test('database, keyring, accept and close failures answer 503 retryable without secrets', async () => {
  const boom = () => {
    throw new Error('postgres://user:hunter2@host/db');
  };
  const closeFails = harness({
    createDatabase: () =>
      ({
        close: async () => {
          throw new Error('hunter2');
        },
      }) as unknown as SqlExecutor,
  });
  const variants = [
    harness({ createDatabase: boom }),
    harness({ loadKeyring: boom }),
    harness({ accept: vi.fn(async () => boom()) }),
    closeFails,
  ];

  for (const variant of variants) {
    const response = await variant.route.POST(post(validBody()));
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ retryable: true });
    expect(text).not.toContain('hunter2');
    expect(variant.nudge).not.toHaveBeenCalled();
  }
});

test('a failing setup, accept or close logs the stage and error name without submitted values', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const secret = new TypeError(`insert failed for ${EMAIL} ${MESSAGE}`);
  const variants = [
    harness({
      loadKeyring: () => {
        throw secret;
      },
    }),
    harness({ accept: vi.fn(async () => Promise.reject(secret)) }),
    harness({
      createDatabase: () =>
        ({
          close: async () => {
            throw secret;
          },
        }) as unknown as SqlExecutor,
    }),
  ];

  for (const variant of variants) {
    await variant.route.POST(post(validBody()));
  }

  expect(error.mock.calls).toEqual([
    ['[unstuck-form-failed]', { stage: 'setup', name: 'TypeError' }],
    ['[unstuck-form-failed]', { stage: 'accept', name: 'TypeError' }],
    ['[unstuck-form-failed]', { stage: 'close', name: 'TypeError' }],
  ]);
  const logged = JSON.stringify(error.mock.calls);
  expect(logged).not.toContain('Acme');
  expect(logged.toLowerCase()).not.toContain('jordan');
  expect(logged).not.toContain(MESSAGE);
  error.mockRestore();
});

test('a rate limit is not logged as a failure', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { route } = harness({
    accept: vi.fn(async () => {
      throw new FormRateLimitError(60);
    }),
  });

  await route.POST(post(validBody()));

  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('a message containing NUL answers 400 before accepting', async () => {
  const { route, accept } = harness();

  const response = await route.POST(
    post(validBody({ message: `${MESSAGE}\u0000` })),
  );

  expect(response.status).toBe(400);
  expect(accept).not.toHaveBeenCalled();
});
