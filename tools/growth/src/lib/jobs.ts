import { canonicalJson } from './activity.ts';
import { businessMorningAfter } from './campaign-schedule.ts';
import {
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import { CONTACT_HARD_STOP_REASONS } from './contacts.ts';
import { normalizeEmail } from './crypto.ts';
import type {
  GrowthCampaignEnrollmentReason,
  GrowthJob,
  GrowthJobKind,
  GrowthLifecycleFormSubmission,
  GrowthLifecycleJobContext,
} from './models.ts';

const FULFILLMENT_ALLOWED_PRIOR_STOPS = new Set([
  'unsubscribe',
  'campaign.reply_received',
]);
const FULFILLMENT_EPOCH_FATAL_STOP_REASONS = CONTACT_HARD_STOP_REASONS.filter(
  (reason) =>
    reason !== 'deletion' && !FULFILLMENT_ALLOWED_PRIOR_STOPS.has(reason),
);

interface JobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  contact_id: string | null;
  project_id: string | null;
  status: GrowthJob['status'];
  available_at: Date | string;
  lease_until: Date | string | null;
  lease_token: string | null;
  attempts: number;
  idempotency_key: string;
  payload: Record<string, unknown>;
  provider_email_id: string | null;
  rfc_message_id: string | null;
  gmail_seed_message_id: string | null;
  delivery_status: GrowthJob['deliveryStatus'];
  last_error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Thrown when a lease-guarded operation finds the job's lease gone or replaced. */
export class JobLeaseConflictError extends Error {
  constructor(jobId: string) {
    super(`Growth job lease is no longer active: ${jobId}`);
    this.name = 'JobLeaseConflictError';
  }
}

/** Thrown when a stored submission authorization does not match the lease it claims. */
export class FinalSendAuthorizationConflictError extends JobLeaseConflictError {
  constructor(eventKey: string, jobId: string) {
    super(jobId);
    this.name = 'FinalSendAuthorizationConflictError';
    this.message = `Growth final authorization event key conflict: ${eventKey}`;
  }
}

/**
 * The result of {@link authorizeLeasedJobForSubmission}: either a recipient
 * cleared for one provider submission, or the gate that refused it.
 */
export type FinalSendAuthorization =
  | {
      authorized: true;
      job: GrowthJob;
      recipient: {
        contactId: string;
        emailNormalized: string;
      };
      boundedRaceNotice: 'a_future_stop_can_overlap_provider_submission';
    }
  | {
      authorized: false;
      reason:
        | 'contact_deleted'
        | 'contact_stopped'
        | 'contact_unapproved'
        | 'campaign_disabled'
        | 'delivery_disabled'
        | 'outside_send_window';
      job: GrowthJob;
    };

interface SendContactRow extends Record<string, unknown> {
  id: string;
  email_normalized: string | null;
  outreach_approved_at: Date | string | null;
  deleted_at: Date | string | null;
  latest_hard_stop_kind: string | null;
  latest_hard_stop_at: Date | string | null;
  fulfillment_delivery_blocked?: boolean;
  fulfillment_deletion_blocked?: boolean;
  campaign_approval_valid?: boolean;
  campaign_enrollment_valid?: boolean;
}

interface FinalSendAuthorizationRow extends Record<string, unknown> {
  event_key: string;
  contact_id: string | null;
  project_id: string | null;
  kind: string;
  occurred_at: Date | string;
  data: Record<string, unknown>;
}

type ProviderAcceptanceActivityRow = FinalSendAuthorizationRow;

interface ProviderAcceptanceContactReference extends Record<string, unknown> {
  contact_id: string | null;
}

function validDate(field: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date`);
  }
  return value;
}

function positiveInteger(
  field: string,
  value: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${field} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function requiredText(field: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} is required`);
  return normalized;
}

function opaqueIdentifier(
  field: string,
  value: string,
  maximum: number,
): string {
  const normalized = requiredText(field, value);
  if (
    normalized.length > maximum ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)
  ) {
    throw new Error(`${field} must be a bounded opaque identifier`);
  }
  return normalized;
}

