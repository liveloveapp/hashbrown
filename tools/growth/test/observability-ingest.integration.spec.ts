import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { SqlExecutor } from '../src/lib/database.ts';
import { acceptObservationBatch } from '../src/lib/observability/ingest.ts';
import {
  cleanEvidence,
  evidenceDatabase,
  evidenceFixture,
  evidenceKeys,
} from './observability-fixtures.ts';

let db: SqlExecutor;
const subjects: string[] = [];
const emails: string[] = [];

beforeAll(async () => {
  db = await evidenceDatabase();
});

afterAll(async () => {
  await cleanEvidence(db, { subjects, emails });
  await db.close?.();
});

function installEvent(now: Date) {
  const event = evidenceFixture(now).install.events[0];
  subjects.push(event.subject.id);
  if (event.identity?.gitEmail) emails.push(event.identity.gitEmail);
  return event;
}

test('accepts multi-subject batches in opposing event order without deadlocks', async () => {
  const now = new Date();
  const a = installEvent(now);
  const b = installEvent(now);
  await acceptObservationBatch(
    db,
    'install',
    { schemaVersion: 1, events: [a, b] },
    { now, keyring: evidenceKeys },
  );
  const left = structuredClone([a, b]);
  const right = structuredClone([b, a]);
  left[0].eventId = '00000000-0000-4000-8000-' + randomUUID().slice(-12);
  left[1].eventId = 'ffffffff-ffff-4fff-8fff-' + randomUUID().slice(-12);
  right[0].eventId = '00000000-0000-4000-8000-' + randomUUID().slice(-12);
  right[1].eventId = 'ffffffff-ffff-4fff-8fff-' + randomUUID().slice(-12);

  const result = await Promise.allSettled(
    [left, right].map((events) =>
      acceptObservationBatch(
        db,
        'install',
        { schemaVersion: 1, events },
        { now, keyring: evidenceKeys },
      ),
    ),
  );

  expect(result.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
});

test('deduplicates concurrent retries without refreshing subject activity', async () => {
  const now = new Date();
  const event = installEvent(now);
  const batch = { schemaVersion: 1, events: [event] };

  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      acceptObservationBatch(db, 'install', batch, {
        now,
        keyring: evidenceKeys,
      }),
    ),
  );
  await acceptObservationBatch(db, 'install', batch, {
    now: new Date(now.getTime() + 1000),
    keyring: evidenceKeys,
  });

  expect(
    results
      .flatMap((r) => r.events)
      .filter((e) => e.disposition === 'accepted'),
  ).toHaveLength(1);
  const rows = await db.execute<{ total: string; last_received_at: Date }>(
    `select count(o.id)::text as total, s.last_received_at from growth_observation_subjects s join growth_observations o on o.subject_id=s.id where s.external_id=$1 group by s.id`,
    [event.subject.id],
  );
  expect(rows.rows[0].total).toBe('1');
  expect(new Date(rows.rows[0].last_received_at)).toEqual(now);
  const identity = await db.execute(
    `select i.* from growth_observation_identities i join growth_observations o on o.id=i.observation_id where o.event_id=$1`,
    [event.eventId],
  );
  expect(identity.rows).toHaveLength(1);
});

test('rolls an entire batch back on a conflicting event', async () => {
  const now = new Date();
  const original = installEvent(now);
  await acceptObservationBatch(
    db,
    'install',
    { schemaVersion: 1, events: [original] },
    { now, keyring: evidenceKeys },
  );
  const changed = structuredClone(original);
  changed.properties.packageVersion = '2';
  const fresh = installEvent(now);
  fresh.eventId = '00000000-0000-4000-8000-' + randomUUID().slice(-12);

  const accepted = acceptObservationBatch(
    db,
    'install',
    { schemaVersion: 1, events: [fresh, changed] },
    { now, keyring: evidenceKeys },
  );

  await expect(accepted).rejects.toThrow('event_conflict');
  expect(
    (
      await db.execute('select id from growth_observations where event_id=$1', [
        fresh.eventId,
      ])
    ).rows,
  ).toEqual([]);
});

test('accepts the website, install, and runtime fixture batches', async () => {
  const now = new Date();
  const fixture = evidenceFixture(now);
  for (const batch of Object.values(fixture))
    subjects.push(batch.events[0].subject.id);
  const email = fixture.install.events[0].identity?.gitEmail;
  if (email) emails.push(email);

  const results = await Promise.all(
    (['website', 'install', 'runtime'] as const).map((source) =>
      acceptObservationBatch(db, source, fixture[source], {
        now,
        keyring: evidenceKeys,
      }),
    ),
  );

  expect(results.flatMap((r) => r.events.map((e) => e.disposition))).toEqual([
    'accepted',
    'accepted',
    'accepted',
  ]);
  const tokens = await db.execute<{ source: string; digest: string | null }>(
    `select o.source, o.installation_token_digest as digest from growth_observations o join growth_observation_subjects s on s.id=o.subject_id where s.external_id=any($1::uuid[]) order by o.source`,
    [Object.values(fixture).map((batch) => batch.events[0].subject.id)],
  );
  expect(tokens.rows.map((row) => row.source)).toEqual([
    'install',
    'runtime',
    'website',
  ]);
  expect(tokens.rows[0].digest).toBe(tokens.rows[1].digest);
  expect(tokens.rows[2].digest).toBeNull();
});
