import { loadEmailHmacKeyring } from '../email-keyring.ts';
import { renderFulfillmentTemplate } from '../fulfillment/templates.ts';
import {
  assertRecipientDeliveryPolicy,
  authorizeLeasedJobForSubmission,
  type CampaignTemplateId,
  cancelLeasedJob,
  claimInternalNotificationSubmission,
  classifyResendProviderError,
  completeLeasedJob,
  completeProviderAttempt,
  createGrowthActionToken,
  type CreateGrowthActionTokenInput,
  createUnsubscribeActionUrl,
  createUnsubscribeActionUrlForJob,
  type CreateUnsubscribeActionUrlInput,
  deferLeasedJob,
  type DeliveryEnvironment,
  type EmailHmacKeyring,
  failLeasedJob,
  type GrowthAppJobHandler,
  type GrowthAppJobKind,
  type GrowthDispatchResult,
  type GrowthJob,
  type GrowthLifecycleJobContext,
  type GrowthScoreResult,
  type GrowthTokenEnvironment,
  type GrowthTokenKey,
  type InstallDigestCandidate,
  type InstallDigestContext,
  type InternalNotificationKind,
  isCampaignSendWindow,
  loadGrowthTokenKeyring,
  markInstallDigestReported,
  markInternalNotificationUnknown,
  markProviderAcceptanceUnknown,
  markProviderRejection,
  normalizeGrowthPublicActionOrigin,
  normalizeRecipientEmail,
  type NotificationSubmission,
  providerIdempotencyKey,
  readInstallDigestCandidates,
  readInstallDigestContext,
  readLifecycleJobContext,
  readNotificationSubmission,
  RECIPIENT_EMAIL_SENDER,
  type RecipientDeliveryPolicy,
  type RecipientEmailInput,
  type RecipientEmailProviderPayload,
  type RecipientResendClient,
  type RecipientSendResult,
  recomputeContactScore,
  recordProviderAcceptance,
  renderPlainHtml,
  renderPlainText,
  reserveProviderAttempt,
  sendRecipientEmail,
  type SqlExecutor,
  type SqlTransaction,
  type UnsubscribeActionUrl,
  unsubscribeActionUrlValue,
  VERIFIED_DOMAIN,
} from '../growth.ts';
import { DeterministicLifecycleJobError } from '../job-errors.ts';
import { createResendFetchClient } from '../resend-client.ts';
import { renderInstallDigest } from '../notifications/install-digest.ts';
import { renderInternalNotificationSummary } from '../notifications/templates.ts';
import { type CampaignStep, renderCampaignTemplate } from './templates.ts';

/** The fixed template each campaign v1 step sends. */
export const STEP_NAMES = {
  1: 'immediate',
  2: 'day-3',
  3: 'day-8',
} as const satisfies Record<1 | 2 | 3, CampaignStep & CampaignTemplateId>;

/** How long a job waits before the next attempt when sending is held back. */
export const RETRY_DELAY_MS = 60_000;

/** The most identities one install digest reports. */
export const INSTALL_DIGEST_CANDIDATE_LIMIT = 200;

const INSTALL_DIGEST_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
const FOUNDER_STOP_PATH = '/_/growth/stop';
const SIGNATURE = 'Brian';

const FIRST_NAME_PATTERN = /^[A-Za-z][A-Za-z'’-]{0,29}$/u;
const PLAIN_NAME_PATTERN = /^[A-Za-z'’.-]+(?:\s[A-Za-z'’.-]+){0,5}$/u;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const CANONICAL_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/**
 * "Hey <first name>," when the display name is a plain name whose first word
 * is a plain first name; otherwise "Hey there,". Display names are free-text
 * form input, so a name carrying digits, punctuation or a URL anywhere is
 * discarded as a whole and never reaches the email.
 *
 * @param displayName - The contact's persisted display name, if any.
 */
export function campaignGreeting(displayName: string | null): string {
  const name = (displayName ?? '').trim();
  if (name.length > 60 || !PLAIN_NAME_PATTERN.test(name)) return 'Hey there,';
  const first = name.split(/\s+/u)[0] ?? '';
  return FIRST_NAME_PATTERN.test(first) ? `Hey ${first},` : 'Hey there,';
}

