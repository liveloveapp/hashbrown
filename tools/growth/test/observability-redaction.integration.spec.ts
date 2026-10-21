import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { deleteContact } from '../src/lib/contacts.ts';
import { createEmailLookupCandidates } from '../src/lib/crypto.ts';
import type { SqlExecutor } from '../src/lib/database.ts';
import { acceptObservationBatch } from '../src/lib/observability/ingest.ts';
import {
  leaseObservationWork,
  projectObservation,
} from '../src/lib/observability/projection.ts';
import {
  initializeObservationRedactions,
  redactContactObservationEvidence,
  redactObservationEvidence,
} from '../src/lib/observability/redaction.ts';
import { replayObservations } from '../src/lib/observability/replay.ts';
import type { CollectionBatchV1 } from '../src/lib/observability/contracts.ts';
import {
  cleanContactObservationFences,
  cleanEvidence,
  evidenceDatabase,
  evidenceFixture,
  evidenceKeys,
} from './observability-fixtures.ts';

let db: SqlExecutor;
const subjects: string[] = [];
const emails: string[] = [];
const operations: string[] = [];
const contacts: string[] = [];

beforeAll(async () => {
  db = await evidenceDatabase();
});

afterAll(async () => {
  for (const contactId of contacts)
    await cleanContactObservationFences(db, contactId);
  await cleanEvidence(db, { subjects, emails, operations });
  await db.transaction(async (tx) => {
    await tx.execute(
      'delete from growth_activity where contact_id=any($1::uuid[])',
      [contacts],
    );
    await tx.execute('delete from growth_contacts where id=any($1::uuid[])', [
      contacts,
    ]);
  });
  await db.close?.();
});

/** A fresh install batch whose subject and email the suite cleans up. */
function installBatch(now: Date): CollectionBatchV1 {
  const batch = evidenceFixture(now).install;
  subjects.push(batch.events[0].subject.id);
  emails.push(batch.events[0].identity?.gitEmail ?? '');
  return batch;
}

/** The batch's git email. */
function emailOf(batch: CollectionBatchV1): string {
  return batch.events[0].identity?.gitEmail ?? '';
}

/** Gives the batch a new event id (and optionally a new subject), tracked for cleanup. */
function renew(batch: CollectionBatchV1, newSubject = false): void {
  batch.events[0].eventId = randomUUID();
  if (newSubject) {
    batch.events[0].subject = { ...batch.events[0].subject, id: randomUUID() };
    subjects.push(batch.events[0].subject.id);
  }
}

async function dispositionOf(batch: CollectionBatchV1, now: Date) {
  return (
    await acceptObservationBatch(db, 'install', batch, {
      now,
      keyring: evidenceKeys,
    })
  ).events[0].disposition;
}

async function identityEmail(observationId: string) {
  return (
    await db.execute<{ email_normalized: string | null }>(
      'select email_normalized from growth_observation_identities where observation_id=$1',
      [observationId],
    )
  ).rows[0]?.email_normalized;
}

/** Inserts a synthetic contact holding the email's active-key HMAC. */
async function insertContact(email: string, deletedAt: Date | null) {
  const key = createEmailLookupCandidates(email, evidenceKeys)[0];
  const id = randomUUID();
  contacts.push(id);
  await db.execute(
    `insert into growth_contacts(id,email_normalized,email_lookup_hmac,email_hmac_key_version,source,deleted_at) values($1,$2,$3,$4,'integration',$5)`,
    [id, deletedAt ? null : email, key.digest, key.keyVersion, deletedAt],
  );
  return id;
}

test('subject redaction scrubs every identity on the subject and fences its future installs', async () => {
  const now = new Date();
  const first = installBatch(now);
  const second = installBatch(now);
  second.events[0].subject = first.events[0].subject;
  for (const batch of [first, second]) await dispositionOf(batch, now);
  const subjectId = (
    await db.execute<{ id: string }>(
      'select id from growth_observation_subjects where external_id=$1',
      [first.events[0].subject.id],
    )
  ).rows[0].id;
  const operationId = randomUUID();
  operations.push(operationId);

  const result = await redactObservationEvidence(
    db,
    { subjectId },
    { operationId, now, keyring: evidenceKeys },
  );
  const repeat = await redactObservationEvidence(
    db,
    { subjectId },
    { operationId, now, keyring: evidenceKeys },
  );

  expect(result).toEqual({ selectedCount: 2 });
  expect(repeat).toEqual({ selectedCount: 2 });
  const remaining = await db.execute<{
    identity_digest: string | null;
    redacted_at: Date | null;
    identities: number;
  }>(
    `select o.identity_digest,o.redacted_at,(select count(*)::int from growth_observation_identities i where i.observation_id=o.id) as identities
    from growth_observations o where o.subject_id=$1`,
    [subjectId],
  );
  expect(remaining.rows).toHaveLength(2);
  for (const row of remaining.rows) {
    expect(row.identity_digest).toBeNull();
    expect(row.redacted_at).not.toBeNull();
    expect(row.identities).toBe(0);
  }
  renew(first);
  expect(await dispositionOf(first, now)).toBe('redacted');
  for (const batch of [first, second]) {
    renew(batch, true);
    expect(await dispositionOf(batch, now)).toBe('redacted');
  }
});

