import type { SqlExecutor } from './database.ts';
import { INBOX_REPLY_ADDRESS, loadInboxPilot } from './inbox-replies.ts';
import type { ErrorResponse } from 'resend';
import {
  authorizeLeasedJobForSubmission,
  markProviderAcceptanceUnknown,
  markProviderRejection,
  recordProviderAcceptance,
} from './jobs.ts';
import {
  type UnsubscribeActionUrl,
  unsubscribeActionUrlValue,
  unsubscribeActionUrlValueForContact,
} from './tokens.ts';
import { normalizeRecipientEmail } from './crypto.ts';
import { assertPlainHtml } from './email-html.ts';
import {
  bindProviderMessageId,
  ProviderMessageIdBindingError,
  replySubjectSha256,
} from './provider-message-ids.ts';
import {
  completeProviderAttempt,
  providerIdempotencyKey,
  reserveProviderAttempt,
} from './provider-attempts.ts';

/** The only sender recipient mail may use; replies go back to it as well. */
export const RECIPIENT_EMAIL_SENDER =
  'Brian at Hashbrown <brian@hashbrown.dev>';

/** The Resend domain the sender must be verified on. */
export const VERIFIED_DOMAIN = 'hashbrown.dev';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const RECIPIENT_JOB_KINDS = new Set(['fulfill', 'send_step']);
const AMBIGUOUS_PROVIDER_ERROR_NAMES = new Set([
  'concurrent_idempotent_requests',
  'invalid_idempotent_request',
]);
const AMBIGUOUS_PROVIDER_STATUSES = new Set([408, 409, 425, 429]);

/**
 * Classifies a Resend error response. A missing status, a 5xx, 408, 409, 425,
 * 429, or an idempotency-conflict name means the provider may have accepted
 * the message, so the outcome is `unknown`; anything else is `rejected`.
 *
 * @param error - The Resend error's name and status code.
 */
export function classifyResendProviderError(
  error: Pick<ErrorResponse, 'name' | 'statusCode'>,
): 'rejected' | 'unknown' {
  return error.statusCode === null ||
    error.statusCode >= 500 ||
    AMBIGUOUS_PROVIDER_STATUSES.has(error.statusCode) ||
    AMBIGUOUS_PROVIDER_ERROR_NAMES.has(error.name)
    ? 'unknown'
    : 'rejected';
}

/** The environment a send, and the database that records it, belongs to. */
export type DeliveryEnvironment = 'production' | 'preview' | 'test';

/**
 * The deployment configuration a recipient send is checked against; see
 * {@link assertRecipientDeliveryPolicy}.
 */
export interface RecipientDeliveryPolicy {
  campaignEnabled: boolean;
  deliveryEnabled: boolean;
  environment: DeliveryEnvironment;
  databaseEnvironment: DeliveryEnvironment;
  senderVerified: boolean;
  verifiedDomain: string;
  configuredSender: string;
  providerTrackingDisabled: boolean;
  nonProductionRecipientAllowlist: readonly string[];
  nonProductionRedirectTo?: string;
}

/**
 * The closed set of campaign template ids a send_step may be attributed to.
 * Provider tags are the only per-template signal webhooks and reply handling
 * can see, so every value here is a fixed identifier and never contact data.
 */
export const CAMPAIGN_TEMPLATE_IDS = ['immediate', 'day-3', 'day-8'] as const;
/** One of {@link CAMPAIGN_TEMPLATE_IDS}. */
export type CampaignTemplateId = (typeof CAMPAIGN_TEMPLATE_IDS)[number];
const CAMPAIGN_TEMPLATE_ID_SET: ReadonlySet<string> = new Set(
  CAMPAIGN_TEMPLATE_IDS,
);

/** Whether `value` is one of {@link CAMPAIGN_TEMPLATE_IDS}. */
export function isCampaignTemplateId(
  value: unknown,
): value is CampaignTemplateId {
  return typeof value === 'string' && CAMPAIGN_TEMPLATE_ID_SET.has(value);
}

/** What a caller asks {@link sendRecipientEmail} to submit for one leased job. */
export interface RecipientEmailInput {
  jobId: string;
  leaseToken: string;
  subject: string;
  text: string;
  /**
   * Which campaign template rendered this message. Required for send_step
   * jobs and forbidden otherwise; it is emitted as the bounded
   * `campaign_template` provider tag.
   */
  campaignTemplate?: CampaignTemplateId;
  /**
   * Optional HTML alternative for the same message. It must stay a plain
   * rendering of the text part: paragraphs and HTTPS anchors only, no images,
   * scripts, styles, forms, or event handlers, and it must carry the same
   * unsubscribe link as the text part.
   */
  html?: string;
  unsubscribeUrl: UnsubscribeActionUrl;
  signal?: AbortSignal;
}

