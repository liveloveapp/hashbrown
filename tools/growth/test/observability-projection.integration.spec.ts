import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { SqlExecutor } from '../src/lib/database.ts';
import { acceptObservationBatch } from '../src/lib/observability/ingest.ts';
import {
  leaseObservationWork,
  type ObservationLease,
  processObservations,
  projectObservation,
} from '../src/lib/observability/projection.ts';
import { replayObservations } from '../src/lib/observability/replay.ts';
import type { CollectionBatchV1 } from '../src/lib/observability/contracts.ts';
import {
  cleanEvidence,
  evidenceDatabase,
  evidenceFixture,
  evidenceKeys,
} from './observability-fixtures.ts';

let db: SqlExecutor;
const subjects: string[] = [];
const emails: string[] = [];
const operations: string[] = [];

beforeAll(async () => {
  db = await evidenceDatabase();
});

afterAll(async () => {
  await cleanEvidence(db, { subjects, emails, operations });
  await db.close?.();
});

/** A fresh install batch whose rows the suite cleans up. */
function installBatch(now: Date): CollectionBatchV1 {
  const batch = evidenceFixture(now).install;
  subjects.push(batch.events[0].subject.id);
  const email = batch.events[0].identity?.gitEmail;
  if (email) emails.push(email);
  return batch;
}

/** Accepts a batch and returns the stored observation row for its first event. */
async function accept(
  source: 'install' | 'runtime',
  batch: CollectionBatchV1,
  now: Date,
): Promise<{ id: string; subject_id: string }> {
  await acceptObservationBatch(db, source, batch, {
    now,
    keyring: evidenceKeys,
  });
  return (
    await db.execute<{ id: string; subject_id: string }>(
      'select id,subject_id from growth_observations where source=$1 and event_id=$2',
      [source, batch.events[0].eventId],
    )
  ).rows[0];
}

/** Claims due work and returns the lease for one observation. */
async function leaseFor(
  observationId: string,
  now: Date,
): Promise<ObservationLease> {
  const lease = (await leaseObservationWork(db, { now, limit: 20 })).find(
    (l) => l.observationId === observationId,
  );
  if (!lease) throw new Error(`no lease for ${observationId}`);
  return lease;
}

test('processes concurrently without duplicate facts or duplicate settlements', async () => {
  const now = new Date();
  const a = installBatch(now);
  const b = installBatch(now);
  for (const batch of [a, b]) await accept('install', batch, now);

  const results = await Promise.all(
    [1, 2].map(() =>
      processObservations(db, { enabled: true, limit: 1, now: () => now }),
    ),
  );

  expect(results.reduce((total, result) => total + result.completed, 0)).toBe(
    2,
  );
  const rows = await db.execute(
    'select f.observation_id from growth_observation_facts f join growth_observations o on o.id=f.observation_id where o.event_id=any($1::uuid[])',
    [[a.events[0].eventId, b.events[0].eventId]],
  );
  expect(rows.rows).toHaveLength(2);
});

test('reports exhausted crashed leases even when no further work can be claimed', async () => {
  const now = new Date();
  const { id } = await accept('install', installBatch(now), now);
  await db.execute(
    "update growth_observation_work set status='leased',attempts=5,lease_token=$2,lease_until=$3 where observation_id=$1",
    [id, randomUUID(), now],
  );

  const counts = await processObservations(db, {
    enabled: true,
    limit: 20,
    now: () => now,
  });

  expect(counts).toMatchObject({ failed: 1, retryScheduled: 0 });
  expect(
    (
      await db.execute(
        'select status,last_error_code from growth_observation_work where observation_id=$1',
        [id],
      )
    ).rows[0],
  ).toEqual({ status: 'failed', last_error_code: 'attempts_exhausted' });
});

test('recovers expired leases and rolls back facts if time expires during settlement', async () => {
  const now = new Date();
  const later = new Date(now.getTime() + 31000);
  const { id } = await accept('install', installBatch(now), now);
  const lease = await leaseFor(id, now);
  let reads = 0;

  const expired = await projectObservation(db, lease, {
    now: () => (++reads < 3 ? now : later),
  });
  const facts = await db.execute(
    'select observation_id from growth_observation_facts where observation_id=$1',
    [id],
  );
  const replacement = await leaseFor(id, later);

  expect(expired).toBe('lease_lost');
  expect(facts.rows).toHaveLength(0);
  expect(replacement.leaseToken).not.toBe(lease.leaseToken);
  expect(await projectObservation(db, lease, { now: () => later })).toBe(
    'lease_lost',
  );
  expect(await projectObservation(db, replacement, { now: () => later })).toBe(
    'completed',
  );
});

