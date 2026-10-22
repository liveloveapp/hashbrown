import { createHash } from 'node:crypto';

import {
  CONTACT_HARD_STOP_REASONS,
  type ContactHardStopReason,
} from './contacts.ts';
import {
  createEmailLookupCandidates,
  type EmailHmacKeyring,
} from './crypto.ts';
import { canonicalJson } from './activity.ts';
import type { SqlExecutor, SqlTransaction } from './database.ts';
import type { GrowthJob } from './models.ts';

/** A hard-stop reason a stop can record; deletion has its own flow. */
export type CanonicalStopReason = Exclude<ContactHardStopReason, 'deletion'>;

/** The hard-stop reasons {@link stopContact} accepts, in canonical order. */
export const CANONICAL_STOP_REASONS = CONTACT_HARD_STOP_REASONS.filter(
  (reason): reason is CanonicalStopReason => reason !== 'deletion',
);

const PROVIDER_SUPPRESSION_REASONS = new Set<CanonicalStopReason>([
  'unsubscribe',
  'complaint',
  'hard_bounce',
  'provider_suppression',
  'invalid_address',
  'manual_suppression',
]);

/** Who or what originated a stop. */
export type StopProvenanceKind =
  | 'founder_action'
  | 'mailbox_reply'
  | 'one_click'
  | 'provider_webhook'
  | 'system';

/** A request to stop outreach to one contact, keyed by an idempotent event key. */
export interface StopContactInput {
  contactId: string;
  reason: CanonicalStopReason;
  eventKey: string;
  occurredAt: Date;
  source: string;
  provenance: {
    actor?: string;
    kind: StopProvenanceKind;
    policyVersion: string;
  };
}

/** Whether the email provider must also suppress the contact after a stop. */
export interface StopProviderSyncAction {
  action: 'none' | 'suppress_contact';
  required: boolean;
}

/**
 * The outcome of a stop: which jobs were cancelled or preserved and whether a
 * provider submission may have raced it. Persisted on the stop activity and
 * returned unchanged on replay.
 */
export interface StopContactResult {
  applied: boolean;
  effective: boolean;
  contactId: string;
  reason: CanonicalStopReason;
  providerSync: StopProviderSyncAction;
  cancelledJobIds: string[];
  legacyProviderCancellationIds: string[];
  preservedJobIds: string[];
  race: {
    boundedProviderSubmissionPossible: boolean;
    manualReviewRequired: boolean;
    jobIds: string[];
    providerSubmissionAlreadyRecordedJobIds: string[];
    unknownDeliveryJobIds: string[];
  };
}

/** An unsubscribe that identifies the recipient by email rather than contact id. */
export interface StopLegacyEmailUnsubscribeInput {
  email: string;
  keyring: EmailHmacKeyring;
  occurredAt: Date;
  policyVersion: string;
  source: string;
}

/** The outcome of {@link stopLegacyEmailUnsubscribe}. */
export interface StopLegacyEmailUnsubscribeResult {
  applied: boolean;
  contactMatched: boolean;
  effective: boolean;
}

interface StopContactRow extends Record<string, unknown> {
  id: string;
  outreach_approved_at: Date | string | null;
  deleted_at: Date | string | null;
}

interface LegacyStopActivityRow extends Record<string, unknown> {
  event_key: string;
  occurred_at: Date | string;
}

interface StopActivityRow extends Record<string, unknown> {
  event_key: string;
  contact_id: string | null;
  project_id: string | null;
  kind: string;
  occurred_at: Date | string;
  data: Record<string, unknown>;
}

interface StopJobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  status: GrowthJob['status'];
  delivery_status: GrowthJob['deliveryStatus'];
  provider_email_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  lease_token: string | null;
  payload: Record<string, unknown>;
  authorization_event_key: string | null;
  authorization_contact_id: string | null;
  authorization_project_id: string | null;
  authorization_kind: string | null;
  authorization_occurred_at: Date | string | null;
  authorization_data: Record<string, unknown> | null;
}

