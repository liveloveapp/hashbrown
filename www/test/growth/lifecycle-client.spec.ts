import { expect, test, vi } from 'vitest';

import {
  invokeLifecycle,
  nudgeLifecycle,
} from '../../src/lib/growth/lifecycle-client';

const THREAD_ID = '5b0c3f0e-7c1a-4f0a-9d2e-1a2b3c4d5e6f';
const INPUT = {
  baseUrl: 'https://lifecycle.example/',
  serviceSecret: 'service-secret',
  trigger: 'cron' as const,
};

function state(operatorAlerts: string[], recoveryPaused = false): string {
  return JSON.stringify({
    trigger: 'cron',
    result: { leased: 1, dispatched: 1, recoveryPaused, operatorAlerts },
  });
}

test('invokeLifecycle posts route /dispatch#workflow with the bearer and rejects a response of the wrong shape or over 64 KiB', async () => {
  const fetch = vi.fn(async () => new Response(state([])));
  const wrongShape = vi.fn(
    async () => new Response(JSON.stringify({ trigger: 'cron', result: {} })),
  );
  const oversize = vi.fn(async () => new Response('x'.repeat(65 * 1_024)));

  const result = await invokeLifecycle(INPUT, {
    fetch: fetch as never,
    randomUUID: () => THREAD_ID,
  });
  const wrong = invokeLifecycle(INPUT, {
    fetch: wrongShape as never,
    randomUUID: () => THREAD_ID,
  });
  const big = invokeLifecycle(INPUT, {
    fetch: oversize as never,
    randomUUID: () => THREAD_ID,
  });

  expect(result).toEqual({ operatorAlerts: [], threadId: THREAD_ID });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`https://lifecycle.example/threads/${THREAD_ID}/runs/wait`);
  expect(init.redirect).toBe('error');
  expect((init.headers as Record<string, string>)['authorization']).toBe(
    'Bearer service-secret',
  );
  expect(JSON.parse(String(init.body))).toEqual({
    route: '/dispatch#workflow',
    input: { trigger: 'cron' },
  });
  await expect(wrong).rejects.toThrow('invalid state');
  await expect(big).rejects.toThrow('invalid state');
});

test('invokeLifecycle accepts both operator alerts', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        state(
          ['mailbox_recovery_required', 'observation_projection_failed'],
          true,
        ),
      ),
  );
  const unknown = vi.fn(async () => new Response(state(['something_else'])));

  const result = await invokeLifecycle(INPUT, {
    fetch: fetch as never,
    randomUUID: () => THREAD_ID,
  });
  const rejected = invokeLifecycle(INPUT, {
    fetch: unknown as never,
    randomUUID: () => THREAD_ID,
  });

  expect(result.operatorAlerts).toEqual([
    'mailbox_recovery_required',
    'observation_projection_failed',
  ]);
  await expect(rejected).rejects.toThrow('invalid state');
});

test('invokeLifecycle accepts a projection alert without a recovery pause', async () => {
  const fetch = vi.fn(
    async () => new Response(state(['observation_projection_failed'], false)),
  );

  const result = await invokeLifecycle(INPUT, {
    fetch: fetch as never,
    randomUUID: () => THREAD_ID,
  });

  expect(result.operatorAlerts).toEqual(['observation_projection_failed']);
});

test('invokeLifecycle sends submission_id for a nudge and rejects a non-https origin', async () => {
  const submissionId = '018f47a2-4a2b-4f86-9f03-3dca36f26e55';
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          trigger: 'nudge',
          submission_id: submissionId,
          result: {
            leased: 0,
            dispatched: 0,
            recoveryPaused: false,
            operatorAlerts: [],
          },
        }),
      ),
  );

  const result = await invokeLifecycle(
    { ...INPUT, trigger: 'nudge', submissionId },
    { fetch: fetch as never, randomUUID: () => THREAD_ID },
  );
  const insecure = invokeLifecycle(
    { ...INPUT, baseUrl: 'http://lifecycle.example' },
    { fetch: fetch as never },
  );

  expect(result.threadId).toBe(THREAD_ID);
  const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(JSON.parse(String(init.body)).input).toEqual({
    trigger: 'nudge',
    submission_id: submissionId,
  });
  await expect(insecure).rejects.toThrow('HTTPS origin');
});

test('invokeLifecycle rejects a non-success status with a closed error', async () => {
  const fetch = vi.fn(async () => new Response('boom', { status: 502 }));

  const result = invokeLifecycle(INPUT, { fetch: fetch as never });

  await expect(result).rejects.toThrow('not accepted');
});

test('invokeLifecycle rejects an out-of-range timeout as its own error', async () => {
  const fetch = vi.fn();

  const result = invokeLifecycle(
    { ...INPUT, timeoutMs: 10 },
    { fetch: fetch as never },
  );

  await expect(result).rejects.toThrow('timeout must be between');
  expect(fetch).not.toHaveBeenCalled();
});

const SUBMISSION_ID = '018f47a2-4a2b-4f86-9f03-3dca36f26e55';

function stubLifecycleEnv(overrides: Record<string, string> = {}) {
  const env = {
    LIFECYCLE_CRON_ENABLED: 'true',
    LIFECYCLE_URL: 'https://lifecycle.example',
    LIFECYCLE_SERVICE_SECRET: 'service-secret',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

test('nudgeLifecycle does nothing unless the switch is exactly true and the URL and secret are set', async () => {
  try {
    const invoke = vi.fn();
    stubLifecycleEnv({ LIFECYCLE_CRON_ENABLED: 'TRUE' });
    await nudgeLifecycle({ submissionId: SUBMISSION_ID }, invoke);
    stubLifecycleEnv({ LIFECYCLE_URL: '' });
    await nudgeLifecycle({ submissionId: SUBMISSION_ID }, invoke);
    stubLifecycleEnv({ LIFECYCLE_SERVICE_SECRET: '' });
    await nudgeLifecycle({ submissionId: SUBMISSION_ID }, invoke);

    expect(invoke).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

test('nudgeLifecycle invokes a nudge with a 2 s timeout and never throws', async () => {
  try {
    stubLifecycleEnv();
    const invoke = vi.fn(async () => {
      throw new Error('down');
    });

    await expect(
      nudgeLifecycle({ submissionId: SUBMISSION_ID }, invoke as never),
    ).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith({
      baseUrl: 'https://lifecycle.example',
      serviceSecret: 'service-secret',
      timeoutMs: 2_000,
      trigger: 'nudge',
      submissionId: SUBMISSION_ID,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