function toJob(row: JobRow): GrowthJob {
  return {
    id: row.id,
    kind: row.kind,
    contactId: row.contact_id,
    projectId: row.project_id,
    status: row.status,
    availableAt: new Date(row.available_at),
    leaseUntil: row.lease_until ? new Date(row.lease_until) : null,
    leaseToken: row.lease_token,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    providerEmailId: row.provider_email_id,
    rfcMessageId: row.rfc_message_id,
    gmailSeedMessageId: row.gmail_seed_message_id,
    deliveryStatus: row.delivery_status,
    lastErrorCode: row.last_error_code,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** The approval activity kinds that may authorize campaign v1 outreach. */
const CAMPAIGN_APPROVAL_KINDS = [
  'form.outreach_approved',
  'contact.reauthorized',
  'install_runtime.outreach_approved',
] as const;

/**
 * SQL predicate: the approval activity aliased `alias` may authorize campaign
 * outreach. A form approval must be a server-verified Get unstuck submission,
 * a reauthorization must be a founder action, and an install runtime approval
 * must name the install and runtime observations it was linked from, backed by
 * an `approved` link row for exactly those observations and this contact,
 * with both observations unredacted.
 */
function campaignApprovalPredicate(alias: string): string {
  return `(
    (
      ${alias}.kind = 'form.outreach_approved'
      and ${alias}.data->>'verification' = 'server_verified'
      and ${alias}.data->>'source_form' = any(array['unstuck'])
    )
    or (
      ${alias}.kind = 'contact.reauthorized'
      and ${alias}.data->>'provenance' = 'founder_action'
    )
    or (
      ${alias}.kind = 'install_runtime.outreach_approved'
      and ${alias}.data->>'verification' = 'linked_observations'
      and coalesce(${alias}.data->>'install_observation_id', '') <> ''
      and coalesce(${alias}.data->>'runtime_observation_id', '') <> ''
      and exists (
        select 1
        from growth_install_runtime_links link
        join growth_observations runtime_observation
          on runtime_observation.id = link.runtime_observation_id
        join growth_observations install_observation
          on install_observation.id = link.install_observation_id
        where link.outcome = 'approved'
          and link.contact_id = ${alias}.contact_id
          and link.runtime_observation_id::text =
              ${alias}.data->>'runtime_observation_id'
          and link.install_observation_id::text =
              ${alias}.data->>'install_observation_id'
          and runtime_observation.redacted_at is null
          and install_observation.redacted_at is null
      )
    )
  )`;
}

/** Options for {@link materializeCampaignEnrollment}. */
export interface MaterializeCampaignEnrollmentInput {
  /** `CAMPAIGN_ENROLLMENT_ENABLED`; when false nothing is read or written. */
  enrollmentEnabled: boolean;
  /**
   * `CAMPAIGN_ENROLLMENT_START_AT`: only contacts approved at or after it are
   * enrolled. Recorded once as `campaign:v1:configuration` and immutable.
   */
  enrollmentStartAt: Date;
  now: Date;
  /** Contacts to enrol in this call, 1..1000. */
  batchSize: number;
}

/** The contacts {@link materializeCampaignEnrollment} enrolled. */
export interface MaterializeCampaignEnrollmentResult {
  enrolledContactIds: string[];
  createdJobs: number;
}

/**
 * Enrols approved contacts in campaign v1. Under the privacy lock and a
 * campaign advisory lock it records the enrollment start once, then, for each
 * contact whose `outreach_approved_at` is at or after the start, is backed by
 * an approval activity at that instant (a server-verified `unstuck` form, a
 * founder reauthorization or a linked install runtime approval), is not
 * deleted, has no hard stop since approval and is not yet enrolled, it records
 * `campaign.enrolled:v1` with its `enrollment_reason` and queues three
 * `send_step` jobs (`campaign:v1:<contactId>:step:<n>`) due at the next
 * business morning. Step 1 is never leased before the enrollment is five
 * minutes old; {@link recordProviderAcceptance} anchors steps 2 and 3.
 *
 * @throws When `enrollmentStartAt` differs from the recorded configuration.
 */
export async function materializeCampaignEnrollment(
  executor: SqlExecutor,
  input: MaterializeCampaignEnrollmentInput,
): Promise<MaterializeCampaignEnrollmentResult> {
  const enrollmentStartAt = validDate(
    'enrollmentStartAt',
    input.enrollmentStartAt,
  );
  const now = validDate('now', input.now);
  const batchSize = positiveInteger('batchSize', input.batchSize, 1_000);
  if (typeof input.enrollmentEnabled !== 'boolean') {
    throw new Error('enrollmentEnabled must be a boolean');
  }
  if (!input.enrollmentEnabled) {
    return { enrolledContactIds: [], createdJobs: 0 };
  }

  return executor.transaction(async (transaction) => {
    await privacyLock(transaction);
    await transaction.execute(
      `/* growth:lock-campaign-enrollment */
       select pg_advisory_xact_lock(
         hashtextextended('growth:campaign-enrollment:v1', 0)
       )`,
    );
    await transaction.execute(
      `/* growth:insert-campaign-enrollment-config */
       insert into growth_activity (
         event_key, kind, occurred_at, data
       ) values (
         'campaign:v1:configuration',
         'campaign.configured:v1',
         $2,
         jsonb_build_object('enrollment_start_at', $1::timestamptz)
       )
       on conflict (event_key) do nothing`,
      [enrollmentStartAt, now],
    );
    const configured = await transaction.execute<{
      enrollment_start_at: Date | string | null;
    }>(
      `/* growth:read-campaign-enrollment-start */
       select data->>'enrollment_start_at' as enrollment_start_at
       from growth_activity
       where event_key = 'campaign:v1:configuration'
         and kind = 'campaign.configured:v1'`,
    );
    const configuredAt = configured.rows[0]?.enrollment_start_at;
    if (
      configuredAt == null ||
      new Date(configuredAt).getTime() !== enrollmentStartAt.getTime()
    ) {
      throw new Error(
        'CAMPAIGN_ENROLLMENT_START_AT is immutable after campaign configuration',
      );
    }
    const result = await transaction.execute<{
      contact_id: string;
      created_jobs: number | string;
    }>(
      `/* growth:enroll-campaign-v1 */
       with eligible as (
         select c.id,
                approved.event_key as approval_event_key,
                approved.kind as approval_kind,
                approved.occurred_at as approval_at
         from growth_contacts c
         join lateral (
           select approval.event_key,
                  approval.kind,
                  approval.occurred_at
           from growth_activity approval
           where approval.contact_id = c.id
             and approval.occurred_at = c.outreach_approved_at
             and ${campaignApprovalPredicate('approval')}
           order by approval.event_key
           limit 1
         ) approved on true
         where c.deleted_at is null
           and c.outreach_approved_at >= $1
           and not exists (
             select 1
             from growth_activity stop
             where stop.contact_id = c.id
               and stop.kind = any($4::text[])
               and stop.occurred_at >= c.outreach_approved_at
           )
           and not exists (
             select 1
             from growth_activity a
             where a.event_key = 'campaign:v1:' || c.id::text || ':enrolled'
           )
         order by c.outreach_approved_at, c.id
         for update of c skip locked
         limit $3
       ), inserted_enrollment as (
         insert into growth_activity (
           event_key, contact_id, kind, occurred_at, data
         )
         select 'campaign:v1:' || e.id::text || ':enrolled',
                e.id,
                'campaign.enrolled:v1',
                $2,
                jsonb_build_object(
                  'campaign_version', 'v1',
                  'enrollment_reason', case e.approval_kind
                    when 'form.outreach_approved' then 'unstuck_form'
                    when 'contact.reauthorized' then 'install_digest'
                    when 'install_runtime.outreach_approved'
                      then 'install_runtime'
                  end,
                  'enrollment_start_at', $1::timestamptz,
                  'approval_event_key', e.approval_event_key,
                  'approval_kind', e.approval_kind,
                  'approval_at', e.approval_at
                )
         from eligible e
         on conflict (event_key) do nothing
         returning contact_id, data
       ), enrolled as (
         select contact_id,
                data->>'approval_event_key' as approval_event_key,
                data->>'approval_kind' as approval_kind,
                data->>'approval_at' as approval_at
         from inserted_enrollment
       ), inserted_jobs as (
         insert into growth_jobs (
           kind, contact_id, status, available_at,
           idempotency_key, payload
         )
         select 'send_step',
                e.contact_id,
                'pending',
                $5,
                'campaign:v1:' || e.contact_id::text || ':step:' || step::text,
                jsonb_build_object(
                  'campaign_version', 'v1',
                  'step', step,
                  'approval_event_key', e.approval_event_key,
                  'approval_kind', e.approval_kind,
                  'approval_at', e.approval_at
                )
         from enrolled e
         cross join generate_series(1, 3) step
         on conflict (idempotency_key) do nothing
         returning contact_id
       )
       select e.contact_id, count(j.contact_id)::integer as created_jobs
       from enrolled e
       left join inserted_jobs j on j.contact_id = e.contact_id
       group by e.contact_id
       order by e.contact_id`,
      [
        enrollmentStartAt,
        now,
        batchSize,
        CONTACT_HARD_STOP_REASONS,
        businessMorningAfter(now, 1),
      ],
    );
    return {
      enrolledContactIds: result.rows.map(({ contact_id }) => contact_id),
      createdJobs: result.rows.reduce(
        (total, { created_jobs }) => total + Number(created_jobs),
        0,
      ),
    };
  });
}

/** A job to enqueue once under its idempotency key. */
export interface EnqueueJobInput {
  kind: GrowthJobKind;
  contactId: string | null;
  availableAt: Date;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/** Whether {@link enqueueJob} inserted the job or found it already queued. */
export interface EnqueueJobResult {
  status: 'inserted' | 'exists';
  job: GrowthJob;
}

/**
 * Inserts a pending job once per idempotency key. A second call with the same
 * key returns the stored job as `exists`.
 *
 * @param transaction - The open transaction (or executor) to write through.
 * @throws When the stored job for the key differs in kind, contact, or payload.
 */
export async function enqueueJob(
  transaction: SqlTransaction,
  input: EnqueueJobInput,
): Promise<EnqueueJobResult> {
  const kind = requiredText('kind', input.kind);
  const idempotencyKey = requiredText('idempotencyKey', input.idempotencyKey);
  const availableAt = validDate('availableAt', input.availableAt);
  const inserted = await transaction.execute<JobRow>(
    `/* growth:enqueue-job */
     insert into growth_jobs (
       kind, contact_id, status, available_at, idempotency_key, payload
     ) values ($1, $2, 'pending', $3, $4, $5::jsonb)
     on conflict (idempotency_key) do nothing
     returning *`,
    [
      kind,
      input.contactId,
      availableAt,
      idempotencyKey,
      JSON.stringify(input.payload),
    ],
  );
  if (inserted.rows[0]) {
    return { status: 'inserted', job: toJob(inserted.rows[0]) };
  }

  const existing = await transaction.execute<JobRow>(
    `/* growth:read-enqueued-job */
     select *
     from growth_jobs
     where idempotency_key = $1`,
    [idempotencyKey],
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.kind !== kind ||
    row.contact_id !== input.contactId ||
    canonicalJson(row.payload) !== canonicalJson(input.payload)
  ) {
    throw new Error(`Growth job idempotency conflict: ${idempotencyKey}`);
  }
  return { status: 'exists', job: toJob(row) };
}

/** Options for {@link leaseDueJobs}. */
export interface LeaseDueJobsInput {
  kinds: readonly string[];
  now: Date;
  batchSize: number;
  leaseDurationMs: number;
  campaignEnabled: boolean;
  /**
   * Whether `now` is inside the campaign send window; defaults to always. The
   * lease SQL also requires Monday to Friday 07:00 Pacific for `send_step`,
   * so both must agree.
   */
  isSendWindow?: (now: Date) => boolean;
}

/**
 * Leases due jobs of the given kinds with `for update skip locked`. Pending
 * jobs and expired leases are leased with a fresh token and an incremented
 * attempt count; an expired lease that was already authorized for submission
 * is failed with `delivery_status = 'unknown'` for manual review instead.
 *
 * A `send_step` is leased only when the campaign is enabled, `isSendWindow`
 * agrees, `now` is Monday to Friday in the 07:00 Pacific hour, and either it
 * is step 1 of an enrollment (from one of the three approval kinds) at least
 * five minutes old, or the previous step was accepted by the provider. A
 * `send_step` also waits while another `fulfill` or `send_step` for the same
 * contact is completed with a provider id but no RFC Message-ID yet, and
 * neither `send_step` nor `reply_reconcile` is leased while a
 * `mailbox.recovery_required` has no matching `mailbox.recovery_completed`.
 *
 * @throws When no kinds are given or `batchSize` is outside 1..100.
 */
export async function leaseDueJobs(
  executor: SqlExecutor,
  input: LeaseDueJobsInput,
): Promise<GrowthJob[]> {
  const kinds = [
    ...new Set(input.kinds.map((kind) => requiredText('kind', kind))),
  ];
  if (kinds.length === 0) throw new Error('at least one job kind is required');
  const now = validDate('now', input.now);
  const batchSize = positiveInteger('batchSize', input.batchSize, 100);
  if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs < 1) {
    throw new Error('leaseDurationMs must be a positive integer');
  }
  const leaseUntil = new Date(now.getTime() + input.leaseDurationMs);

  const result = await executor.execute<JobRow>(
    `/* growth:lease-due-jobs */
     with ambiguous_candidates as (
       select interrupted.id
       from growth_jobs interrupted
       where interrupted.kind = any($1::text[])
         and interrupted.status = 'leased'
         and interrupted.lease_until <= $2
         and interrupted.delivery_status = 'not_submitted'
         and exists (
           select 1
           from growth_activity submission_authorization
           where submission_authorization.kind =
                 'delivery.submission_authorized'
             and submission_authorization.event_key =
                 'job:' || interrupted.id::text || ':submission-authorized:' || interrupted.lease_token::text
             and submission_authorization.data->>'lease_token' = interrupted.lease_token::text
         )
       order by interrupted.lease_until, interrupted.id
       for update skip locked
       limit $3
     ), ambiguous_authorized as (
       update growth_jobs interrupted
       set status = 'failed',
           lease_token = null,
           lease_until = null,
           delivery_status = 'unknown',
           last_error_code = 'worker_interrupted_after_authorization'
       from ambiguous_candidates candidate
       where interrupted.id = candidate.id
       returning interrupted.id, interrupted.contact_id,
                 interrupted.project_id
     ), recorded_ambiguous as (
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       )
       select 'job:' || interrupted.id::text || ':provider-acceptance-unknown',
              interrupted.contact_id,
              interrupted.project_id,
              'delivery.acceptance_unknown',
              $2,
              jsonb_build_object(
                'error_code', 'worker_interrupted_after_authorization',
                'manual_review', true
              )
       from ambiguous_authorized interrupted
       on conflict (event_key) do nothing
       returning event_key
     ), due as (
       select j.id
       from growth_jobs j
       where j.kind = any($1::text[])
         and ($5::boolean or j.kind <> 'send_step')
         -- A reply to an earlier send can only be matched once that send's
         -- Message-ID is bound, so the next step waits for the binding.
         and (j.kind <> 'send_step' or not exists (
           select 1 from growth_jobs unbound
           where unbound.contact_id = j.contact_id and unbound.id <> j.id
             and unbound.kind in ('fulfill', 'send_step') and unbound.status = 'completed'
             and unbound.provider_email_id is not null and unbound.rfc_message_id is null
         ))
         -- While the mailbox poller may have missed replies, nothing that
         -- depends on reply evidence runs.
         and (
           j.kind not in ('send_step', 'reply_reconcile')
           or not exists (
             select 1
             from growth_activity recovery_required
             where recovery_required.kind = 'mailbox.recovery_required'
               and not exists (
                 select 1
                 from growth_activity recovery_completed
                 where recovery_completed.kind = 'mailbox.recovery_completed'
                   and recovery_completed.data->>'recovery_id' = recovery_required.data->>'recovery_id'
               )
           )
         )
         and j.available_at <= $2
         and (
           j.status = 'pending'
           or (j.status = 'leased' and j.lease_until <= $2)
         )
         and not exists (
           select 1 from ambiguous_authorized interrupted
           where interrupted.id = j.id
         )
         and (
           j.kind <> 'send_step'
           or (
             j.payload->>'campaign_version' = 'v1'
             and $6::boolean
             and extract(isodow from $2::timestamptz at time zone 'America/Los_Angeles') between 1 and 5
             and extract(hour from $2::timestamptz at time zone 'America/Los_Angeles') = 7
             and (
               (
                 j.payload->>'step' = '1'
                 and exists (
                   select 1
                   from growth_activity enrollment
                   where enrollment.event_key =
                         'campaign:v1:' || j.contact_id::text || ':enrolled'
                     and enrollment.contact_id = j.contact_id
                     and enrollment.kind = 'campaign.enrolled:v1'
                     and enrollment.data->>'approval_kind' = any(
                       array[${CAMPAIGN_APPROVAL_KINDS.map((kind) => `'${kind}'`).join(', ')}]
                     )
                     and enrollment.occurred_at + interval '5 minutes' <= $2
                 )
               )
               or exists (
                 select 1
                 from growth_jobs prior
                 where prior.contact_id = j.contact_id
                   and prior.kind = 'send_step'
                   and prior.payload->>'campaign_version' = 'v1'
                   and prior.payload->>'step' = case j.payload->>'step'
                     when '2' then '1'
                     when '3' then '2'
                     else null
                   end
                   and prior.status = 'completed'
                   and prior.provider_email_id is not null
                   and prior.delivery_status in ('submitted', 'delivered')
               )
             )
           )
         )
       order by j.available_at, j.id
       for update skip locked
       limit $3
     )
     update growth_jobs j
     set status = 'leased',
         lease_token = gen_random_uuid(),
         lease_until = $4,
         attempts = j.attempts + 1
     from due
     where j.id = due.id
     returning j.*`,
    [
      kinds,
      now,
      batchSize,
      leaseUntil,
      input.campaignEnabled,
      (input.isSendWindow ?? (() => true))(now),
    ],
  );
  return result.rows.map(toJob);
}

/**
 * Final gate before a provider submission. Under the privacy lock it locks the
 * contact, then the job, and checks in order: delivery enabled, campaign
 * enabled, contact not deleted, approval not stopped (non-`fulfill` kinds),
 * lease still valid (throws), send window. On success it records
 * `delivery.submission_authorized` once for this lease.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export async function authorizeLeasedJobForSubmission(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    campaignEnabled: boolean;
    deliveryEnabled: boolean;
    currentTime?: () => Date;
    /** Whether `now` is inside the campaign send window; defaults to always. */
    isSendWindow?: (now: Date) => boolean;
  },
): Promise<FinalSendAuthorization> {
  const jobId = requiredText('jobId', input.jobId);
  const leaseToken = requiredText('leaseToken', input.leaseToken);
  let now = validDate('now', input.now);
  if (typeof input.campaignEnabled !== 'boolean') {
    throw new Error('campaignEnabled must be a boolean');
  }
  if (typeof input.deliveryEnabled !== 'boolean') {
    throw new Error('deliveryEnabled must be a boolean');
  }

  return executor.transaction(async (transaction) => {
    await privacyLock(transaction);
    const contactResult = await transaction.execute<SendContactRow>(
      `/* growth:lock-contact-for-send */
       select c.id,
              c.email_normalized,
              c.outreach_approved_at,
              c.deleted_at,
              stop.kind as latest_hard_stop_kind,
              stop.occurred_at as latest_hard_stop_at,
              exists (
                select 1
                from growth_activity fatal_stop
                where fatal_stop.contact_id = c.id
                  and fatal_stop.kind = any($3::text[])
                  and (
                    c.outreach_approved_at is null
                    or fatal_stop.occurred_at >= c.outreach_approved_at
                  )
              ) as fulfillment_delivery_blocked,
              exists (
                select 1
                from growth_activity deletion_stop
                where deletion_stop.contact_id = c.id
                  and deletion_stop.kind = 'deletion'
              ) as fulfillment_deletion_blocked,
              approval.event_key is not null as campaign_approval_valid,
              enrollment.event_key is not null as campaign_enrollment_valid
       from growth_contacts c
       join growth_jobs target on target.contact_id = c.id
       left join lateral (
         select authoritative.event_key,
                authoritative.kind,
                authoritative.occurred_at
         from growth_activity authoritative
         where authoritative.contact_id = c.id
           and authoritative.event_key =
               target.payload->>'approval_event_key'
           and authoritative.kind = target.payload->>'approval_kind'
           and authoritative.occurred_at = c.outreach_approved_at
           and ${campaignApprovalPredicate('authoritative')}
         limit 1
       ) approval on true
       left join lateral (
         select enrolled.event_key
         from growth_activity enrolled
         where enrolled.event_key =
               'campaign:v1:' || c.id::text || ':enrolled'
           and enrolled.contact_id = c.id
           and enrolled.kind = 'campaign.enrolled:v1'
           and enrolled.data->>'campaign_version' =
               target.payload->>'campaign_version'
           and enrolled.data->>'approval_event_key' = approval.event_key
           and enrolled.data->>'approval_kind' = approval.kind
           and enrolled.data->>'approval_at' = target.payload->>'approval_at'
           and target.payload->>'approval_event_key' = approval.event_key
           and target.payload->>'approval_kind' = approval.kind
         limit 1
       ) enrollment on true
       left join lateral (
         select a.kind, a.occurred_at
         from growth_activity a
         where a.contact_id = c.id
           and a.kind = any($2::text[])
         order by a.occurred_at desc, a.id desc
         limit 1
       ) stop on true
       where target.id = $1
       for update of c`,
      [jobId, CONTACT_HARD_STOP_REASONS, FULFILLMENT_EPOCH_FATAL_STOP_REASONS],
    );
    const contact = contactResult.rows[0];
    if (!contact) throw new JobLeaseConflictError(jobId);

    const jobResult = await transaction.execute<JobRow>(
      `/* growth:lock-job-for-send */
       select j.*
       from growth_jobs j
       where j.id = $1
       for update of j`,
      [jobId],
    );
    const row = jobResult.rows[0];
    if (!row) throw new JobLeaseConflictError(jobId);
    const job = toJob(row);

    if (!input.deliveryEnabled) {
      return { authorized: false, reason: 'delivery_disabled', job };
    }
    if (job.kind === 'send_step' && !input.campaignEnabled) {
      return { authorized: false, reason: 'campaign_disabled', job };
    }

    if (contact.deleted_at !== null) {
      return { authorized: false, reason: 'contact_deleted', job };
    }
    if (
      job.kind === 'fulfill' &&
      (contact.fulfillment_delivery_blocked === true ||
        contact.fulfillment_deletion_blocked === true)
    ) {
      return {
        authorized: false,
        reason:
          contact.fulfillment_deletion_blocked === true
            ? 'contact_deleted'
            : 'contact_stopped',
        job,
      };
    }
    const requiresOutreachApproval = job.kind !== 'fulfill';
    if (requiresOutreachApproval) {
      const approvedAt = contact.outreach_approved_at
        ? new Date(contact.outreach_approved_at)
        : null;
      if (!approvedAt) {
        return {
          authorized: false,
          reason: contact.latest_hard_stop_kind
            ? 'contact_stopped'
            : 'contact_unapproved',
          job,
        };
      }
      const stoppedAt = contact.latest_hard_stop_at
        ? new Date(contact.latest_hard_stop_at)
        : null;
      if (stoppedAt && stoppedAt.getTime() >= approvedAt.getTime()) {
        return { authorized: false, reason: 'contact_stopped', job };
      }
      if (
        job.kind === 'send_step' &&
        (contact.campaign_approval_valid !== true ||
          contact.campaign_enrollment_valid !== true)
      ) {
        return { authorized: false, reason: 'contact_unapproved', job };
      }
    }
    if (
      job.contactId !== contact.id ||
      job.status !== 'leased' ||
      job.leaseToken !== leaseToken ||
      job.leaseUntil === null ||
      job.leaseUntil.getTime() <= now.getTime() ||
      job.deliveryStatus !== 'not_submitted'
    ) {
      throw new JobLeaseConflictError(jobId);
    }
    if (typeof contact.email_normalized !== 'string') {
      throw new JobLeaseConflictError(jobId);
    }
    let emailNormalized: string;
    try {
      emailNormalized = normalizeEmail(contact.email_normalized);
    } catch {
      throw new JobLeaseConflictError(jobId);
    }
    if (emailNormalized !== contact.email_normalized) {
      throw new JobLeaseConflictError(jobId);
    }

    // Lock waits must not carry a pre-window-boundary timestamp into a send.
    now = validDate('now', input.currentTime?.() ?? now);
    if (job.leaseUntil === null || job.leaseUntil.getTime() <= now.getTime())
      throw new JobLeaseConflictError(jobId);
    if (
      job.kind === 'send_step' &&
      !(input.isSendWindow ?? (() => true))(now)
    ) {
      return { authorized: false, reason: 'outside_send_window', job };
    }

    const inserted = await transaction.execute<{ event_key: string }>(
      `/* growth:insert-final-send-authorization */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values (
         'job:' || $1::text || ':submission-authorized:' || $4::text,
         $2,
         $3,
         'delivery.submission_authorized',
         $5,
         jsonb_build_object(
           'lease_token', $4::text,
           'bounded_stop_race', true
         )
       )
       on conflict (event_key) do nothing
       returning event_key`,
      [job.id, job.contactId, job.projectId, leaseToken, now],
    );
    if (inserted.rows.length === 0) {
      await readAndValidateFinalSendAuthorization(transaction, {
        job,
        leaseToken,
        exactOccurredAt: now,
      });
    }
    return {
      authorized: true,
      job,
      recipient: { contactId: contact.id, emailNormalized },
      boundedRaceNotice: 'a_future_stop_can_overlap_provider_submission',
    };
  });
}

