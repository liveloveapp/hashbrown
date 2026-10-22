import { randomBytes, randomUUID } from 'node:crypto';

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

/** An install and a runtime observation that share an installation token. */
export interface LinkedObservations {
  installObservationId: string;
  runtimeObservationId: string;
}

/**
 * Inserts an install and a runtime observation under fresh subjects for
 * integration tests and records the subjects' external ids in
 * `createdSubjectIds` so {@link deleteCreatedSubjects} removes them (and,
 * by cascade, their observations and install runtime links).
 */
export async function insertLinkedObservations(
  executor: SqlExecutor,
  createdSubjectIds: Set<string>,
  at: Date,
): Promise<LinkedObservations> {
  const token = randomBytes(32).toString('hex');
  const insert = async (
    source: 'install' | 'runtime',
    namespace: 'installation' | 'development_browser',
    kind: string,
  ) => {
    const externalId = randomUUID();
    createdSubjectIds.add(externalId);
    const result = await executor.execute<{ id: string }>(
      `with subject as (
         insert into growth_observation_subjects (
           namespace, external_id, first_received_at, last_received_at
         ) values ($2, $3, $5, $5)
         returning id
       )
       insert into growth_observations (
         source, event_id, subject_id, kind, schema_version, collector_version,
         identity_scope, occurred_at, received_at, properties, public_digest,
         installation_token_digest
       )
       select $1, gen_random_uuid(), subject.id, $4, 1, '1', 'persistent',
              $5, $5, '{}'::jsonb, $6, $7
       from subject
       returning id`,
      [
        source,
        namespace,
        externalId,
        kind,
        at,
        randomBytes(32).toString('hex'),
        token,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('expected an observation');
    return id;
  };
  return {
    installObservationId: await insert(
      'install',
      'installation',
      'package.installed',
    ),
    runtimeObservationId: await insert(
      'runtime',
      'development_browser',
      'runtime.session_started',
    ),
  };
}

/** The `install_runtime.outreach_approved` approval naming linked observations. */
export function installRuntimeApproval(
  observations: LinkedObservations,
): CampaignApprovalFixture {
  return {
    kind: 'install_runtime.outreach_approved',
    data: {
      install_observation_id: observations.installObservationId,
      runtime_observation_id: observations.runtimeObservationId,
      policy_version: 'growth-v1',
      verification: 'linked_observations',
    },
  };
}

/** Records an install runtime link decision for linked observations. */
export async function insertInstallRuntimeLink(
  executor: SqlExecutor,
  observations: LinkedObservations,
  link: {
    contactId: string | null;
    outcome: 'approved' | 'ineligible' | 'conflicted';
    evaluatedAt: Date;
  },
): Promise<void> {
  await executor.execute(
    `insert into growth_install_runtime_links (
       runtime_observation_id, install_observation_id, contact_id, outcome,
       evaluated_at
     ) values ($1, $2, $3, $4, $5)`,
    [
      observations.runtimeObservationId,
      observations.installObservationId,
      link.contactId,
      link.outcome,
      link.evaluatedAt,
    ],
  );
}

/** Deletes subjects created by {@link insertLinkedObservations}; observations and links cascade. */
export async function deleteCreatedSubjects(
  executor: SqlExecutor,
  createdSubjectIds: Set<string>,
): Promise<void> {
  const ids = [...createdSubjectIds];
  if (ids.length === 0) return;
  await executor.execute(
    'delete from growth_observation_subjects where external_id = any($1::uuid[])',
    [ids],
  );
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
    await tx.execute(
      'delete from growth_contact_scores where contact_id = any($1::uuid[])',
      [ids],
    );
    await tx.execute('delete from growth_contacts where id = any($1::uuid[])', [
      ids,
    ]);
  });
}
