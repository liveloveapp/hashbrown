import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { deleteContact } from '../src/lib/contacts.ts';
import {
  createDatabaseExecutor,
  type SqlExecutor,
} from '../src/lib/database.ts';
import {
  authorizeLeasedJobForSubmission,
  leaseDueJobs,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import {
  bindProviderMessageId,
  replySubjectSha256,
  settleGoogleReplyReconciliation,
  sha256Base64Url,
} from '../src/lib/replies.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  type EnrolledContact,
  insertSendStep,
  runCleanup,
} from './job-fixtures.ts';

/** Leases, authorizes and accepts step 1, leaving its Message-ID unbound. */
async function acceptStepOne(
  executor: SqlExecutor,
  contact: EnrolledContact,
  sentAt: Date,
  subject: string,
): Promise<{ jobId: string; providerEmailId: string }> {
  const leaseToken = randomUUID();
  const jobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: sentAt,
    leaseUntil: new Date(sentAt.getTime() + 10 * 60_000),
    leaseToken,
  });
  const authorization = await authorizeLeasedJobForSubmission(executor, {
    jobId,
    leaseToken,
    now: sentAt,
    campaignEnabled: true,
    deliveryEnabled: true,
  });
  if (!authorization.authorized) throw new Error('expected authorization');
  const providerEmailId = `resend-${randomUUID()}`;
  await recordProviderAcceptance(executor, {
    jobId,
    leaseToken,
    acceptedAt: new Date(sentAt.getTime() + 1_000),
    providerEmailId,
    subjectSha256: replySubjectSha256(subject),
  });
  return { jobId, providerEmailId };
}

test('leaseDueJobs holds a send_step while a sibling send waits for its Message-ID', async () => {
  const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
  const createdContactIds = new Set<string>();
  try {
    await applyMigrations({
      directory: defaultMigrationsDirectory(),
      executor,
    });

    const approvedAt = new Date('2037-05-01T00:00:00.000Z');
    // Tuesday 2037-05-05 07:10 PDT.
    const leaseAt = new Date('2037-05-05T14:10:00.000Z');
    const contact = await createEnrolledContact(
      executor,
      createdContactIds,
      approvedAt,
    );
    const stepOne = await acceptStepOne(
      executor,
      contact,
      new Date('2037-05-04T14:10:00.000Z'),
      'Engineer to engineer',
    );
    const stepTwo = await insertSendStep(executor, contact, {
      status: 'pending',
      availableAt: approvedAt,
      step: 2,
    });
    const lease = async () =>
      (
        await leaseDueJobs(executor, {
          kinds: ['send_step'],
          now: leaseAt,
          batchSize: 100,
          leaseDurationMs: 60_000,
          campaignEnabled: true,
        })
      ).filter((job) => job.contactId === contact.contactId);

    const whileUnbound = await lease();
    await bindProviderMessageId(executor, {
      providerEmailId: stepOne.providerEmailId,
      rfcMessageId: `<${randomUUID()}@resend.dev>`,
    });
    const afterBinding = await lease();

    expect(whileUnbound).toEqual([]);
    expect(afterBinding.map(({ id }) => id)).toEqual([stepTwo]);
  } finally {
    try {
      await deleteCreatedContacts(executor, createdContactIds);
    } finally {
      await executor.close?.();
    }
  }
});

/*
 * Historical Gmail-era reply reconciliation: contact deletion and settlement
 * must leave no reply metadata pointing at a deleted contact.
 */
const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();
const createdGmailIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  await runCleanup([
    () =>
      executor.execute(
        `delete from growth_jobs
         where kind = 'reply_reconcile' and idempotency_key = any($1::text[])`,
        [[...createdGmailIds].map((id) => `reply_reconcile:gmail:${id}`)],
      ),
    () =>
      executor.execute(
        `delete from growth_activity where event_key like any($1::text[])`,
        [
          [...createdGmailIds].map(
            (id) => `google:reply:${sha256Base64Url(id)}%`,
          ),
        ],
      ),
    () => deleteCreatedContacts(executor, createdContactIds),
  ]);
  await executor.close?.();
});

/** Inserts a `reply_reconcile` job the way an unmatched reply leaves it. */
async function insertReconcile(
  occurredAt: Date,
  reply: Record<string, unknown>,
  resolvedContactId?: string,
): Promise<string> {
  const gmailId = `gmail-${randomUUID()}`;
  createdGmailIds.add(gmailId);
  const inserted = await executor.execute<{ id: string }>(
    `insert into growth_jobs (kind, status, available_at, idempotency_key, payload)
     values ('reply_reconcile', 'pending', $1, $2, $3::jsonb)
     returning id`,
    [
      occurredAt,
      `reply_reconcile:gmail:${gmailId}`,
      JSON.stringify({
        schema_version: 1,
        gmail_message_id: gmailId,
        rfc_message_id: `<reply.${randomUUID()}@example.com>`,
        occurred_at: occurredAt.toISOString(),
        in_reply_to: null,
        references: [],
        subject_sha256: null,
        ranked_candidates: [],
        resolved_candidates: resolvedContactId
          ? [{ message_id: 'x', rank: 0, contact_id: resolvedContactId }]
          : [],
        ...reply,
      }),
    ],
  );
  return inserted.rows[0]?.id ?? '';
}

