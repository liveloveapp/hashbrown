import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { canonicalJson } from './activity.ts';
import {
  nestedExecutor,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import { stopContact as canonicalStopContact } from './stops.ts';

/** The founder mailbox the Google poller watches; seeds must come from it. */
export const BRIAN_EMAIL = 'brian@hashbrown.dev';

/**
 * The request headers that carry a signed Google mailbox event. The body is
 * signed as `v1=` + base64url HMAC-SHA256 over
 * `<timestamp>\n<nonce>\n<sha256Base64Url(rawBody)>`.
 */
export const GOOGLE_REPLY_HEADERS = {
  timestamp: 'x-hashbrown-timestamp',
  nonce: 'x-hashbrown-nonce',
  signature: 'x-hashbrown-signature',
} as const;

/** The environment variable holding the Google reply HMAC secret (>= 32 bytes). */
export const GOOGLE_REPLY_HMAC_SECRET_ENV = 'GOOGLE_REPLY_HMAC_SECRET';

/**
 * How long an unmatched reply waits before its `reply_reconcile` job is due,
 * and the accepted clock skew of a signed request.
 */
export const GOOGLE_REPLY_RECONCILE_DELAY_MS = 5 * 60 * 1_000;

const MAX_CLOCK_SKEW_MS = GOOGLE_REPLY_RECONCILE_DELAY_MS;
/** Exact keys allowed even though they contain a forbidden key part. */
const ALLOWED_DIGEST_KEYS = new Set(['subject_sha256']);
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const SIGNATURE_PATTERN = /^v1=([A-Za-z0-9_-]{43})$/u;
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ACCEPTED_BOUND_DELIVERY_STATUSES = new Set([
  'submitted',
  'delivered',
  'bounced',
  'complained',
  'suppressed',
  'failed',
  'unknown',
]);
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/u;
const MESSAGE_ID_PATTERN =
  /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,128})@([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)>$/u;
const FORBIDDEN_KEY_PARTS = [
  'attachment',
  'body',
  'content',
  'metadata',
  'payload',
  'snippet',
  'subject',
] as const;

/** The signed envelope {@link verifyGoogleReplySignature} checks. */
export interface GoogleReplySignatureInput {
  rawBody: string;
  timestamp: string;
  nonce: string;
  signature: string;
  secret: string;
  now: Date;
}

interface GoogleEventBase {
  version: 1;
  gmailMessageId: string;
  rfcMessageId: string;
  occurredAt: Date;
  from: string;
}

/**
 * The founder's own copy of a sent message, seen in the mailbox: it binds the
 * job named by its `X-Hashbrown-Job-ID` header to its RFC Message-ID.
 */
export interface GoogleSeedEvent extends GoogleEventBase {
  kind: 'seed';
  jobId: string;
  verification: 'gmail_auth_aligned';
}

/**
 * A reply from a recipient. Only identifiers reach the store: the Gmail id,
 * the RFC Message-ID, In-Reply-To and References, and optionally a SHA-256
 * digest of the normalized subject (see {@link replySubjectSha256}). Bodies,
 * snippets and subjects are rejected at parse time.
 */
export interface GoogleReplyEvent extends GoogleEventBase {
  kind: 'reply';
  inReplyTo: string | null;
  references: string[];
  subjectSha256: string | null;
}

/** The poller lost its Gmail history cursor; replies may have been missed. */
export interface GoogleRecoveryRequiredEvent {
  kind: 'recovery_required';
  version: 1;
  recoveryId: string;
  occurredAt: Date;
  reason: 'cursor_missing' | 'history_expired';
}

/** The poller finished a full rescan for the recovery it opened. */
export interface GoogleRecoveryCompletedEvent {
  kind: 'recovery_completed';
  version: 1;
  recoveryId: string;
  occurredAt: Date;
}

/** A message the poller listed could no longer be fetched. */
export interface GoogleMessageUnavailableEvent {
  kind: 'message_unavailable';
  version: 1;
  gmailMessageId: string;
  occurredAt: Date;
  reason: 'not_found';
}

/** Mailbox events that carry no message identity. */
export type GoogleMailboxControlEvent =
  | GoogleRecoveryRequiredEvent
  | GoogleRecoveryCompletedEvent
  | GoogleMessageUnavailableEvent;

/** Every event the Google mailbox poller may post. */
export type GoogleMailboxEvent =
  GoogleSeedEvent | GoogleReplyEvent | GoogleMailboxControlEvent;

type GoogleMailboxMessageEvent = GoogleSeedEvent | GoogleReplyEvent;

/** A verified, parsed mailbox event and its signed envelope. */
export interface ProcessGoogleMailboxEventInput {
  event: GoogleMailboxEvent;
  nonce: string;
  timestamp: string;
  requestDigest: string;
  receivedAt: Date;
}

/** Collaborators of the reply path; the stop is injectable for tests. */
export interface ProcessGoogleMailboxEventDependencies {
  stopContact: (
    ...input: Parameters<typeof canonicalStopContact>
  ) => Promise<unknown>;
}

/** Why a well-formed event was terminally rejected (recorded, answered 200). */
export type GoogleMailboxRejectionReason =
  | 'gmail_message_conflict'
  | 'seed_sender_invalid'
  | 'seed_job_not_found'
  | 'seed_contact_not_found'
  | 'seed_job_invalid'
  | 'seed_contact_conflict'
  | 'seed_binding_conflict'
  | 'seed_identifier_conflict'
  | 'reply_binding_invalid'
  | 'reply_contact_not_found'
  | 'reconcile_payload_invalid'
  | 'reconcile_conflict';

/** What {@link processGoogleMailboxEvent} did with one event. */
export type ProcessGoogleMailboxEventResult =
  | {
      applied: boolean;
      outcome:
        | 'seed_registered'
        | 'reply_stopped'
        | 'reconcile_queued'
        | 'ignored_deleted'
        | 'replay'
        | 'recovery_paused'
        | 'recovery_completed'
        | 'message_unavailable_recorded';
    }
  | {
      applied: true;
      outcome: 'rejected_terminal';
      rejectionReason: GoogleMailboxRejectionReason;
    };

interface ActivityRow extends Record<string, unknown> {
  event_key: string;
  contact_id?: string | null;
  project_id?: string | null;
  kind: string;
  occurred_at: Date | string;
  data: Record<string, unknown>;
}

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

interface ReplyJobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  contact_id: string | null;
  status: string;
  provider_email_id: string | null;
  delivery_status: string;
  rfc_message_id: string | null;
}

