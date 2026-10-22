import { createHash } from 'node:crypto';
import {
  nestedExecutor,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import { stopContact as canonicalStopContact } from './stops.ts';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ACCEPTED_BOUND_DELIVERY_STATUSES = new Set([
  'submitted',
  'delivered',
  'bounced',
  'complained',
  'suppressed',
  'failed',
  'unknown',
]);
const MESSAGE_ID_PATTERN =
  /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,128})@([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)>$/u;

/** Collaborators retained for provider binding and historical reply reconciliation. */
export interface ProcessGoogleMailboxEventDependencies {
  stopContact: (
    ...input: Parameters<typeof canonicalStopContact>
  ) => Promise<unknown>;
}

type ReplyReconciliationFailure =
  'reconcile_payload_invalid' | 'reconcile_conflict';

interface SeedJobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  contact_id: string | null;
  status: string;
  provider_email_id: string | null;
  delivery_status: string;
  rfc_message_id: string | null;
  gmail_seed_message_id: string | null;
}

interface MailboxContactRow extends Record<string, unknown> {
  id: string;
  deleted_at: Date | string | null;
}

interface ReconcileJobRow extends Record<string, unknown> {
  id: string;
  contact_id: string | null;
  status: string;
  payload: Record<string, unknown>;
}

interface LeasedReconcileJobRow extends ReconcileJobRow {
  kind: string;
  lease_token: string | null;
  attempts: number;
}

/** A Message-ID a reply points at; rank 0 is In-Reply-To, then References newest first. */
export interface RankedReplyCandidate {
  message_id: string;
  rank: number;
}

/** A ranked candidate whose Message-ID was bound to a sent job and contact. */
export interface ResolvedReplyCandidate extends RankedReplyCandidate {
  contact_id: string;
  seed_job_id: string;
}

/**
 * Picks the resolution with the lowest rank, breaking ties by Message-ID and
 * then contact id, so every worker settles the same reply the same way.
 */
export function selectBestGoogleReplyResolution(
  candidates: readonly ResolvedReplyCandidate[],
): ResolvedReplyCandidate | null {
  return (
    [...candidates].sort(
      (left, right) =>
        left.rank - right.rank ||
        left.message_id.localeCompare(right.message_id) ||
        left.contact_id.localeCompare(right.contact_id),
    )[0] ?? null
  );
}

class ReplyReconciliationError extends Error {
  constructor(readonly reason: ReplyReconciliationFailure) {
    super(reason);
    this.name = 'ReplyReconciliationError';
  }
}

function domainError(reason: ReplyReconciliationFailure): never {
  throw new ReplyReconciliationError(reason);
}