async function readReconcile(id: string) {
  const result = await executor.execute<{
    status: string;
    payload: Record<string, unknown>;
  }>('select status, payload from growth_jobs where id = $1', [id]);
  return result.rows[0];
}

const deletion = (contactId: string, at: Date) => ({
  contactId,
  eventKey: `delete:${randomUUID()}`,
  occurredAt: at,
  actor: 'founder',
  source: 'test',
  policyVersion: 'growth-v1',
  redactEvidence: async () => undefined,
});

test('deleting a contact clears unmatched reply_reconcile payloads that reference its messages', async () => {
  const approvedAt = new Date('2037-07-01T00:00:00.000Z');
  const sentAt = new Date('2037-07-07T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const stepOne = await acceptStepOne(
    executor,
    contact,
    sentAt,
    'Engineer to engineer',
  );
  const rfcMessageId = `<${randomUUID()}@resend.dev>`;
  await bindProviderMessageId(executor, {
    providerEmailId: stepOne.providerEmailId,
    rfcMessageId,
  });
  const byInReplyTo = await insertReconcile(sentAt, {
    in_reply_to: rfcMessageId,
  });
  const byReferences = await insertReconcile(sentAt, {
    references: [rfcMessageId],
  });
  const byResolved = await insertReconcile(sentAt, {}, contact.contactId);
  const unrelated = await insertReconcile(sentAt, {
    in_reply_to: `<${randomUUID()}@resend.dev>`,
  });

  await deleteContact(executor, deletion(contact.contactId, sentAt));

  for (const id of [byInReplyTo, byReferences, byResolved]) {
    const job = await readReconcile(id);
    expect(job?.status).toBe('cancelled');
    expect(job?.payload).toEqual({});
  }
  expect((await readReconcile(unrelated))?.status).toBe('pending');
});

test("deleting a contact leaves other contacts' reply_reconcile payloads intact", async () => {
  const approvedAt = new Date('2037-08-01T00:00:00.000Z');
  const sentAt = new Date('2037-08-07T14:10:00.000Z');
  const deleted = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const kept = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const keptStep = await acceptStepOne(
    executor,
    kept,
    sentAt,
    'Engineer to engineer',
  );
  await acceptStepOne(executor, deleted, sentAt, 'Another subject');
  const keptRfc = `<${randomUUID()}@resend.dev>`;
  await bindProviderMessageId(executor, {
    providerEmailId: keptStep.providerEmailId,
    rfcMessageId: keptRfc,
  });
  const reply = await insertReconcile(sentAt, {
    in_reply_to: keptRfc,
    references: [keptRfc],
  });

  await deleteContact(executor, deletion(deleted.contactId, sentAt));

  const job = await readReconcile(reply);
  expect(job?.status).toBe('pending');
  expect(job?.payload).toMatchObject({
    in_reply_to: keptRfc,
    references: [keptRfc],
  });
});

/** Inserts a leased `reply_reconcile` job holding the given payload fields. */
async function insertLeasedReconcile(
  occurredAt: Date,
  fields: Record<string, unknown>,
): Promise<{ id: string; leaseToken: string }> {
  const gmailId = `gmail-${randomUUID()}`;
  createdGmailIds.add(gmailId);
  const leaseToken = randomUUID();
  const inserted = await executor.execute<{ id: string }>(
    `insert into growth_jobs (
       kind, status, available_at, idempotency_key, payload,
       lease_until, lease_token, attempts
     ) values (
       'reply_reconcile', 'leased', $1, $2, $3::jsonb, $4, $5, 1
     ) returning id`,
    [
      occurredAt,
      `reply_reconcile:gmail:${gmailId}`,
      JSON.stringify({
        schema_version: 1,
        gmail_message_id: gmailId,
        rfc_message_id: `<reply.${randomUUID()}@example.com>`,
        occurred_at: occurredAt.toISOString(),
        in_reply_to: null,
        references: [],
        ranked_candidates: [],
        resolved_candidates: [],
        ...fields,
      }),
      new Date(occurredAt.getTime() + 600_000),
      leaseToken,
    ],
  );
  return { id: inserted.rows[0]?.id ?? '', leaseToken };
}

async function readReconcileRow(id: string) {
  const result = await executor.execute<{
    status: string;
    contact_id: string | null;
    payload: Record<string, unknown>;
  }>('select status, contact_id, payload from growth_jobs where id = $1', [id]);
  return result.rows[0];
}

async function sentContact(at: Date, month: string) {
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    new Date(`2037-${month}-01T00:00:00.000Z`),
  );
  const step = await acceptStepOne(
    executor,
    contact,
    at,
    'Engineer to engineer',
  );
  const rfc = `<${randomUUID()}@resend.dev>`;
  await bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId: rfc,
  });
  return { contact, step, rfc };
}