test('isolates a projection failure, schedules a retry, then exhausts attempts', async () => {
  const now = new Date();
  const { id } = await accept('install', installBatch(now), now);
  await accept('install', installBatch(now), now);
  const failing: SqlExecutor = {
    execute: db.execute.bind(db),
    transaction: (operation) =>
      db.transaction((tx) =>
        operation({
          execute: (sql, params) => {
            if (
              sql.includes('growth:observation-upsert-fact') &&
              params?.[0] === id
            )
              throw new Error('synthetic storage failure');
            return tx.execute(sql, params);
          },
        }),
      ),
  };

  const first = await processObservations(failing, {
    enabled: true,
    limit: 20,
    now: () => now,
  });
  const retry = (
    await db.execute<{ status: string; available_at: Date }>(
      'select status,available_at from growth_observation_work where observation_id=$1',
      [id],
    )
  ).rows[0];
  await db.execute(
    'update growth_observation_work set attempts=4 where observation_id=$1',
    [id],
  );
  const last = await processObservations(failing, {
    enabled: true,
    limit: 20,
    now: () => new Date(now.getTime() + 60000),
  });
  const final = await db.execute(
    'select status from growth_observation_work where observation_id=$1',
    [id],
  );

  expect(first).toMatchObject({ retryScheduled: 1, failed: 0 });
  expect(retry.status).toBe('pending');
  expect(new Date(retry.available_at).getTime()).toBe(now.getTime() + 60000);
  expect(last).toMatchObject({ failed: 1, retryScheduled: 0 });
  expect(final.rows[0]).toEqual({ status: 'failed' });
});

test('fences an old worker after replay and rebuilds one fact', async () => {
  const now = new Date();
  const observation = await accept('install', installBatch(now), now);
  const lease = await leaseFor(observation.id, now);
  const operationId = randomUUID();
  operations.push(operationId);
  const selection = {
    operationId,
    subjectId: observation.subject_id,
    maxEvents: 10,
  };

  await replayObservations(db, selection, now);
  const stale = await projectObservation(db, lease, { now: () => now });
  const fresh = await leaseFor(observation.id, now);
  const rebuilt = await projectObservation(db, fresh, { now: () => now });
  const repeated = await replayObservations(db, selection, now);
  const facts = await db.execute<{ generation: string }>(
    'select generation from growth_observation_facts where observation_id=$1',
    [observation.id],
  );

  expect(stale).toBe('lease_lost');
  expect(rebuilt).toBe('completed');
  expect(repeated).toEqual({ selectedCount: 1 });
  expect(facts.rows).toEqual([{ generation: fresh.generation }]);
});

test('a replay does not resurrect the milestone of a redacted observation', async () => {
  const now = new Date();
  const batch = evidenceFixture(now).runtime;
  batch.events[0].kind = 'component.first_rendered';
  subjects.push(batch.events[0].subject.id);
  const observation = await accept('runtime', batch, now);
  const first = await leaseFor(observation.id, now);
  await projectObservation(db, first, { now: () => now });
  const before = await db.execute<{ milestone_kind: string | null }>(
    'select milestone_kind from growth_observation_facts where observation_id=$1',
    [observation.id],
  );
  await db.execute(
    'update growth_observations set redacted_at=$2 where id=$1',
    [observation.id, now],
  );
  const operationId = randomUUID();
  operations.push(operationId);

  await replayObservations(
    db,
    { operationId, subjectId: observation.subject_id, maxEvents: 10 },
    now,
  );
  const lease = await leaseFor(observation.id, now);
  const result = await projectObservation(db, lease, { now: () => now });
  const after = await db.execute<{
    milestone_kind: string | null;
    active_day: unknown;
  }>(
    "select milestone_kind,to_char(active_day,'YYYY-MM-DD') as active_day from growth_observation_facts where observation_id=$1",
    [observation.id],
  );

  expect(before.rows).toEqual([{ milestone_kind: 'component.first_rendered' }]);
  expect(result).toBe('completed');
  expect(after.rows).toEqual([
    { milestone_kind: null, active_day: now.toISOString().slice(0, 10) },
  ]);
});
