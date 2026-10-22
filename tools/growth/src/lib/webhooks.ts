import { canonicalJson } from './activity.ts';
import { bindOutboundMessageId } from './inbox-replies.ts';
import { nestedExecutor, type SqlExecutor } from './database.ts';
import type { GrowthDeliveryStatus } from './models.ts';
import {
  type DeliveryEnvironment,
  isCampaignTemplateId,
  VERIFIED_DOMAIN,
} from './resend.ts';
import type {
  CanonicalStopReason,
  StopContactInput,
  StopContactResult,
} from './stops.ts';

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const SUPPORTED_EVENT_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
  'email.failed',
]);
const DELIVERY_STATUS_PRECEDENCE: Readonly<
  Record<GrowthDeliveryStatus, number>
> = {
  not_submitted: -1,
  unknown: -1,
  submitted: 0,
  delivered: 1,
  failed: 1,
  bounced: 2,
  suppressed: 3,
  complained: 4,
};

type SupportedResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.suppressed'
  | 'email.failed';

interface ParsedResendEvent {
  type: SupportedResendEventType;
  occurredAt: Date;
  providerEmailId: string;
  senderDomain: string;
  rfcMessageId?: string;
  tags: Record<string, string>;
  bounceCategory?: 'permanent' | 'transient' | 'unknown';
}

interface WebhookJobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  contact_id: string | null;
  project_id: string | null;
  status: string;
  payload: Record<string, unknown>;
  provider_email_id: string;
  delivery_status: GrowthDeliveryStatus;
}

interface WebhookActivityRow extends Record<string, unknown> {
  event_key: string;
  contact_id: string | null;
  project_id: string | null;
  kind: string;
  occurred_at: Date | string;
  data: Record<string, unknown>;
}

/** What the webhook processor needs from its caller. */
export interface ProcessResendWebhookDependencies {
  databaseEnvironment: DeliveryEnvironment;
  stopContact: (
    executor: SqlExecutor,
    input: StopContactInput,
  ) => Promise<Pick<StopContactResult, 'applied' | 'effective'>>;
}

/**
 * The outcome of processing one verified Resend webhook.
 *
 * - `ignored_event_type`: an event type the processor does not record.
 * - `environment_mismatch`: the event's environment tag names another
 *   database environment.
 * - `foreign_sender`: the sender is not on the verified domain; the Resend
 *   account is shared with another product, whose events are acknowledged and
 *   ignored without touching the database.
 * - `foreign_product`: the app tag is missing or names another product;
 *   ignored without touching the database, even on the verified domain.
 * - `unmatched_job`: no job matches and the tags are not ours.
 * - `retryable_unmatched_job`: no job matches yet, but the tags are ours, so
 *   the provider should retry.
 * - `replay`: the event was already recorded.
 */
export type ProcessResendWebhookResult =
  | {
      applied: false;
      reason:
        | 'ignored_event_type'
        | 'environment_mismatch'
        | 'foreign_sender'
        | 'foreign_product'
        | 'unmatched_job'
        | 'retryable_unmatched_job';
    }
  | {
      applied: false;
      reason: 'replay';
    }
  | {
      applied: true;
      activityKind: string;
      deliveryStatus: GrowthDeliveryStatus;
    };

function plainObject(value: unknown): Record<string, unknown> | null {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(
  value: unknown,
  maximum: number,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string')
    throw new Error('Invalid Resend webhook payload');
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    /\0/u.test(normalized) ||
    (pattern !== undefined && !pattern.test(normalized))
  ) {
    throw new Error('Invalid Resend webhook payload');
  }
  return normalized;
}

function boundedDate(value: unknown): Date {
  const text = boundedText(value, 64, ISO_TIMESTAMP_PATTERN);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid Resend webhook payload');
  }
  return date;
}

function boundedRecord(
  value: unknown,
  maximumEntries: number,
  maximumKey: number,
  maximumValue: number,
): Record<string, string> {
  if (value === undefined) return {};
  const record = plainObject(value);
  if (!record || Object.keys(record).length > maximumEntries) {
    throw new Error('Invalid Resend webhook payload');
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      boundedText(key, maximumKey, PROVIDER_ID_PATTERN),
      boundedText(item, maximumValue),
    ]),
  );
}

const MAX_DATA_KEYS = 32;
const MAX_HEADER_ENTRIES = 32;
const MAX_DIAGNOSTIC_CODES = 10;