test('settling a reply_reconcile job records the resolved contact', async () => {
  const at = new Date('2037-09-07T14:10:00.000Z');
  const { contact, step, rfc } = await sentContact(at, '09');
  const job = await insertLeasedReconcile(at, {
    in_reply_to: rfc,
    ranked_candidates: [{ message_id: rfc, rank: 0 }],
    resolved_candidates: [
      {
        message_id: rfc,
        rank: 0,
        contact_id: contact.contactId,
        seed_job_id: step.jobId,
      },
    ],
  });

  const outcome = await settleGoogleReplyReconciliation(executor, {
    jobId: job.id,
    leaseToken: job.leaseToken,
    now: new Date(at.getTime() + 600_000),
  });

  expect(outcome).toBe('completed');
  expect(await readReconcileRow(job.id)).toMatchObject({
    status: 'completed',
    contact_id: contact.contactId,
  });
});

test('settling for a deleted contact cancels, records the contact and clears the payload', async () => {
  const at = new Date('2037-10-07T14:10:00.000Z');
  const { contact, step, rfc } = await sentContact(at, '10');
  await deleteContact(executor, deletion(contact.contactId, at));
  const job = await insertLeasedReconcile(at, {
    in_reply_to: rfc,
    ranked_candidates: [{ message_id: rfc, rank: 0 }],
    resolved_candidates: [
      {
        message_id: rfc,
        rank: 0,
        contact_id: contact.contactId,
        seed_job_id: step.jobId,
      },
    ],
  });

  const outcome = await settleGoogleReplyReconciliation(executor, {
    jobId: job.id,
    leaseToken: job.leaseToken,
    now: new Date(at.getTime() + 600_000),
  });

  expect(outcome).toBe('ignored_deleted');
  expect(await readReconcileRow(job.id)).toEqual({
    status: 'cancelled',
    contact_id: contact.contactId,
    payload: {},
  });
});

test('settling a lower reference to a deleted contact strips its ids and keeps the job', async () => {
  const at = new Date('2037-11-07T14:10:00.000Z');
  const gone = await sentContact(at, '11');
  const live = await sentContact(at, '11');
  await deleteContact(executor, deletion(gone.contact.contactId, at));
  const job = await insertLeasedReconcile(at, {
    in_reply_to: live.rfc,
    references: [gone.rfc, live.rfc],
    ranked_candidates: [
      { message_id: live.rfc, rank: 0 },
      { message_id: gone.rfc, rank: 1 },
    ],
    resolved_candidates: [
      {
        message_id: gone.rfc,
        rank: 1,
        contact_id: gone.contact.contactId,
        seed_job_id: gone.step.jobId,
      },
    ],
  });

  const outcome = await settleGoogleReplyReconciliation(executor, {
    jobId: job.id,
    leaseToken: job.leaseToken,
    now: new Date(at.getTime() + 600_000),
  });

  expect(outcome).toBe('retry_scheduled');
  const row = await readReconcileRow(job.id);
  expect(row?.status).toBe('pending');
  expect(JSON.stringify(row?.payload)).not.toContain(gone.rfc);
  expect(row?.payload['references']).toEqual([live.rfc]);
});

test('deleting a contact strips only its ids from a reply that also references a live contact', async () => {
  const at = new Date('2038-01-07T14:10:00.000Z');
  const gone = await sentContact(at, '01');
  const live = await sentContact(at, '01');
  const mixed = await insertReconcile(at, {
    in_reply_to: gone.rfc,
    references: [live.rfc, gone.rfc],
    ranked_candidates: [
      { message_id: gone.rfc, rank: 0 },
      { message_id: live.rfc, rank: 1 },
    ],
  });

  await deleteContact(executor, deletion(gone.contact.contactId, at));

  const row = await readReconcileRow(mixed);
  expect(row?.status).toBe('pending');
  expect(JSON.stringify(row?.payload)).not.toContain(gone.rfc);
  expect(row?.payload).toMatchObject({
    in_reply_to: null,
    references: [live.rfc],
    ranked_candidates: [{ message_id: live.rfc, rank: 1 }],
  });
});

test('binding a provider Message-ID after the contact was deleted cancels the waiting reply job and clears its payload', async () => {
  const at = new Date('2038-02-07T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    new Date('2038-02-01T00:00:00.000Z'),
  );
  const step = await acceptStepOne(
    executor,
    contact,
    at,
    'Engineer to engineer',
  );
  const rfc = `<${randomUUID()}@resend.dev>`;
  const reply = await insertReconcile(at, {
    in_reply_to: rfc,
    ranked_candidates: [{ message_id: rfc, rank: 0 }],
  });
  const unrelated = await insertReconcile(at, {
    in_reply_to: `<${randomUUID()}@resend.dev>`,
  });
  await deleteContact(executor, deletion(contact.contactId, at));

  const result = await bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId: rfc,
  });

  expect(result).toBe('ignored_deleted');
  expect(await readReconcileRow(reply)).toEqual({
    status: 'cancelled',
    contact_id: contact.contactId,
    payload: {},
  });
  expect((await readReconcile(unrelated))?.status).toBe('pending');
});
