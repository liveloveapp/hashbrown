import { createHash } from 'node:crypto';
import type { SqlExecutor } from './database.ts';

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

interface ProviderMessageJobRow extends Record<string, unknown> {
  id: string;
  kind: string;
  contact_id: string | null;
  status: string;
  provider_email_id: string | null;
  delivery_status: string;
  rfc_message_id: string | null;
}

interface ProviderMessageContactRow extends Record<string, unknown> {
  id: string;
  deleted_at: Date | string | null;
}

/** SHA-256 of a UTF-8 string, base64url without padding (43 characters). */
export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function parseMessageId(value: string): string {
  if (value.length === 0 || value.length > 254 || /\r|\n|\0/u.test(value)) {
    throw new Error('message_id is invalid');
  }
  const raw = value.trim();
  const match = MESSAGE_ID_PATTERN.exec(raw);
  if (!match || raw.includes('..')) throw new Error('message_id is invalid');
  return `<${match[1]}@${(match[2] as string).toLowerCase()}>`;
}

/**
 * Normalizes a subject for reply matching: Unicode NFKC, any run of leading
 * `Re:`, `Fw:`, `Fwd:` or `Aw:` prefixes removed, whitespace collapsed,
 * trimmed and lowercased.
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

/** Thrown when a provider Message-ID cannot be bound to its job safely. */
export class ProviderMessageIdBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderMessageIdBindingError';
  }
}

/**
 * Binds a provider-reported RFC Message-ID to the completed `fulfill` or
 * `send_step` job that carries `providerEmailId`, locking the contact and
 * then the job. Binding is idempotent for the same Message-ID. For a deleted
 * contact nothing is bound. Only provider-authenticated identifiers are bound.
 *
 * @param executor - The growth database executor.
 * @param input - The provider email id and the RFC Message-ID it reported.
 * @returns `bound`, `unmatched` when no job carries the provider id, or
 *   `ignored_deleted` when the job's contact was deleted.
 * @throws {ProviderMessageIdBindingError} On malformed or conflicting identities.
 */
export async function bindProviderMessageId(
  executor: SqlExecutor,
  input: { providerEmailId: string; rfcMessageId: string },
): Promise<'bound' | 'unmatched' | 'ignored_deleted'> {
  let rfcMessageId: string;
  try {
    rfcMessageId = parseMessageId(input.rfcMessageId);
  } catch {
    throw new ProviderMessageIdBindingError('Invalid provider message_id');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(input.providerEmailId)) {
    throw new ProviderMessageIdBindingError('Invalid provider email ID');
  }
  return executor.transaction(async (transaction) => {
    const discovered = await transaction.execute<ProviderMessageJobRow>(
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
    const contact = await transaction.execute<ProviderMessageContactRow>(
      `/* growth:lock-provider-message-contact */
       select id, deleted_at from growth_contacts where id = $1 for update`,
      [reference.contact_id],
    );
    const locked = await transaction.execute<ProviderMessageJobRow>(
      `/* growth:lock-provider-message-job */
       select id, kind, contact_id, status, provider_email_id, delivery_status,
              rfc_message_id
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
    return 'bound';
  });
}
