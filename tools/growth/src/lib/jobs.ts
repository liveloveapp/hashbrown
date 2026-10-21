import { canonicalJson } from './activity.ts';
import {
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import { CONTACT_HARD_STOP_REASONS } from './contacts.ts';
import { normalizeEmail } from './crypto.ts';
import type { GrowthJob, GrowthJobKind } from './models.ts';

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
  /** Whether `now` is inside the campaign send window; defaults to always. */
  isSendWindow?: (now: Date) => boolean;
}

/**
 * Leases due jobs of the given kinds with `for update skip locked`. Pending
 * jobs and expired leases are leased with a fresh token and an incremented
 * attempt count; an expired lease that was already authorized for submission
 * is failed with `delivery_status = 'unknown'` for manual review instead.
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
             and (
               (
                 j.payload->>'step' = '1'
                 and exists (
                   select 1
                   from growth_activity enrollment
                   where enrollment.contact_id = j.contact_id
                     and enrollment.kind = 'campaign.enrolled:v1'
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
           and (
             (
               authoritative.kind = 'form.outreach_approved'
               and authoritative.data->>'verification' = 'server_verified'
               and authoritative.data->>'source_form' = any(
                 array['whitepaper', 'newsletter', 'contact', 'pricing']
               )
             )
             or (
               authoritative.kind = 'contact.reauthorized'
               and authoritative.data->>'provenance' = 'founder_action'
             )
           )
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
 * to completed.
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
  },
): Promise<GrowthJob> {
  const acceptedAt = validDate('acceptedAt', input.acceptedAt);
  const providerEmailId = opaqueIdentifier(
    'providerEmailId',
    input.providerEmailId,
    256,
  );
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