type ResendResponse =
  { data: { id: string }; error: null } | { data: null; error: ErrorResponse };

/** The exact payload {@link sendRecipientEmail} hands to Resend. */
export interface RecipientEmailProviderPayload {
  from: typeof RECIPIENT_EMAIL_SENDER;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
  headers: {
    'List-Unsubscribe': string;
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click';
    'X-Hashbrown-Job-ID': string;
  };
  tags: { name: string; value: string }[];
}

/** The slice of the Resend client recipient sends use; injected for tests. */
export interface RecipientResendClient {
  emails: {
    send(
      payload: RecipientEmailProviderPayload,
      options: { idempotencyKey: string },
    ): Promise<ResendResponse>;
  };
}

/** Collaborators of {@link sendRecipientEmail}, injected for tests. */
export interface RecipientSendDependencies {
  now: () => Date;
  /** Whether `now` is inside the campaign send window; defaults to always. */
  isSendWindow?: (now: Date) => boolean;
  resend: RecipientResendClient;
  authorizeLeasedJobForSubmission: typeof authorizeLeasedJobForSubmission;
  recordProviderAcceptance: typeof recordProviderAcceptance;
  markProviderAcceptanceUnknown: typeof markProviderAcceptanceUnknown;
  markProviderRejection: typeof markProviderRejection;
  /** Reserves immutable payload evidence and enforces the provider retry horizon. */
  reserveProviderAttempt?: typeof reserveProviderAttempt;
  /** Persists known acceptance before the job's acceptance is recorded. */
  completeProviderAttempt?: typeof completeProviderAttempt;
}

/** Whether Resend accepted the message, or why it was not sent. */
export type RecipientSendResult =
  | { accepted: true; providerEmailId: string }
  | {
      accepted: false;
      reason:
        | 'contact_deleted'
        | 'contact_stopped'
        | 'contact_unapproved'
        | 'campaign_disabled'
        | 'delivery_disabled'
        | 'outside_send_window'
        | 'mailbox_recovery_required'
        | 'reply_binding_pending'
        | 'pilot_recipient_not_allowlisted'
        | 'provider_rejected'
        | 'provider_outcome_unknown';
    };

function requiredBoundedText(
  field: string,
  value: string,
  maximum: number,
  allowNewlines = false,
): string {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    (!allowNewlines && /[\r\n]/u.test(normalized)) ||
    /\0/u.test(normalized)
  ) {
    throw new Error(
      `${field} must contain between 1 and ${maximum} safe characters`,
    );
  }
  return normalized;
}

function validEmail(field: string, value: string): string {
  try {
    return normalizeRecipientEmail(value);
  } catch {
    throw new Error(`${field} must be a valid email address`);
  }
}

function validUuid(field: string, value: string): string {
  const normalized = requiredBoundedText(field, value, 36).toLowerCase();
  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error(`${field} must be a UUID v4`);
  }
  return normalized;
}

function opaqueIdentifier(
  field: string,
  value: string,
  maximum: number,
): string {
  const normalized = requiredBoundedText(field, value, maximum);
  if (!OPAQUE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`${field} must be an opaque identifier`);
  }
  return normalized;
}

/**
 * Checks the delivery configuration before any send: a verified exact sender
 * on {@link VERIFIED_DOMAIN}, provider tracking disabled, matching delivery
 * and database environments, and, outside production, a non-empty recipient
 * allowlist that includes any redirect address.
 *
 * @param policy - The deployment's delivery configuration.
 * @throws When the configuration is not safe to send under.
 */