interface StopRaceReviewRow extends Record<string, unknown> {
  event_key: string;
  contact_id: string | null;
  project_id: string | null;
  kind: string;
  occurred_at: Date | string;
  data: Record<string, unknown>;
  job_id?: string;
}

const LIMITS = {
  actor: 100,
  contactId: 100,
  eventKey: 255,
  policyVersion: 100,
  source: 100,
} as const;

function requiredText(
  field: string,
  value: string,
  maximumLength: number,
): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(
      `${field} must contain between 1 and ${maximumLength} characters`,
    );
  }
  return normalized;
}

function optionalText(
  field: string,
  value: string | undefined,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(field, value, maximumLength);
}

function validDate(field: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date`);
  }
  return value;
}

function validReason(reason: CanonicalStopReason): CanonicalStopReason {
  if (!(CANONICAL_STOP_REASONS as readonly string[]).includes(reason)) {
    throw new Error(`Unsupported contact stop reason: ${String(reason)}`);
  }
  return reason;
}

/**
 * Maps a stop reason to the provider sync it requires: provider-side reasons
 * suppress the contact; a reply does not.
 *
 * @throws When the reason is not a canonical stop reason.
 */
export function providerSyncActionForStopReason(
  reason: CanonicalStopReason,
): StopProviderSyncAction {
  validReason(reason);
  return PROVIDER_SUPPRESSION_REASONS.has(reason)
    ? { action: 'suppress_contact', required: true }
    : { action: 'none', required: false };
}

function stopActivityData(input: StopContactInput): Record<string, unknown> {
  const actor = optionalText(
    'provenance.actor',
    input.provenance.actor,
    LIMITS.actor,
  );
  return {
    ...(actor ? { actor } : {}),
    policy_version: requiredText(
      'provenance.policyVersion',
      input.provenance.policyVersion,
      LIMITS.policyVersion,
    ),
    provenance: input.provenance.kind,
    reason: input.reason,
    source: input.source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function persistedStopResultData(
  result: StopContactResult,
): Record<string, unknown> {
  return {
    effective: result.effective,
    provider_sync: {
      action: result.providerSync.action,
      required: result.providerSync.required,
    },
    cancelled_job_ids: result.cancelledJobIds,
    legacy_provider_cancellation_ids: result.legacyProviderCancellationIds,
    preserved_job_ids: result.preservedJobIds,
    race: {
      bounded_provider_submission_possible:
        result.race.boundedProviderSubmissionPossible,
      manual_review_required: result.race.manualReviewRequired,
      job_ids: result.race.jobIds,
      provider_submission_already_recorded_job_ids:
        result.race.providerSubmissionAlreadyRecordedJobIds,
      unknown_delivery_job_ids: result.race.unknownDeliveryJobIds,
    },
  };
}

function persistedStopResult(
  row: StopActivityRow,
  input: StopContactInput,
): StopContactResult | null {
  const stored = row.data['result'];
  if (stored === undefined) return null;
  if (!isRecord(stored)) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  const providerSync = stored['provider_sync'];
  const race = stored['race'];
  if (
    typeof stored['effective'] !== 'boolean' ||
    !isRecord(providerSync) ||
    (providerSync['action'] !== 'none' &&
      providerSync['action'] !== 'suppress_contact') ||
    typeof providerSync['required'] !== 'boolean' ||
    !isStringArray(stored['cancelled_job_ids']) ||
    !isStringArray(stored['legacy_provider_cancellation_ids']) ||
    !isStringArray(stored['preserved_job_ids']) ||
    !isRecord(race) ||
    typeof race['bounded_provider_submission_possible'] !== 'boolean' ||
    typeof race['manual_review_required'] !== 'boolean' ||
    !isStringArray(race['job_ids']) ||
    !isStringArray(race['provider_submission_already_recorded_job_ids']) ||
    !isStringArray(race['unknown_delivery_job_ids'])
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  const result: StopContactResult = {
    applied: false,
    effective: stored['effective'],
    contactId: input.contactId,
    reason: input.reason,
    providerSync: {
      action: providerSync['action'],
      required: providerSync['required'],
    },
    cancelledJobIds: stored['cancelled_job_ids'],
    legacyProviderCancellationIds: stored['legacy_provider_cancellation_ids'],
    preservedJobIds: stored['preserved_job_ids'],
    race: {
      boundedProviderSubmissionPossible:
        race['bounded_provider_submission_possible'],
      manualReviewRequired: race['manual_review_required'],
      jobIds: race['job_ids'],
      providerSubmissionAlreadyRecordedJobIds:
        race['provider_submission_already_recorded_job_ids'],
      unknownDeliveryJobIds: race['unknown_delivery_job_ids'],
    },
  };
  if (
    canonicalJson(stored) !== canonicalJson(persistedStopResultData(result))
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  return result;
}

function validateStopReplay(
  row: StopActivityRow | undefined,
  input: StopContactInput,
  data: Record<string, unknown>,
): { occurredAt: Date; result: StopContactResult | null } {
  const occurredAt = row ? new Date(row.occurred_at) : null;
  const immutableData = row
    ? Object.fromEntries(
        Object.entries(row.data).filter(([key]) => key !== 'result'),
      )
    : null;
  if (
    !row ||
    row.event_key !== input.eventKey ||
    row.contact_id !== input.contactId ||
    row.project_id !== null ||
    row.kind !== input.reason ||
    !occurredAt ||
    Number.isNaN(occurredAt.getTime()) ||
    canonicalJson(immutableData) !== canonicalJson(data)
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  return { occurredAt, result: persistedStopResult(row, input) };
}

async function insertStopActivityOnce(
  transaction: SqlTransaction,
  input: StopContactInput,
  data: Record<string, unknown>,
): Promise<{
  applied: boolean;
  occurredAt: Date;
  result: StopContactResult | null;
}> {
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-stop-activity */
     insert into growth_activity (
       event_key, contact_id, occurred_at, kind, data
     ) values ($1, $2, $3, $4, $5::jsonb)
     on conflict (event_key) do nothing
     returning event_key`,
    [
      input.eventKey,
      input.contactId,
      input.occurredAt,
      input.reason,
      JSON.stringify(data),
    ],
  );
  if (inserted.rows.length > 0) {
    return { applied: true, occurredAt: input.occurredAt, result: null };
  }

  const replay = await transaction.execute<StopActivityRow>(
    `/* growth:read-stop-activity */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [input.eventKey],
  );
  const persisted = validateStopReplay(replay.rows[0], input, data);
  return { applied: false, ...persisted };
}

async function finalizeStopActivity(
  transaction: SqlTransaction,
  input: StopContactInput,
  data: Record<string, unknown>,
  result: StopContactResult,
): Promise<void> {
  const resultData = persistedStopResultData(result);
  const finalized = await transaction.execute<{ event_key: string }>(
    `/* growth:finalize-stop-activity */
     update growth_activity
     set data = jsonb_set(data, '{result}', $2::jsonb, true)
     where event_key = $1
       and not (data ? 'result')
     returning event_key`,
    [input.eventKey, JSON.stringify(resultData)],
  );
  if (finalized.rows.length > 0) return;

  const replay = await transaction.execute<StopActivityRow>(
    `/* growth:read-stop-activity */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [input.eventKey],
  );
  const persisted = validateStopReplay(replay.rows[0], input, data).result;
  if (
    !persisted ||
    canonicalJson(persistedStopResultData(persisted)) !==
      canonicalJson(resultData)
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
}