/** A rendered campaign step, ready for {@link sendRecipientEmail}. */
export interface PreparedCampaignMessage {
  subject: string;
  text: string;
  html: string;
  /** The template that rendered the step, sent as the `campaign_template` tag. */
  template: CampaignTemplateId;
}

function campaignStep(job: GrowthJob): 1 | 2 | 3 {
  const step = job.payload['step'];
  if (
    job.kind !== 'send_step' ||
    job.payload['campaign_version'] !== 'v1' ||
    (step !== 1 && step !== 2 && step !== 3)
  ) {
    throw new DeterministicLifecycleJobError(
      'Invalid campaign send_step payload',
    );
  }
  return step;
}

function signedParts(
  body: string,
  unsubscribeUrl: UnsubscribeActionUrl,
): { text: string; html: string } {
  const parts = {
    text: body,
    unsubscribeUrl: unsubscribeActionUrlValue(unsubscribeUrl),
    signature: SIGNATURE,
  };
  return { text: renderPlainText(parts), html: renderPlainHtml(parts) };
}

/**
 * Renders a campaign v1 step: the greeting, the step's fixed template, the
 * signature and the unsubscribe link, as text and a plain HTML alternative.
 *
 * @param input - The contact context, the leased `send_step` and its
 *   contact-bound unsubscribe URL.
 * @throws {DeterministicLifecycleJobError} When the payload is not a v1 step 1–3.
 */
export function prepareCampaignMessage(input: {
  context: GrowthLifecycleJobContext;
  job: GrowthJob;
  unsubscribeUrl: UnsubscribeActionUrl;
}): PreparedCampaignMessage {
  const template = STEP_NAMES[campaignStep(input.job)];
  const draft = renderCampaignTemplate(template);
  const body = `${campaignGreeting(input.context.displayName)}\n\n${draft.body}`;
  return {
    subject: draft.subject,
    ...signedParts(body, input.unsubscribeUrl),
    template,
  };
}