function validateProviderDiagnosticCode(value: unknown): void {
  if (value == null) return;
  if (typeof value === 'string') {
    boundedText(value, 2_000);
    return;
  }
  if (!Array.isArray(value) || value.length > MAX_DIAGNOSTIC_CODES) {
    throw new Error('Invalid Resend webhook payload');
  }
  for (const code of value) {
    if (code != null) boundedText(code, 2_000);
  }
}

// Known keys are validated; unknown keys are ignored rather than fatal, because
// Resend has added keys (message_id, headers) without notice and each addition
// used to turn every delivery event into a 400. The total key count stays bounded.
function validateProviderBaseData(data: Record<string, unknown>): void {
  if (Object.keys(data).length > MAX_DATA_KEYS) {
    throw new Error('Invalid Resend webhook payload');
  }
  boundedDate(data['created_at']);
  boundedText(data['from'], 320);
  boundedText(data['subject'], 500);
  if (
    !Array.isArray(data['to']) ||
    data['to'].length < 1 ||
    data['to'].length > 50
  ) {
    throw new Error('Invalid Resend webhook payload');
  }
  for (const recipient of data['to']) boundedText(recipient, 254);
  for (const key of ['broadcast_id', 'template_id'] as const) {
    if (data[key] !== undefined && data[key] !== null) {
      boundedText(data[key], 256);
    }
  }
  if (data['message_id'] !== undefined && data['message_id'] !== null) {
    boundedText(data['message_id'], 998);
  }
  if (data['headers'] !== undefined && data['headers'] !== null) {
    const headers = data['headers'];
    if (!Array.isArray(headers) || headers.length > MAX_HEADER_ENTRIES) {
      throw new Error('Invalid Resend webhook payload');
    }
    for (const header of headers) {
      const entry = plainObject(header);
      if (!entry) throw new Error('Invalid Resend webhook payload');
      boundedText(entry['name'], 128);
      boundedText(entry['value'], 2_000);
    }
  }
}

function validateClosedDetails(
  type: SupportedResendEventType,
  data: Record<string, unknown>,
): ParsedResendEvent['bounceCategory'] {
  if (
    (type !== 'email.bounced' && data['bounce'] !== undefined) ||
    (type !== 'email.failed' && data['failed'] !== undefined) ||
    (type !== 'email.suppressed' && data['suppressed'] !== undefined)
  ) {
    throw new Error('Invalid Resend webhook payload');
  }
  if (type === 'email.bounced') {
    const bounce = plainObject(data['bounce']);
    if (
      !bounce ||
      Object.keys(bounce).some(
        (key) =>
          !['message', 'subType', 'type', 'diagnosticCode'].includes(key),
      )
    ) {
      throw new Error('Invalid Resend webhook payload');
    }
    const bounceType = boundedText(bounce['type'], 100).toLowerCase();
    boundedText(bounce['subType'], 100);
    boundedText(bounce['message'], 500);
    validateProviderDiagnosticCode(bounce['diagnosticCode']);
    if (bounceType === 'permanent' || bounceType === 'hard') return 'permanent';
    if (bounceType === 'transient' || bounceType === 'soft') return 'transient';
    return 'unknown';
  }
  if (type === 'email.failed') {
    const failed = plainObject(data['failed']);
    if (!failed || Object.keys(failed).length !== 1 || !('reason' in failed)) {
      throw new Error('Invalid Resend webhook payload');
    }
    boundedText(failed['reason'], 500);
  }
  if (type === 'email.suppressed') {
    const suppressed = plainObject(data['suppressed']);
    if (
      !suppressed ||
      Object.keys(suppressed).some(
        (key) => !['message', 'type', 'reason', 'diagnosticCode'].includes(key),
      )
    ) {
      throw new Error('Invalid Resend webhook payload');
    }
    boundedText(suppressed['type'], 100);
    boundedText(suppressed['message'], 500);
    if (suppressed['reason'] != null) boundedText(suppressed['reason'], 500);
    validateProviderDiagnosticCode(suppressed['diagnosticCode']);
  }
  return undefined;
}

// `from` arrives either bare (`a@b`) or display-named (`Name <a@b>`).
function senderDomainOf(from: string): string {
  const named = /<([^<>]*)>$/u.exec(from);
  const address = (named ? named[1] : from).trim();
  const at = address.lastIndexOf('@');
  if (at < 1 || at === address.length - 1) {
    throw new Error('Invalid Resend webhook payload');
  }
  return address.slice(at + 1).toLowerCase();
}