function canCancelJob(job: StopJobRow): boolean {
  if (job.status !== 'pending' && job.status !== 'leased') return false;
  if (job.delivery_status !== 'not_submitted') return false;
  return job.provider_email_id === null || job.kind === 'legacy';
}

function hasExactCurrentLeaseAuthorization(
  job: StopJobRow,
  stopAt: Date,
): boolean {
  if (job.status !== 'leased' || !job.lease_token) return false;
  const occurredAt = job.authorization_occurred_at
    ? new Date(job.authorization_occurred_at)
    : null;
  return (
    job.authorization_event_key ===
      `job:${job.id}:submission-authorized:${job.lease_token}` &&
    job.authorization_contact_id === job.contact_id &&
    job.authorization_project_id === job.project_id &&
    job.authorization_kind === 'delivery.submission_authorized' &&
    occurredAt !== null &&
    !Number.isNaN(occurredAt.getTime()) &&
    occurredAt.getTime() <= stopAt.getTime() &&
    canonicalJson(job.authorization_data) ===
      canonicalJson({
        bounded_stop_race: true,
        lease_token: job.lease_token,
      })
  );
}

function stopRaceEventKey(jobId: string, stopEventKey: string): string {
  const digest = createHash('sha256').update(stopEventKey).digest('hex');
  return `job:${jobId}:stop-race-review:${digest}`;
}