export function assertRecipientDeliveryPolicy(
  policy: RecipientDeliveryPolicy,
): void {
  if (typeof policy.campaignEnabled !== 'boolean') {
    throw new Error('campaignEnabled must be a boolean');
  }
  if (typeof policy.deliveryEnabled !== 'boolean') {
    throw new Error('deliveryEnabled must be a boolean');
  }
  if (
    !['production', 'preview', 'test'].includes(policy.environment) ||
    !['production', 'preview', 'test'].includes(policy.databaseEnvironment)
  ) {
    throw new Error('A registered delivery environment is required');
  }
  if (
    !policy.senderVerified ||
    policy.verifiedDomain !== VERIFIED_DOMAIN ||
    policy.configuredSender !== RECIPIENT_EMAIL_SENDER ||
    !policy.providerTrackingDisabled
  ) {
    throw new Error(
      'Exact verified Hashbrown sender configuration is required',
    );
  }
  if (policy.databaseEnvironment !== policy.environment) {
    throw new Error('Delivery environment must match the database environment');
  }
  if (policy.environment === 'production') return;
  if (policy.nonProductionRecipientAllowlist.length === 0) {
    throw new Error('A non-production recipient allowlist is required');
  }
  const allowlist = new Set(
    policy.nonProductionRecipientAllowlist.map((email) =>
      validEmail('nonProductionRecipientAllowlist', email),
    ),
  );
  if (policy.nonProductionRedirectTo !== undefined) {
    const redirect = validEmail(
      'nonProductionRedirectTo',
      policy.nonProductionRedirectTo,
    );
    if (!allowlist.has(redirect)) {
      throw new Error('Non-production recipient is not allowlisted');
    }
  }
}

function effectiveRecipient(
  recipient: string,
  policy: RecipientDeliveryPolicy,
): string {
  if (policy.environment === 'production') return recipient;
  const allowlist = new Set(
    policy.nonProductionRecipientAllowlist.map((email) =>
      validEmail('nonProductionRecipientAllowlist', email),
    ),
  );
  const redirected = policy.nonProductionRedirectTo
    ? validEmail('nonProductionRedirectTo', policy.nonProductionRedirectTo)
    : recipient;
  if (!allowlist.has(redirected)) {
    throw new Error('Non-production recipient is not allowlisted');
  }
  return redirected;
}

function campaignTags(
  environment: DeliveryEnvironment,
  kind: string,
  payload: Record<string, unknown>,
  campaignTemplate: unknown,
): { name: string; value: string }[] {
  const tags = [
    { name: 'app', value: 'hashbrown' },
    { name: 'environment', value: environment },
    { name: 'job_kind', value: kind },
  ];
  if (kind !== 'send_step') {
    if (campaignTemplate !== undefined) {
      throw new Error('Only send_step carries a campaign template');
    }
    return tags;
  }
  const campaignVersion = payload['campaign_version'];
  const step = payload['step'];
  if (campaignVersion !== 'v1' || (step !== 1 && step !== 2 && step !== 3)) {
    throw new Error(
      'send_step requires a registered campaign version and step',
    );
  }
  if (!isCampaignTemplateId(campaignTemplate)) {
    throw new Error('send_step requires a registered campaign template');
  }
  tags.push(
    { name: 'campaign_version', value: campaignVersion },
    { name: 'campaign_step', value: String(step) },
    { name: 'campaign_template', value: campaignTemplate },
  );
  return tags;
}

/**
 * Submits one leased `fulfill` or `send_step` job to Resend. The job is
 * authorized for submission first; the send carries one-click unsubscribe
 * headers, bounded tags, and an environment-scoped idempotency key. An immutable
 * payload reservation limits retries to the provider deduplication horizon.
 * Acceptance, rejection
 * (`resend_<name>`), and ambiguous outcomes
 * (`resend_submission_outcome_unknown`) are recorded against the job.
 *
 * @param executor - The growth database executor.
 * @param input - The leased job and the message to send.
 * @param policy - The deployment's delivery configuration.
 * @param dependencies - The Resend client, clock, and job recorders.
 * @throws When the input, policy, or authorized job is invalid.
 */
