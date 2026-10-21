import { randomUUID } from 'node:crypto';

import type { SqlExecutor } from '../src/lib/database.ts';

/** A contact approved by a verified form and enrolled in campaign v1. */
export interface EnrolledContact {
  contactId: string;
  approvalEventKey: string;
  approvedAt: Date;
}

/**
 * Inserts an approved, enrolled contact for integration tests and records its
 * id in `createdContactIds` for cleanup.
 */
export async function createEnrolledContact(
  executor: SqlExecutor,
  createdContactIds: Set<string>,
  approvedAt: Date,
): Promise<EnrolledContact> {
  const contactId = randomUUID();
  const approvalEventKey = `jobs-integration:approval:${contactId}`;
  createdContactIds.add(contactId);
  await executor.execute(
    `insert into growth_contacts (
       id, email_normalized, email_lookup_hmac, email_hmac_key_version,
       outreach_approved_at, source
     ) values ($1, $2, $3, 1, $4, 'jobs-integration')`,
    [
      contactId,
      `${contactId}@example.com`,
      `jobs-integration:${contactId}`,
      approvedAt,
    ],
  );
  await executor.execute(
    `insert into growth_activity (
       event_key, contact_id, kind, occurred_at, data
     ) values
       ($1, $2, 'form.outreach_approved', $3,
        jsonb_build_object(
          'source_form', 'contact',
          'verification', 'server_verified'
        )),
       ('campaign:v1:' || $2::text || ':enrolled', $2,
        'campaign.enrolled:v1', $3,
        jsonb_build_object(
          'campaign_version', 'v1',
          'approval_event_key', $1::text,
          'approval_kind', 'form.outreach_approved',
          'approval_at', $3::timestamptz
        ))`,
    [approvalEventKey, contactId, approvedAt],
  );
  return { contactId, approvalEventKey, approvedAt };
}

/** Inserts a campaign v1 `send_step` job for an enrolled contact. */
export async function insertSendStep(
  executor: SqlExecutor,
  contact: EnrolledContact,
  job: {
    status: 'pending' | 'leased';
    availableAt: Date;
    leaseUntil?: Date;
    leaseToken?: string;
    step?: number;
  },
): Promise<string> {
  const jobId = randomUUID();
  await executor.execute(
    `insert into growth_jobs (
       id, kind, contact_id, status, available_at, lease_until,
       lease_token, idempotency_key, payload
     ) values (
       $1, 'send_step', $2, $3, $4, $5, $6, $7,
       jsonb_build_object(
         'campaign_version', 'v1',
         'step', $8::integer,
         'approval_event_key', $9::text,
         'approval_kind', 'form.outreach_approved',
         'approval_at', $10::timestamptz
       )
     )`,
    [
      jobId,
      contact.contactId,
      job.status,
      job.availableAt,
      job.leaseUntil ?? null,
      job.leaseToken ?? null,
      `jobs-integration:${jobId}`,
      job.step ?? 1,
      contact.approvalEventKey,
      contact.approvedAt,
    ],
  );
  return jobId;
}

/** Deletes every row the integration tests created, in foreign-key-safe order. */
export async function deleteCreatedContacts(
  executor: SqlExecutor,
  createdContactIds: Set<string>,
): Promise<void> {
  const ids = [...createdContactIds];
  if (ids.length === 0) return;
  await executor.transaction(async (tx) => {
    await tx.execute(
      `delete from growth_artifacts
       where contact_id = any($1::uuid[])
          or job_id in (
            select id from growth_jobs where contact_id = any($1::uuid[])
          )`,
      [ids],
    );
    await tx.execute(
      'delete from growth_activity where contact_id = any($1::uuid[])',
      [ids],
    );
    await tx.execute(
      'delete from growth_jobs where contact_id = any($1::uuid[])',
      [ids],
    );
    await tx.execute('delete from growth_contacts where id = any($1::uuid[])', [
      ids,
    ]);
  });
}