function stopRaceData(
  job: StopJobRow,
  input: StopContactInput,
): Record<string, unknown> {
  const campaignVersion =
    typeof job.payload['campaign_version'] === 'string'
      ? job.payload['campaign_version']
      : null;
  const step = Number.isInteger(job.payload['step'])
    ? job.payload['step']
    : null;
  return {
    bounded_provider_submission: true,
    campaign_version: campaignVersion,
    job_id: job.id,
    reason: input.reason,
    step,
    stop_event_key: input.eventKey,
  };
}

async function persistStopRaceReview(
  transaction: SqlTransaction,
  job: StopJobRow,
  input: StopContactInput,
): Promise<void> {
  const eventKey = stopRaceEventKey(job.id, input.eventKey);
  const data = stopRaceData(job, input);
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-stop-race-review */
     insert into growth_activity (
       event_key, contact_id, project_id, kind, occurred_at, data
     ) values ($1, $2, $3, 'delivery.stop_race_review', $4, $5::jsonb)
     on conflict (event_key) do nothing
     returning event_key`,
    [
      eventKey,
      job.contact_id,
      job.project_id,
      input.occurredAt,
      JSON.stringify(data),
    ],
  );
  if (inserted.rows.length > 0) return;
  const replay = await transaction.execute<StopRaceReviewRow>(
    `/* growth:read-stop-race-review */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  validateStopRaceReview(replay.rows[0], job, input, eventKey, data);
}

function validateStopRaceReview(
  row: StopRaceReviewRow | undefined,
  job: StopJobRow,
  input: StopContactInput,
  eventKey = stopRaceEventKey(job.id, input.eventKey),
  data = stopRaceData(job, input),
): void {
  if (
    !row ||
    row.event_key !== eventKey ||
    row.contact_id !== job.contact_id ||
    row.project_id !== job.project_id ||
    row.kind !== 'delivery.stop_race_review' ||
    new Date(row.occurred_at).getTime() !== input.occurredAt.getTime() ||
    canonicalJson(row.data) !== canonicalJson(data)
  ) {
    throw new Error(`Growth stop race event key conflict: ${eventKey}`);
  }
}

/**
 * Stops outreach to a contact in one transaction: locks the contact, records
 * the stop once by event key, clears an approval it post-dates, cancels
 * unsubmitted jobs, records a `delivery.stop_race_review` for jobs already
 * authorized for submission, settles submitted jobs, and persists the result
 * on the stop activity. A replay returns the persisted result without writes.
 *
 * @throws When the contact is missing or the event key conflicts.
 */
