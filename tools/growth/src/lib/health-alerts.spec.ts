import { expect, test, vi } from 'vitest';

import { reportReceivingHealth } from './health-alerts.ts';
import { ProviderAttemptError } from './provider-attempts.ts';
import { executorWith } from './testing/fake-executor.ts';

const now = new Date('2026-10-22T01:00:00Z');
const environment = {
  GROWTH_HEALTH_ALERTS_ENABLED: 'true',
  GROWTH_HEALTH_ALERT_RECIPIENT: 'brian@cacheplane.ai',
  DELIVERY_ENVIRONMENT: 'production',
  GROWTH_DATABASE_ENVIRONMENT: 'production',
  RESEND_API_KEY: 're_test',
};

function setup() {
  let fingerprint = '[]';
  let depth = 0;
  let failSettlement = false;
  const outbox: {
    id: string;
    environment: string;
    codes: string[];
    created_at: Date;
    provider_email_id: string | null;
    failure_code: string | null;
  }[] = [];
  const fixture = executorWith({
    'health-alert-state-insert': () => ({ rows: [] }),
    'health-alert-state-lock': () => ({ rows: [{ fingerprint }] }),
    'health-alert-state-update': (params) => {
      fingerprint = String(params[2]);
      return { rows: [] };
    },
    'health-alert-enqueue': (params) => {
      outbox.push({
        id: String(params[0]),
        environment: String(params[1]),
        codes: JSON.parse(String(params[2])),
        created_at: params[3] as Date,
        provider_email_id: null,
        failure_code: null,
      });
      return { rows: [] };
    },
    'health-alert-pending': () => ({
      rows: outbox
        .filter(
          (row) => row.provider_email_id === null && row.failure_code === null,
        )
        .slice(0, 1),
    }),
    'health-alert-accepted': (params) => {
      if (failSettlement) {
        failSettlement = false;
        throw new Error('local settlement failed');
      }
      const row = outbox.find((row) => row.id === params[0]);
      if (row) row.provider_email_id = String(params[1]);
      return { rows: row ? [{ id: row.id }] : [] };
    },
    'health-alert-terminal': (params) => {
      const row = outbox.find((row) => row.id === params[0]);
      if (row) row.failure_code = String(params[1]);
      return { rows: [] };
    },
  });
  const db = {
    ...fixture.executor,
    transaction: async <T>(
      operation: Parameters<typeof fixture.executor.transaction<T>>[0],
    ) => {
      depth++;
      try {
        return await fixture.executor.transaction(operation);
      } finally {
        depth--;
      }
    },
  };
  let nextId = 0;
  const send = vi.fn(async () => {
    expect(depth).toBe(0);
    return 'provider-id';
  });
  const reserveAttempt = vi.fn(async () => {
    expect(depth).toBe(0);
    return null as string | null;
  });
  const completeAttempt = vi.fn(async () => undefined);
  const dependencies = {
    now: () => now,
    createId: () =>
      `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    send,
    reserveAttempt,
    completeAttempt,
  };
  return {
    db,
    calls: fixture.calls,
    outbox,
    dependencies,
    send,
    reserveAttempt,
    completeAttempt,
    failNextSettlement: () => {
      failSettlement = true;
    },
  };
}

test('alerts stay disabled in preview even when the flag is set', async () => {
  const h = setup();

  const result = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    { ...environment, VERCEL_ENV: 'preview' },
    h.dependencies,
  );

  expect(result.status).toBe('disabled');
  expect(h.calls).toEqual([]);
  expect(h.send).not.toHaveBeenCalled();
});

test('initial healthy state is silent and persists no personal data', async () => {
  const h = setup();

  const result = await reportReceivingHealth(
    h.db,
    [],
    environment,
    h.dependencies,
  );

  expect(result.status).toBe('idle');
  expect(h.outbox).toEqual([]);
  expect(JSON.stringify(h.calls)).not.toContain('brian@');
});

test('first unhealthy transition sends once and identical canonical codes stay quiet', async () => {
  const h = setup();

  const first = await reportReceivingHealth(
    h.db,
    ['unread_receipts', 'recovery_failed'],
    environment,
    h.dependencies,
  );
  const second = await reportReceivingHealth(
    h.db,
    ['recovery_failed', 'unread_receipts', 'recovery_failed'],
    environment,
    h.dependencies,
  );

  expect(first).toEqual({ status: 'sent', queued: true });
  expect(second).toEqual({ status: 'idle', queued: false });
  expect(h.outbox).toHaveLength(1);
  expect(h.send).toHaveBeenCalledTimes(1);
  expect(h.reserveAttempt.mock.calls[0]).toEqual(
    expect.arrayContaining([expect.stringMatching(/^hashbrown:production:/u)]),
  );
  expect(JSON.stringify(h.calls)).not.toContain('brian@');
});

test('failed delivery preserves frozen payload and recovery transition independently', async () => {
  const h = setup();
  h.send.mockRejectedValueOnce(new Error('private provider response'));

  const failed = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    h.dependencies,
  );
  const recovered = await reportReceivingHealth(h.db, [], environment, {
    ...h.dependencies,
    now: () => new Date(now.getTime() + 60000),
  });

  expect(failed).toEqual({ status: 'pending', queued: true });
  expect(recovered).toEqual({ status: 'sent', queued: true });
  expect(h.outbox).toHaveLength(2);
  expect(h.outbox[1].codes).toEqual([]);
  expect(h.outbox[1].provider_email_id).toBeNull();
  expect(h.send.mock.calls[1]).toEqual(h.send.mock.calls[0]);
});

test('expired ambiguous attempts terminalize without sending and do not starve recovery', async () => {
  const h = setup();
  h.reserveAttempt.mockRejectedValueOnce(
    new ProviderAttemptError('idempotency_expired'),
  );

  const expired = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    h.dependencies,
  );
  const recovery = await reportReceivingHealth(
    h.db,
    [],
    environment,
    h.dependencies,
  );

  expect(expired).toEqual({ status: 'failed', queued: true });
  expect(h.outbox[0].failure_code).toBe('idempotency_expired');
  expect(recovery).toEqual({ status: 'sent', queued: true });
  expect(h.send).toHaveBeenCalledTimes(1);
});

test('known acceptance settles an old outbox without another provider submission', async () => {
  const h = setup();
  h.reserveAttempt.mockResolvedValueOnce('previously-accepted');

  const result = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    h.dependencies,
  );

  expect(result.status).toBe('sent');
  expect(h.send).not.toHaveBeenCalled();
  expect(h.outbox[0].provider_email_id).toBe('previously-accepted');
});

test('arbitrary codes and unapproved destinations fail before storage or delivery', async () => {
  const h = setup();

  const invalidCodes = await reportReceivingHealth(
    h.db,
    ['private@example.com'],
    environment,
    h.dependencies,
  );
  const invalidRecipient = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    { ...environment, GROWTH_HEALTH_ALERT_RECIPIENT: 'other@example.com' },
    h.dependencies,
  );

  expect(invalidCodes.status).toBe('failed');
  expect(invalidRecipient.status).toBe('failed');
  expect(h.calls).toEqual([]);
  expect(h.send).not.toHaveBeenCalled();
});

test('runtime sender uses approved HTTPS endpoint and a bounded signal', async () => {
  const h = setup();
  const fetch = vi.fn(async (_input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ id: 'provider-id' });
  });
  const { send: _send, ...dependencies } = h.dependencies;
  void _send;

  const result = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    { ...dependencies, fetch },
  );

  expect(result.status).toBe('sent');
  expect(fetch).toHaveBeenCalledWith(
    'https://api.resend.com/emails',
    expect.objectContaining({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }),
  );
  const request = fetch.mock.calls[0]?.[1] as RequestInit;
  expect(JSON.parse(String(request.body))).toMatchObject({
    to: 'brian@cacheplane.ai',
  });
});

test('singleton locking serializes transitions and pending alerts follow causal sequence', async () => {
  const h = setup();

  await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    h.dependencies,
  );

  expect(
    h.calls.find((call) => call.marker === 'health-alert-state-insert')?.sql,
  ).toContain('on conflict (key, environment) do nothing');
  expect(
    h.calls.find((call) => call.marker === 'health-alert-state-lock')?.sql,
  ).toContain('for update');
  expect(
    h.calls.find((call) => call.marker === 'health-alert-pending')?.sql,
  ).toContain('order by sequence');
});

test('provider acceptance survives a local outbox settlement crash without another send', async () => {
  const h = setup();
  h.failNextSettlement();
  h.completeAttempt.mockImplementation(async () => {
    h.reserveAttempt.mockResolvedValue('provider-id');
  });

  const first = await reportReceivingHealth(
    h.db,
    ['recovery_failed'],
    environment,
    h.dependencies,
  );
  const replay = await reportReceivingHealth(
    h.db,
    [],
    environment,
    h.dependencies,
  );

  expect(first).toEqual({ status: 'pending', queued: true });
  expect(replay).toEqual({ status: 'sent', queued: true });
  expect(h.send).toHaveBeenCalledTimes(1);
  expect(h.outbox[0].provider_email_id).toBe('provider-id');
  expect(h.outbox[1].provider_email_id).toBeNull();
});