interface ValidatedReplyJobRow extends ReplyJobRow {
  contact_id: string;
  rfc_message_id: string;
}

interface RankedReplyJob {
  job: ReplyJobRow;
  rank: number;
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

/** Thrown when a signed envelope's nonce was already claimed. */
export class GoogleReplyReplayError extends Error {
  constructor() {
    super('Google reply nonce has already been used');
    this.name = 'GoogleReplyReplayError';
  }
}

class GoogleMailboxDomainError extends Error {
  constructor(readonly reason: GoogleMailboxRejectionReason) {
    super(reason);
    this.name = 'GoogleMailboxDomainError';
  }
}

function domainError(reason: GoogleMailboxRejectionReason): never {
  throw new GoogleMailboxDomainError(reason);
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

function strictTimestamp(value: string): number {
  if (!/^(?:0|[1-9][0-9]{12})$/u.test(value)) {
    throw new Error('Google reply timestamp is invalid');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Google reply timestamp is invalid');
  }
  return parsed;
}

/**
 * Verifies a signed mailbox request: a strict millisecond timestamp within
 * five minutes of `now`, a 16..128 character nonce, a secret of at least 32
 * bytes, and a constant-time match of the `v1=` HMAC-SHA256 signature over
 * `<timestamp>\n<nonce>\n<sha256Base64Url(rawBody)>`.
 *
 * @throws When any part of the envelope is invalid.
 */
export function verifyGoogleReplySignature(
  input: GoogleReplySignatureInput,
): void {
  const now = validDate('now', input.now);
  const timestampMs = strictTimestamp(input.timestamp);
  if (Math.abs(now.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw new Error('Google reply timestamp is outside the accepted window');
  }
  if (!NONCE_PATTERN.test(input.nonce)) {
    throw new Error('Google reply nonce is invalid');
  }
  if (Buffer.byteLength(input.secret, 'utf8') < 32) {
    throw new Error('Google reply HMAC secret must be at least 32 bytes');
  }
  const match = SIGNATURE_PATTERN.exec(input.signature);
  if (!match) throw new Error('Google reply signature encoding is invalid');
  const canonical = `${input.timestamp}\n${input.nonce}\n${sha256Base64Url(
    input.rawBody,
  )}`;
  const expected = createHmac('sha256', input.secret)
    .update(canonical, 'utf8')
    .digest();
  const actual = Buffer.from(match[1] as string, 'base64url');
  if (
    actual.toString('base64url') !== match[1] ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error('Google reply signature is invalid');
  }
}

function assertPlainObject(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Google mailbox event must be an object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Google mailbox event must be a plain object');
  }
}

function rejectForbiddenKeys(value: unknown, topLevel = true): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenKeys(item, false);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const semanticKey = key.toLowerCase().replace(/[^a-z]/gu, '');
    if (
      !(topLevel && ALLOWED_DIGEST_KEYS.has(key) && typeof item === 'string') &&
      FORBIDDEN_KEY_PARTS.some((part) => semanticKey.includes(part))
    ) {
      throw new Error(
        `Google mailbox event contains a prohibited field: ${key}`,
      );
    }
    rejectForbiddenKeys(item, false);
  }
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error('Google mailbox event has an unsupported schema');
  }
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

function parseEmail(value: unknown): string {
  const raw = requiredString('from', value, 320).trim();
  const bracketed = /<([^<>]+)>$/u.exec(raw);
  const candidate = (bracketed?.[1] ?? raw).trim().toLowerCase();
  if (
    candidate.length > 254 ||
    !EMAIL_PATTERN.test(candidate) ||
    candidate.includes('..')
  ) {
    throw new Error('from is invalid');
  }
  const [local, domain] = candidate.split('@');
  if (
    !local ||
    !domain ||
    local.length > 64 ||
    domain.length > 253 ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    !domain.includes('.')
  ) {
    throw new Error('from is invalid');
  }
  return candidate;
}

