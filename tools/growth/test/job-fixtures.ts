import { randomUUID } from 'node:crypto';

import type { SqlExecutor } from '../src/lib/database.ts';

/** An approval activity that may authorize campaign outreach. */
export interface CampaignApprovalFixture {
  kind: string;
  data: Record<string, unknown>;
}

/** The default approval: a server-verified Get unstuck form. */
export const UNSTUCK_FORM_APPROVAL: CampaignApprovalFixture = {
  kind: 'form.outreach_approved',
  data: { source_form: 'unstuck', verification: 'server_verified' },
};

/** A contact whose outreach approval is backed by an approval activity. */
export interface ApprovedContact {
  contactId: string;
  approvalEventKey: string;
  approvalKind: string;
  approvedAt: Date;
}

/** A contact approved by a verified form and enrolled in campaign v1. */
export type EnrolledContact = ApprovedContact;

/**
 * Inserts a contact and its approval activity for integration tests and
 * records its id in `createdContactIds` for cleanup. The contact's
 * `outreach_approved_at` is the approval time unless `approved` is false.
 */
export async function createApprovedContact(
  executor: SqlExecutor,
  createdContactIds: Set<string>,
  approvedAt: Date,
  options: { approval?: CampaignApprovalFixture; approved?: boolean } = {},
): Promise<ApprovedContact> {
  const approval = options.approval ?? UNSTUCK_FORM_APPROVAL;
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
      options.approved === false ? null : approvedAt,
    ],
  );
  await executor.execute(
    `insert into growth_activity (
       event_key, contact_id, kind, occurred_at, data
     ) values ($1, $2, $3, $4, $5::jsonb)`,
    [
      approvalEventKey,
      contactId,
      approval.kind,
      approvedAt,
      JSON.stringify(approval.data),
    ],
  );
  return {
    contactId,
    approvalEventKey,
    approvalKind: approval.kind,
    approvedAt,
  };
}

/**
 * Inserts an approved, enrolled contact for integration tests and records its
 * id in `createdContactIds` for cleanup.
 */
export async function createEnrolledContact(
  executor: SqlExecutor,
  createdContactIds: Set<string>,
  approvedAt: Date,
  approval: CampaignApprovalFixture = UNSTUCK_FORM_APPROVAL,
): Promise<EnrolledContact> {
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    approvedAt,
    { approval },
  );
  await executor.execute(
    `insert into growth_activity (
       event_key, contact_id, kind, occurred_at, data
     ) values (
       'campaign:v1:' || $2::text || ':enrolled', $2::uuid,
       'campaign.enrolled:v1', $3,
       jsonb_build_object(
         'campaign_version', 'v1',
         'approval_event_key', $1::text,
         'approval_kind', $4::text,
         'approval_at', $3::timestamptz
       )
     )`,
    [contact.approvalEventKey, contact.contactId, approvedAt, approval.kind],
  );
  return contact;
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
         'approval_kind', $11::text,
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
      contact.approvalKind,
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