export async function sendRecipientEmail(
  executor: SqlExecutor,
  input: RecipientEmailInput,
  policy: RecipientDeliveryPolicy,
  dependencies: RecipientSendDependencies,
): Promise<RecipientSendResult> {
  input.signal?.throwIfAborted();
  assertRecipientDeliveryPolicy(policy);
  const jobId = validUuid('jobId', input.jobId);
  const leaseToken = validUuid('leaseToken', input.leaseToken);
  const subject = requiredBoundedText('subject', input.subject, 200);
  const text = requiredBoundedText('text', input.text, 20_000, true);
  const html =
    input.html === undefined
      ? undefined
      : assertPlainHtml(
          input.html,
          unsubscribeActionUrlValue(input.unsubscribeUrl),
        );
  const isSendWindow = dependencies.isSendWindow ?? (() => true);
  const authorizedAt = dependencies.now();
  const pilot = loadInboxPilot();
  const pilotAllowlist = (
    process.env['RESEND_INBOX_PILOT_RECIPIENT_ALLOWLIST'] ?? ''
  )
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const allowAllPilotRecipients =
    process.env['RESEND_INBOX_PILOT_ALLOW_ALL_RECIPIENTS'] === 'true';
  if (Number.isNaN(authorizedAt.getTime()))
    throw new Error('now must be valid');

  const authorization = await dependencies.authorizeLeasedJobForSubmission(
    executor,
    {
      campaignEnabled: policy.campaignEnabled,
      deliveryEnabled: policy.deliveryEnabled,
      ...(pilot.enabled
        ? {
            requireInboxPilot: true,
            ...(allowAllPilotRecipients
              ? {}
              : { canaryRecipientAllowlist: pilotAllowlist }),
          }
        : {}),
      jobId,
      leaseToken,
      now: authorizedAt,
      currentTime: dependencies.now,
      isSendWindow,
    },
  );
  if (!authorization.authorized) {
    return { accepted: false, reason: authorization.reason };
  }
  input.signal?.throwIfAborted();
  const job = authorization.job;
  if (job.id !== jobId || job.leaseToken !== leaseToken) {
    throw new Error('Final send authorization returned a different job lease');
  }
  if (
    authorization.recipient.contactId !== job.contactId ||
    typeof authorization.recipient.emailNormalized !== 'string'
  ) {
    throw new Error('Final send authorization returned a different recipient');
  }
  const recipient = validEmail(
    'authorized recipient',
    authorization.recipient.emailNormalized,
  );
  if (recipient !== authorization.recipient.emailNormalized) {
    throw new Error(
      'Final send authorization returned a noncanonical recipient',
    );
  }
  const unsubscribeUrl = unsubscribeActionUrlValueForContact(
    input.unsubscribeUrl,
    authorization.recipient.contactId,
  );
  const to = effectiveRecipient(recipient, policy);
  if (pilot.enabled && !allowAllPilotRecipients) {
    if (!pilotAllowlist.includes(to))
      throw new Error('Recipient is outside the pilot canary allowlist');
  }
  if (!RECIPIENT_JOB_KINDS.has(job.kind)) {
    throw new Error(`Unsupported recipient job kind: ${job.kind}`);
  }
  const sourceIdempotencyKey = opaqueIdentifier(
    'job.idempotencyKey',
    job.idempotencyKey,
    256,
  );
  const idempotencyKey = providerIdempotencyKey(
    policy.environment,
    sourceIdempotencyKey,
  );
  const tags = campaignTags(
    policy.environment,
    job.kind,
    job.payload,
    input.campaignTemplate,
  );

  input.signal?.throwIfAborted();
  let response: ResendResponse;
  if (job.kind === 'send_step' && !isSendWindow(dependencies.now())) {
    return { accepted: false, reason: 'outside_send_window' };
  }
  const providerPayload: RecipientEmailProviderPayload = {
    from: RECIPIENT_EMAIL_SENDER,
    to,
    replyTo: pilot.enabled ? INBOX_REPLY_ADDRESS : RECIPIENT_EMAIL_SENDER,
    subject,
    text,
    ...(html === undefined ? {} : { html }),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Hashbrown-Job-ID': jobId,
    },
    tags,
  };
  const knownProviderId = await (
    dependencies.reserveProviderAttempt ?? reserveProviderAttempt
  )(executor, idempotencyKey, providerPayload, dependencies.now());
  input.signal?.throwIfAborted();
  if (
    knownProviderId === null &&
    job.kind === 'send_step' &&
    !isSendWindow(dependencies.now())
  ) {
    return { accepted: false, reason: 'outside_send_window' };
  }
  try {
    response =
      knownProviderId === null
        ? await dependencies.resend.emails.send(providerPayload, {
            idempotencyKey,
          })
        : { data: { id: knownProviderId }, error: null };
  } catch {
    const occurredAt = dependencies.now();
    await dependencies.markProviderAcceptanceUnknown(executor, {
      jobId,
      leaseToken,
      occurredAt: Number.isNaN(occurredAt.getTime())
        ? authorizedAt
        : occurredAt,
      errorCode: 'resend_submission_outcome_unknown',
    });
    return { accepted: false, reason: 'provider_outcome_unknown' };
  }

  if (response.error !== null) {
    if (classifyResendProviderError(response.error) === 'unknown') {
      const occurredAt = dependencies.now();
      await dependencies.markProviderAcceptanceUnknown(executor, {
        jobId,
        leaseToken,
        occurredAt: Number.isNaN(occurredAt.getTime())
          ? authorizedAt
          : occurredAt,
        errorCode: 'resend_submission_outcome_unknown',
      });
      return { accepted: false, reason: 'provider_outcome_unknown' };
    }
    const occurredAt = dependencies.now();
    const providerErrorName = /^[a-z0-9_]{1,80}$/u.test(response.error.name)
      ? response.error.name
      : 'provider_rejected';
    await dependencies.markProviderRejection(executor, {
      errorCode: `resend_${providerErrorName}`,
      jobId,
      leaseToken,
      occurredAt: Number.isNaN(occurredAt.getTime())
        ? authorizedAt
        : occurredAt,
    });
    return { accepted: false, reason: 'provider_rejected' };
  }
  let providerEmailId: string;
  try {
    providerEmailId = opaqueIdentifier(
      'providerEmailId',
      response.data.id,
      256,
    );
  } catch {
    const occurredAt = dependencies.now();
    await dependencies.markProviderAcceptanceUnknown(executor, {
      jobId,
      leaseToken,
      occurredAt: Number.isNaN(occurredAt.getTime())
        ? authorizedAt
        : occurredAt,
      errorCode: 'resend_submission_outcome_unknown',
    });
    return { accepted: false, reason: 'provider_outcome_unknown' };
  }
  const acceptedAt = dependencies.now();
  if (Number.isNaN(acceptedAt.getTime())) {
    await dependencies.markProviderAcceptanceUnknown(executor, {
      jobId,
      leaseToken,
      occurredAt: authorizedAt,
      errorCode: 'resend_submission_outcome_unknown',
    });
    return { accepted: false, reason: 'provider_outcome_unknown' };
  }
  await (dependencies.completeProviderAttempt ?? completeProviderAttempt)(
    executor,
    idempotencyKey,
    providerEmailId,
  );
  await dependencies.recordProviderAcceptance(executor, {
    jobId,
    leaseToken,
    acceptedAt,
    providerEmailId,
    subjectSha256: replySubjectSha256(subject),
  });
  return { accepted: true, providerEmailId };
}