function parseSupportedEvent(payload: unknown): ParsedResendEvent | null {
  const root = plainObject(payload);
  if (
    !root ||
    Object.keys(root).some(
      (key) => !['created_at', 'data', 'type'].includes(key),
    )
  ) {
    throw new Error('Invalid Resend webhook payload');
  }
  const rawType = boundedText(root['type'], 64);
  if (!SUPPORTED_EVENT_TYPES.has(rawType)) return null;
  const type = rawType as SupportedResendEventType;
  const occurredAt = boundedDate(root['created_at']);
  const data = plainObject(root['data']);
  if (!data) throw new Error('Invalid Resend webhook payload');
  validateProviderBaseData(data);
  const providerEmailId = boundedText(
    data['email_id'],
    256,
    PROVIDER_ID_PATTERN,
  );
  const tags = boundedRecord(data['tags'], 10, 64, 128);
  const senderDomain = senderDomainOf(boundedText(data['from'], 320));
  return {
    type,
    occurredAt,
    providerEmailId,
    senderDomain,
    ...(data['message_id'] == null
      ? {}
      : { rfcMessageId: boundedText(data['message_id'], 998) }),
    tags,
    ...(type === 'email.bounced'
      ? { bounceCategory: validateClosedDetails(type, data) }
      : (validateClosedDetails(type, data), {})),
  };
}

function activityProjection(event: ParsedResendEvent): {
  activityKind: string;
  category: string;
  incomingStatus: GrowthDeliveryStatus;
  stopReason?: CanonicalStopReason;
} {
  switch (event.type) {
    case 'email.sent':
      return {
        activityKind: 'delivery.sent',
        category: 'sent',
        incomingStatus: 'submitted',
      };
    case 'email.delivered':
      return {
        activityKind: 'delivery.delivered',
        category: 'delivered',
        incomingStatus: 'delivered',
      };
    case 'email.delivery_delayed':
      return {
        activityKind: 'delivery.delayed',
        category: 'delayed',
        incomingStatus: 'submitted',
      };
    case 'email.bounced':
      return {
        activityKind: 'delivery.bounced',
        category: event.bounceCategory ?? 'unknown',
        incomingStatus: 'bounced',
        ...(event.bounceCategory === 'permanent'
          ? { stopReason: 'hard_bounce' as const }
          : {}),
      };
    case 'email.complained':
      return {
        activityKind: 'delivery.complained',
        category: 'complaint',
        incomingStatus: 'complained',
        stopReason: 'complaint',
      };
    case 'email.suppressed':
      return {
        activityKind: 'delivery.suppressed',
        category: 'provider_suppression',
        incomingStatus: 'suppressed',
        stopReason: 'provider_suppression',
      };
    case 'email.failed':
      return {
        activityKind: 'delivery.failed',
        category: 'provider_failed',
        incomingStatus: 'failed',
      };
  }
}

function validateActivityReplay(
  row: WebhookActivityRow | undefined,
  expected: {
    eventKey: string;
    activityKind: string;
    occurredAt: Date;
    data: Record<string, unknown>;
    contactId?: string | null;
    projectId?: string | null;
  },
): void {
  const occurredAt = row ? new Date(row.occurred_at) : null;
  if (
    !row ||
    row.event_key !== expected.eventKey ||
    row.kind !== expected.activityKind ||
    occurredAt?.getTime() !== expected.occurredAt.getTime() ||
    canonicalJson(row.data) !== canonicalJson(expected.data) ||
    (expected.contactId !== undefined &&
      row.contact_id !== expected.contactId) ||
    (expected.projectId !== undefined && row.project_id !== expected.projectId)
  ) {
    throw new Error(`Resend webhook event ID conflict: ${expected.eventKey}`);
  }
}

function validateCorroboration(
  job: WebhookJobRow,
  event: ParsedResendEvent,
): void {
  const environment = event.tags['environment'];
  if (
    environment !== undefined &&
    environment !== 'production' &&
    environment !== 'preview' &&
    environment !== 'test'
  ) {
    throw new Error('Resend webhook corroboration conflict');
  }
  if (
    event.tags['job_kind'] !== undefined &&
    event.tags['job_kind'] !== job.kind
  ) {
    throw new Error('Resend webhook corroboration conflict');
  }
  if (job.kind === 'send_step') {
    const campaignVersion = job.payload['campaign_version'];
    const step = job.payload['step'];
    if (
      (event.tags['campaign_version'] !== undefined &&
        event.tags['campaign_version'] !== campaignVersion) ||
      (event.tags['campaign_step'] !== undefined &&
        event.tags['campaign_step'] !== String(step))
    ) {
      throw new Error('Resend webhook corroboration conflict');
    }
  } else if (
    event.tags['campaign_version'] !== undefined ||
    event.tags['campaign_step'] !== undefined
  ) {
    throw new Error('Resend webhook corroboration conflict');
  }
}