async function readAndValidateFinalSendAuthorization(
  transaction: SqlTransaction,
  input: {
    job: GrowthJob;
    leaseToken: string;
    exactOccurredAt?: Date;
    mustOccurBy?: Date;
  },
): Promise<FinalSendAuthorizationRow> {
  const eventKey = `job:${input.job.id}:submission-authorized:${input.leaseToken}`;
  const result = await transaction.execute<FinalSendAuthorizationRow>(
    `/* growth:read-final-send-authorization */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  const row = result.rows[0];
  const occurredAt = row ? new Date(row.occurred_at) : null;
  const expectedData = {
    bounded_stop_race: true,
    lease_token: input.leaseToken,
  };
  const validOccurredAt =
    occurredAt !== null &&
    !Number.isNaN(occurredAt.getTime()) &&
    (input.exactOccurredAt === undefined ||
      occurredAt.getTime() === input.exactOccurredAt.getTime()) &&
    (input.mustOccurBy === undefined ||
      occurredAt.getTime() <= input.mustOccurBy.getTime());
  if (
    !row ||
    row.event_key !== eventKey ||
    row.contact_id !== input.job.contactId ||
    row.project_id !== input.job.projectId ||
    row.kind !== 'delivery.submission_authorized' ||
    !validOccurredAt ||
    canonicalJson(row.data) !== canonicalJson(expectedData)
  ) {
    throw new FinalSendAuthorizationConflictError(eventKey, input.job.id);
  }
  return row;
}

/** Extends a live lease; returns `null` when the lease is gone. */
export async function renewJobLease(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    leaseDurationMs: number;
  },
): Promise<GrowthJob | null> {
  const now = validDate('now', input.now);
  if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs < 1) {
    throw new Error('leaseDurationMs must be a positive integer');
  }
  const leaseUntil = new Date(now.getTime() + input.leaseDurationMs);
  const result = await executor.execute<JobRow>(
    `/* growth:renew-job-lease */
     update growth_jobs
     set lease_until = greatest(lease_until, $4)
     where id = $1
       and lease_token = $2::uuid
       and status = 'leased'
       and lease_until > $3
     returning *`,
    [input.jobId, input.leaseToken, now, leaseUntil],
  );
  return result.rows[0] ? toJob(result.rows[0]) : null;
}

interface LifecycleJobContextRow extends Record<string, unknown> {
  contact_id: string;
  display_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  email_classification: string | null;
  form_submission: Record<string, unknown> | null;
  enrollment_at: Date | string | null;
  campaign_enrollment_reason: string | null;
}

const CAMPAIGN_ENROLLMENT_REASONS: readonly GrowthCampaignEnrollmentReason[] = [
  'unstuck_form',
  'install_digest',
  'install_runtime',
];

function toLifecycleFormSubmission(
  value: Record<string, unknown> | null,
): GrowthLifecycleFormSubmission | null {
  if (value === null || typeof value !== 'object') return null;
  const submission: GrowthLifecycleFormSubmission = {};
  if (value['form_kind'] === 'unstuck') submission.form_kind = 'unstuck';
  if (typeof value['submission_id'] === 'string') {
    submission.submission_id = value['submission_id'];
  }
  if (typeof value['message_present'] === 'boolean') {
    submission.message_present = value['message_present'];
  }
  return submission;
}

/**
 * Reads what a lifecycle job may know about its contact: name and company
 * (from the job's accepted form submission, else the contact row), the email
 * classification, the form facts (never the message itself) and the campaign
 * v1 enrollment. A job whose payload names a `submission_id` reads the
 * `contact.form_submission` recorded as `form:<submission_id>:accepted`; any
 * other job reads the contact's latest accepted form submission.
 *
 * @throws When the job or its contact does not exist.
 */
export async function readLifecycleJobContext(
  executor: SqlExecutor,
  input: { jobId: string },
): Promise<GrowthLifecycleJobContext> {
  const jobId = requiredText('jobId', input.jobId);
  const result = await executor.execute<LifecycleJobContextRow>(
    `/* growth:read-lifecycle-job-context */
     select c.id as contact_id,
            coalesce(submission.data->>'display_name', c.display_name)
              as display_name,
            coalesce(submission.data->>'company_name', c.company_name)
              as company_name,
            coalesce(submission.data->>'company_domain', c.company_domain)
              as company_domain,
            submission.data->>'email_classification' as email_classification,
            case when submission.data is null then null else
              jsonb_strip_nulls(jsonb_build_object(
                'form_kind', submission.data->'form_kind',
                'submission_id', submission.data->'submission_id',
                'message_present',
                  coalesce(length(submission.data->>'message'), 0) > 0
              ))
            end as form_submission,
            enrollment.occurred_at as enrollment_at,
            enrollment.data->>'enrollment_reason'
              as campaign_enrollment_reason
     from growth_jobs target
     join growth_contacts c on c.id = target.contact_id
     left join lateral (
       select a.data
       from growth_activity a
       where a.contact_id = c.id
         and a.kind = 'contact.form_submission'
         and (
           (
             target.payload ? 'submission_id'
             and a.event_key =
                 'form:' || (target.payload->>'submission_id') || ':accepted'
           )
           or not target.payload ? 'submission_id'
         )
       order by a.occurred_at desc, a.id desc
       limit 1
     ) submission on true
     left join lateral (
       select a.occurred_at, a.data
       from growth_activity a
       where a.event_key = 'campaign:v1:' || c.id::text || ':enrolled'
         and a.contact_id = c.id
         and a.kind = 'campaign.enrolled:v1'
       limit 1
     ) enrollment on true
     where target.id = $1`,
    [jobId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Growth lifecycle job context not found: ${jobId}`);
  }
  const emailClassification =
    row.email_classification === 'work' ||
    row.email_classification === 'personal' ||
    row.email_classification === 'unknown'
      ? row.email_classification
      : 'unknown';
  const reason = CAMPAIGN_ENROLLMENT_REASONS.find(
    (candidate) => candidate === row.campaign_enrollment_reason,
  );
  return {
    contactId: row.contact_id,
    displayName: row.display_name,
    companyName: row.company_name,
    companyDomain: row.company_domain,
    emailClassification,
    formSubmission: toLifecycleFormSubmission(row.form_submission),
    enrollmentAt: row.enrollment_at ? new Date(row.enrollment_at) : null,
    campaignEnrollmentReason: reason ?? null,
  };
}