export async function stopContact(
  executor: SqlExecutor,
  rawInput: StopContactInput,
): Promise<StopContactResult> {
  let input: StopContactInput = {
    ...rawInput,
    contactId: requiredText('contactId', rawInput.contactId, LIMITS.contactId),
    eventKey: requiredText('eventKey', rawInput.eventKey, LIMITS.eventKey),
    occurredAt: validDate('occurredAt', rawInput.occurredAt),
    reason: validReason(rawInput.reason),
    source: requiredText('source', rawInput.source, LIMITS.source),
  };
  const data = stopActivityData(input);

  return executor.transaction(async (transaction) => {
    const locked = await transaction.execute<StopContactRow>(
      `/* growth:lock-contact-for-stop */
       select id, outreach_approved_at, deleted_at
       from growth_contacts
       where id = $1
       for update`,
      [input.contactId],
    );
    if (!locked.rows[0]) {
      throw new Error(`Growth contact not found: ${input.contactId}`);
    }

    const activity = await insertStopActivityOnce(transaction, input, data);
    if (activity.result) return activity.result;
    input = { ...input, occurredAt: activity.occurredAt };
    const applied = activity.applied;
    const approvedAt = locked.rows[0].outreach_approved_at
      ? new Date(locked.rows[0].outreach_approved_at)
      : null;
    const effective =
      approvedAt === null || input.occurredAt.getTime() >= approvedAt.getTime();
    if (!effective) {
      const result: StopContactResult = {
        applied,
        effective: false,
        contactId: input.contactId,
        reason: input.reason,
        providerSync: { action: 'none', required: false },
        cancelledJobIds: [],
        legacyProviderCancellationIds: [],
        preservedJobIds: [],
        race: {
          boundedProviderSubmissionPossible: false,
          manualReviewRequired: false,
          jobIds: [],
          providerSubmissionAlreadyRecordedJobIds: [],
          unknownDeliveryJobIds: [],
        },
      };
      await finalizeStopActivity(transaction, input, data, result);
      return result;
    }

    await transaction.execute<{ id: string }>(
      `/* growth:clear-stop-approval */
       update growth_contacts
       set outreach_approved_at = null
       where id = $1
         and outreach_approved_at is not null
         and outreach_approved_at <= $2
       returning id`,
      [input.contactId, input.occurredAt],
    );

    const lockedJobs = await transaction.execute<StopJobRow>(
      `/* growth:lock-stop-jobs */
       select j.id, j.kind, j.contact_id, j.project_id, j.status,
              j.delivery_status, j.provider_email_id, j.lease_token, j.payload,
              submission_authorization.event_key as authorization_event_key,
              submission_authorization.contact_id as authorization_contact_id,
              submission_authorization.project_id as authorization_project_id,
              submission_authorization.kind as authorization_kind,
              submission_authorization.occurred_at as authorization_occurred_at,
              submission_authorization.data as authorization_data
       from growth_jobs j
       left join growth_activity submission_authorization
         on submission_authorization.event_key =
           'job:' || j.id::text || ':submission-authorized:' || j.lease_token::text
       where j.contact_id = $1
       order by j.id
       for update of j`,
      [input.contactId],
    );
    const cancellable = lockedJobs.rows.filter(canCancelJob);
    const cancelledJobIds = cancellable.map(({ id }) => id);
    const authorizedRaceJobs = cancellable.filter((job) =>
      hasExactCurrentLeaseAuthorization(job, input.occurredAt),
    );
    for (const job of authorizedRaceJobs) {
      await persistStopRaceReview(transaction, job, input);
    }
    const authorizedRaceJobIds = authorizedRaceJobs.map(({ id }) => id);
    if (cancelledJobIds.length > 0) {
      await transaction.execute(
        `/* growth:cancel-stop-jobs */
         update growth_jobs
         set status = 'cancelled',
             lease_until = null,
             lease_token = null,
             payload = case
               when kind = 'legacy' then payload
               when id = any($3::uuid[]) then jsonb_strip_nulls(
                 jsonb_build_object(
                   'campaign_version', payload->'campaign_version',
                   'step', payload->'step'
                 )
               )
               else '{}'::jsonb
             end,
             last_error_code = 'contact_stopped'
         where contact_id = $1
           and id = any($2::uuid[])`,
        [input.contactId, cancelledJobIds, authorizedRaceJobIds],
      );
    }

    const preserved = lockedJobs.rows.filter((job) => !canCancelJob(job));
    const ledgerJobsWithActiveQueueState = preserved
      .filter(
        ({ status, delivery_status, provider_email_id }) =>
          (status === 'pending' || status === 'leased') &&
          (delivery_status !== 'not_submitted' || provider_email_id !== null),
      )
      .map(({ id }) => id);
    if (ledgerJobsWithActiveQueueState.length > 0) {
      await transaction.execute(
        `/* growth:settle-stop-ledger-jobs */
         update growth_jobs
         set status = case
               when delivery_status = 'unknown' then 'failed'
               when delivery_status = 'failed' then 'failed'
               else 'completed'
             end,
             lease_until = null,
             lease_token = null
         where contact_id = $1
           and id = any($2::uuid[])`,
        [input.contactId, ledgerJobsWithActiveQueueState],
      );
    }
    const durableRaceReviews = await transaction.execute<StopRaceReviewRow>(
      `/* growth:read-stop-race-reviews */
       select event_key, contact_id, project_id, kind, occurred_at, data,
              data->>'job_id' as job_id
       from growth_activity
       where contact_id = $1
         and kind = 'delivery.stop_race_review'
         and data->>'stop_event_key' = $2
       order by data->>'job_id'`,
      [input.contactId, input.eventKey],
    );
    const jobsById = new Map(lockedJobs.rows.map((job) => [job.id, job]));
    for (const review of durableRaceReviews.rows) {
      const reviewJob = review.job_id ? jobsById.get(review.job_id) : undefined;
      if (!reviewJob) {
        throw new Error(
          `Growth stop race event key conflict: ${review.event_key}`,
        );
      }
      validateStopRaceReview(review, reviewJob, input);
    }
    const leasedRaceJobIds = durableRaceReviews.rows
      .map(({ job_id }) => job_id)
      .filter((id): id is string => typeof id === 'string');
    const submittedJobIds = preserved
      .filter(
        ({ delivery_status, provider_email_id }) =>
          provider_email_id !== null ||
          delivery_status === 'submitted' ||
          delivery_status === 'delivered' ||
          delivery_status === 'bounced' ||
          delivery_status === 'complained' ||
          delivery_status === 'suppressed',
      )
      .map(({ id }) => id);
    const unknownJobIds = preserved
      .filter(({ delivery_status }) => delivery_status === 'unknown')
      .map(({ id }) => id);
    const manualReviewJobIds = [
      ...new Set([...leasedRaceJobIds, ...submittedJobIds, ...unknownJobIds]),
    ];

    const result: StopContactResult = {
      applied,
      effective: true,
      contactId: input.contactId,
      reason: input.reason,
      providerSync: providerSyncActionForStopReason(input.reason),
      cancelledJobIds,
      legacyProviderCancellationIds: lockedJobs.rows
        .filter(
          ({ kind, status, delivery_status, provider_email_id }) =>
            kind === 'legacy' &&
            (status === 'pending' ||
              status === 'leased' ||
              status === 'cancelled') &&
            delivery_status === 'not_submitted' &&
            provider_email_id !== null,
        )
        .map(({ provider_email_id }) => provider_email_id as string),
      preservedJobIds: preserved.map(({ id }) => id),
      race: {
        boundedProviderSubmissionPossible: leasedRaceJobIds.length > 0,
        manualReviewRequired: manualReviewJobIds.length > 0,
        jobIds: manualReviewJobIds,
        providerSubmissionAlreadyRecordedJobIds: submittedJobIds,
        unknownDeliveryJobIds: unknownJobIds,
      },
    };
    await finalizeStopActivity(transaction, input, data, result);
    return result;
  });
}

