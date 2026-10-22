import { expect, test, vi } from 'vitest';

import { createLifecycleCronRoute } from '../../src/app/%5F/cron/lifecycle/route';

const URL_ = 'https://hashbrown.dev/_/cron/lifecycle';

function configure(overrides: Record<string, string | undefined> = {}) {
  const env = {
    CRON_SECRET: 'cron-secret',
    LIFECYCLE_CRON_ENABLED: 'true',
    LIFECYCLE_URL: 'https://lifecycle.example',
    LIFECYCLE_SERVICE_SECRET: 'service-secret',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, undefined as never);
    else vi.stubEnv(key, value);
  }
}

function request(secret = 'cron-secret'): Request {
  return new Request(URL_, { headers: { authorization: `Bearer ${secret}` } });
}

/** Runs a test body, then restores stubbed env and spies. */
async function isolated(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } finally {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  }
}

test('cron route: 401 wrong secret, 503 when disabled or unconfigured, 200 with operator_alerts, 503 on invoke failure', async () => {
  await isolated(async () => {
    const invoke = vi.fn(async () => ({
      operatorAlerts: ['observation_projection_failed' as const],
      threadId: 't',
    }));
    const route = createLifecycleCronRoute({ invoke });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();

    const wrong = await route(request('nope'));
    const ok = await route(request());
    configure({ LIFECYCLE_CRON_ENABLED: 'false' });
    const disabled = await route(request());
    configure({ LIFECYCLE_URL: '' });
    const unconfigured = await route(request());
    configure();
    const failing = await createLifecycleCronRoute({
      invoke: async () => {
        throw new Error('down');
      },
    })(request());

    expect(wrong.status).toBe(401);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      accepted: true,
      operator_alerts: ['observation_projection_failed'],
    });
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({
      baseUrl: 'https://lifecycle.example',
      serviceSecret: 'service-secret',
      timeoutMs: 15_000,
      trigger: 'cron',
    });
    expect(warn).toHaveBeenCalledWith(
      '[lifecycle-operator-alert]',
      'observation_projection_failed',
    );
    expect(disabled.status).toBe(503);
    expect(unconfigured.status).toBe(503);
    expect(failing.status).toBe(503);
    expect(await failing.json()).toEqual({ accepted: false });
  });
});

test('cron route rejects every request when CRON_SECRET is unset', async () => {
  await isolated(async () => {
    const invoke = vi.fn();
    const route = createLifecycleCronRoute({ invoke: invoke as never });
    configure({ CRON_SECRET: undefined });

    const response = await route(request(''));

    expect(response.status).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
  });
});

test('cron route logs a fixed line when the dispatch fails', async () => {
  await isolated(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    const route = createLifecycleCronRoute({
      invoke: async () => {
        throw new Error('Lifecycle dispatch request failed');
      },
    });

    const response = await route(request());

    expect(response.status).toBe(503);
    expect(warn).toHaveBeenCalledWith(
      '[lifecycle-cron-failed]',
      'Lifecycle dispatch request failed',
    );
  });
});

test('cron route logs a misconfiguration once, without the value, for a switch that is neither true nor false', async () => {
  await isolated(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invoke = vi.fn();
    configure({ LIFECYCLE_CRON_ENABLED: 'yes-please' });
    const route = createLifecycleCronRoute({ invoke: invoke as never });

    const response = await route(request());
    const explicitlyOff = await (configure({ LIFECYCLE_CRON_ENABLED: 'false' }),
    route(request()));

    expect(response.status).toBe(503);
    expect(explicitlyOff.status).toBe(503);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[lifecycle-cron-misconfigured]');
    expect(invoke).not.toHaveBeenCalled();
  });
});
