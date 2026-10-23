import { randomUUID } from 'node:crypto';

import type { SqlExecutor } from './database.ts';
import {
  completeProviderAttempt,
  ProviderAttemptError,
  providerIdempotencyKey,
  reserveProviderAttempt,
} from './provider-attempts.ts';
import { RECIPIENT_EMAIL_SENDER } from './resend.ts';

const PRODUCT = 'hashbrown';
const RECIPIENT = 'brian@cacheplane.ai';
const ALLOWED_CODES = new Set([
  'mailbox_disabled',
  'recovery_in_progress',
  'coverage_stale',
  'unread_receipts',
  'pending_receipts',
  'unforwarded_receipts',
  'unbound_messages',
  'send_outcome_unknown',
  'provider_attempt_expired',
  'recovery_failed',
  'health_read_failed',
]);

/** Immutable provider payload derived only from an outbox transition. */
export interface ReceivingHealthAlertPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
  tags: { name: string; value: string }[];
}

/** Injectable clocks, attempt persistence, and server-only provider transport. */
export interface ReceivingHealthAlertDependencies {
  now(): Date;
  createId(): string;
  send(payload: ReceivingHealthAlertPayload, key: string): Promise<string>;
  reserveAttempt: typeof reserveProviderAttempt;
  completeAttempt: typeof completeProviderAttempt;
  fetch: typeof globalThis.fetch;
}

/** Redacted outcome of recording health and flushing at most one pending alert. */
export interface ReceivingHealthAlertResult {
  status: 'disabled' | 'idle' | 'sent' | 'pending' | 'failed';
  queued: boolean;
}

function canonicalCodes(codes: readonly string[]): string[] {
  if (!Array.isArray(codes) || codes.some((code) => !ALLOWED_CODES.has(code)))
    throw new Error('Invalid receiving health codes');
  return [...new Set(codes)].sort();
}

function providerId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value))
    throw new Error('Invalid alert provider outcome');
  return value;
}

async function sendAlert(
  payload: ReceivingHealthAlertPayload,
  key: string,
  apiKey: string,
  fetcher: typeof globalThis.fetch,
): Promise<string> {
  if (!apiKey || /[\r\n\0]/u.test(apiKey))
    throw new Error('Missing alert credentials');
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Alert submission outcome unknown');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Alert submission outcome unknown');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16_384) throw new Error('Alert response too large');
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      id?: unknown;
    };
    return providerId(result?.id);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Atomically records receiving-health transitions, then flushes one durable alert.
 * Initial healthy state and unchanged canonical codes are silent. Delivery uses
 * immutable outbox time/codes and the existing provider-attempt horizon, outside
 * database locks. Expired or conflicting attempts retain terminal audit evidence
 * and cannot starve later recovery alerts. Only the approved production recipient
 * is enabled; failures return closed statuses without exposing provider content.
 */