/** How many accepted sends one reconciliation pass looks up. */
export const RESEND_MESSAGE_ID_LOOKUP_BATCH = 5;
const RESEND_LOOKUP_TIMEOUT_MS = 5_000;
const RESEND_LOOKUP_MAX_BYTES = 128 * 1_024;
const DELIVERY_ENVIRONMENTS: readonly string[] = [
  'production',
  'preview',
  'test',
];

/**
 * Collaborators of {@link reconcilePendingResendMessageIds}. `env` supplies
 * `RESEND_INBOX_READ_API_KEY`, `DELIVERY_ENVIRONMENT` and
 * `GROWTH_DATABASE_ENVIRONMENT`;
 * `bindProviderMessageId` is injectable for tests.
 */
export interface ResendMessageIdReconciliationDependencies {
  fetch: typeof globalThis.fetch;
  env: Readonly<Record<string, string | undefined>>;
  bindProviderMessageId?: typeof bindProviderMessageId;
}

/** What one reconciliation pass did: looked up, bound, and left for a later retry. */
export interface ResendMessageIdReconciliationResult {
  claimed: number;
  bound: number;
  deferred: number;
}

async function boundedProviderResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) {
    throw new Error('Provider lookup unavailable');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RESEND_LOOKUP_MAX_BYTES) {
        throw new Error('Provider lookup exceeds limit');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid provider lookup');
  }
  return value as Record<string, unknown>;
}

function environmentTags(tags: unknown): unknown[] {
  if (Array.isArray(tags)) {
    return tags
      .filter(
        (tag): tag is { name: unknown; value: unknown } =>
          tag !== null &&
          typeof tag === 'object' &&
          (tag as { name?: unknown }).name === 'environment',
      )
      .map((tag) => tag.value);
  }
  if (tags && typeof tags === 'object') {
    return [(tags as Record<string, unknown>)['environment']];
  }
  return [];
}

/**
 * Binds the RFC Message-ID of accepted sends that do not have one yet, so a
 * reply's In-Reply-To can be matched and the next step can lease. Each pass
 * durably reserves at most {@link RESEND_MESSAGE_ID_LOOKUP_BATCH} completed
 * `fulfill`/`send_step` jobs of live contacts (`for update skip locked`),
 * pushing each one's next lookup out by `min(60, 2^min(6, attempts))`
 * minutes before any network I/O, then reads
 * `GET https://api.resend.com/emails/:id` with a 5 s timeout and a 128 KiB
 * response cap. A response for another id, without a Message-ID, or tagged
 * with another environment is ignored and retried later; binding conflicts
 * are deferred, and database errors propagate. This path only reads from
 * Resend and never sends.
 *
 * Without `RESEND_INBOX_READ_API_KEY`, `DELIVERY_ENVIRONMENT` and
 * `GROWTH_DATABASE_ENVIRONMENT` it does nothing, since the final send gate
 * still waits for every binding.
 *
 * @throws When the environments are unregistered or differ, or a database
 *   or abort error occurs.
 */