/** The internal notification job kinds that submit at most once. */
export type InternalNotificationKind = 'notify' | 'digest';

/**
 * Claims the single provider submission of a leased internal notification
 * (`notify` or `digest`) by recording
 * `internal_notification.submission_started` once per job. A job that was
 * already claimed, for example by a worker that crashed mid-send, returns
 * `already_claimed` and must not be sent again.
 *
 * @throws {JobLeaseConflictError} When the job is unclaimed and its lease is
 * no longer valid, or the job is not of `kind`.
 */
export async function claimInternalNotificationSubmission(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    kind: InternalNotificationKind;
  },
): Promise<'claimed' | 'already_claimed'> {
  const jobId = requiredText('jobId', input.jobId);
  const leaseToken = requiredText('leaseToken', input.leaseToken);
  const now = validDate('now', input.now);
  const kind = internalNotificationKind(input.kind);
  const result = await executor.execute<{ event_key: string }>(
    `/* growth:claim-internal-notification-submission */
     insert into growth_activity (
       event_key, contact_id, project_id, kind, occurred_at, data
     )
     select 'job:' || j.id::text || ':internal-notification-submission',
            j.contact_id,
            j.project_id,
            'internal_notification.submission_started',
            $3,
            jsonb_build_object('at_most_once', true)
     from growth_jobs j
     where j.id = $1
       and j.kind = $4
       and j.status = 'leased'
       and j.lease_token = $2::uuid
       and j.lease_until > $3
     on conflict (event_key) do nothing
     returning event_key`,
    [jobId, leaseToken, now, kind],
  );
  if (result.rows.length === 1) return 'claimed';
  const existing = await executor.execute<{ event_key: string }>(
    `/* growth:read-internal-notification-claim */
     select event_key
     from growth_activity
     where event_key = 'job:' || $1::text || ':internal-notification-submission'
       and kind = 'internal_notification.submission_started'`,
    [jobId],
  );
  if (existing.rows.length === 1) return 'already_claimed';
  throw new JobLeaseConflictError(jobId);
}