function isHashbrownGrowthSend(tags: Record<string, string>): boolean {
  if (tags['app'] !== 'hashbrown') return false;
  const environment = tags['environment'];
  if (
    environment !== 'production' &&
    environment !== 'preview' &&
    environment !== 'test'
  ) {
    return false;
  }
  if (tags['job_kind'] === 'fulfill') {
    return (
      Object.keys(tags).length === 3 &&
      tags['campaign_version'] === undefined &&
      tags['campaign_step'] === undefined
    );
  }
  if (tags['job_kind'] !== 'send_step') return false;
  // App-tagged sends without a template carry five tags; newer sends carry
  // a sixth, bounded to the closed template allowlist.
  const template = tags['campaign_template'];
  const expectedTagCount = template === undefined ? 5 : 6;
  return (
    Object.keys(tags).length === expectedTagCount &&
    tags['campaign_version'] === 'v1' &&
    (tags['campaign_step'] === '1' ||
      tags['campaign_step'] === '2' ||
      tags['campaign_step'] === '3') &&
    (template === undefined || isCampaignTemplateId(template))
  );
}

function statusAfter(
  current: GrowthDeliveryStatus,
  incoming: GrowthDeliveryStatus,
): GrowthDeliveryStatus {
  return DELIVERY_STATUS_PRECEDENCE[incoming] >
    DELIVERY_STATUS_PRECEDENCE[current]
    ? incoming
    : current;
}

/**
 * Reads which database environment this process serves.
 *
 * @param environment - The variables to read; defaults to `process.env`.
 * @throws When `GROWTH_DATABASE_ENVIRONMENT` is not production, preview, or test.
 */
export function loadGrowthDatabaseEnvironment(
  environment: Record<string, string | undefined> = process.env,
): DeliveryEnvironment {
  const value = environment['GROWTH_DATABASE_ENVIRONMENT'];
  if (value === 'production' || value === 'preview' || value === 'test') {
    return value;
  }
  throw new Error(
    'GROWTH_DATABASE_ENVIRONMENT must be production, preview, or test',
  );
}

/** The webhook payload failed strict validation; the caller should answer 400. */
export class ResendWebhookPayloadError extends Error {
  constructor() {
    super('Invalid Resend webhook payload');
    this.name = 'ResendWebhookPayloadError';
  }
}

/**
 * Applies one signature-verified Resend event: records a delivery activity,
 * advances the job's delivery status, and stops the contact on a permanent
 * bounce, complaint, or provider suppression. Replays by `resend:<id>` are
 * no-ops. Events whose sender is not on {@link VERIFIED_DOMAIN} return
 * `foreign_sender`; events without `app: hashbrown` return `foreign_product`.
 * Both are ignored before any database call.
 *
 * @param executor - Opens the transaction the event is applied in.
 * @param input - The svix id and the parsed payload.
 * @param dependencies - The database environment and the stop implementation.
 * @throws {ResendWebhookPayloadError} When the id or payload is malformed.
 */