/**
 * Stops a contact found by email for a legacy unsubscribe link. The event key
 * is derived from the contact's approval epoch, so repeats within one epoch
 * replay and a later re-approval can be stopped again.
 *
 * @throws When the email matches more than one contact.
 */
export async function stopLegacyEmailUnsubscribe(
  executor: SqlExecutor,
  rawInput: StopLegacyEmailUnsubscribeInput,
): Promise<StopLegacyEmailUnsubscribeResult> {
  const candidates = createEmailLookupCandidates(
    rawInput.email,
    rawInput.keyring,
  );
  const occurredAt = validDate('occurredAt', rawInput.occurredAt);
  const policyVersion = requiredText(
    'policyVersion',
    rawInput.policyVersion,
    LIMITS.policyVersion,
  );
  const source = requiredText('source', rawInput.source, LIMITS.source);

  return executor.transaction(async (transaction) => {
    const locked = await transaction.execute<StopContactRow>(
      `/* growth:lock-contact-by-email-for-legacy-stop */
       select c.id, c.outreach_approved_at, c.deleted_at
       from growth_contacts c
       where exists (
         select 1
         from jsonb_to_recordset($1::jsonb)
           as candidate(key_version smallint, digest text)
         where (
             candidate.key_version = c.email_hmac_key_version
             and candidate.digest = c.email_lookup_hmac
           )
           or exists (
             select 1
             from growth_activity alias
             where alias.contact_id = c.id
               and alias.kind = 'contact.lookup_alias_added'
               and alias.data->>'key_version' = candidate.key_version::text
               and alias.data->>'digest' = candidate.digest
           )
       )
       order by c.id
       limit 2
       for update of c`,
      [
        JSON.stringify(
          candidates.map(({ digest, keyVersion }) => ({
            digest,
            key_version: keyVersion,
          })),
        ),
      ],
    );
    if (locked.rows.length > 1) {
      throw new Error('Email HMAC lookup matched multiple growth contacts');
    }
    const contact = locked.rows[0];
    if (!contact) {
      return {
        applied: false,
        contactMatched: false,
        effective: false,
      };
    }

    const approvalEpoch = contact.outreach_approved_at
      ? new Date(contact.outreach_approved_at)
      : null;
    if (approvalEpoch && Number.isNaN(approvalEpoch.getTime())) {
      throw new Error('Growth contact has an invalid approval timestamp');
    }

    if (approvalEpoch === null) {
      const replay = await transaction.execute<LegacyStopActivityRow>(
        `/* growth:read-latest-legacy-stop */
         select event_key, occurred_at
         from growth_activity
         where contact_id = $1
           and kind = 'unsubscribe'
           and data->>'source' = $2
           and data->>'provenance' = 'system'
         order by occurred_at desc, id desc
         limit 1`,
        [contact.id, source],
      );
      if (replay.rows[0]) {
        return {
          applied: false,
          contactMatched: true,
          effective: true,
        };
      }
    }

    const approvalEpochIdentity = approvalEpoch
      ? approvalEpoch.getTime().toString(10)
      : 'unapproved';
    const eventIdentity = createHash('sha256')
      .update(
        `legacy-unsubscribe-v1:${contact.id}:${approvalEpochIdentity}`,
        'utf8',
      )
      .digest('base64url');
    const stopAt =
      approvalEpoch && occurredAt.getTime() < approvalEpoch.getTime()
        ? approvalEpoch
        : occurredAt;
    const transactionExecutor: SqlExecutor = {
      execute: (sql, parameters) => transaction.execute(sql, parameters),
      transaction: (operation) => operation(transaction),
    };
    const stopped = await stopContact(transactionExecutor, {
      contactId: contact.id,
      reason: 'unsubscribe',
      eventKey: `legacy:unsubscribe:${eventIdentity}`,
      occurredAt: stopAt,
      source,
      provenance: {
        actor: 'recipient',
        kind: 'system',
        policyVersion,
      },
    });
    return {
      applied: stopped.applied,
      contactMatched: true,
      effective: stopped.effective,
    };
  });
}