function parseMessageId(field: string, value: unknown): string {
  const raw = requiredString(field, value, 254).trim();
  const match = MESSAGE_ID_PATTERN.exec(raw);
  if (!match || raw.includes('..')) throw new Error(`${field} is invalid`);
  return `<${match[1]}@${(match[2] as string).toLowerCase()}>`;
}

function parseOccurredAt(value: unknown): Date {
  const raw = requiredString('occurred_at', value, 40);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== raw) {
    throw new Error('occurred_at is invalid');
  }
  return parsed;
}

function parseGmailId(value: unknown): string {
  const raw = requiredString('gmail_message_id', value, 128);
  if (!OPAQUE_ID_PATTERN.test(raw))
    throw new Error('gmail_message_id is invalid');
  return raw;
}

function parseJobId(value: unknown): string {
  const raw = requiredString('x_hashbrown_job_id', value, 36).toLowerCase();
  if (!UUID_V4_PATTERN.test(raw)) {
    throw new Error('x_hashbrown_job_id is invalid');
  }
  return raw;
}

function parseDigest(field: string, value: unknown): string {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

/**
 * Normalizes a subject for reply matching: Unicode NFKC, any run of leading
 * `Re:`, `Fw:`, `Fwd:` or `Aw:` prefixes removed, whitespace collapsed,
 * trimmed and lowercased. The poller and the sender must normalize the same
 * way, so a reply's subject digest equals the sent message's.
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
 * The subject digest a reply carries as `subject_sha256` and a sent job
 * records at provider acceptance: {@link sha256Base64Url} of
 * {@link normalizeReplySubject}. The subject itself is never stored.
 */
export function replySubjectSha256(subject: string): string {
  return sha256Base64Url(normalizeReplySubject(subject));
}

function parseReferences(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error('references is invalid');
  }
  const references = value.map((item) => parseMessageId('references', item));
  if (references.reduce((total, item) => total + item.length, 0) > 4_000) {
    throw new Error('references is too large');
  }
  return references;
}

/**
 * Parses one mailbox event with an exact schema per kind. Any key naming a
 * body, snippet, subject, attachment, content, metadata or payload is
 * rejected (except the `subject_sha256` digest), and a reply from the
 * founder or without In-Reply-To/References is rejected.
 *
 * @throws When the body is not a supported, well-formed event.
 */
export function parseGoogleMailboxEvent(rawBody: string): GoogleMailboxEvent {
  if (typeof rawBody !== 'string') throw new Error('rawBody must be a string');
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error('Google mailbox event is not valid JSON');
  }
  assertPlainObject(decoded);
  rejectForbiddenKeys(decoded);
  if (decoded['version'] !== 1) {
    throw new Error('Google mailbox event version is unsupported');
  }

  const kind = decoded['kind'];
  if (kind === 'recovery_required') {
    exactKeys(decoded, [
      'kind',
      'version',
      'recovery_id',
      'occurred_at',
      'reason',
    ]);
    if (
      decoded['reason'] !== 'cursor_missing' &&
      decoded['reason'] !== 'history_expired'
    ) {
      throw new Error('Google mailbox recovery reason is invalid');
    }
    return {
      kind,
      version: 1,
      recoveryId: parseJobId(decoded['recovery_id']),
      occurredAt: parseOccurredAt(decoded['occurred_at']),
      reason: decoded['reason'],
    };
  }
  if (kind === 'recovery_completed') {
    exactKeys(decoded, ['kind', 'version', 'recovery_id', 'occurred_at']);
    return {
      kind,
      version: 1,
      recoveryId: parseJobId(decoded['recovery_id']),
      occurredAt: parseOccurredAt(decoded['occurred_at']),
    };
  }
  if (kind === 'message_unavailable') {
    exactKeys(decoded, [
      'kind',
      'version',
      'gmail_message_id',
      'occurred_at',
      'reason',
    ]);
    if (decoded['reason'] !== 'not_found') {
      throw new Error('Google mailbox unavailable reason is invalid');
    }
    return {
      kind,
      version: 1,
      gmailMessageId: parseGmailId(decoded['gmail_message_id']),
      occurredAt: parseOccurredAt(decoded['occurred_at']),
      reason: 'not_found',
    };
  }
  if (kind === 'seed') {
    exactKeys(decoded, [
      'kind',
      'version',
      'gmail_message_id',
      'rfc_message_id',
      'occurred_at',
      'from',
      'verification',
      'x_hashbrown_job_id',
    ]);
    if (decoded['verification'] !== 'gmail_auth_aligned') {
      throw new Error('Google mailbox seed verification is invalid');
    }
    return {
      kind,
      version: 1,
      gmailMessageId: parseGmailId(decoded['gmail_message_id']),
      rfcMessageId: parseMessageId('rfc_message_id', decoded['rfc_message_id']),
      occurredAt: parseOccurredAt(decoded['occurred_at']),
      from: parseEmail(decoded['from']),
      jobId: parseJobId(decoded['x_hashbrown_job_id']),
      verification: 'gmail_auth_aligned',
    };
  }
  if (kind === 'reply') {
    exactKeys(
      decoded,
      [
        'kind',
        'version',
        'gmail_message_id',
        'rfc_message_id',
        'occurred_at',
        'from',
      ],
      ['in_reply_to', 'references', 'subject_sha256'],
    );
    const inReplyTo =
      decoded['in_reply_to'] === undefined
        ? null
        : parseMessageId('in_reply_to', decoded['in_reply_to']);
    const references = parseReferences(decoded['references']);
    const subjectSha256 =
      decoded['subject_sha256'] === undefined
        ? null
        : parseDigest('subject_sha256', decoded['subject_sha256']);
    const from = parseEmail(decoded['from']);
    if (from === BRIAN_EMAIL || (!inReplyTo && references.length === 0)) {
      throw new Error('Google mailbox reply candidate is invalid');
    }
    return {
      kind,
      version: 1,
      gmailMessageId: parseGmailId(decoded['gmail_message_id']),
      rfcMessageId: parseMessageId('rfc_message_id', decoded['rfc_message_id']),
      occurredAt: parseOccurredAt(decoded['occurred_at']),
      from,
      inReplyTo,
      references,
      subjectSha256,
    };
  }
  throw new Error('Google mailbox event kind is unsupported');
}