export async function reconcilePendingResendMessageIds(
  executor: SqlExecutor,
  input: { now: Date; signal: AbortSignal },
  dependencies: ResendMessageIdReconciliationDependencies = {
    fetch: globalThis.fetch,
    env: process.env,
  },
): Promise<ResendMessageIdReconciliationResult> {
  input.signal.throwIfAborted();
  const apiKey = dependencies.env['RESEND_INBOX_READ_API_KEY']?.trim() ?? '';
  const environment = dependencies.env['DELIVERY_ENVIRONMENT']?.trim() ?? '';
  const databaseEnvironment =
    dependencies.env['GROWTH_DATABASE_ENVIRONMENT']?.trim() ?? '';
  if (!apiKey || !environment || !databaseEnvironment) {
    return { claimed: 0, bound: 0, deferred: 0 };
  }
  if (
    !DELIVERY_ENVIRONMENTS.includes(environment) ||
    environment !== databaseEnvironment ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) {
    throw new Error(
      'Provider lookup requires matching environments and credentials',
    );
  }
  const bind = dependencies.bindProviderMessageId ?? bindProviderMessageId;
  // Reserve retries atomically before network I/O, including process crashes.
  // A missing ID never reopens a completed send or changes its idempotency key.
  const claimed = await executor.execute<{ provider_email_id: string }>(
    `/* growth:claim-provider-message-lookups */
     with due as (
       select job.id from growth_jobs job
       join growth_contacts contact on contact.id = job.contact_id
       where job.kind in ('fulfill', 'send_step') and job.status = 'completed'
         and job.provider_email_id is not null and job.rfc_message_id is null
         and contact.deleted_at is null
         and coalesce((job.payload->>'message_id_lookup_after')::timestamptz, job.updated_at) <= $1
       order by coalesce((job.payload->>'message_id_lookup_after')::timestamptz, job.updated_at), job.id
       limit ${RESEND_MESSAGE_ID_LOOKUP_BATCH} for update of job skip locked
     )
     update growth_jobs job set payload = job.payload || jsonb_build_object(
       'message_id_lookup_attempts', least(16, coalesce((job.payload->>'message_id_lookup_attempts')::int, 0) + 1),
       'message_id_lookup_after', $1::timestamptz + make_interval(mins => least(60, power(2,
         least(6, coalesce((job.payload->>'message_id_lookup_attempts')::int, 0) + 1))::int))
     ) from due where job.id = due.id returning job.provider_email_id`,
    [input.now],
  );
  let bound = 0;
  for (const row of claimed.rows) {
    input.signal.throwIfAborted();
    let binding: { providerEmailId: string; rfcMessageId: string };
    try {
      const providerEmailId = opaqueIdentifier(
        'providerEmailId',
        row.provider_email_id,
        256,
      );
      const response = await dependencies.fetch(
        `https://api.resend.com/emails/${encodeURIComponent(providerEmailId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          redirect: 'error',
          signal: AbortSignal.any([
            input.signal,
            AbortSignal.timeout(RESEND_LOOKUP_TIMEOUT_MS),
          ]),
        },
      );
      const data = await boundedProviderResponse(response);
      const environments = environmentTags(data['tags']);
      if (
        data['id'] !== providerEmailId ||
        environments.length !== 1 ||
        environments[0] !== environment ||
        typeof data['message_id'] !== 'string'
      ) {
        continue;
      }
      binding = { providerEmailId, rfcMessageId: data['message_id'] };
    } catch {
      input.signal.throwIfAborted();
      // The durable next-at reservation survives provider errors and timeouts.
      continue;
    }
    try {
      if ((await bind(executor, binding)) === 'bound') bound += 1;
    } catch (error) {
      input.signal.throwIfAborted();
      // Malformed or conflicting identities stay unbound; database errors surface.
      if (!(error instanceof ProviderMessageIdBindingError)) throw error;
    }
  }
  return {
    claimed: claimed.rows.length,
    bound,
    deferred: claimed.rows.length - bound,
  };
}
