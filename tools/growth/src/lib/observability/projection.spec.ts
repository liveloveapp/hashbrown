import { expect, test } from 'vitest';

import type { SqlExecutor, SqlQueryResult } from '../database.ts';
import { executorWith, type MarkerHandler } from '../testing/fake-executor.ts';
import { ObservationError } from './contracts.ts';
import {
  leaseObservationWork,
  type ObservationLease,
  processObservations,
  PROJECTION_VERSION,
  projectObservation,
} from './projection.ts';

const now = new Date('2026-10-21T12:00:00.000Z');
const observationId = '11111111-1111-4111-8111-111111111111';
const leaseToken = '22222222-2222-4222-8222-222222222222';
const subjectId = '33333333-3333-4333-8333-333333333333';
const lease: ObservationLease = {
  observationId,
  generation: '3',
  leaseToken,
  attempts: 1,
};
const one = (row: Record<string, unknown>) => () => ({ rows: [row] });
const none = () => ({ rows: [] });

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    subject_id: subjectId,
    source: 'runtime',
    kind: 'component.first_rendered',
    occurred_at: new Date('2026-10-20T23:59:00.000Z'),
    received_at: new Date('2026-10-21T00:01:00.000Z'),
    redacted_at: null,
    ...overrides,
  };
}

function projectionHandlers(
  overrides: Record<string, MarkerHandler> = {},
): Record<string, MarkerHandler> {
  return {
    'observation-read-lease': one({ observation_id: observationId }),
    'observation-read-observation': one(observationRow()),
    'observation-upsert-fact': none,
    'observation-settle-work': one({ observation_id: observationId }),
    ...overrides,
  };
}