/** The lifecycle switches and the enrollment start, read once per tick. */
export interface LifecycleRuntimeConfiguration {
  campaignEnabled: boolean;
  campaignEnrollmentEnabled: boolean;
  installRuntimeHelloEnabled: boolean;
  installDigestEnabled: boolean;
  observationProcessingEnabled: boolean;
  deliveryEnabled: boolean;
  /** `CAMPAIGN_ENROLLMENT_START_AT`; present only when enrollment is on. */
  campaignEnrollmentStartAt?: Date;
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

function exactBoolean(environment: RuntimeEnvironment, name: string): boolean {
  const value = environment[name];
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(`${name} must be exactly true or false`);
}

/**
 * Reads the lifecycle switches. Each accepts only the exact strings `true`
 * and `false`, and unset is `false`. When enrollment is on,
 * `CAMPAIGN_ENROLLMENT_START_AT` must be a canonical
 * `YYYY-MM-DDTHH:MM:SS.mmmZ` instant.
 *
 * @param environment - The process environment.
 * @throws When a switch or the enrollment start is malformed.
 */
export function loadLifecycleRuntimeConfiguration(
  environment: RuntimeEnvironment,
): LifecycleRuntimeConfiguration {
  const configuration: LifecycleRuntimeConfiguration = {
    campaignEnabled: exactBoolean(environment, 'CAMPAIGN_ENABLED'),
    campaignEnrollmentEnabled: exactBoolean(
      environment,
      'CAMPAIGN_ENROLLMENT_ENABLED',
    ),
    installRuntimeHelloEnabled: exactBoolean(
      environment,
      'GROWTH_INSTALL_RUNTIME_HELLO_ENABLED',
    ),
    installDigestEnabled: exactBoolean(
      environment,
      'GROWTH_INSTALL_DIGEST_ENABLED',
    ),
    observationProcessingEnabled: exactBoolean(
      environment,
      'GROWTH_OBSERVATION_PROCESSING_ENABLED',
    ),
    deliveryEnabled: exactBoolean(environment, 'DELIVERY_ENABLED'),
  };
  if (!configuration.campaignEnrollmentEnabled) return configuration;
  const raw = environment['CAMPAIGN_ENROLLMENT_START_AT'];
  const startAt =
    raw && CANONICAL_INSTANT_PATTERN.test(raw) ? new Date(raw) : null;
  if (
    !raw ||
    !startAt ||
    Number.isNaN(startAt.getTime()) ||
    startAt.toISOString() !== raw
  ) {
    throw new Error(
      'CAMPAIGN_ENROLLMENT_START_AT must be canonical UTC RFC3339 with milliseconds when enrollment is enabled',
    );
  }
  return { ...configuration, campaignEnrollmentStartAt: startAt };
}

function deliveryEnvironment(
  environment: RuntimeEnvironment,
  name: string,
): DeliveryEnvironment {
  const value = environment[name];
  if (value === 'production' || value === 'preview' || value === 'test') {
    return value;
  }
  throw new Error(`${name} must be production, preview, or test`);
}

function requiredText(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Builds and checks the recipient delivery policy: `DELIVERY_ENVIRONMENT`
 * and `GROWTH_DATABASE_ENVIRONMENT` must match, the sender is
 * {@link RECIPIENT_EMAIL_SENDER} on {@link VERIFIED_DOMAIN}, and outside
 * production `RESEND_NON_PRODUCTION_ALLOWLIST` (CSV) must hold any
 * `RESEND_NON_PRODUCTION_REDIRECT_TO`.
 *
 * @param environment - The process environment.
 * @throws When the policy is not safe to send under.
 */
export function loadRecipientDeliveryPolicy(
  environment: RuntimeEnvironment,
): RecipientDeliveryPolicy {
  const runtime = loadLifecycleRuntimeConfiguration(environment);
  const allowlist = (environment['RESEND_NON_PRODUCTION_ALLOWLIST'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const redirect = environment['RESEND_NON_PRODUCTION_REDIRECT_TO']?.trim();
  const policy: RecipientDeliveryPolicy = {
    campaignEnabled: runtime.campaignEnabled,
    deliveryEnabled: runtime.deliveryEnabled,
    environment: deliveryEnvironment(environment, 'DELIVERY_ENVIRONMENT'),
    databaseEnvironment: deliveryEnvironment(
      environment,
      'GROWTH_DATABASE_ENVIRONMENT',
    ),
    senderVerified: environment['RESEND_SENDER_VERIFIED'] === 'true',
    verifiedDomain: VERIFIED_DOMAIN,
    configuredSender: RECIPIENT_EMAIL_SENDER,
    providerTrackingDisabled:
      environment['RESEND_TRACKING_DISABLED'] === 'true',
    nonProductionRecipientAllowlist: allowlist,
    ...(redirect ? { nonProductionRedirectTo: redirect } : {}),
  };
  assertRecipientDeliveryPolicy(policy);
  return policy;
}

/** One founder-only message from the internal sender. */
export interface InternalNotificationRequest {
  subject: string;
  text: string;
  /** The source job key, namespaced by product and environment for the provider. */
  idempotencyKey: string;
  kind: InternalNotificationKind;
}

/** Whether the provider accepted an internal notification. */
export interface InternalNotificationResult {
  outcome: 'accepted' | 'rejected' | 'unknown';
}

/** The exact payload the internal sender hands to Resend. */
export interface InternalNotificationProviderPayload {
  from: typeof RECIPIENT_EMAIL_SENDER;
  to: string;
  subject: string;
  text: string;
  tags: { name: string; value: string }[];
}

/**
 * The slice of the Resend client lifecycle uses for recipient and internal
 * mail; injected in tests so nothing reaches Resend.
 */
export interface LifecycleResendClient {
  emails: {
    send(
      payload:
        RecipientEmailProviderPayload | InternalNotificationProviderPayload,
      options: { idempotencyKey: string },
    ): ReturnType<RecipientResendClient['emails']['send']>;
  };
}

/** Everything a lifecycle job handler reads, writes and sends through. */
export interface LifecycleJobDependencies {
  now: () => Date;
  /** `DELIVERY_ENABLED`; internal notifications wait while it is off. */
  readonly deliveryEnabled: boolean;
  /** `GROWTH_PUBLIC_ACTION_ORIGIN`, a bare HTTPS origin. */
  readonly publicActionOrigin: string;
  readonly emailKeyring: EmailHmacKeyring;
  readJobContext: (
    executor: SqlExecutor,
    input: { jobId: string },
  ) => Promise<GrowthLifecycleJobContext>;
  readNotificationSubmission: (
    executor: SqlExecutor,
    input: { jobId: string },
  ) => Promise<NotificationSubmission | null>;
  scoreContact: (
    executor: SqlExecutor,
    input: { contactId: string; now: Date },
  ) => Promise<GrowthScoreResult>;
  /** Mints a contact-bound unsubscribe URL with the active token key. */
  createUnsubscribeUrl: (
    input: CreateUnsubscribeActionUrlInput,
  ) => UnsubscribeActionUrl;
  /** Mints a retry-stable unsubscribe URL from the job's immutable creation time. */
  createUnsubscribeUrlForJob: (
    job: Pick<GrowthJob, 'id' | 'contactId' | 'createdAt'>,
  ) => UnsubscribeActionUrl;
  /** Mints a signed action token with the active token key. */
  createActionToken: (input: CreateGrowthActionTokenInput) => string;
  /** Sends one recipient message under the tick's delivery policy. */
  sendRecipient: (
    executor: SqlExecutor,
    input: RecipientEmailInput,
  ) => Promise<RecipientSendResult>;
  deferJob: typeof deferLeasedJob;
  completeJob: typeof completeLeasedJob;
  cancelJob: typeof cancelLeasedJob;
  failJob: typeof failLeasedJob;
  claimInternalNotification: typeof claimInternalNotificationSubmission;
  markInternalNotificationUnknown: typeof markInternalNotificationUnknown;
  /** Sends a founder-only message to `FOUNDER_NOTIFICATION_EMAIL`. */
  sendInternalNotification: (
    executor: SqlExecutor,
    request: InternalNotificationRequest,
  ) => Promise<InternalNotificationResult>;
  readInstallDigestCandidates: (
    executor: SqlTransaction,
    input: { limit: number; keyring?: EmailHmacKeyring },
  ) => Promise<InstallDigestCandidate[]>;
  readInstallDigestContext: (
    executor: SqlTransaction,
    input: { since: Date },
  ) => Promise<InstallDigestContext>;
  markInstallDigestReported: typeof markInstallDigestReported;
}

function requireLease(job: GrowthJob): string {
  if (job.status !== 'leased' || !job.leaseToken) {
    throw new Error(`Inactive lifecycle job: ${job.id}`);
  }
  return job.leaseToken;
}

async function deferForRetry(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  errorCode: string,
  dependencies: LifecycleJobDependencies,
): Promise<GrowthDispatchResult> {
  const now = dependencies.now();
  await dependencies.deferJob(executor, {
    jobId: job.id,
    leaseToken,
    now,
    availableAt: new Date(now.getTime() + RETRY_DELAY_MS),
    errorCode,
  });
  return 'deferred';
}

interface RecipientMessage {
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: UnsubscribeActionUrl;
  campaignTemplate?: CampaignTemplateId;
}

async function dispatchRecipient(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  message: RecipientMessage,
  signal: AbortSignal,
  dependencies: LifecycleJobDependencies,
): Promise<GrowthDispatchResult> {
  signal.throwIfAborted();
  const result = await dependencies.sendRecipient(executor, {
    jobId: job.id,
    leaseToken,
    ...message,
    signal,
  });
  if (result.accepted) return 'completed';
  switch (result.reason) {
    case 'mailbox_recovery_required':
      return 'recovery_paused';
    case 'campaign_disabled':
    case 'delivery_disabled':
    case 'outside_send_window':
    case 'reply_binding_pending':
    case 'pilot_recipient_not_allowlisted':
      return deferForRetry(
        executor,
        job,
        leaseToken,
        result.reason,
        dependencies,
      );
    case 'contact_deleted':
    case 'contact_stopped':
    case 'contact_unapproved':
      await dependencies.cancelJob(executor, {
        jobId: job.id,
        leaseToken,
        now: dependencies.now(),
        errorCode: result.reason,
      });
      return 'cancelled';
    // The sender already settled the job: a rejection fails it, and an
    // unknown outcome fails it with delivery_status = 'unknown' for review.
    case 'provider_rejected':
    case 'provider_outcome_unknown':
      return 'failed';
  }
}

function fulfillmentTemplate(job: GrowthJob) {
  if (job.payload['form_kind'] !== 'unstuck') {
    throw new DeterministicLifecycleJobError(
      'Unsupported fulfillment form context',
    );
  }
  return renderFulfillmentTemplate({ context: 'unstuck' });
}

async function claimAndSendInternal(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  kind: InternalNotificationKind,
  message: { subject: string; text: string; claimedAt: Date },
  signal: AbortSignal,
  dependencies: LifecycleJobDependencies,
): Promise<'accepted' | 'failed'> {
  const unknownCode =
    kind === 'digest'
      ? 'install_digest_outcome_unknown'
      : 'internal_notification_outcome_unknown';
  const markUnknown = () =>
    dependencies.markInternalNotificationUnknown(executor, {
      jobId: job.id,
      leaseToken,
      occurredAt: dependencies.now(),
      errorCode: unknownCode,
      kind,
    });
  signal.throwIfAborted();
  // A JobLeaseConflictError here means the job is no longer ours; it
  // propagates so the dispatcher drops the job without sending.
  const claim = await dependencies.claimInternalNotification(executor, {
    jobId: job.id,
    leaseToken,
    now: message.claimedAt,
    kind,
  });
  if (claim === 'already_claimed') {
    await markUnknown();
    return 'failed';
  }
  signal.throwIfAborted();
  const sent = await dependencies.sendInternalNotification(executor, {
    subject: message.subject,
    text: message.text,
    idempotencyKey: job.idempotencyKey,
    kind,
  });
  if (sent.outcome === 'unknown') {
    await markUnknown();
    return 'failed';
  }
  if (sent.outcome === 'rejected') {
    await dependencies.failJob(executor, {
      jobId: job.id,
      leaseToken,
      now: dependencies.now(),
      errorCode:
        kind === 'digest'
          ? 'install_digest_rejected'
          : 'internal_notification_rejected',
    });
    return 'failed';
  }
  return 'accepted';
}

async function dispatchNotifyJob(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  context: GrowthLifecycleJobContext,
  signal: AbortSignal,
  dependencies: LifecycleJobDependencies,
): Promise<GrowthDispatchResult> {
  if (!dependencies.deliveryEnabled) {
    return deferForRetry(
      executor,
      job,
      leaseToken,
      'delivery_disabled',
      dependencies,
    );
  }
  const claimedAt = dependencies.now();
  const submission = await dependencies.readNotificationSubmission(executor, {
    jobId: job.id,
  });
  const score = await dependencies.scoreContact(executor, {
    contactId: context.contactId,
    now: claimedAt,
  });
  signal.throwIfAborted();
  const message = submission?.message ?? null;
  const founderStopToken = dependencies.createActionToken({
    contactId: context.contactId,
    purpose: 'founder_stop',
    // Internal submissions are at most once; validity starts when sending.
    issuedAt: claimedAt,
    eventNonce: job.id,
  });
  // Render (and validate) before the at-most-once claim is consumed.
  const text = renderInternalNotificationSummary({
    scoreVersion: score.scoreVersion,
    scoreReasons: score.reasons.map(({ code, points }) => ({ code, points })),
    submission: {
      messagePresent: message !== null,
      messageLength: message?.length ?? 0,
      ...(message === null ? {} : { message }),
    },
    drafts: ([1, 2, 3] as const).map((step) =>
      renderCampaignTemplate(STEP_NAMES[step]),
    ),
    origin: dependencies.publicActionOrigin,
    founderStopUrl: `${dependencies.publicActionOrigin}${FOUNDER_STOP_PATH}?token=${founderStopToken}`,
  });
  const outcome = await claimAndSendInternal(
    executor,
    job,
    leaseToken,
    'notify',
    { subject: 'Hashbrown lifecycle review', text, claimedAt },
    signal,
    dependencies,
  );
  if (outcome === 'failed') return 'failed';
  await dependencies.completeJob(executor, {
    jobId: job.id,
    leaseToken,
    now: dependencies.now(),
  });
  return 'completed';
}

/**
 * Founder-only install digest. The job has no contact, so it never reads the
 * lifecycle contact context; the identities are recorded as reported only
 * after the provider accepted the message, in the same transaction that
 * completes the job. A crash after acceptance leaves the claim consumed, so
 * the retry fails with `install_digest_outcome_unknown` for manual review and
 * the unrecorded identities appear in the next digest.
 */
async function dispatchInstallDigestJob(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  signal: AbortSignal,
  dependencies: LifecycleJobDependencies,
): Promise<GrowthDispatchResult> {
  if (!dependencies.deliveryEnabled) {
    return deferForRetry(
      executor,
      job,
      leaseToken,
      'delivery_disabled',
      dependencies,
    );
  }
  const businessDate = job.payload['business_date'];
  if (
    typeof businessDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(businessDate)
  ) {
    throw new DeterministicLifecycleJobError(
      'Digest job is missing its business date',
    );
  }
  const candidates = await dependencies.readInstallDigestCandidates(executor, {
    limit: INSTALL_DIGEST_CANDIDATE_LIMIT,
    keyring: dependencies.emailKeyring,
  });
  signal.throwIfAborted();
  if (candidates.length === 0) {
    await dependencies.completeJob(executor, {
      jobId: job.id,
      leaseToken,
      now: dependencies.now(),
    });
    return 'completed';
  }
  const claimedAt = dependencies.now();
  const context = await dependencies.readInstallDigestContext(executor, {
    since: new Date(job.createdAt.getTime() - INSTALL_DIGEST_CONTEXT_WINDOW_MS),
  });
  const text = renderInstallDigest({
    businessDate,
    publicActionOrigin: dependencies.publicActionOrigin,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      approveToken: dependencies.createActionToken({
        contactId: candidate.firstInstallObservationId,
        purpose: 'founder_approve_install',
        // The permanent submission claim prevents reissuing a sent token.
        issuedAt: claimedAt,
        eventNonce: job.id,
      }),
    })),
    context,
  });
  const count = candidates.length;
  const outcome = await claimAndSendInternal(
    executor,
    job,
    leaseToken,
    'digest',
    {
      subject: `Hashbrown install digest for ${businessDate}: ${count} new ${
        count === 1 ? 'identity' : 'identities'
      }`,
      text,
      claimedAt,
    },
    signal,
    dependencies,
  );
  if (outcome === 'failed') return 'failed';
  await executor.transaction(async (transaction) => {
    await dependencies.markInstallDigestReported(transaction, {
      digestJobId: job.id,
      reportedAt: dependencies.now(),
      candidates,
    });
    await dependencies.completeJob(transaction, {
      jobId: job.id,
      leaseToken,
      now: dependencies.now(),
    });
  });
  return 'completed';
}

/**
 * Runs one leased app-owned job (`fulfill`, `send_step`, `notify` or
 * `digest`) and settles its lease. Recipient results map as: accepted →
 * `completed`; `campaign_disabled`, `delivery_disabled`,
 * `outside_send_window`, `reply_binding_pending`,
 * `pilot_recipient_not_allowlisted` → deferred 60 s;
 * `contact_*` → `cancelled`; `mailbox_recovery_required` → `recovery_paused`
 * (still leased; the dispatcher defers it); `provider_rejected` and
 * `provider_outcome_unknown` → `failed` (the sender recorded both).
 *
 * @throws {DeterministicLifecycleJobError} For a payload that can never send.
 * @throws {JobLeaseConflictError} When the lease was lost mid-job.
 */
export async function dispatchLifecycleAppOwnedJob(
  executor: SqlExecutor,
  job: GrowthJob,
  dispatchContext: { signal?: AbortSignal },
  dependencies: LifecycleJobDependencies,
): Promise<GrowthDispatchResult> {
  const leaseToken = requireLease(job);
  const signal = dispatchContext.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  if (job.kind === 'digest') {
    return dispatchInstallDigestJob(
      executor,
      job,
      leaseToken,
      signal,
      dependencies,
    );
  }
  if (
    job.kind !== 'fulfill' &&
    job.kind !== 'send_step' &&
    job.kind !== 'notify'
  ) {
    throw new DeterministicLifecycleJobError(
      `Unsupported app-owned growth job kind: ${job.kind}`,
    );
  }
  const context = await dependencies.readJobContext(executor, {
    jobId: job.id,
  });
  signal.throwIfAborted();
  if (context.contactId !== job.contactId) {
    throw new DeterministicLifecycleJobError(
      'Lifecycle context contact does not match the leased job',
    );
  }
  if (job.kind === 'notify') {
    return dispatchNotifyJob(
      executor,
      job,
      leaseToken,
      context,
      signal,
      dependencies,
    );
  }
  const unsubscribeUrl = dependencies.createUnsubscribeUrlForJob(job);
  if (job.kind === 'send_step') {
    const message = prepareCampaignMessage({ context, job, unsubscribeUrl });
    return dispatchRecipient(
      executor,
      job,
      leaseToken,
      {
        subject: message.subject,
        text: message.text,
        html: message.html,
        unsubscribeUrl,
        campaignTemplate: message.template,
      },
      signal,
      dependencies,
    );
  }
  const template = fulfillmentTemplate(job);
  // Fulfillment is the first message from Brian, so it opens like a step.
  const body = `${campaignGreeting(context.displayName)}\n\n${template.body}`;
  return dispatchRecipient(
    executor,
    job,
    leaseToken,
    {
      subject: template.subject,
      ...signedParts(body, unsubscribeUrl),
      unsubscribeUrl,
    },
    signal,
    dependencies,
  );
}

interface MailRuntime {
  founderNotificationEmail: string;
  recipientPolicy: RecipientDeliveryPolicy;
  resend: LifecycleResendClient;
  tokenKey: GrowthTokenKey;
}

/** Options for {@link createDefaultLifecycleJobDependencies}. */
export interface LifecycleJobDependencyOptions {
  /** Builds the Resend client; defaults to `createResendFetchClient({ apiKey: RESEND_API_KEY })`. */
  resend?: () => LifecycleResendClient;
  now?: () => Date;
  /** Reserves immutable provider payload evidence before submission. */
  reserveProviderAttempt?: typeof reserveProviderAttempt;
  /** Records known acceptance before settling the job. */
  completeProviderAttempt?: typeof completeProviderAttempt;
}

/**
 * The production job dependencies for one tick. The mail configuration
 * (Resend key, founder address, delivery policy, token key, public origin)
 * and the email keyring are read lazily and once, so a tick that sends
 * nothing needs none of them. Outside production the founder address must be
 * on `RESEND_NON_PRODUCTION_ALLOWLIST`. Internal notification claims validate
 * this configuration before persisting permanent submission evidence.
 *
 * @param environment - The process environment.
 * @param options - Test seams: the Resend client and the clock.
 * @throws When a lifecycle switch is malformed.
 */
export function createDefaultLifecycleJobDependencies(
  environment: RuntimeEnvironment = process.env,
  options: LifecycleJobDependencyOptions = {},
): LifecycleJobDependencies {
  const runtime = loadLifecycleRuntimeConfiguration(environment);
  const now = options.now ?? ((): Date => new Date());
  let mail: MailRuntime | undefined;
  let origin: string | undefined;
  let keyring: EmailHmacKeyring | undefined;
  const publicActionOrigin = (): string => {
    origin ??= normalizeGrowthPublicActionOrigin(
      environment['GROWTH_PUBLIC_ACTION_ORIGIN'] ?? '',
    );
    return origin;
  };
  const tokenKey = (): GrowthTokenKey =>
    loadGrowthTokenKeyring(environment as GrowthTokenEnvironment).active;
  const mailRuntime = (): MailRuntime => {
    if (mail) return mail;
    const founderNotificationEmail = normalizeRecipientEmail(
      requiredText(environment, 'FOUNDER_NOTIFICATION_EMAIL'),
    );
    const recipientPolicy = loadRecipientDeliveryPolicy(environment);
    if (
      recipientPolicy.environment !== 'production' &&
      !recipientPolicy.nonProductionRecipientAllowlist
        .map((email) => normalizeRecipientEmail(email))
        .includes(founderNotificationEmail)
    ) {
      throw new Error(
        'FOUNDER_NOTIFICATION_EMAIL must be on RESEND_NON_PRODUCTION_ALLOWLIST outside production',
      );
    }
    const apiKey = requiredText(environment, 'RESEND_API_KEY');
    mail = {
      founderNotificationEmail,
      recipientPolicy,
      resend: options.resend?.() ?? createResendFetchClient({ apiKey }),
      tokenKey: tokenKey(),
    };
    return mail;
  };

  return {
    now,
    deliveryEnabled: runtime.deliveryEnabled,
    get publicActionOrigin() {
      return publicActionOrigin();
    },
    get emailKeyring() {
      keyring ??= loadEmailHmacKeyring(environment);
      return keyring;
    },
    readJobContext: readLifecycleJobContext,
    readNotificationSubmission,
    scoreContact: recomputeContactScore,
    createUnsubscribeUrl: (input) =>
      createUnsubscribeActionUrl(input, tokenKey(), publicActionOrigin()),
    createUnsubscribeUrlForJob: (job) =>
      createUnsubscribeActionUrlForJob(job, tokenKey(), publicActionOrigin()),
    createActionToken: (input) => createGrowthActionToken(input, tokenKey()),
    sendRecipient: (executor, input) => {
      const { recipientPolicy, resend } = mailRuntime();
      return sendRecipientEmail(executor, input, recipientPolicy, {
        now,
        isSendWindow: isCampaignSendWindow,
        resend,
        authorizeLeasedJobForSubmission,
        recordProviderAcceptance,
        markProviderAcceptanceUnknown,
        markProviderRejection,
      });
    },
    deferJob: deferLeasedJob,
    completeJob: completeLeasedJob,
    cancelJob: cancelLeasedJob,
    failJob: failLeasedJob,
    claimInternalNotification: (executor, input) => {
      // Validate lazy mail configuration before consuming the permanent claim.
      // The sender reuses this runtime; uncertain submissions stay at most once.
      mailRuntime();
      return claimInternalNotificationSubmission(executor, input);
    },
    markInternalNotificationUnknown,
    async sendInternalNotification(executor, request) {
      const { founderNotificationEmail, recipientPolicy, resend } =
        mailRuntime();
      const payload: InternalNotificationProviderPayload = {
        from: RECIPIENT_EMAIL_SENDER,
        to: founderNotificationEmail,
        subject: request.subject,
        text: request.text,
        tags: [
          { name: 'app', value: 'hashbrown' },
          { name: 'environment', value: recipientPolicy.environment },
          { name: 'job_kind', value: request.kind },
        ],
      };
      const idempotencyKey = providerIdempotencyKey(
        recipientPolicy.environment,
        `internal:${request.idempotencyKey}`,
      );
      const knownProviderId = await (
        options.reserveProviderAttempt ?? reserveProviderAttempt
      )(executor, idempotencyKey, payload, now());
      try {
        const response =
          knownProviderId === null
            ? await resend.emails.send(payload, { idempotencyKey })
            : { data: { id: knownProviderId }, error: null };
        if (response.error === null) {
          const providerId: unknown = response.data?.id;
          if (
            typeof providerId !== 'string' ||
            !PROVIDER_ID_PATTERN.test(providerId)
          )
            return { outcome: 'unknown' };
          await (options.completeProviderAttempt ?? completeProviderAttempt)(
            executor,
            idempotencyKey,
            providerId,
          );
          return { outcome: 'accepted' };
        }
        return { outcome: classifyResendProviderError(response.error) };
      } catch {
        return { outcome: 'unknown' };
      }
    },
    readInstallDigestCandidates,
    readInstallDigestContext,
    markInstallDigestReported,
  };
}

/**
 * The lifecycle app's handlers for growth's `dispatchGrowthLeasedJob`: one per
 * app-owned kind, all sharing the tick's dependencies.
 *
 * @param dependencies - The tick's job dependencies.
 */
export function createLifecycleAppJobHandlers(
  dependencies: LifecycleJobDependencies,
): Record<GrowthAppJobKind, GrowthAppJobHandler> {
  const handler: GrowthAppJobHandler = (executor, job, context) =>
    dispatchLifecycleAppOwnedJob(executor, job, context, dependencies);
  return {
    fulfill: handler,
    send_step: handler,
    notify: handler,
    digest: handler,
  };
}
