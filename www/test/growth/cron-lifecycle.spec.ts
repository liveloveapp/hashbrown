import { expect, test, vi } from 'vitest';

import { LifecycleInvokeError } from '../../src/lib/growth/lifecycle-client';
import {
  createLifecycleCronRoute,
  maxDuration,
} from '../../src/app/%5F/cron/lifecycle/route';

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
      timeoutMs: 58_000,
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

test('cron route may run for 60 s, the longest a tick takes', () => {
  const seconds = maxDuration;

  expect(seconds).toBe(60);
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

test('the cron deletes its thread after a successful run', async () => {
  await isolated(async () => {
    configure();
    const invoke = vi.fn(async () => ({ operatorAlerts: [], threadId: 't-1' }));
    const deleteThread = vi.fn(async () => undefined);
    const route = createLifecycleCronRoute({ invoke, deleteThread });

    const response = await route(request());

    expect(response.status).toBe(200);
    expect(deleteThread).toHaveBeenCalledWith({
      baseUrl: 'https://lifecycle.example',
      serviceSecret: 'service-secret',
      threadId: 't-1',
      timeoutMs: 5_000,
    });
  });
});

test('the cron still answers 200 when the delete fails or times out', async () => {
  await isolated(async () => {
    configure();
    const invoke = vi.fn(async () => ({ operatorAlerts: [], threadId: 't-1' }));
    const deleteThread = vi.fn(async () => {
      throw new Error('delete timed out');
    });
    const route = createLifecycleCronRoute({ invoke, deleteThread });

    const response = await route(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      operator_alerts: [],
    });
  });
});

test('a failed run still deletes its thread and answers 503', async () => {
  await isolated(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    const invoke = vi.fn(async () => {
      throw new LifecycleInvokeError(
        'Lifecycle dispatch rejected',
        't-2',
        true,
      );
    });
    const deleteThread = vi.fn(async () => undefined);
    const route = createLifecycleCronRoute({ invoke, deleteThread });

    const response = await route(request());

    expect(response.status).toBe(503);
    expect(deleteThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 't-2' }),
    );
  });
});

test('the cron does not delete the thread of a run that never completed', async () => {
  await isolated(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    const invoke = vi.fn(async () => {
      throw new LifecycleInvokeError('timed out', 't-3', false);
    });
    const deleteThread = vi.fn(async () => undefined);
    const route = createLifecycleCronRoute({ invoke, deleteThread });

    const response = await route(request());

    expect(response.status).toBe(503);
    expect(deleteThread).not.toHaveBeenCalled();
  });
});

test('the cron logs alerts before a slow delete and answers inside its budget', async () => {
  await isolated(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    let clock = 0;
    const invoke = vi.fn(async () => {
      clock = 57_500;
      return {
        operatorAlerts: ['action_origin_invalid' as const],
        threadId: 't-4',
      };
    });
    const deleteThread = vi.fn(
      () => new Promise<void>(() => undefined), // never settles
    );
    const route = createLifecycleCronRoute({
      invoke,
      deleteThread,
      now: () => clock,
    });

    const startedAt = Date.now();
    const response = await route(request());

    expect(response.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(2_500);
    expect(deleteThread).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 1_500 }),
    );
    expect(warn).toHaveBeenCalledWith(
      '[lifecycle-operator-alert]',
      'action_origin_invalid',
    );
  });
});

test('the cron skips the delete when no budget is left', async () => {
  await isolated(async () => {
    configure();
    let clock = 0;
    const invoke = vi.fn(async () => {
      clock = 59_500;
      return { operatorAlerts: [], threadId: 't-5' };
    });
    const deleteThread = vi.fn(async () => undefined);
    const route = createLifecycleCronRoute({
      invoke,
      deleteThread,
      now: () => clock,
    });

    const response = await route(request());

    expect(response.status).toBe(200);
    expect(deleteThread).not.toHaveBeenCalled();
  });
});