function internalNotificationKind(
  kind: InternalNotificationKind | undefined,
): InternalNotificationKind {
  if (kind === undefined) return 'notify';
  if (kind !== 'notify' && kind !== 'digest') {
    throw new Error('kind must be notify or digest');
  }
  return kind;
}

/**
 * Records that an internal notification's provider outcome is unknown: the
 * leased job fails with `delivery_status = 'unknown'` and
 * `internal_notification.acceptance_unknown` asks for manual review.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export async function markInternalNotificationUnknown(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    occurredAt: Date;
    errorCode: string;
    /** Defaults to `notify`. */
    kind?: InternalNotificationKind;
  },
): Promise<GrowthJob> {
  const jobId = requiredText('jobId', input.jobId);
  const leaseToken = requiredText('leaseToken', input.leaseToken);
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const errorCode = requiredText('errorCode', input.errorCode);
  const kind = internalNotificationKind(input.kind);
  return executor.transaction(async (transaction) => {
    const result = await transaction.execute<JobRow>(
      `/* growth:mark-internal-notification-unknown */
       update growth_jobs
       set status = 'failed',
           lease_token = null,
           lease_until = null,
           delivery_status = 'unknown',
           last_error_code = $4
       where id = $1
         and kind = $5
         and lease_token = $2::uuid
         and status = 'leased'
         and lease_until > $3
         and delivery_status = 'not_submitted'
       returning *`,
      [jobId, leaseToken, occurredAt, errorCode, kind],
    );
    const row = result.rows[0];
    if (!row) throw new JobLeaseConflictError(jobId);
    const job = toJob(row);
    await transaction.execute(
      `/* growth:insert-internal-notification-unknown */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values (
         'job:' || $1::text || ':internal-notification-acceptance-unknown',
         $2, $3, 'internal_notification.acceptance_unknown', $4,
         jsonb_build_object('error_code', $5::text, 'manual_review', true)
       )
       on conflict (event_key) do nothing`,
      [job.id, job.contactId, job.projectId, occurredAt, errorCode],
    );
    return job;
  });
}