export async function reportReceivingHealth(
  db: SqlExecutor,
  codes: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Partial<ReceivingHealthAlertDependencies> = {},
): Promise<ReceivingHealthAlertResult> {
  if (
    environment['GROWTH_HEALTH_ALERTS_ENABLED'] !== 'true' ||
    environment['DELIVERY_ENVIRONMENT'] !== 'production' ||
    environment['GROWTH_DATABASE_ENVIRONMENT'] !== 'production' ||
    (environment['VERCEL_ENV'] !== undefined &&
      environment['VERCEL_ENV'] !== 'production')
  )
    return { status: 'disabled', queued: false };
  let queued = false;
  let selected = false;
  try {
    if (
      environment['GROWTH_HEALTH_ALERT_RECIPIENT']?.trim().toLowerCase() !==
      RECIPIENT
    )
      throw new Error('Invalid alert recipient');
    const normalized = canonicalCodes(codes);
    const fingerprint = JSON.stringify(normalized);
    const clock = dependencies.now ?? (() => new Date());
    const occurredAt = clock();
    if (!Number.isFinite(occurredAt.getTime()))
      throw new Error('Invalid alert clock');
    const stateKey = `${PRODUCT}:receiving`;
    queued = await db.transaction(async (tx) => {
      await tx.execute(
        `/* growth:health-alert-state-insert */ insert into growth_health_alert_state(key, environment, fingerprint)
         values ($1, $2, '[]') on conflict (key, environment) do nothing`,
        [stateKey, 'production'],
      );
      const previous = await tx.execute<{ fingerprint: string }>(
        `/* growth:health-alert-state-lock */ select fingerprint from growth_health_alert_state
         where key = $1 and environment = $2 for update`,
        [stateKey, 'production'],
      );
      if (previous.rows.length !== 1) throw new Error('Missing alert state');
      if (previous.rows[0].fingerprint === fingerprint) return false;
      await tx.execute(
        `/* growth:health-alert-state-update */ update growth_health_alert_state set fingerprint = $3
         where key = $1 and environment = $2`,
        [stateKey, 'production', fingerprint],
      );
      await tx.execute(
        `/* growth:health-alert-enqueue */ insert into growth_health_alert_outbox(id, environment, codes, created_at)
         values ($1::uuid, $2, $3::jsonb, $4)`,
        [
          (dependencies.createId ?? randomUUID)(),
          'production',
          fingerprint,
          occurredAt,
        ],
      );
      return true;
    });
    const pending = await db.execute<{
      id: string;
      environment: string;
      codes: string[];
      created_at: Date | string;
    }>(
      `/* growth:health-alert-pending */ select id, environment, codes, created_at from growth_health_alert_outbox
       where environment = $1 and provider_email_id is null and failure_code is null
       order by sequence limit 1`,
      ['production'],
    );
    const alert = pending.rows[0];
    if (!alert) return { status: 'idle', queued };
    selected = true;
    const createdAt = new Date(alert.created_at);
    const frozenCodes = canonicalCodes(alert.codes);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      alert.environment !== 'production'
    )
      throw new Error('Invalid alert outbox');
    const payload: ReceivingHealthAlertPayload = {
      from: RECIPIENT_EMAIL_SENDER,
      to: RECIPIENT,
      subject: `${PRODUCT} receiving ${frozenCodes.length ? 'needs attention' : 'recovered'}`,
      text: `${PRODUCT} receiving health at ${createdAt.toISOString()}\n${frozenCodes.length ? frozenCodes.join('\n') : 'healthy'}\n`,
      tags: [
        { name: 'app', value: PRODUCT },
        { name: 'environment', value: 'production' },
        { name: 'job_kind', value: 'health_alert' },
      ],
    };
    const key = providerIdempotencyKey(
      'production',
      `health-alert:${alert.id}`,
    );
    let knownId: string | null;
    try {
      knownId = await (dependencies.reserveAttempt ?? reserveProviderAttempt)(
        db,
        key,
        payload,
        clock(),
      );
    } catch (error) {
      if (!(error instanceof ProviderAttemptError)) throw error;
      await db.execute(
        `/* growth:health-alert-terminal */ update growth_health_alert_outbox set failure_code = $2
         where id = $1::uuid and provider_email_id is null and failure_code is null`,
        [alert.id, error.code],
      );
      return { status: 'failed', queued };
    }
    const id = providerId(
      knownId ??
        (await (
          dependencies.send ??
          ((message, idempotencyKey) =>
            sendAlert(
              message,
              idempotencyKey,
              environment['RESEND_API_KEY'] ?? '',
              dependencies.fetch ?? globalThis.fetch,
            ))
        )(payload, key)),
    );
    await (dependencies.completeAttempt ?? completeProviderAttempt)(
      db,
      key,
      id,
    );
    const accepted = await db.execute(
      `/* growth:health-alert-accepted */ update growth_health_alert_outbox set provider_email_id = $2, failure_code = null
       where id = $1::uuid and (provider_email_id is null or provider_email_id = $2) returning id`,
      [alert.id, id],
    );
    if (accepted.rows.length !== 1)
      throw new Error('Conflicting alert acceptance');
    return { status: 'sent', queued };
  } catch {
    return { status: selected ? 'pending' : 'failed', queued };
  }
}
