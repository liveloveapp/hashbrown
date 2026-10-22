import { createHash } from 'node:crypto';

import type { SqlExecutor, SqlTransaction } from './database.ts';

/** A retry is refused when payload evidence or provider deduplication is unsafe. */
export class ProviderAttemptError extends Error {
  constructor(readonly code: 'payload_conflict' | 'idempotency_expired') {
    super(
      code === 'payload_conflict'
        ? 'Provider payload changed'
        : 'Provider idempotency expired',
    );
  }
}

/** Namespaces provider keys across the shared Resend account; bounded for any input. */
export function providerIdempotencyKey(
  environment: string,
  source: string,
): string {
  if (!['production', 'preview', 'test'].includes(environment))
    throw new Error('Invalid provider environment');
  return `hashbrown:${environment}:${createHash('sha256').update(source).digest('hex')}`;
}

/**
 * Records the first attempt and a digest of the complete payload before sending.
 * Retries keep both immutable and stay inside a conservative 23-hour horizon.
 */
export async function reserveProviderAttempt(
  db: SqlExecutor,
  key: string,
  payload: unknown,
  now: Date,
): Promise<string | null> {
  if (key.length > 255 || !Number.isFinite(now.getTime()))
    throw new Error('Invalid provider attempt');
  const digest = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(
      `/* growth:provider-attempt-insert */ insert into growth_provider_attempts(idempotency_key, first_attempted_at, payload_sha256)
      values ($1,$2,$3) on conflict (idempotency_key) do nothing`,
      [key, now, digest],
    );
    const result = await tx.execute<{
      first_attempted_at: Date | string;
      payload_sha256: string;
      provider_email_id: string | null;
    }>(
      `/* growth:provider-attempt-lock */ select * from growth_provider_attempts where idempotency_key = $1 for update`,
      [key],
    );
    const attempt = result.rows[0];
    if (!attempt) throw new Error('Missing provider attempt');
    // Already accepted work is returned without submitting again, even later.
    if (attempt.provider_email_id) return attempt.provider_email_id;
    if (
      now.getTime() - new Date(attempt.first_attempted_at).getTime() >=
      23 * 3600000
    )
      throw new ProviderAttemptError('idempotency_expired');
    if (attempt.payload_sha256 !== digest)
      throw new ProviderAttemptError('payload_conflict');
    return null;
  });
}

/** Records known provider acceptance without allowing a conflicting ID. */
export async function completeProviderAttempt(
  tx: SqlTransaction,
  key: string,
  providerId: string,
): Promise<void> {
  const result = await tx.execute(
    `/* growth:provider-attempt-complete */ update growth_provider_attempts set provider_email_id = $2
    where idempotency_key = $1 and (provider_email_id is null or provider_email_id = $2) returning idempotency_key`,
    [key, providerId],
  );
  if (result.rows.length !== 1) throw new Error('Provider acceptance conflict');
}