export async function processVerifiedResendWebhook(
  executor: SqlExecutor,
  input: { providerEventId: string; payload: unknown },
  dependencies: ProcessResendWebhookDependencies,
): Promise<ProcessResendWebhookResult> {
  let providerEventId: string;
  let event: ParsedResendEvent | null;
  try {
    providerEventId = boundedText(
      input.providerEventId,
      240,
      PROVIDER_ID_PATTERN,
    );
    event = parseSupportedEvent(input.payload);
  } catch {
    throw new ResendWebhookPayloadError();
  }
  if (!event) return { applied: false, reason: 'ignored_event_type' };
  if (event.tags['environment'] !== dependencies.databaseEnvironment) {
    return { applied: false, reason: 'environment_mismatch' };
  }
  if (event.senderDomain !== VERIFIED_DOMAIN) {
    return { applied: false, reason: 'foreign_sender' };
  }
  if (event.tags['app'] !== 'hashbrown') {
    return { applied: false, reason: 'foreign_product' };
  }
  const eventKey = `resend:${providerEventId}`;
  const projection = activityProjection(event);
  const activityData = {
    provider: 'resend',
    provider_event_id: providerEventId,
    provider_email_id: event.providerEmailId,
    event_type: event.type,
    category: projection.category,
  };

  return executor.transaction(async (transaction) => {
    const existing = await transaction.execute<WebhookActivityRow>(
      `/* growth:read-resend-webhook-activity */
       select event_key, contact_id, project_id, kind, occurred_at, data
       from growth_activity
       where event_key = $1`,
      [eventKey],
    );
    if (existing.rows[0]) {
      validateActivityReplay(existing.rows[0], {
        eventKey,
        activityKind: projection.activityKind,
        occurredAt: event.occurredAt,
        data: activityData,
      });
      return { applied: false, reason: 'replay' };
    }

    const discovered = await transaction.execute<{
      id: string;
      contact_id: string | null;
    }>(
      `/* growth:discover-resend-webhook-job */
       select id, contact_id
       from growth_jobs
       where provider_email_id = $1`,
      [event.providerEmailId],
    );
    const reference = discovered.rows[0];
    if (!reference) {
      return {
        applied: false,
        reason: isHashbrownGrowthSend(event.tags)
          ? 'retryable_unmatched_job'
          : 'unmatched_job',
      };
    }

    if (reference.contact_id !== null) {
      const contact = await transaction.execute<{ id: string }>(
        `/* growth:lock-resend-webhook-contact */
         select id
         from growth_contacts
         where id = $1
         for update`,
        [reference.contact_id],
      );
      if (!contact.rows[0]) throw new Error('Resend webhook contact not found');
    }

    const locked = await transaction.execute<WebhookJobRow>(
      `/* growth:lock-resend-webhook-job */
       select id, kind, contact_id, project_id, status, payload,
              provider_email_id, delivery_status
       from growth_jobs
       where provider_email_id = $1
       for update`,
      [event.providerEmailId],
    );
    const job = locked.rows[0];
    if (
      !job ||
      job.id !== reference.id ||
      job.contact_id !== reference.contact_id ||
      job.provider_email_id !== event.providerEmailId
    ) {
      throw new Error('Resend webhook job changed during processing');
    }
    validateCorroboration(job, event);
    if (event.rfcMessageId)
      await bindOutboundMessageId(
        transaction,
        event.providerEmailId,
        event.rfcMessageId,
      );

    const inserted = await transaction.execute<{ event_key: string }>(
      `/* growth:insert-resend-webhook-activity */
       insert into growth_activity (
         event_key, contact_id, project_id, kind, occurred_at, data
       ) values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (event_key) do nothing
       returning event_key`,
      [
        eventKey,
        job.contact_id,
        job.project_id,
        projection.activityKind,
        event.occurredAt,
        JSON.stringify(activityData),
      ],
    );
    if (inserted.rows.length === 0) {
      const replay = await transaction.execute<WebhookActivityRow>(
        `/* growth:read-resend-webhook-activity */
         select event_key, contact_id, project_id, kind, occurred_at, data
         from growth_activity
         where event_key = $1`,
        [eventKey],
      );
      validateActivityReplay(replay.rows[0], {
        eventKey,
        activityKind: projection.activityKind,
        occurredAt: event.occurredAt,
        data: activityData,
        contactId: job.contact_id,
        projectId: job.project_id,
      });
      return { applied: false, reason: 'replay' };
    }

    const nextStatus = statusAfter(
      job.delivery_status,
      projection.incomingStatus,
    );
    if (nextStatus !== job.delivery_status) {
      await transaction.execute(
        `/* growth:update-resend-delivery-status */
         update growth_jobs
         set delivery_status = $2
         where id = $1
           and provider_email_id = $3`,
        [job.id, nextStatus, event.providerEmailId],
      );
    }

    if (projection.stopReason && job.contact_id !== null) {
      await dependencies.stopContact(nestedExecutor(transaction), {
        contactId: job.contact_id,
        reason: projection.stopReason,
        eventKey: `${eventKey}:stop`,
        occurredAt: event.occurredAt,
        source: 'resend_webhook',
        provenance: {
          actor: 'resend',
          kind: 'provider_webhook',
          policyVersion: 'growth-lifecycle-v1',
        },
      });
    }

    return {
      applied: true,
      activityKind: projection.activityKind,
      deliveryStatus: nextStatus,
    };
  });
}