/** SHA-256 of a UTF-8 string, base64url without padding (43 characters). */
export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function validDate(field: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date`);
  }
  return value;
}

function requiredString(
  field: string,
  value: unknown,
  maximum: number,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum
  ) {
    throw new Error(`${field} is invalid`);
  }
  if (/\r|\n|\0/u.test(value)) throw new Error(`${field} is unsafe`);
  return value;
}

function parseMessageId(field: string, value: unknown): string {
  const raw = requiredString(field, value, 254).trim();
  const match = MESSAGE_ID_PATTERN.exec(raw);
  if (!match || raw.includes('..')) throw new Error(`${field} is invalid`);
  return `<${match[1]}@${(match[2] as string).toLowerCase()}>`;
}

/**
 * Normalizes a subject for reply matching: Unicode NFKC, any run of leading
 * `Re:`, `Fw:`, `Fwd:` or `Aw:` prefixes removed, whitespace collapsed,
 * trimmed and lowercased. Retained for provider acceptance and historical
 * reply reconciliation; no Gmail intake remains.
 */
export function normalizeReplySubject(subject: string): string {
  let normalized = subject.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  for (;;) {
    const stripped = normalized.replace(/^(?:re|fwd?|aw)\s*:\s*/iu, '');
    if (stripped === normalized) break;
    normalized = stripped;
  }
  return normalized.toLowerCase();
}

/**
 * The subject digest a sent job records at provider acceptance: {@link sha256Base64Url} of
 * {@link normalizeReplySubject}. The subject itself is never stored.
 */
export function replySubjectSha256(subject: string): string {
  return sha256Base64Url(normalizeReplySubject(subject));
}

/**
 * Whether historical `mailbox.recovery_required` activity lacks a matching
 * `mailbox.recovery_completed`; while it does, `send_step` and
 * `reply_reconcile` work is paused.
 */
export async function isGoogleMailboxRecoveryPaused(
  executor: Pick<SqlExecutor, 'execute'>,
): Promise<boolean> {
  const result = await executor.execute<{ paused: boolean }>(
    `/* growth:read-google-mailbox-recovery-pause */
     select exists (
       select 1
       from growth_activity required
       where required.kind = 'mailbox.recovery_required'
         and not exists (
           select 1
           from growth_activity completed
           where completed.kind = 'mailbox.recovery_completed'
             and completed.data->>'recovery_id' = required.data->>'recovery_id'
         )
     ) as paused`,
  );
  return result.rows[0]?.paused === true;
}

function replyStopEventKey(gmailMessageId: string): string {
  return `google:reply:${sha256Base64Url(gmailMessageId)}:stop`;
}

function reconcilePayloadReferences(
  payload: Record<string, unknown>,
): string[] {
  const inReplyTo =
    typeof payload['in_reply_to'] === 'string' ? [payload['in_reply_to']] : [];
  const references = Array.isArray(payload['references'])
    ? payload['references'].filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
  return [...inReplyTo, ...references];
}

/** Orders a reply's candidates: In-Reply-To first, then References newest first, deduplicated. */
export function rankGoogleReplyCandidates(event: {
  inReplyTo: string | null;
  references: readonly string[];
}): RankedReplyCandidate[] {
  const ordered = [
    ...(event.inReplyTo ? [event.inReplyTo] : []),
    ...[...event.references].reverse(),
  ];
  return ordered
    .filter((messageId, index) => ordered.indexOf(messageId) === index)
    .map((message_id, rank) => ({ message_id, rank }));
}

function rankedCandidatesFromPayload(
  payload: Record<string, unknown>,
): RankedReplyCandidate[] | null {
  if (!Array.isArray(payload['ranked_candidates'])) return null;
  const candidates: RankedReplyCandidate[] = [];
  for (const candidate of payload['ranked_candidates']) {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      domainError('reconcile_payload_invalid');
    }
    const item = candidate as Record<string, unknown>;
    if (
      typeof item['message_id'] !== 'string' ||
      !Number.isInteger(item['rank']) ||
      Number(item['rank']) < 0 ||
      Number(item['rank']) > 20
    ) {
      domainError('reconcile_payload_invalid');
    }
    candidates.push({
      message_id: item['message_id'],
      rank: Number(item['rank']),
    });
  }
  return candidates;
}

function resolvedCandidatesFromPayload(
  payload: Record<string, unknown>,
): ResolvedReplyCandidate[] {
  if (payload['resolved_candidates'] === undefined) return [];
  if (!Array.isArray(payload['resolved_candidates'])) {
    domainError('reconcile_payload_invalid');
  }
  return payload['resolved_candidates'].map((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      domainError('reconcile_payload_invalid');
    }
    const item = candidate as Record<string, unknown>;
    if (
      typeof item['message_id'] !== 'string' ||
      !Number.isInteger(item['rank']) ||
      Number(item['rank']) < 0 ||
      Number(item['rank']) > 20 ||
      typeof item['contact_id'] !== 'string' ||
      typeof item['seed_job_id'] !== 'string'
    ) {
      domainError('reconcile_payload_invalid');
    }
    return {
      message_id: item['message_id'],
      rank: Number(item['rank']),
      contact_id: item['contact_id'],
      seed_job_id: item['seed_job_id'],
    };
  });
}

async function stopForReply(
  transaction: SqlTransaction,
  dependencies: ProcessGoogleMailboxEventDependencies,
  contactId: string,
  gmailMessageId: string,
  occurredAt: Date,
): Promise<void> {
  await dependencies.stopContact(nestedExecutor(transaction), {
    contactId,
    reason: 'campaign.reply_received',
    eventKey: replyStopEventKey(gmailMessageId),
    occurredAt,
    source: 'google_mailbox_poller',
    provenance: {
      actor: 'mailbox_recipient',
      kind: 'mailbox_reply',
      policyVersion: 'google-reply-v1',
    },
  });
}

async function reconcileBoundMessage(
  transaction: SqlTransaction,
  event: { jobId: string; rfcMessageId: string },
  contactId: string,
  dependencies: ProcessGoogleMailboxEventDependencies,
): Promise<void> {
  const pending = await transaction.execute<ReconcileJobRow>(
    `/* growth:lock-google-reconcile-for-seed */
     select id, contact_id, status, payload, last_error_code
     from growth_jobs
     where kind = 'reply_reconcile'
       and (status in ('pending', 'leased')
         or (status = 'failed' and last_error_code = 'founder_review'))
       and (
         payload->>'in_reply_to' = $1
         or payload->'references' ? $1
         or payload->'ranked_candidates' @> jsonb_build_array(
           jsonb_build_object('message_id', $1::text)
         )
       )
     order by available_at, id
     for update`,
    [event.rfcMessageId],
  );
  for (const reconcile of pending.rows) {
    const rankedCandidates = rankedCandidatesFromPayload(reconcile.payload);
    if (reconcile.status === 'failed') {
      // A provider identity can arrive after the bounded reply lookup window.
      // Recover only exhausted lookups with decisive direct-reply evidence.
      // A lower reference remains ambiguous: roll back this binding so its
      // contact cannot resume sending while that reply awaits resolution.
      const direct = rankedCandidates
        ? rankedCandidates.some(
            (candidate) =>
              candidate.message_id === event.rfcMessageId &&
              candidate.rank === 0,
          )
        : reconcile.payload['in_reply_to'] === event.rfcMessageId;
      if (reconcile['last_error_code'] !== 'founder_review' || !direct)
        domainError('reconcile_conflict');
      const occurredAt = reconcile.payload['occurred_at'];
      if (
        typeof occurredAt !== 'string' ||
        Number.isNaN(new Date(occurredAt).getTime())
      )
        domainError('reconcile_payload_invalid');
      const revived = await transaction.execute<{ id: string }>(
        `/* growth:revive-exhausted-google-reconcile */
         update growth_jobs set status = 'pending', available_at = $2,
           lease_until = null, lease_token = null, last_error_code = null
         where id = $1 and kind = 'reply_reconcile'
           and status = 'failed' and last_error_code = 'founder_review'
         returning id`,
        [reconcile.id, new Date(occurredAt)],
      );
      if (revived.rows.length !== 1) domainError('reconcile_conflict');
    }
    if (rankedCandidates) {
      const candidate = rankedCandidates.find(
        (item) => item.message_id === event.rfcMessageId,
      );
      if (!candidate) domainError('reconcile_payload_invalid');
      const resolvedCandidates = resolvedCandidatesFromPayload(
        reconcile.payload,
      );
      const conflictingResolution = resolvedCandidates.find(
        (item) => item.message_id === event.rfcMessageId,
      );
      if (
        conflictingResolution &&
        (conflictingResolution.contact_id !== contactId ||
          conflictingResolution.seed_job_id !== event.jobId ||
          conflictingResolution.rank !== candidate.rank)
      ) {
        domainError('reconcile_conflict');
      }
      if (!conflictingResolution) {
        const resolution: ResolvedReplyCandidate = {
          ...candidate,
          contact_id: contactId,
          seed_job_id: event.jobId,
        };
        const recorded = await transaction.execute<{ id: string }>(
          `/* growth:record-google-reconcile-candidate */
           update growth_jobs
           set payload = jsonb_set(
             payload,
             '{resolved_candidates}',
             coalesce(payload->'resolved_candidates', '[]'::jsonb) || $2::jsonb
           )
           where id = $1 and status in ('pending', 'leased')
           returning id`,
          [reconcile.id, JSON.stringify([resolution])],
        );
        if (recorded.rows.length !== 1) domainError('reconcile_conflict');
      }
      // Rank zero is the exact In-Reply-To and cannot be superseded. Lower
      // ranks settle only after the bounded window, independent of arrival.
      if (candidate.rank !== 0) continue;
    }
    if (
      !reconcilePayloadReferences(reconcile.payload).includes(
        event.rfcMessageId,
      ) &&
      !rankedCandidates
    ) {
      domainError('reconcile_payload_invalid');
    }
    const gmailMessageId = reconcile.payload['gmail_message_id'];
    const occurredAtValue = reconcile.payload['occurred_at'];
    if (
      typeof gmailMessageId !== 'string' ||
      typeof occurredAtValue !== 'string'
    ) {
      domainError('reconcile_payload_invalid');
    }
    const replyOccurredAt = new Date(occurredAtValue);
    if (Number.isNaN(replyOccurredAt.getTime())) {
      domainError('reconcile_payload_invalid');
    }
    if (await isGoogleMailboxRecoveryPaused(nestedExecutor(transaction))) {
      continue;
    }
    await stopForReply(
      transaction,
      dependencies,
      contactId,
      gmailMessageId,
      replyOccurredAt,
    );
    const completed = await transaction.execute<{ id: string }>(
      `/* growth:complete-google-reconciled-reply */
       update growth_jobs
       set status = 'completed',
           contact_id = $2,
           available_at = $3,
           lease_until = null,
           lease_token = null,
           last_error_code = null
       where id = $1 and status in ('pending', 'leased')
       returning id`,
      [reconcile.id, contactId, replyOccurredAt],
    );
    if (completed.rows.length !== 1) {
      domainError('reconcile_conflict');
    }
  }
}

/** Thrown when a provider Message-ID cannot be bound to its job safely. */
export class ProviderMessageIdBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderMessageIdBindingError';
  }
}

/**
 * Binds a provider-reported RFC Message-ID to the completed job that carries
 * `providerEmailId`, then settles any `reply_reconcile` waiting on it (a
 * direct In-Reply-To match stops the contact at once). Only provider-
 * authenticated identifiers are bound, never a fabricated Gmail seed.
 *
 * @throws {ProviderMessageIdBindingError} On malformed or conflicting identities.
 */
export async function bindProviderMessageId(
  executor: SqlExecutor,
  input: { providerEmailId: string; rfcMessageId: string },
  dependencies: ProcessGoogleMailboxEventDependencies = {
    stopContact: canonicalStopContact,
  },
): Promise<'bound' | 'unmatched' | 'ignored_deleted'> {
  let rfcMessageId: string;
  try {
    rfcMessageId = parseMessageId('message_id', input.rfcMessageId);
  } catch {
    throw new ProviderMessageIdBindingError('Invalid provider message_id');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(input.providerEmailId)) {
    throw new ProviderMessageIdBindingError('Invalid provider email ID');
  }
  return executor.transaction(async (transaction) => {
    // Same lock order as Gmail reconciliation: advisory, contact, then job.
    await transaction.execute(`/* growth:acquire-google-reconcile-advisory-lock */
      select pg_advisory_xact_lock(hashtextextended('google-mailbox-reconciliation', 0))`);
    const discovered = await transaction.execute<SeedJobRow>(
      `/* growth:discover-provider-message-job */
       select id, contact_id from growth_jobs where provider_email_id = $1`,
      [input.providerEmailId],
    );
    const reference = discovered.rows[0];
    if (!reference) return 'unmatched';
    if (!reference.contact_id)
      throw new ProviderMessageIdBindingError(
        'Provider message contact is missing',
      );
    const contact = await transaction.execute<MailboxContactRow>(
      `/* growth:lock-provider-message-contact */
       select id, deleted_at from growth_contacts where id = $1 for update`,
      [reference.contact_id],
    );
    const locked = await transaction.execute<SeedJobRow>(
      `/* growth:lock-provider-message-job */
       select id, kind, contact_id, status, provider_email_id, delivery_status,
              rfc_message_id, gmail_seed_message_id
       from growth_jobs where id = $1 for update`,
      [reference.id],
    );
    const job = locked.rows[0];
    if (
      !contact.rows[0] ||
      !job ||
      job.id !== reference.id ||
      job.contact_id !== reference.contact_id ||
      job.provider_email_id !== input.providerEmailId ||
      job.status !== 'completed' ||
      !['fulfill', 'send_step'].includes(job.kind) ||
      !ACCEPTED_BOUND_DELIVERY_STATUSES.has(job.delivery_status) ||
      (job.rfc_message_id && job.rfc_message_id !== rfcMessageId)
    ) {
      throw new ProviderMessageIdBindingError(
        'Provider Message-ID binding conflict',
      );
    }
    if (contact.rows[0].deleted_at !== null) return 'ignored_deleted';
    const conflicts = await transaction.execute<{ id: string }>(
      `/* growth:check-provider-message-conflicts */
       select id from growth_jobs where id <> $1 and rfc_message_id = $2 limit 1`,
      [job.id, rfcMessageId],
    );
    if (conflicts.rows.length)
      throw new ProviderMessageIdBindingError(
        'Provider Message-ID binding conflict',
      );
    if (!job.rfc_message_id) {
      const updated = await transaction.execute<{ id: string }>(
        `/* growth:bind-provider-message-id */
         update growth_jobs set rfc_message_id = $3
         where id = $1 and provider_email_id = $2 and rfc_message_id is null
         returning id`,
        [job.id, input.providerEmailId, rfcMessageId],
      );
      if (updated.rows.length !== 1)
        throw new ProviderMessageIdBindingError(
          'Provider Message-ID binding conflict',
        );
    }
    try {
      await reconcileBoundMessage(
        transaction,
        { jobId: job.id, rfcMessageId },
        reference.contact_id,
        dependencies,
      );
    } catch (error) {
      if (error instanceof ReplyReconciliationError)
        throw new ProviderMessageIdBindingError(
          'Provider reply reconciliation conflict',
        );
      throw error;
    }
    return 'bound';
  });
}

/**
 * Settles one leased `reply_reconcile` job: paused while mailbox recovery is
 * open; with no resolved candidate it retries with backoff
 * `min(60, 2^attempts)` minutes and fails to `founder_review` after five
 * attempts; otherwise it stops the best-ranked contact and completes.
 *
 * @throws When the lease is no longer active or the payload is invalid.
 */
export async function settleGoogleReplyReconciliation(
  executor: SqlExecutor,
  input: { jobId: string; leaseToken: string; now: Date },
  dependencies: ProcessGoogleMailboxEventDependencies = {
    stopContact: canonicalStopContact,
  },
): Promise<
  | 'completed'
  | 'retry_scheduled'
  | 'founder_review'
  | 'ignored_deleted'
  | 'recovery_paused'
> {
  const now = validDate('now', input.now);
  if (
    !UUID_V4_PATTERN.test(input.jobId) ||
    !UUID_V4_PATTERN.test(input.leaseToken)
  ) {
    throw new Error('Google reply reconciliation lease is invalid');
  }
  const discovered = await executor.execute<LeasedReconcileJobRow>(
    `/* growth:read-google-reconcile-settlement */
     select id, kind, contact_id, status, lease_token, attempts, payload
     from growth_jobs
     where id = $1`,
    [input.jobId],
  );
  const snapshot = discovered.rows[0];
  if (
    !snapshot ||
    snapshot.kind !== 'reply_reconcile' ||
    snapshot.status !== 'leased' ||
    snapshot.lease_token !== input.leaseToken
  ) {
    throw new Error('Google reply reconciliation lease is no longer active');
  }
  return executor.transaction(async (transaction) => {
    await transaction.execute(
      `/* growth:acquire-google-reconcile-advisory-lock */
       select pg_advisory_xact_lock(hashtextextended('google-mailbox-reconciliation', 0))`,
    );
    if (await isGoogleMailboxRecoveryPaused(nestedExecutor(transaction))) {
      return 'recovery_paused';
    }
    const current = await transaction.execute<LeasedReconcileJobRow>(
      `/* growth:read-current-google-reconcile-settlement */
       select id, kind, contact_id, status, lease_token, attempts, payload
       from growth_jobs
       where id = $1`,
      [input.jobId],
    );
    const currentSnapshot = current.rows[0];
    if (
      !currentSnapshot ||
      currentSnapshot.kind !== 'reply_reconcile' ||
      currentSnapshot.status !== 'leased' ||
      currentSnapshot.lease_token !== input.leaseToken
    ) {
      throw new Error('Google reply reconciliation lease is no longer active');
    }
    const selected = selectBestGoogleReplyResolution(
      resolvedCandidatesFromPayload(currentSnapshot.payload),
    );
    if (!selected) {
      const locked = await transaction.execute<LeasedReconcileJobRow>(
        `/* growth:lock-unresolved-google-reconcile */
         select id, kind, contact_id, status, lease_token, attempts, payload
         from growth_jobs
         where id = $1
         for update`,
        [input.jobId],
      );
      const job = locked.rows[0];
      if (
        !job ||
        job.kind !== 'reply_reconcile' ||
        job.status !== 'leased' ||
        job.lease_token !== input.leaseToken
      ) {
        throw new Error(
          'Google reply reconciliation lease is no longer active',
        );
      }
      const terminal = job.attempts >= 5;
      const deferred = await transaction.execute<{ id: string }>(
        `/* growth:defer-unresolved-google-reconcile */
         update growth_jobs
         set status = $3,
             available_at = $4,
             lease_until = null,
             lease_token = null,
             last_error_code = $5
         where id = $1 and lease_token = $2::uuid
         returning id`,
        [
          input.jobId,
          input.leaseToken,
          terminal ? 'failed' : 'pending',
          new Date(now.getTime() + Math.min(60, 2 ** job.attempts) * 60_000),
          terminal ? 'founder_review' : 'reply_reference_unresolved',
        ],
      );
      if (deferred.rows.length !== 1) {
        throw new Error(
          'Google reply reconciliation lease is no longer active',
        );
      }
      return terminal ? 'founder_review' : 'retry_scheduled';
    }
    const contact = await transaction.execute<MailboxContactRow>(
      `/* growth:lock-google-reconcile-contact */
       select id, deleted_at
       from growth_contacts
       where id = $1
       for update`,
      [selected.contact_id],
    );
    if (!contact.rows[0]) throw new Error('Google reply contact was not found');
    const locked = await transaction.execute<LeasedReconcileJobRow>(
      `/* growth:lock-leased-google-reconcile */
       select id, kind, contact_id, status, lease_token, attempts, payload
       from growth_jobs
       where id = $1
       for update`,
      [input.jobId],
    );
    const job = locked.rows[0];
    if (
      !job ||
      job.kind !== 'reply_reconcile' ||
      job.status !== 'leased' ||
      job.lease_token !== input.leaseToken
    ) {
      throw new Error('Google reply reconciliation lease is no longer active');
    }
    const currentBest = selectBestGoogleReplyResolution(
      resolvedCandidatesFromPayload(job.payload),
    );
    if (
      !currentBest ||
      currentBest.contact_id !== selected.contact_id ||
      currentBest.message_id !== selected.message_id
    ) {
      throw new Error('Google reply reconciliation candidate changed');
    }
    const gmailMessageId = job.payload['gmail_message_id'];
    const occurredAtValue = job.payload['occurred_at'];
    if (
      typeof gmailMessageId !== 'string' ||
      typeof occurredAtValue !== 'string' ||
      Number.isNaN(new Date(occurredAtValue).getTime())
    ) {
      throw new Error('Google reply reconciliation payload is invalid');
    }
    if (contact.rows[0].deleted_at !== null) {
      if (currentBest.rank > 0) {
        const remaining = resolvedCandidatesFromPayload(job.payload).filter(
          (candidate) =>
            candidate.message_id !== currentBest.message_id ||
            candidate.contact_id !== currentBest.contact_id,
        );
        const terminal = job.attempts >= 5;
        const deferred = await transaction.execute<{ id: string }>(
          `/* growth:defer-deleted-lower-google-reconcile */
           update growth_jobs
           set status = $3,
               payload = $4::jsonb,
               available_at = $5,
               lease_until = null,
               lease_token = null,
               last_error_code = $6
           where id = $1 and lease_token = $2::uuid
           returning id`,
          [
            input.jobId,
            input.leaseToken,
            terminal ? 'failed' : 'pending',
            JSON.stringify({
              ...job.payload,
              resolved_candidates: remaining,
            }),
            new Date(now.getTime() + Math.min(60, 2 ** job.attempts) * 60_000),
            terminal ? 'founder_review' : 'reply_lower_reference_deleted',
          ],
        );
        if (deferred.rows.length !== 1) {
          throw new Error(
            'Google reply reconciliation lease is no longer active',
          );
        }
        return terminal ? 'founder_review' : 'retry_scheduled';
      }
      const cancelled = await transaction.execute<{ id: string }>(
        `/* growth:cancel-deleted-google-reconcile */
         update growth_jobs
         set status = 'cancelled', lease_until = null, lease_token = null,
             last_error_code = 'contact_deleted'
         where id = $1 and lease_token = $2::uuid
         returning id`,
        [input.jobId, input.leaseToken],
      );
      if (cancelled.rows.length !== 1) {
        throw new Error(
          'Google reply reconciliation lease is no longer active',
        );
      }
      return 'ignored_deleted';
    }
    await stopForReply(
      transaction,
      dependencies,
      selected.contact_id,
      gmailMessageId,
      new Date(occurredAtValue),
    );
    const completed = await transaction.execute<{ id: string }>(
      `/* growth:complete-leased-google-reconcile */
       update growth_jobs
       set status = 'completed', contact_id = $3,
           lease_until = null, lease_token = null, last_error_code = null
       where id = $1 and lease_token = $2::uuid
       returning id`,
      [input.jobId, input.leaseToken, selected.contact_id],
    );
    if (completed.rows.length !== 1) {
      throw new Error('Google reply reconciliation lease is no longer active');
    }
    return 'completed';
  });
}
