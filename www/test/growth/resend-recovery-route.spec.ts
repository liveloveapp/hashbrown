import { expect, test, vi } from 'vitest';

import { createInboxRecoveryRoute } from '../../src/app/%5F/cron/inbox-recovery/route';

test('recovery refuses missing or wrong bearer authorization before any work', async () => {
  const recover = vi.fn();
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover,
  });

  expect((await route.GET(new Request('https://hashbrown.dev'))).status).toBe(
    401,
  );
  expect(
    (
      await route.GET(
        new Request('https://hashbrown.dev', {
          headers: { authorization: 'Bearer wrong' },
        }),
      )
    ).status,
  ).toBe(401);
  expect(recover).not.toHaveBeenCalled();
});

test('recovery failure is generic and cannot masquerade as a successful scan', async () => {
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => {
      throw new Error('private detail');
    },
  });

  const response = await route.GET(
    new Request('https://hashbrown.dev', {
      headers: { authorization: `Bearer ${'s'.repeat(32)}` },
    }),
  );

  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private detail');
});

test('authorized recovery returns only aggregate counts', async () => {
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => ({ received: 2, processed: 1 }),
  });

  const response = await route.GET(
    new Request('https://hashbrown.dev', {
      headers: { authorization: `Bearer ${'s'.repeat(32)}` },
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: 2, processed: 1 });
});

function authorizedRequest(): Request {
  return new Request('https://hashbrown.test/recovery', {
    headers: { authorization: `Bearer ${'s'.repeat(32)}` },
  });
}

test('unauthorized recovery never reads health or submits an alert', async () => {
  const readHealth = vi.fn();
  const report = vi.fn();
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: vi.fn(),
    readHealth,
    report,
  });

  const response = await route.GET(
    new Request('https://hashbrown.test/recovery'),
  );

  expect(response.status).toBe(401);
  expect(readHealth).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});

test('authorized recovery reports unhealthy closed codes and returns the notification outcome', async () => {
  const report = vi.fn().mockResolvedValue({ status: 'sent', queued: true });
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => ({ received: 2, processed: 1 }),
    readHealth: async () => ({ codes: ['coverage_stale'] }),
    report,
  });

  const response = await route.GET(authorizedRequest());

  expect(response.status).toBe(200);
  expect(report).toHaveBeenCalledWith(['coverage_stale']);
  expect(await response.json()).toMatchObject({
    received: 2,
    processed: 1,
    notification: { status: 'sent', queued: true },
  });
});

test('healthy recovery reports an empty code set for recovery transitions', async () => {
  const report = vi.fn().mockResolvedValue({ status: 'idle', queued: false });
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => ({ received: 0, processed: 0 }),
    readHealth: async () => ({ codes: [] }),
    report,
  });

  const response = await route.GET(authorizedRequest());

  expect(response.status).toBe(200);
  expect(report).toHaveBeenCalledWith([]);
});

test('failed recovery still reports failure alongside actual health and stays unavailable', async () => {
  const report = vi.fn().mockResolvedValue({ status: 'sent', queued: true });
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => {
      throw new Error('private recovery detail');
    },
    readHealth: async () => ({ codes: ['coverage_stale'] }),
    report,
  });

  const response = await route.GET(authorizedRequest());

  expect(response.status).toBe(503);
  expect(report).toHaveBeenCalledWith(['recovery_failed', 'coverage_stale']);
  expect(await response.text()).toBe('Recovery unavailable');
});

test('health read failure cannot report healthy or claim a successful recovery', async () => {
  const report = vi.fn().mockResolvedValue({ status: 'sent', queued: true });
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => ({ received: 1, processed: 1 }),
    readHealth: async () => {
      throw new Error('private health detail');
    },
    report,
  });

  const response = await route.GET(authorizedRequest());

  expect(response.status).toBe(503);
  expect(report).toHaveBeenCalledWith(['health_read_failed']);
  expect(await response.text()).toBe('Recovery unavailable');
});

test.each(['pending', 'failed'] as const)(
  'alert outcome %s permits successful recovery to finish',
  async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const report = vi
      .fn()
      .mockResolvedValue({
        status,
        queued: false,
        diagnostic: 'private-provider-detail',
      });
    const route = createInboxRecoveryRoute({
      secret: () => 's'.repeat(32),
      recover: async () => ({ received: 1, processed: 1 }),
      readHealth: async () => ({ codes: ['coverage_stale'] }),
      report,
    });

    try {
      const response = await route.GET(authorizedRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        notification: { status, queued: false },
      });
      expect(warn).toHaveBeenCalledWith(
        'Receiving health notification needs attention',
        { status },
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'private-provider-detail',
      );
      expect(JSON.stringify(body)).not.toContain('private-provider-detail');
    } finally {
      warn.mockRestore();
    }
  },
);

test('alert persistence failure does not masquerade as a successful cron run', async () => {
  const report = vi
    .fn()
    .mockRejectedValue(new Error('private database detail'));
  const route = createInboxRecoveryRoute({
    secret: () => 's'.repeat(32),
    recover: async () => ({ received: 1, processed: 1 }),
    readHealth: async () => ({ codes: [] }),
    report,
  });

  const response = await route.GET(authorizedRequest());

  expect(response.status).toBe(503);
  expect(await response.text()).toBe('Recovery unavailable');
});
