import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import {
  createDatabaseExecutor,
  type SqlExecutor,
} from '../src/lib/database.ts';
import {
  type ReceivingHealthAlertPayload,
  reportReceivingHealth,
} from '../src/lib/health-alerts.ts';
import { providerIdempotencyKey } from '../src/lib/provider-attempts.ts';

const environment = {
  GROWTH_HEALTH_ALERTS_ENABLED: 'true',
  GROWTH_HEALTH_ALERT_RECIPIENT: 'brian@cacheplane.ai',
  DELIVERY_ENVIRONMENT: 'production',
  GROWTH_DATABASE_ENVIRONMENT: 'production',
};

test('durable health alerts preserve transition order and acceptance across retries against Postgres', async () => {
  const db = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
  const stateKey = 'hashbrown:receiving';
  const ownedIds: string[] = [];
  const ownedKeys: string[] = [];
  let ownsState = false;
  const now = new Date('2026-10-22T01:00:00.000Z');
  // Reverse lexical IDs ensure same-clock transitions cannot rely on UUID order.
  const ids = [
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '00000000-0000-4000-8000-000000000001',
    randomUUID(),
  ];
  const send = vi.fn(
    async (payload: ReceivingHealthAlertPayload, key: string) => {
      expect(payload.to).toBe('brian@cacheplane.ai');
      expect(key).toMatch(/^hashbrown:production:/u);
      return 'alert-provider-id';
    },
  );
  const dependencies = {
    now: () => now,
    createId: () => {
      const id = ids[ownedIds.length];
      if (!id) throw new Error('Unexpected alert transition');
      ownedIds.push(id);
      ownedKeys.push(
        providerIdempotencyKey('production', `health-alert:${id}`),
      );
      return id;
    },
    send,
  };

  try {
    await applyMigrations({
      directory: defaultMigrationsDirectory(),
      executor: db,
    });
    expect(
      (
        await db.execute(
          'select key from growth_health_alert_state where key = $1 and environment = $2',
          [stateKey, 'production'],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.execute(
          'select id from growth_health_alert_outbox where environment = $1',
          ['production'],
        )
      ).rows,
    ).toEqual([]);
    ownsState = true;

    const initial = await reportReceivingHealth(
      db,
      [],
      environment,
      dependencies,
    );
    send.mockRejectedValueOnce(new Error('private provider failure'));
    const first = await reportReceivingHealth(
      db,
      ['unread_receipts', 'recovery_failed'],
      environment,
      dependencies,
    );
    send.mockRejectedValueOnce(new Error('private provider failure'));
    const repeated = await reportReceivingHealth(
      db,
      ['recovery_failed', 'unread_receipts', 'recovery_failed'],
      environment,
      dependencies,
    );
    send.mockRejectedValueOnce(new Error('private provider failure'));
    const recovery = await reportReceivingHealth(
      db,
      [],
      environment,
      dependencies,
    );
    const queued = await db.execute<{
      id: string;
      codes: string[];
      created_at: Date | string;
    }>(
      'select id, codes, created_at from growth_health_alert_outbox order by sequence',
    );
    const later = {
      ...dependencies,
      now: () => new Date(now.getTime() + 60000),
    };
    const flushedFailure = await reportReceivingHealth(
      db,
      [],
      environment,
      later,
    );
    const flushedRecovery = await reportReceivingHealth(
      db,
      [],
      environment,
      later,
    );
    const quiet = await reportReceivingHealth(db, [], environment, later);

    expect(initial).toEqual({ status: 'idle', queued: false });
    expect(first).toEqual({ status: 'pending', queued: true });
    expect(repeated).toEqual({ status: 'pending', queued: false });
    expect(recovery).toEqual({ status: 'pending', queued: true });
    expect(queued.rows.map(({ id }) => id)).toEqual(ids.slice(0, 2));
    expect(queued.rows.map(({ codes }) => codes)).toEqual([
      ['recovery_failed', 'unread_receipts'],
      [],
    ]);
    expect(queued.rows.map(({ created_at }) => new Date(created_at))).toEqual([
      now,
      now,
    ]);
    expect(flushedFailure).toEqual({ status: 'sent', queued: false });
    expect(flushedRecovery).toEqual({ status: 'sent', queued: false });
    expect(quiet).toEqual({ status: 'idle', queued: false });
    expect(send).toHaveBeenCalledTimes(5);
    for (const call of send.mock.calls.slice(1, 4))
      expect(call).toEqual(send.mock.calls[0]);
    expect(send.mock.calls[4]?.[0].subject).toContain('recovered');
    expect(send.mock.calls[4]?.[1]).not.toBe(send.mock.calls[0]?.[1]);

    let interruptSettlement = true;
    const interrupted: SqlExecutor = {
      ...db,
      async execute<Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) {
        if (
          interruptSettlement &&
          sql.includes('growth:health-alert-accepted')
        ) {
          interruptSettlement = false;
          throw new Error('Simulated settlement interruption');
        }
        return db.execute<Row>(sql, parameters);
      },
    };
    const unsettled = await reportReceivingHealth(
      interrupted,
      ['recovery_failed'],
      environment,
      later,
    );
    const acceptance = await db.execute<{ provider_email_id: string }>(
      'select provider_email_id from growth_provider_attempts where idempotency_key = $1',
      [ownedKeys[2]],
    );
    const settled = await reportReceivingHealth(
      interrupted,
      ['recovery_failed'],
      environment,
      later,
    );
    const completed = await db.execute<{ provider_email_id: string }>(
      'select provider_email_id from growth_health_alert_outbox where id = $1::uuid',
      [ownedIds[2]],
    );

    expect(unsettled).toEqual({ status: 'pending', queued: true });
    expect(acceptance.rows).toEqual([
      { provider_email_id: 'alert-provider-id' },
    ]);
    expect(settled).toEqual({ status: 'sent', queued: false });
    expect(completed.rows).toEqual([
      { provider_email_id: 'alert-provider-id' },
    ]);
    expect(send).toHaveBeenCalledTimes(6);
  } finally {
    if (ownsState) {
      await db.execute(
        'delete from growth_health_alert_outbox where id = any($1::uuid[])',
        [ownedIds],
      );
      await db.execute(
        'delete from growth_provider_attempts where idempotency_key = any($1::text[])',
        [ownedKeys],
      );
      await db.execute(
        'delete from growth_health_alert_state where key = $1 and environment = $2',
        [stateKey, 'production'],
      );
    }
    await db.close?.();
  }
});