test('email redaction fences leased work and retained keys while leaving another identity untouched', async () => {
  const now = new Date();
  const batch = installBatch(now);
  const other = installBatch(now);
  for (const fixture of [batch, other]) await dispositionOf(fixture, now);
  const rows = (
    await db.execute<{ id: string; event_id: string }>(
      'select id,event_id from growth_observations where event_id=any($1::uuid[])',
      [[batch.events[0].eventId, other.events[0].eventId]],
    )
  ).rows;
  const id = rows.find((r) => r.event_id === batch.events[0].eventId)?.id ?? '';
  const otherId =
    rows.find((r) => r.event_id === other.events[0].eventId)?.id ?? '';
  const lease = (await leaseObservationWork(db, { now, limit: 20 })).find(
    (l) => l.observationId === id,
  );
  if (!lease) throw new Error(`no lease for ${id}`);
  const operationId = randomUUID();
  operations.push(operationId);
  const rotated = {
    active: {
      version: 778,
      secret: 'rotated-fixture-secret-at-least-32-bytes',
    },
    previous: [evidenceKeys.active],
  };

  await redactObservationEvidence(
    db,
    { email: emailOf(batch) },
    { operationId, now, keyring: evidenceKeys },
  );
  const settled = await projectObservation(db, lease, { now: () => now });

  expect(settled).toBe('lease_lost');
  expect(await identityEmail(id)).toBeUndefined();
  expect(await identityEmail(otherId)).toBe(emailOf(other));
  const work = await db.execute<{ status: string }>(
    'select status from growth_observation_work where observation_id=$1',
    [id],
  );
  expect(work.rows[0].status).toBe('pending');
  renew(batch);
  expect(
    (
      await acceptObservationBatch(db, 'install', batch, {
        now,
        keyring: rotated,
      })
    ).events[0].disposition,
  ).toBe('redacted');
  await expect(
    acceptObservationBatch(db, 'install', batch, {
      now,
      keyring: { active: rotated.active },
    }),
  ).rejects.toThrow('identity_key_unavailable');
});

test('a redaction operation id that belongs to a replay conflicts', async () => {
  const now = new Date();
  const operationId = randomUUID();
  operations.push(operationId);
  await replayObservations(
    db,
    { operationId, subjectId: randomUUID(), maxEvents: 1 },
    now,
  );

  const redaction = redactObservationEvidence(
    db,
    { email: 'synthetic@example.invalid' },
    { operationId, now, keyring: evidenceKeys },
  );

  await expect(redaction).rejects.toThrow('operation_conflict');
});

test('the contact redaction fences a contact before its first observation exists', async () => {
  const now = new Date();
  const batch = installBatch(now);
  const contactId = await insertContact(emailOf(batch), null);

  await db.transaction(async (tx) => {
    await tx.execute('select id from growth_contacts where id=$1 for update', [
      contactId,
    ]);
    await redactContactObservationEvidence(tx, contactId, now);
    await tx.execute(
      'update growth_contacts set email_normalized=null,deleted_at=$2 where id=$1',
      [contactId, now],
    );
  });

  expect(await dispositionOf(batch, now)).toBe('redacted');
});

test('deleteContact redacts observation evidence end to end', async () => {
  const now = new Date();
  const batch = installBatch(now);
  await dispositionOf(batch, now);
  const observationId = (
    await db.execute<{ id: string }>(
      'select id from growth_observations where event_id=$1',
      [batch.events[0].eventId],
    )
  ).rows[0].id;
  const contactId = await insertContact(emailOf(batch), null);

  await deleteContact(db, {
    contactId,
    eventKey: `integration:delete:${randomUUID()}`,
    occurredAt: now,
    actor: 'test',
    source: 'integration',
    policyVersion: 'growth-v1',
  });

  expect(await identityEmail(observationId)).toBeUndefined();
  renew(batch);
  expect(await dispositionOf(batch, now)).toBe('redacted');
});

test('initializeObservationRedactions backfills deleted-contact and alias fences repeatably', async () => {
  const now = new Date();
  const batch = installBatch(now);
  const alias = installBatch(now);
  const aliasKey = createEmailLookupCandidates(emailOf(alias), evidenceKeys)[0];
  const contactId = await insertContact(emailOf(batch), now);
  await db.execute(
    "insert into growth_activity(contact_id,kind,event_key,occurred_at,data) values($1,'contact.lookup_alias_added',$2,$3,$4::jsonb)",
    [
      contactId,
      `fixture:${randomUUID()}`,
      now,
      JSON.stringify({
        digest: aliasKey.digest,
        key_version: aliasKey.keyVersion,
      }),
    ],
  );
  await expect(dispositionOf(batch, now)).rejects.toThrow(
    'redaction_initialization_required',
  );

  for (let pass = 0; pass < 2; pass++) {
    let cursor: string | undefined;
    do {
      const result = await initializeObservationRedactions(
        db,
        { limit: 100, cursor },
        now,
      );
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
  }

  for (const fixture of [batch, alias])
    expect(await dispositionOf(fixture, now)).toBe('redacted');
});