// Single statement, so it also runs inside an existing transaction.
async function transitionLeasedJob(
  executor: SqlTransaction,
  marker: string,
  status: 'completed' | 'failed' | 'cancelled',
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    errorCode?: string;
  },
): Promise<GrowthJob> {
  const now = validDate('now', input.now);
  const result = await executor.execute<JobRow>(
    `/* growth:${marker} */
     update growth_jobs
     set status = '${status}',
         lease_token = null,
         lease_until = null,
         last_error_code = $4
     where id = $1
       and lease_token = $2::uuid
       and status = 'leased'
       and lease_until > $3
       ${status === 'completed' ? "and kind <> 'send_step'" : ''}
     returning *`,
    [input.jobId, input.leaseToken, now, input.errorCode ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new JobLeaseConflictError(input.jobId);
  return toJob(row);
}

/**
 * Completes a leased non-`send_step` job.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export function completeLeasedJob(
  executor: SqlTransaction,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    errorCode?: string;
  },
): Promise<GrowthJob> {
  return transitionLeasedJob(
    executor,
    'completed-leased-job',
    'completed',
    input,
  );
}

/**
 * Fails a leased job.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export function failLeasedJob(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    errorCode?: string;
  },
): Promise<GrowthJob> {
  return transitionLeasedJob(executor, 'failed-leased-job', 'failed', input);
}

/**
 * Cancels a leased job.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export function cancelLeasedJob(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    errorCode?: string;
  },
): Promise<GrowthJob> {
  return transitionLeasedJob(
    executor,
    'cancelled-leased-job',
    'cancelled',
    input,
  );
}

/**
 * Returns a leased job to pending at a later `availableAt`.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export async function deferLeasedJob(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    availableAt: Date;
    errorCode?: string;
  },
): Promise<GrowthJob> {
  const now = validDate('now', input.now);
  const availableAt = validDate('availableAt', input.availableAt);
  if (availableAt.getTime() < now.getTime()) {
    throw new Error('availableAt must not be earlier than now');
  }
  const result = await executor.execute<JobRow>(
    `/* growth:defer-leased-job */
     update growth_jobs
     set status = 'pending',
         available_at = $4,
         lease_token = null,
         lease_until = null,
         last_error_code = $5
     where id = $1
       and lease_token = $2::uuid
       and status = 'leased'
       and lease_until > $3
     returning *`,
    [input.jobId, input.leaseToken, now, availableAt, input.errorCode ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new JobLeaseConflictError(input.jobId);
  return toJob(row);
}

/**
 * Records a definite provider rejection: the job fails with
 * `delivery_status = 'failed'`.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export async function markProviderRejection(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    occurredAt: Date;
    errorCode: string;
  },
): Promise<GrowthJob> {
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const errorCode = requiredText('errorCode', input.errorCode);
  return executor.transaction(async (transaction) => {
    const result = await transaction.execute<JobRow>(
      `/* growth:mark-provider-rejected */
       update growth_jobs
       set status = 'failed',
           lease_token = null,
           lease_until = null,
           delivery_status = 'failed',
           last_error_code = $4
       where id = $1
         and lease_token = $2::uuid
         and status = 'leased'
         and lease_until > $3
         and delivery_status = 'not_submitted'
       returning *`,
      [input.jobId, input.leaseToken, occurredAt, errorCode],
    );
    const row = result.rows[0];
    if (!row) throw new JobLeaseConflictError(input.jobId);
    const job = toJob(row);
    await transaction.execute(
      `/* growth:insert-provider-rejected-activity */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values (
         'job:' || $1::text || ':provider-rejected',
         $2, $3, 'delivery.provider_rejected', $4,
         jsonb_build_object('error_code', $5::text)
       )
       on conflict (event_key) do nothing`,
      [job.id, job.contactId, job.projectId, occurredAt, errorCode],
    );
    return job;
  });
}

function campaignStep(job: GrowthJob): number | null {
  if (job.kind !== 'send_step' || job.payload['campaign_version'] !== 'v1') {
    return null;
  }
  const step = job.payload['step'];
  return step === 1 || step === 2 || step === 3 ? step : null;
}

const REPLAYABLE_ACCEPTANCE_DELIVERY_STATUSES: readonly GrowthJob['deliveryStatus'][] =
  ['submitted', 'delivered', 'bounced', 'complained', 'suppressed', 'failed'];

/**
 * Records that the provider accepted an authorized submission and completes
 * the job. Replays with the same provider id return the stored job; a job a
 * stop cancelled, or a deletion interrupted, after authorization is reconciled
 * to completed. Accepting campaign step 1 moves pending step 2 to at least
 * three and step 3 to at least eight business mornings later; accepting step 2
 * moves step 3 to at least five business mornings later.
 *
 * @throws {JobLeaseConflictError} When the job cannot be accepted.
 */
export async function recordProviderAcceptance(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    acceptedAt: Date;
    providerEmailId: string;
    /**
     * The sent subject's reply digest (`replySubjectSha256`), recorded on the
     * job as `payload.subject_sha256` so a reply can be matched before the
     * Message-ID binds. The subject itself is never stored.
     */
    subjectSha256?: string;
  },
): Promise<GrowthJob> {
  const acceptedAt = validDate('acceptedAt', input.acceptedAt);
  const providerEmailId = opaqueIdentifier(
    'providerEmailId',
    input.providerEmailId,
    256,
  );
  if (
    input.subjectSha256 !== undefined &&
    !/^[A-Za-z0-9_-]{43}$/u.test(input.subjectSha256)
  ) {
    throw new Error('subjectSha256 must be a base64url SHA-256 digest');
  }
  const subjectSha256 = input.subjectSha256 ?? null;
  return executor.transaction(async (transaction) => {
    const discovered =
      await transaction.execute<ProviderAcceptanceContactReference>(
        `/* growth:discover-provider-acceptance-contact */
         select contact_id
         from growth_jobs
         where id = $1`,
        [input.jobId],
      );
    const contactReference = discovered.rows[0];
    if (!contactReference) throw new JobLeaseConflictError(input.jobId);

    const lockedContact = await transaction.execute<{ id: string }>(
      `/* growth:lock-provider-acceptance-contact */
       select id
       from growth_contacts
       where id = $1
       for update`,
      [contactReference.contact_id],
    );
    if (contactReference.contact_id !== null && !lockedContact.rows[0]) {
      throw new JobLeaseConflictError(input.jobId);
    }

    const lockedJob = await transaction.execute<JobRow>(
      `/* growth:lock-provider-acceptance-job */
       select j.*
       from growth_jobs j
       where j.id = $1
       for update of j`,
      [input.jobId],
    );
    const lockedRow = lockedJob.rows[0];
    if (!lockedRow || lockedRow.contact_id !== contactReference.contact_id) {
      throw new JobLeaseConflictError(input.jobId);
    }
    let job = toJob(lockedRow);
    if (job.contactId === null) {
      throw new Error(
        'Provider acceptance requires an authorized contact recipient',
      );
    }
    await readAndValidateFinalSendAuthorization(transaction, {
      job,
      leaseToken: input.leaseToken,
      mustOccurBy: acceptedAt,
    });

    if (
      job.status === 'completed' &&
      job.providerEmailId === providerEmailId &&
      REPLAYABLE_ACCEPTANCE_DELIVERY_STATUSES.includes(job.deliveryStatus)
    ) {
      await readAndValidateProviderAcceptanceActivity(transaction, {
        job,
        leaseToken: input.leaseToken,
        acceptedAt,
        providerEmailId,
      });
      return job;
    }

    let newlyAccepted = false;
    let resolvedDeletionUnknown = false;
    if (
      job.status === 'leased' &&
      job.leaseToken === input.leaseToken &&
      job.leaseUntil !== null &&
      job.leaseUntil.getTime() > acceptedAt.getTime() &&
      job.deliveryStatus === 'not_submitted'
    ) {
      const accepted = await transaction.execute<JobRow>(
        `/* growth:accept-provider-submission */
         update growth_jobs current
         set status = 'completed',
             lease_token = null,
             lease_until = null,
             provider_email_id = $4,
             delivery_status = $5,
             payload = case
               when $6::text is null then current.payload
               else current.payload || jsonb_build_object('subject_sha256', $6::text)
             end,
             last_error_code = null
         where current.id = $1
           and current.lease_token = $2::uuid
           and current.status = 'leased'
           and current.lease_until > $3
           and current.delivery_status = 'not_submitted'
           and (
             current.kind <> 'send_step'
             or current.payload->>'step' = '1'
             or exists (
               select 1
               from growth_jobs prior
               where prior.contact_id = current.contact_id
                 and prior.kind = 'send_step'
                 and prior.payload->>'campaign_version' =
                   current.payload->>'campaign_version'
                 and prior.payload->>'step' = case current.payload->>'step'
                   when '2' then '1'
                   when '3' then '2'
                   else null
                 end
                 and prior.status = 'completed'
                 and prior.provider_email_id is not null
                 and prior.delivery_status in ('submitted', 'delivered')
             )
           )
         returning current.*`,
        [
          input.jobId,
          input.leaseToken,
          acceptedAt,
          providerEmailId,
          'submitted',
          subjectSha256,
        ],
      );
      const acceptedRow = accepted.rows[0];
      if (!acceptedRow) throw new JobLeaseConflictError(input.jobId);
      job = toJob(acceptedRow);
      newlyAccepted = true;
    } else if (
      job.status === 'cancelled' &&
      job.deliveryStatus === 'not_submitted' &&
      job.providerEmailId === null
    ) {
      const reconciled = await transaction.execute<JobRow>(
        `/* growth:reconcile-stopped-provider-submission */
         update growth_jobs current
         set status = 'completed',
             lease_token = null,
             lease_until = null,
             provider_email_id = $4,
             delivery_status = $5,
             payload = case
               when $6::text is null then current.payload
               else current.payload || jsonb_build_object('subject_sha256', $6::text)
             end,
             last_error_code = null
         where current.id = $1
           and current.status = 'cancelled'
           and current.delivery_status = 'not_submitted'
           and current.provider_email_id is null
           and exists (
             select 1
             from growth_activity submission_authorization
             where submission_authorization.contact_id = current.contact_id
               and submission_authorization.project_id is not distinct from current.project_id
               and submission_authorization.kind = 'delivery.submission_authorized'
               and submission_authorization.event_key =
                 'job:' || current.id::text ||
                 ':submission-authorized:' || $2::text
               and submission_authorization.data->>'lease_token' = $2::text
               and submission_authorization.data->>'bounded_stop_race' = 'true'
               and submission_authorization.occurred_at <= $3
           )
         returning current.*`,
        [
          input.jobId,
          input.leaseToken,
          acceptedAt,
          providerEmailId,
          'submitted',
          subjectSha256,
        ],
      );
      if (reconciled.rows[0]) {
        job = toJob(reconciled.rows[0]);
        newlyAccepted = true;
      }
    } else if (
      job.status === 'failed' &&
      job.deliveryStatus === 'unknown' &&
      job.lastErrorCode === 'provider_acceptance_interrupted_by_deletion' &&
      job.providerEmailId === null &&
      job.leaseToken === null &&
      job.leaseUntil === null
    ) {
      const reconciled = await transaction.execute<JobRow>(
        `/* growth:reconcile-deletion-interrupted-provider-submission */
         update growth_jobs current
         set status = 'completed',
             provider_email_id = $4,
             delivery_status = $5,
             last_error_code = null
         where current.id = $1
           and current.status = 'failed'
           and current.delivery_status = 'unknown'
           and current.last_error_code =
               'provider_acceptance_interrupted_by_deletion'
           and current.provider_email_id is null
           and current.lease_token is null
           and current.lease_until is null
           and exists (
             select 1
             from growth_activity submission_authorization
             where submission_authorization.contact_id = current.contact_id
               and submission_authorization.project_id is not distinct from current.project_id
               and submission_authorization.kind = 'delivery.submission_authorized'
               and submission_authorization.event_key =
                 'job:' || current.id::text ||
                 ':submission-authorized:' || $2::text
               and submission_authorization.data->>'lease_token' = $2::text
               and submission_authorization.data->>'bounded_stop_race' = 'true'
               and submission_authorization.occurred_at <= $3
           )
           and exists (
             select 1
             from growth_activity provisional
             where provisional.contact_id = current.contact_id
               and provisional.project_id is not distinct from current.project_id
               and provisional.kind = 'delivery.acceptance_unknown'
               and provisional.event_key =
                 'job:' || current.id::text ||
                 ':provider-acceptance-unknown'
               and provisional.data->>'reason' =
                   'authorized_worker_interrupted_by_deletion'
               and provisional.data->>'delivery_status' = 'unknown'
               and provisional.data->>'manual_review' = 'true'
           )
           and exists (
             select 1
             from growth_activity deletion
             where deletion.contact_id = current.contact_id
               and deletion.kind = 'deletion'
           )
         returning current.*`,
        [
          input.jobId,
          input.leaseToken,
          acceptedAt,
          providerEmailId,
          'submitted',
        ],
      );
      if (reconciled.rows[0]) {
        job = toJob(reconciled.rows[0]);
        newlyAccepted = true;
        resolvedDeletionUnknown = true;
      }
    } else {
      throw new JobLeaseConflictError(input.jobId);
    }
    if (!newlyAccepted) throw new JobLeaseConflictError(input.jobId);

    const step = campaignStep(job);
    const insertedAcceptance = await transaction.execute<{ event_key: string }>(
      `/* growth:insert-provider-acceptance-activity */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values (
         'job:' || $1::text || ':provider-accepted',
         $2,
         $3,
         $4,
         $5,
         jsonb_build_object(
           'provider_ref', $6::text,
           'step', $7::integer,
           'lease_token', $8::text
         )
       )
       on conflict (event_key) do nothing
       returning event_key`,
      [
        job.id,
        job.contactId,
        job.projectId,
        step === null ? 'delivery.submitted' : 'campaign.step_accepted',
        acceptedAt,
        providerEmailId,
        step,
        input.leaseToken,
      ],
    );
    if (insertedAcceptance.rows.length === 0) {
      await readAndValidateProviderAcceptanceActivity(transaction, {
        job,
        leaseToken: input.leaseToken,
        acceptedAt,
        providerEmailId,
      });
    }

    if (step === 1 || step === 2) {
      // Anchor later steps to this acceptance; greatest() never moves one
      // earlier, so a delayed or replayed acceptance cannot pull a send in.
      await transaction.execute(
        `/* growth:anchor-campaign-cadence */
         update growth_jobs later
         set available_at = greatest(
           later.available_at,
           case
             when $2::integer = 1 and later.payload->>'step' = '2'
               then $3::timestamptz
             when $2::integer = 1 and later.payload->>'step' = '3'
               then $4::timestamptz
             when $2::integer = 2 and later.payload->>'step' = '3'
               then $3::timestamptz
             else later.available_at
           end
         )
         where later.contact_id = $1
           and later.kind = 'send_step'
           and later.payload->>'campaign_version' = 'v1'
           and later.status = 'pending'
           and later.delivery_status = 'not_submitted'
           and (
             ($2::integer = 1 and later.payload->>'step' in ('2', '3'))
             or ($2::integer = 2 and later.payload->>'step' = '3')
           )`,
        [
          job.contactId,
          step,
          businessMorningAfter(acceptedAt, step === 1 ? 3 : 5),
          businessMorningAfter(acceptedAt, 8),
        ],
      );
    }

    if (resolvedDeletionUnknown) {
      const resolution = await transaction.execute<{ event_key: string }>(
        `/* growth:insert-provider-unknown-resolution */
         insert into growth_activity (
           event_key, contact_id, project_id, kind, occurred_at, data
         ) values (
           'job:' || $1::text || ':provider-acceptance-unknown-resolved',
           $2,
           $3,
           'delivery.acceptance_unknown_resolved',
           $4,
           jsonb_build_object(
             'resolution', 'known_provider_acceptance',
             'supersedes_event_key',
               'job:' || $1::text || ':provider-acceptance-unknown'
           )
         )
         returning event_key`,
        [job.id, job.contactId, job.projectId, acceptedAt],
      );
      if (resolution.rows.length !== 1) {
        throw new Error(
          `Growth provider unknown resolution was not recorded: ${job.id}`,
        );
      }
    }

    return job;
  });
}

async function readAndValidateProviderAcceptanceActivity(
  transaction: SqlTransaction,
  input: {
    job: GrowthJob;
    leaseToken: string;
    acceptedAt: Date;
    providerEmailId: string;
  },
): Promise<ProviderAcceptanceActivityRow> {
  const eventKey = `job:${input.job.id}:provider-accepted`;
  const result = await transaction.execute<ProviderAcceptanceActivityRow>(
    `/* growth:read-provider-acceptance-activity */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  const row = result.rows[0];
  const step = campaignStep(input.job);
  const expectedKind =
    step === null ? 'delivery.submitted' : 'campaign.step_accepted';
  const expectedData = {
    lease_token: input.leaseToken,
    provider_ref: input.providerEmailId,
    step,
  };
  const occurredAt = row ? new Date(row.occurred_at) : null;
  if (
    !row ||
    row.event_key !== eventKey ||
    row.contact_id !== input.job.contactId ||
    row.project_id !== input.job.projectId ||
    row.kind !== expectedKind ||
    occurredAt?.getTime() !== input.acceptedAt.getTime() ||
    canonicalJson(row.data) !== canonicalJson(expectedData)
  ) {
    throw new Error(
      `Growth provider acceptance event key conflict: ${eventKey}`,
    );
  }
  return row;
}

/**
 * Records that the provider outcome is unknown: the job fails with
 * `delivery_status = 'unknown'` for manual review and is never completed.
 *
 * @throws {JobLeaseConflictError} When the lease is no longer valid.
 */
export async function markProviderAcceptanceUnknown(
  executor: SqlExecutor,
  input: {
    jobId: string;
    leaseToken: string;
    occurredAt: Date;
    errorCode: string;
  },
): Promise<GrowthJob> {
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const errorCode = requiredText('errorCode', input.errorCode);
  return executor.transaction(async (transaction) => {
    const discovered =
      await transaction.execute<ProviderAcceptanceContactReference>(
        `/* growth:discover-provider-unknown-contact */
         select contact_id
         from growth_jobs
         where id = $1`,
        [input.jobId],
      );
    const contactReference = discovered.rows[0];
    if (!contactReference) throw new JobLeaseConflictError(input.jobId);

    const lockedContact = await transaction.execute<{ id: string }>(
      `/* growth:lock-provider-unknown-contact */
       select id
       from growth_contacts
       where id = $1
       for update`,
      [contactReference.contact_id],
    );
    if (contactReference.contact_id !== null && !lockedContact.rows[0]) {
      throw new JobLeaseConflictError(input.jobId);
    }

    const lockedJob = await transaction.execute<JobRow>(
      `/* growth:lock-provider-unknown-job */
       select j.*
       from growth_jobs j
       where j.id = $1
       for update of j`,
      [input.jobId],
    );
    const lockedRow = lockedJob.rows[0];
    if (!lockedRow || lockedRow.contact_id !== contactReference.contact_id) {
      throw new JobLeaseConflictError(input.jobId);
    }
    const locked = toJob(lockedRow);
    if (locked.contactId === null) {
      throw new Error(
        'Provider acceptance requires an authorized contact recipient',
      );
    }
    await readAndValidateFinalSendAuthorization(transaction, {
      job: locked,
      leaseToken: input.leaseToken,
      mustOccurBy: occurredAt,
    });

    let row: JobRow | undefined;
    if (locked.status === 'leased') {
      const result = await transaction.execute<JobRow>(
        `/* growth:mark-provider-unknown */
       update growth_jobs current
       set status = 'failed',
           lease_token = null,
           lease_until = null,
           delivery_status = 'unknown',
           last_error_code = $4
       where current.id = $1
         and current.lease_token = $2::uuid
         and current.status = 'leased'
         and current.lease_until > $3
         and current.delivery_status = 'not_submitted'
         and (
           current.kind <> 'send_step'
           or current.payload->>'step' = '1'
           or exists (
             select 1
             from growth_jobs prior
             where prior.contact_id = current.contact_id
               and prior.kind = 'send_step'
               and prior.payload->>'campaign_version' =
                 current.payload->>'campaign_version'
               and prior.payload->>'step' = case current.payload->>'step'
                 when '2' then '1'
                 when '3' then '2'
                 else null
               end
               and prior.status = 'completed'
               and prior.provider_email_id is not null
               and prior.delivery_status in ('submitted', 'delivered')
           )
         )
       returning current.*`,
        [input.jobId, input.leaseToken, occurredAt, errorCode],
      );
      row = result.rows[0];
    } else if (
      locked.status === 'cancelled' &&
      locked.deliveryStatus === 'not_submitted' &&
      locked.providerEmailId === null
    ) {
      const reconciled = await transaction.execute<JobRow>(
        `/* growth:reconcile-stopped-provider-unknown */
         update growth_jobs current
         set status = 'failed',
             lease_token = null,
             lease_until = null,
             delivery_status = 'unknown',
             last_error_code = $4
         where current.id = $1
           and current.status = 'cancelled'
           and current.delivery_status = 'not_submitted'
           and current.provider_email_id is null
           and exists (
             select 1
             from growth_activity submission_authorization
             where submission_authorization.contact_id = current.contact_id
               and submission_authorization.project_id is not distinct from current.project_id
               and submission_authorization.kind = 'delivery.submission_authorized'
               and submission_authorization.event_key =
                 'job:' || current.id::text ||
                 ':submission-authorized:' || $2::text
               and submission_authorization.data->>'lease_token' = $2::text
               and submission_authorization.data->>'bounded_stop_race' = 'true'
               and submission_authorization.occurred_at <= $3
           )
         returning current.*`,
        [input.jobId, input.leaseToken, occurredAt, errorCode],
      );
      row = reconciled.rows[0];
    }
    if (!row) throw new JobLeaseConflictError(input.jobId);
    const job = toJob(row);
    await transaction.execute(
      `/* growth:insert-provider-unknown-activity */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values (
         'job:' || $1::text || ':provider-acceptance-unknown',
         $2, $3, 'delivery.acceptance_unknown', $4,
         jsonb_build_object('error_code', $5::text, 'manual_review', true)
       )
       on conflict (event_key) do nothing`,
      [job.id, job.contactId, job.projectId, occurredAt, errorCode],
    );
    return job;
  });
}