/** Records whether the transaction callback rejected (and so rolled back). */
function withRollbackProbe(executor: SqlExecutor): {
  executor: SqlExecutor;
  rolledBack: () => boolean;
} {
  let rolledBack = false;
  return {
    executor: {
      execute: executor.execute,
      transaction: async (operation) => {
        try {
          return await executor.transaction(operation);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    },
    rolledBack: () => rolledBack,
  };
}

test('leaseObservationWork fails exhausted items and claims due ones with skip locked', async () => {
  const { executor, calls } = executorWith({
    'observation-claim-work': () => ({
      rows: [
        {
          observation_id: observationId,
          generation: '3',
          lease_token: leaseToken,
          attempts: 2,
          exhausted_count: 1,
        },
      ],
    }),
  });

  const leases = await leaseObservationWork(executor, { now, limit: 20 });

  expect(leases).toEqual([
    { observationId, generation: '3', leaseToken, attempts: 2 },
  ]);
  expect(calls.map((c) => c.marker)).toEqual(['observation-claim-work']);
  expect(calls[0].params).toEqual([
    now,
    20,
    new Date('2026-10-21T12:00:30.000Z'),
  ]);
  const sql = calls[0].sql.replace(/\s+/gu, ' ');
  expect(sql).toContain(
    "where attempts>=5 and (status='pending' or (status='leased' and lease_until<=$1))",
  );
  expect(sql).toContain("last_error_code='attempts_exhausted'");
  expect(sql).toContain(
    'order by available_at,observation_id for update skip locked',
  );
  expect(sql).toContain('attempts=attempts+1');
});

test('leaseObservationWork returns no leases when only exhausted items were failed', async () => {
  const { executor } = executorWith({
    'observation-claim-work': () => ({
      rows: [
        {
          observation_id: null,
          generation: null,
          lease_token: null,
          attempts: null,
          exhausted_count: 2,
        },
      ],
    }),
  });

  const leases = await leaseObservationWork(executor, { now, limit: 5 });

  expect(leases).toEqual([]);
});

test('leaseObservationWork rejects limits outside 1..20', async () => {
  const { executor, calls } = executorWith({});

  const results = await Promise.allSettled(
    [0, 21, 1.5].map((limit) => leaseObservationWork(executor, { now, limit })),
  );

  expect(
    results.map((r) =>
      r.status === 'rejected' ? (r.reason as ObservationError).code : 'ok',
    ),
  ).toEqual(['invalid_payload', 'invalid_payload', 'invalid_payload']);
  expect(calls).toEqual([]);
});

test('projectObservation writes active_day and milestone_kind and settles under the lease', async () => {
  const { executor, calls } = executorWith(projectionHandlers());

  const result = await projectObservation(executor, lease, { now: () => now });

  expect(result).toBe('completed');
  expect(calls.map((c) => c.marker)).toEqual([
    'privacy-lock',
    'observation-read-lease',
    'observation-read-observation',
    'observation-upsert-fact',
    'observation-settle-work',
  ]);
  expect(calls[1].params).toEqual([observationId, '3', leaseToken, now]);
  expect(calls[1].sql).toContain('for update');
  expect(calls[2].params).toEqual([observationId]);
  expect(calls[3].params).toEqual([
    observationId,
    '3',
    PROJECTION_VERSION,
    now,
    '2026-10-20',
    'component.first_rendered',
    'runtime',
    subjectId,
  ]);
  expect(calls[3].sql).toContain('on conflict(observation_id) do update');
  expect(calls[4].params).toEqual([
    observationId,
    '3',
    leaseToken,
    now,
    PROJECTION_VERSION,
  ]);
  expect(calls[4].sql).toContain('lease_until>$4');
});

test('projectObservation leaves milestone_kind null for non-milestone kinds', async () => {
  const { executor, calls } = executorWith(
    projectionHandlers({
      'observation-read-observation': one(
        observationRow({ kind: 'runtime.session_started' }),
      ),
    }),
  );

  await projectObservation(executor, lease, { now: () => now });

  expect(calls[3].params[5]).toBeNull();
});

test('projectObservation does not project a redacted observation into a milestone but keeps its active day', async () => {
  const { executor, calls } = executorWith(
    projectionHandlers({
      'observation-read-observation': one(
        observationRow({ redacted_at: new Date('2026-10-21T06:00:00.000Z') }),
      ),
    }),
  );

  const result = await projectObservation(executor, lease, { now: () => now });

  expect(result).toBe('completed');
  expect(calls[3].params[4]).toBe('2026-10-20');
  expect(calls[3].params[5]).toBeNull();
  expect(calls.at(-1)?.marker).toBe('observation-settle-work');
});

test('projectObservation reports lease_lost without writing when the lease no longer matches', async () => {
  const { executor, calls } = executorWith(
    projectionHandlers({ 'observation-read-lease': none }),
  );

  const result = await projectObservation(executor, lease, { now: () => now });

  expect(result).toBe('lease_lost');
  expect(calls.map((c) => c.marker)).toEqual([
    'privacy-lock',
    'observation-read-lease',
  ]);
});

test('a lost lease rolls back the fact', async () => {
  const fake = executorWith(
    projectionHandlers({ 'observation-settle-work': none }),
  );
  const { executor, rolledBack } = withRollbackProbe(fake.executor);

  const result = await projectObservation(executor, lease, { now: () => now });

  expect(result).toBe('lease_lost');
  expect(fake.calls.map((c) => c.marker)).toEqual([
    'privacy-lock',
    'observation-read-lease',
    'observation-read-observation',
    'observation-upsert-fact',
    'observation-settle-work',
  ]);
  expect(rolledBack()).toBe(true);
});

test('failures back off 1m, 5m, 30m then fail after five attempts', async () => {
  const outcomes: { counts: unknown; params: readonly unknown[] }[] = [];

  for (const attempts of [1, 2, 3, 4, 5]) {
    const { executor, calls } = executorWith(
      projectionHandlers({
        'observation-claim-work': () => ({
          rows: [
            {
              observation_id: observationId,
              generation: '3',
              lease_token: leaseToken,
              attempts,
              exhausted_count: 0,
            },
          ],
        }),
        'observation-upsert-fact': () => {
          throw new Error('synthetic storage failure');
        },
        'observation-fail-work': one({ observation_id: observationId }),
        'observation-gc-budgets': none,
      }),
    );
    const counts = await processObservations(executor, {
      enabled: true,
      limit: 1,
      now: () => now,
    });
    outcomes.push({
      counts,
      params:
        calls.find((c) => c.marker === 'observation-fail-work')?.params ?? [],
    });
  }

  expect(
    outcomes.map(({ params }) => [
      params[3],
      (params[4] as Date).getTime() - now.getTime(),
    ]),
  ).toEqual([
    ['pending', 60000],
    ['pending', 300000],
    ['pending', 1800000],
    ['pending', 1800000],
    ['failed', 1800000],
  ]);
  expect(outcomes.map(({ counts }) => counts)).toEqual([
    ...Array.from({ length: 4 }, () => ({
      completed: 0,
      leaseLost: 0,
      retryScheduled: 1,
      failed: 0,
      disabled: false,
    })),
    {
      completed: 0,
      leaseLost: 0,
      retryScheduled: 0,
      failed: 1,
      disabled: false,
    },
  ]);
  expect(outcomes[0].params).toEqual([
    observationId,
    '3',
    leaseToken,
    'pending',
    new Date('2026-10-21T12:01:00.000Z'),
    now,
  ]);
});

test('a failure whose lease was lost counts as lease_lost', async () => {
  const { executor } = executorWith(
    projectionHandlers({
      'observation-claim-work': one({
        observation_id: observationId,
        generation: '3',
        lease_token: leaseToken,
        attempts: 1,
        exhausted_count: 0,
      }),
      'observation-upsert-fact': () => {
        throw new Error('synthetic storage failure');
      },
      'observation-fail-work': none,
      'observation-gc-budgets': none,
    }),
  );

  const counts = await processObservations(executor, {
    enabled: true,
    limit: 1,
    now: () => now,
  });

  expect(counts).toMatchObject({ leaseLost: 1, retryScheduled: 0, failed: 0 });
});

test('processObservations claims in chunks of at most 20 and then collects old budgets', async () => {
  const claimLimits: unknown[] = [];
  const { executor, calls } = executorWith(
    projectionHandlers({
      'observation-claim-work': (params): SqlQueryResult => {
        claimLimits.push(params[1]);
        return {
          rows: Array.from({ length: params[1] as number }, () => ({
            observation_id: observationId,
            generation: '3',
            lease_token: leaseToken,
            attempts: 1,
            exhausted_count: 0,
          })),
        };
      },
      'observation-gc-budgets': none,
    }),
  );

  const counts = await processObservations(executor, {
    enabled: true,
    limit: 45,
    now: () => now,
  });

  expect(claimLimits).toEqual([20, 20, 5]);
  expect(counts).toEqual({
    completed: 45,
    leaseLost: 0,
    retryScheduled: 0,
    failed: 0,
    disabled: false,
  });
  expect(calls.at(-1)?.marker).toBe('observation-gc-budgets');
  expect(calls.at(-1)?.params).toEqual([new Date('2026-10-21T10:00:00.000Z')]);
  expect(calls.at(-1)?.sql).toContain('limit 1000');
});

test('processObservations stops when nothing is claimable and counts exhausted items', async () => {
  const { executor, calls } = executorWith({
    'observation-claim-work': one({
      observation_id: null,
      generation: null,
      lease_token: null,
      attempts: null,
      exhausted_count: 2,
    }),
    'observation-gc-budgets': none,
  });

  const counts = await processObservations(executor, {
    enabled: true,
    limit: 2,
    now: () => now,
  });

  expect(counts).toMatchObject({ failed: 2, completed: 0 });
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-claim-work',
    'observation-gc-budgets',
  ]);
});

test('processObservations does nothing when disabled and validates its limit', async () => {
  const { executor, calls } = executorWith({});

  const counts = await processObservations(executor, {
    enabled: false,
    limit: 100,
  });
  const invalid = await processObservations(executor, {
    enabled: true,
    limit: 101,
  }).catch((error: ObservationError) => error.code);

  expect(counts).toEqual({
    completed: 0,
    leaseLost: 0,
    retryScheduled: 0,
    failed: 0,
    disabled: true,
  });
  expect(invalid).toBe('invalid_payload');
  expect(calls).toEqual([]);
});