function controlEventKey(event: GoogleMailboxControlEvent): string {
  if (event.kind === 'recovery_required') {
    return `google:recovery:${event.recoveryId}:required`;
  }
  if (event.kind === 'recovery_completed') {
    return `google:recovery:${event.recoveryId}:completed`;
  }
  return `google:gmail:${sha256Base64Url(event.gmailMessageId)}:unavailable`;
}

function controlEventData(
  event: GoogleMailboxControlEvent,
  requestDigest: string,
): Record<string, unknown> {
  if (event.kind === 'message_unavailable') {
    return {
      event_fingerprint: requestDigest,
      gmail_message_id: event.gmailMessageId,
      reason: event.reason,
    };
  }
  return {
    event_fingerprint: requestDigest,
    recovery_id: event.recoveryId,
    ...(event.kind === 'recovery_required' ? { reason: event.reason } : {}),
  };
}

async function processControlEvent(
  transaction: SqlTransaction,
  event: GoogleMailboxControlEvent,
  requestDigest: string,
): Promise<ProcessGoogleMailboxEventResult> {
  await transaction.execute(
    `/* growth:acquire-google-reconcile-advisory-lock */
     select pg_advisory_xact_lock(hashtextextended('google-mailbox-reconciliation', 0))`,
  );
  if (event.kind === 'recovery_completed') {
    const required = await transaction.execute<{ recovery_id: string }>(
      `/* growth:require-google-mailbox-recovery */
       select data->>'recovery_id' as recovery_id
       from growth_activity
       where event_key = $1
         and kind = 'mailbox.recovery_required'`,
      [`google:recovery:${event.recoveryId}:required`],
    );
    if (required.rows[0]?.recovery_id !== event.recoveryId) {
      domainError('reconcile_conflict');
    }
  }
  const eventKey = controlEventKey(event);
  const kind = `mailbox.${event.kind}`;
  const data = controlEventData(event, requestDigest);
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-google-mailbox-control-event */
     insert into growth_activity (event_key, kind, occurred_at, data)
     values ($1, $2, $3, $4::jsonb)
     on conflict (event_key) do nothing
     returning event_key`,
    [eventKey, kind, event.occurredAt, JSON.stringify(data)],
  );
  if (inserted.rows.length === 0) {
    const existing = await transaction.execute<ActivityRow>(
      `/* growth:read-google-mailbox-control-event */
       select event_key, kind, occurred_at, data
       from growth_activity
       where event_key = $1`,
      [eventKey],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.kind !== kind ||
      new Date(row.occurred_at).getTime() !== event.occurredAt.getTime() ||
      canonicalJson(row.data) !== canonicalJson(data)
    ) {
      domainError('reconcile_conflict');
    }
    return { applied: false, outcome: 'replay' };
  }
  return {
    applied: true,
    outcome:
      event.kind === 'recovery_required'
        ? 'recovery_paused'
        : event.kind === 'recovery_completed'
          ? 'recovery_completed'
          : 'message_unavailable_recorded',
  };
}

/**
 * Whether any `mailbox.recovery_required` lacks a matching
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

function gmailEventKey(gmailMessageId: string): string {
  return `google:gmail:${sha256Base64Url(gmailMessageId)}`;
}

function replyStopEventKey(gmailMessageId: string): string {
  return `google:reply:${sha256Base64Url(gmailMessageId)}:stop`;
}

function rejectionEventKey(
  eventReference: string,
  requestDigest: string,
): string {
  return `google:gmail:${sha256Base64Url(
    eventReference,
  )}:rejection:${requestDigest}`;
}

function validateMailboxReplay(
  row: ActivityRow | undefined,
  event: GoogleMailboxMessageEvent,
  requestDigest: string,
  data: Record<string, unknown>,
): void {
  if (
    !row ||
    row.event_key !== gmailEventKey(event.gmailMessageId) ||
    row.kind !== `mailbox.${event.kind}_received` ||
    new Date(row.occurred_at).getTime() !== event.occurredAt.getTime() ||
    canonicalJson(row.data) !== canonicalJson(data) ||
    row.data['event_fingerprint'] !== requestDigest
  ) {
    domainError('gmail_message_conflict');
  }
}

async function claimNonce(
  executor: Pick<SqlExecutor, 'execute'>,
  input: ProcessGoogleMailboxEventInput,
): Promise<void> {
  const nonceDigest = sha256Base64Url(input.nonce);
  const result = await executor.execute<{ event_key: string }>(
    `/* growth:claim-google-reply-nonce */
     insert into growth_activity (event_key, kind, occurred_at, data)
     values (
       $1,
       'mailbox.nonce_claimed',
       $2,
       jsonb_build_object(
         'request_digest', $3::text,
         'timestamp', $4::text
       )
     )
     on conflict (event_key) do nothing
     returning event_key`,
    [
      `google:nonce:${nonceDigest}`,
      input.receivedAt,
      input.requestDigest,
      input.timestamp,
    ],
  );
  if (result.rows.length === 0) throw new GoogleReplyReplayError();
}

function mailboxActivityData(
  event: GoogleMailboxMessageEvent,
  requestDigest: string,
): Record<string, unknown> {
  return {
    event_fingerprint: requestDigest,
    gmail_message_id: event.gmailMessageId,
  };
}

async function insertMailboxEventOnce(
  transaction: SqlTransaction,
  event: GoogleMailboxMessageEvent,
  requestDigest: string,
): Promise<boolean> {
  const eventKey = gmailEventKey(event.gmailMessageId);
  const data = mailboxActivityData(event, requestDigest);
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-google-mailbox-event */
     insert into growth_activity (event_key, kind, occurred_at, data)
     values ($1, $2, $3, $4::jsonb)
     on conflict (event_key) do nothing
     returning event_key`,
    [
      eventKey,
      `mailbox.${event.kind}_received`,
      event.occurredAt,
      JSON.stringify(data),
    ],
  );
  if (inserted.rows.length > 0) return true;
  const existing = await transaction.execute<ActivityRow>(
    `/* growth:read-google-mailbox-event */
     select event_key, contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  validateMailboxReplay(existing.rows[0], event, requestDigest, data);
  return false;
}

async function recordTerminalRejection(
  transaction: SqlTransaction,
  event: GoogleMailboxEvent,
  reason: GoogleMailboxRejectionReason,
  requestDigest: string,
): Promise<void> {
  const eventReference =
    'gmailMessageId' in event ? event.gmailMessageId : event.recoveryId;
  const eventKey = rejectionEventKey(eventReference, requestDigest);
  const data = {
    event_fingerprint: requestDigest,
    event_reference: eventReference,
    reason,
  };
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-google-mailbox-rejection */
     insert into growth_activity (event_key, kind, occurred_at, data)
     values ($1, 'mailbox.event_rejected', $2, $3::jsonb)
     on conflict (event_key) do nothing
     returning event_key`,
    [eventKey, event.occurredAt, JSON.stringify(data)],
  );
  if (inserted.rows.length > 0) return;
  const existing = await transaction.execute<ActivityRow>(
    `/* growth:read-google-mailbox-rejection */
     select event_key, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.kind !== 'mailbox.event_rejected' ||
    canonicalJson(row.data) !== canonicalJson(data)
  ) {
    domainError('reconcile_conflict');
  }
}

function assertSeedJob(
  job: SeedJobRow | undefined,
  event: GoogleSeedEvent,
): SeedJobRow {
  if (
    event.from !== BRIAN_EMAIL ||
    !job ||
    job.id !== event.jobId ||
    job.contact_id === null ||
    (job.kind !== 'send_step' && job.kind !== 'fulfill') ||
    job.status !== 'completed' ||
    !job.provider_email_id ||
    !ACCEPTED_BOUND_DELIVERY_STATUSES.has(job.delivery_status)
  ) {
    domainError('seed_job_invalid');
  }
  return job;
}

function assertSeedBindingCompatible(
  job: SeedJobRow,
  event: GoogleSeedEvent,
): void {
  if (
    (job.gmail_seed_message_id &&
      job.gmail_seed_message_id !== event.gmailMessageId) ||
    (job.rfc_message_id && job.rfc_message_id !== event.rfcMessageId)
  ) {
    domainError('seed_binding_conflict');
  }
}

function assertReplyJob(
  job: ReplyJobRow | undefined,
  expected: ReplyJobRow,
): ValidatedReplyJobRow {
  if (
    !job ||
    job.id !== expected.id ||
    !job.contact_id ||
    job.contact_id !== expected.contact_id ||
    !job.rfc_message_id ||
    job.rfc_message_id !== expected.rfc_message_id ||
    (job.kind !== 'send_step' && job.kind !== 'fulfill') ||
    job.status !== 'completed' ||
    !job.provider_email_id ||
    !ACCEPTED_BOUND_DELIVERY_STATUSES.has(job.delivery_status)
  ) {
    domainError('reply_binding_invalid');
  }
  return job as ValidatedReplyJobRow;
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
export function rankGoogleReplyCandidates(
  event: Pick<GoogleReplyEvent, 'inReplyTo' | 'references'>,
): RankedReplyCandidate[] {
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

async function processSeed(
  transaction: SqlTransaction,
  event: GoogleSeedEvent,
  dependencies: ProcessGoogleMailboxEventDependencies,
): Promise<'seed_registered' | 'ignored_deleted'> {
  if (event.from !== BRIAN_EMAIL) {
    domainError('seed_sender_invalid');
  }
  await transaction.execute(
    `/* growth:acquire-google-reconcile-advisory-lock */
     select pg_advisory_xact_lock(hashtextextended('google-mailbox-reconciliation', 0))`,
  );
  const discovered = await transaction.execute<{ contact_id: string | null }>(
    `/* growth:discover-google-seed-job */
     select contact_id
     from growth_jobs
     where id = $1`,
    [event.jobId],
  );
  const contactId = discovered.rows[0]?.contact_id;
  if (!contactId) domainError('seed_job_not_found');
  const contact = await transaction.execute<MailboxContactRow>(
    `/* growth:lock-google-seed-contact */
     select id, deleted_at
     from growth_contacts
     where id = $1
     for update`,
    [contactId],
  );
  if (!contact.rows[0]) domainError('seed_contact_not_found');
  const locked = await transaction.execute<SeedJobRow>(
    `/* growth:lock-google-seed-job */
     select id, kind, contact_id, status, provider_email_id, delivery_status,
            rfc_message_id, gmail_seed_message_id
     from growth_jobs
     where id = $1
     for update`,
    [event.jobId],
  );
  const job = assertSeedJob(locked.rows[0], event);
  if (job.contact_id !== contactId) domainError('seed_contact_conflict');
  assertSeedBindingCompatible(job, event);

  if (contact.rows[0].deleted_at !== null) {
    await transaction.execute<{ id: string }>(
      `/* growth:settle-google-reconcile-for-deleted-seed */
       update growth_jobs
       set status = 'cancelled',
           lease_until = null,
           lease_token = null,
           last_error_code = 'contact_deleted'
       where kind = 'reply_reconcile'
         and status in ('pending', 'leased')
         and (
           (
             payload->'ranked_candidates' is null
             and payload->>'in_reply_to' = $1
           )
           or exists (
             select 1
             from jsonb_array_elements(
               coalesce(payload->'ranked_candidates', '[]'::jsonb)
             ) candidate
             where candidate->>'message_id' = $1
               and candidate->>'rank' = '0'
           )
         )
       returning id`,
      [event.rfcMessageId],
    );
    return 'ignored_deleted';
  }

  const conflicts = await transaction.execute<{ id: string }>(
    `/* growth:check-google-seed-binding-conflicts */
     select id
     from growth_jobs
     where id <> $1
       and (gmail_seed_message_id = $2 or rfc_message_id = $3)
     limit 1`,
    [event.jobId, event.gmailMessageId, event.rfcMessageId],
  );
  if (conflicts.rows.length > 0) {
    domainError('seed_identifier_conflict');
  }
  if (!job.gmail_seed_message_id || !job.rfc_message_id) {
    const updated = await transaction.execute<{ id: string }>(
      `/* growth:bind-google-seed-identifiers */
       update growth_jobs
       set gmail_seed_message_id = $2,
           rfc_message_id = $3
       where id = $1
         and (gmail_seed_message_id is null or gmail_seed_message_id = $2)
         and (rfc_message_id is null or rfc_message_id = $3)
       returning id`,
      [event.jobId, event.gmailMessageId, event.rfcMessageId],
    );
    if (updated.rows.length !== 1) domainError('seed_binding_conflict');
  }

  await reconcileBoundMessage(transaction, event, contactId, dependencies);
  return 'seed_registered';
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
      if (error instanceof GoogleMailboxDomainError)
        throw new ProviderMessageIdBindingError(
          'Provider reply reconciliation conflict',
        );
      throw error;
    }
    return 'bound';
  });
}

async function findReplyJob(
  transaction: SqlTransaction,
  event: GoogleReplyEvent,
): Promise<RankedReplyJob | null> {
  const candidates = rankGoogleReplyCandidates(event);
  for (const candidate of candidates) {
    const found = await transaction.execute<ReplyJobRow>(
      `/* growth:find-google-reply-job-by-rfc */
       select id, kind, contact_id, status, provider_email_id,
              delivery_status, rfc_message_id
       from growth_jobs
       where rfc_message_id = $1
       limit 1`,
      [candidate.message_id],
    );
    if (found.rows[0]) return { job: found.rows[0], rank: candidate.rank };
  }
  return null;
}

function replyReconcilePayload(
  event: GoogleReplyEvent,
  resolvedJob: ValidatedReplyJobRow | null = null,
): Record<string, unknown> {
  const rankedCandidates = rankGoogleReplyCandidates(event);
  const resolvedCandidate = resolvedJob
    ? rankedCandidates.find(
        (candidate) => candidate.message_id === resolvedJob.rfc_message_id,
      )
    : null;
  if (resolvedJob && !resolvedCandidate) {
    domainError('reply_binding_invalid');
  }
  return {
    schema_version: 1,
    gmail_message_id: event.gmailMessageId,
    rfc_message_id: event.rfcMessageId,
    occurred_at: event.occurredAt.toISOString(),
    in_reply_to: event.inReplyTo,
    references: event.references,
    subject_sha256: event.subjectSha256,
    ranked_candidates: rankedCandidates,
    resolved_candidates:
      resolvedJob && resolvedCandidate
        ? [
            {
              ...resolvedCandidate,
              contact_id: resolvedJob.contact_id,
              seed_job_id: resolvedJob.id,
            },
          ]
        : [],
    settle_after: new Date(
      event.occurredAt.getTime() + MAX_CLOCK_SKEW_MS,
    ).toISOString(),
    retry_policy: {
      max_attempts: 5,
      backoff: 'bounded_exponential',
      terminal_state: 'founder_review',
    },
  };
}

/**
 * Subject fallback for a reply whose In-Reply-To/References match no bound
 * Message-ID yet: the sender must be a live contact with a completed send
 * still waiting for its Message-ID (`rfc_message_id is null`) whose recorded
 * subject digest equals the reply's. Stopping is the safe direction, so the
 * contact is stopped at once instead of waiting for the binding.
 */
async function stopBySubjectFallback(
  transaction: SqlTransaction,
  event: GoogleReplyEvent,
  subjectSha256: string,
  dependencies: ProcessGoogleMailboxEventDependencies,
): Promise<'reply_stopped' | 'ignored_deleted' | null> {
  const candidate = await transaction.execute<{ contact_id: string }>(
    `/* growth:find-google-reply-subject-fallback */
     select contact.id as contact_id
     from growth_contacts contact
     join growth_jobs job on job.contact_id = contact.id
     where contact.email_normalized = $1
       and contact.deleted_at is null
       and job.kind in ('fulfill', 'send_step')
       and job.status = 'completed'
       and job.provider_email_id is not null
       and job.rfc_message_id is null
       and job.delivery_status = any($3::text[])
       and job.payload->>'subject_sha256' = $2
     order by job.updated_at desc, job.id
     limit 1`,
    [event.from, subjectSha256, [...ACCEPTED_BOUND_DELIVERY_STATUSES]],
  );
  const contactId = candidate.rows[0]?.contact_id;
  if (!contactId) return null;
  const contact = await transaction.execute<MailboxContactRow>(
    `/* growth:lock-google-reply-contact */
     select id, deleted_at
     from growth_contacts
     where id = $1
     for update`,
    [contactId],
  );
  if (!contact.rows[0]) domainError('reply_contact_not_found');
  if (contact.rows[0].deleted_at !== null) return 'ignored_deleted';
  await stopForReply(
    transaction,
    dependencies,
    contactId,
    event.gmailMessageId,
    event.occurredAt,
  );
  return 'reply_stopped';
}

async function processReply(
  transaction: SqlTransaction,
  event: GoogleReplyEvent,
  dependencies: ProcessGoogleMailboxEventDependencies,
): Promise<'reply_stopped' | 'reconcile_queued' | 'ignored_deleted'> {
  await transaction.execute(
    `/* growth:acquire-google-reconcile-advisory-lock */
     select pg_advisory_xact_lock(hashtextextended('google-mailbox-reconciliation', 0))`,
  );
  const match = await findReplyJob(transaction, event);
  const found = match?.job ?? null;
  const recoveryPaused = await isGoogleMailboxRecoveryPaused(
    nestedExecutor(transaction),
  );
  if (!match && !recoveryPaused && event.subjectSha256 !== null) {
    const fallback = await stopBySubjectFallback(
      transaction,
      event,
      event.subjectSha256,
      dependencies,
    );
    if (fallback) return fallback;
  }
  if (!match || !found || recoveryPaused || match.rank > 0) {
    const recoveryMatch = found ? assertReplyJob(found, found) : null;
    const payload = replyReconcilePayload(event, recoveryMatch);
    const inserted = await transaction.execute<{ id: string }>(
      `/* growth:insert-google-reply-reconcile-job */
       insert into growth_jobs (
         kind, status, available_at, idempotency_key, payload
       ) values (
         'reply_reconcile', 'pending', $2, $1, $3::jsonb
       )
       on conflict (idempotency_key) do nothing
       returning id`,
      [
        `reply_reconcile:gmail:${event.gmailMessageId}`,
        new Date(event.occurredAt.getTime() + GOOGLE_REPLY_RECONCILE_DELAY_MS),
        JSON.stringify(payload),
      ],
    );
    if (inserted.rows.length === 0) {
      const existing = await transaction.execute<ReconcileJobRow>(
        `/* growth:read-google-reply-reconcile-job */
         select id, contact_id, status, payload
         from growth_jobs
         where idempotency_key = $1`,
        [`reply_reconcile:gmail:${event.gmailMessageId}`],
      );
      if (
        !existing.rows[0] ||
        canonicalJson(existing.rows[0].payload) !== canonicalJson(payload)
      ) {
        domainError('reconcile_conflict');
      }
    }
    return 'reconcile_queued';
  }
  if (!found.contact_id || !found.rfc_message_id) {
    domainError('reply_binding_invalid');
  }
  const contact = await transaction.execute<MailboxContactRow>(
    `/* growth:lock-google-reply-contact */
     select id, deleted_at
     from growth_contacts
     where id = $1
     for update`,
    [found.contact_id],
  );
  if (!contact.rows[0]) domainError('reply_contact_not_found');
  const locked = await transaction.execute<ReplyJobRow>(
    `/* growth:lock-google-reply-job */
     select id, kind, contact_id, status, provider_email_id,
            delivery_status, rfc_message_id
     from growth_jobs
     where id = $1
     for update`,
    [found.id],
  );
  assertReplyJob(locked.rows[0], found);
  if (contact.rows[0].deleted_at !== null) return 'ignored_deleted';
  if (await isGoogleMailboxRecoveryPaused(nestedExecutor(transaction))) {
    const payload = replyReconcilePayload(event, assertReplyJob(found, found));
    const queued = await transaction.execute<{ id: string }>(
      `/* growth:insert-google-reply-reconcile-job */
       insert into growth_jobs (
         kind, status, available_at, idempotency_key, payload
       ) values ('reply_reconcile', 'pending', $2, $1, $3::jsonb)
       on conflict (idempotency_key) do nothing
       returning id`,
      [
        `reply_reconcile:gmail:${event.gmailMessageId}`,
        new Date(event.occurredAt.getTime() + GOOGLE_REPLY_RECONCILE_DELAY_MS),
        JSON.stringify(payload),
      ],
    );
    if (queued.rows.length !== 1) domainError('reconcile_conflict');
    return 'reconcile_queued';
  }
  await stopForReply(
    transaction,
    dependencies,
    found.contact_id,
    event.gmailMessageId,
    event.occurredAt,
  );
  return 'reply_stopped';
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

/**
 * Applies one verified mailbox event. The nonce is claimed first, in its own
 * statement, so a failed transaction cannot make an envelope reusable. Seeds
 * bind Message-IDs; replies matched by In-Reply-To stop the contact; a reply
 * from a contact whose last send is still waiting for its Message-ID is
 * matched by its subject digest instead; anything else queues a
 * `reply_reconcile` five minutes out. Domain conflicts are recorded as
 * `mailbox.event_rejected` and answered as `rejected_terminal`.
 *
 * @throws {GoogleReplyReplayError} When the nonce was already used.
 */
export async function processGoogleMailboxEvent(
  executor: SqlExecutor,
  input: ProcessGoogleMailboxEventInput,
  dependencies: ProcessGoogleMailboxEventDependencies = {
    stopContact: canonicalStopContact,
  },
): Promise<ProcessGoogleMailboxEventResult> {
  validDate('receivedAt', input.receivedAt);
  strictTimestamp(input.timestamp);
  if (!NONCE_PATTERN.test(input.nonce))
    throw new Error('Google reply nonce is invalid');
  if (!DIGEST_PATTERN.test(input.requestDigest)) {
    throw new Error('Google reply request digest is invalid');
  }
  // This insert intentionally commits before the domain transaction. A failed
  // transaction cannot make an authenticated envelope reusable.
  await claimNonce(executor, input);
  try {
    return await executor.transaction(async (transaction) => {
      if (
        input.event.kind === 'recovery_required' ||
        input.event.kind === 'recovery_completed' ||
        input.event.kind === 'message_unavailable'
      ) {
        return await processControlEvent(
          transaction,
          input.event,
          input.requestDigest,
        );
      }
      const inserted = await insertMailboxEventOnce(
        transaction,
        input.event,
        input.requestDigest,
      );
      if (!inserted) {
        // The overlapping poller intentionally replays seeds. Re-running the
        // idempotent binding/reconciliation closes the race where an unmatched
        // reply commits immediately after the seed's first reconciliation scan.
        if (input.event.kind === 'seed') {
          await processSeed(transaction, input.event, dependencies);
        }
        return { applied: false, outcome: 'replay' };
      }
      if (input.event.kind === 'seed') {
        const outcome = await processSeed(
          transaction,
          input.event,
          dependencies,
        );
        return { applied: true, outcome };
      }
      const outcome = await processReply(
        transaction,
        input.event,
        dependencies,
      );
      return { applied: true, outcome };
    });
  } catch (error) {
    if (!(error instanceof GoogleMailboxDomainError)) throw error;
    await executor.transaction(async (transaction) => {
      if (input.event.kind === 'seed' || input.event.kind === 'reply') {
        try {
          await insertMailboxEventOnce(
            transaction,
            input.event,
            input.requestDigest,
          );
        } catch (envelopeError) {
          if (
            !(envelopeError instanceof GoogleMailboxDomainError) ||
            envelopeError.reason !== 'gmail_message_conflict'
          ) {
            throw envelopeError;
          }
        }
      }
      await recordTerminalRejection(
        transaction,
        input.event,
        error.reason,
        input.requestDigest,
      );
    });
    return {
      applied: true,
      outcome: 'rejected_terminal',
      rejectionReason: error.reason,
    };
  }
}
