import {
  nestedExecutor,
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import { stopContact } from './stops.ts';

/** Stable mailbox ledger identity, retained across the root-domain cutover. */
export const INBOX_PILOT_ADDRESS = 'brian@replies.hashbrown.dev';

/** Primary reply address after the operator-authorized root MX cutover. */
export const INBOX_REPLY_ADDRESS = 'brian@hashbrown.dev';

/** Accepts only Brian's root receiving address; the legacy alias is retired. */
export function isInboxRecipient(value: unknown): boolean {
  return (
    typeof value === 'string' && value.toLowerCase() === INBOX_REPLY_ADDRESS
  );
}

/** Explicit, server-side pilot configuration. The start bounds recovery coverage. */
export type InboxPilot =
  { enabled: false } | { enabled: true; address: string; startedAt: Date };

/** Loads the opt-in pilot; invalid enabled configuration fails closed. */
export function loadInboxPilot(
  env: Record<string, string | undefined> = process.env,
): InboxPilot {
  if (
    env['RESEND_INBOX_PILOT_ENABLED'] === undefined ||
    env['RESEND_INBOX_PILOT_ENABLED'] === 'false'
  )
    return { enabled: false };
  const startedAt = new Date(env['RESEND_INBOX_PILOT_STARTED_AT'] ?? '');
  if (
    env['RESEND_INBOX_PILOT_ENABLED'] !== 'true' ||
    env['RESEND_INBOX_PILOT_ADDRESS'] !== INBOX_PILOT_ADDRESS ||
    !Number.isFinite(startedAt.getTime())
  )
    throw new Error('Invalid Resend inbox pilot configuration');
  return { enabled: true, address: INBOX_PILOT_ADDRESS, startedAt };
}

/** A provider identifier safe for URL path components and database event keys. */
export function inboxProviderId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error('Invalid Resend identifier');
  return value;
}

/** Validates an RFC Message-ID, retaining the case-sensitive local part. */
export function inboxMessageId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 998 || /[\r\n\0]/.test(value))
    throw new Error('Invalid RFC message ID');
  const match = /^<([^<>\s@]+)@([A-Za-z0-9.-]+)>$/.exec(value.trim());
  if (!match) throw new Error('Invalid RFC message ID');
  return `<${match[1]}@${match[2].toLowerCase()}>`;
}

/** Extracts bounded reference evidence without depending on subject or body. */
export function parseReplyHeaders(value: unknown): {
  messageId: string | null;
  references: string[];
  direct: string | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Missing received headers');
  const headers = Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key.toLowerCase(), field]),
  );
  const read = (name: string): string => {
    const field = headers[name] ?? '';
    if (typeof field !== 'string' || field.length > 12000)
      throw new Error('Invalid received header');
    const unfolded = field.replace(/\r?\n[ \t]+/g, ' ');
    if (/[\r\n\0]/.test(unfolded)) throw new Error('Invalid received header');
    return unfolded.trim();
  };
  const ids = (text: string): string[] => {
    if (!text) return [];
    const tokens = text.match(/<[^<>]+>/g) ?? [];
    if (
      tokens.length === 0 ||
      tokens.length > 100 ||
      text.replace(/<[^<>]+>/g, '').trim()
    )
      throw new Error('Invalid reference headers');
    return tokens.map(inboxMessageId);
  };
  const directIds = ids(read('in-reply-to'));
  if (directIds.length > 1) throw new Error('Ambiguous direct reference');
  const direct = directIds[0] ?? null;
  const messageId = read('message-id');
  return {
    messageId: messageId ? inboxMessageId(messageId) : null,
    direct,
    references: [...new Set([...directIds, ...ids(read('references'))])],
  };
}

/** Provider data is inspected in memory; bodies and subjects are never stored. */
export interface InboxReceivedEmail {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  headers: unknown;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  raw?: { download_url: string };
}

/** Operations required by the reply processor, injectable for deterministic tests. */
export interface InboxReplyDependencies {
  getReceived: (id: string) => Promise<InboxReceivedEmail>;
  stopContact: typeof stopContact;
}

/** Serializes inbox admission/settlement with final campaign authorization. */
export async function inboxTransactionGuard(tx: SqlTransaction): Promise<void> {
  await tx.execute(
    `/* growth:inbox-send-lock */ select pg_advisory_xact_lock(hashtextextended('hashbrown-inbox-send-v1', 0))`,
  );
}

/** Registers a configured mailbox without changing its immutable recovery start. */
export async function ensureInboxMailbox(
  tx: SqlTransaction,
  config: Extract<InboxPilot, { enabled: true }>,
): Promise<void> {
  const result = await tx.execute(
    `/* growth:inbox-ensure-mailbox */
    insert into growth_reply_mailboxes(address, started_at, enabled) values ($1, $2, true)
    on conflict (address) do update set enabled = true
      where growth_reply_mailboxes.started_at = excluded.started_at
    returning address`,
    [config.address, config.startedAt],
  );
  if (!result.rows.length) throw new Error('Mailbox recovery start conflict');
}

/** Admits root-address mail into the stable historical mailbox ledger. */
export async function admitInboxEvent(
  executor: SqlExecutor,
  payload: unknown,
  config: Extract<InboxPilot, { enabled: true }>,
): Promise<string | null> {
  if (!payload || typeof payload !== 'object')
    throw new Error('Invalid inbound payload');
  const root = payload as Record<string, unknown>;
  if (root['type'] !== 'email.received') return null;
  const data = root['data'] as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data['to']))
    throw new Error('Invalid inbound recipients');
  if (!data['to'].some(isInboxRecipient)) return null;
  const id = inboxProviderId(data['email_id']);
  const receivedAt = new Date(String(data['created_at'] ?? root['created_at']));
  if (!Number.isFinite(receivedAt.getTime()))
    throw new Error('Invalid received timestamp');
  if (receivedAt < config.startedAt) return null;
  await executor.transaction(async (tx) => {
    await privacyLock(tx);
    await inboxTransactionGuard(tx);
    await ensureInboxMailbox(tx, config);
    await tx.execute(
      `/* growth:inbox-admit */
      insert into growth_reply_receipts(id, recipient, received_at) values ($1, $2, $3)
      on conflict (id) do nothing`,
      [id, config.address, receivedAt],
    );
  });
  return id;
}

/** Binds a submitted Hashbrown job once; conflicting or missing jobs fail closed. */
export async function bindOutboundMessageId(
  tx: SqlTransaction,
  providerId: string,
  messageId: string,
): Promise<void> {
  const result = await tx.execute(
    `/* growth:inbox-bind-outbound */
    update growth_jobs set rfc_message_id = $2
    where provider_email_id = $1 and kind in ('fulfill', 'send_step')
      and (rfc_message_id is null or rfc_message_id = $2)
    returning id`,
    [inboxProviderId(providerId), inboxMessageId(messageId)],
  );
  if (result.rows.length !== 1)
    throw new Error('Outbound Message-ID binding conflict');
}

/** Normalizes a received sender address for matching and erasure lookups. */
export function inboxSenderAddress(value: string): string {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n\0]/.test(value))
    throw new Error('Invalid received sender');
  const address = (/<([^<>]+)>$/.exec(value)?.[1] ?? value)
    .trim()
    .toLowerCase();
  if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(address))
    throw new Error('Invalid received sender');
  return address;
}

/**
 * Matches a provider-fetched reply and applies the canonical stop in the same
 * transaction as receipt completion. Unknown references remain recoverable.
 */
export async function processInboxReceipt(
  executor: SqlExecutor,
  rawId: string,
  config: Extract<InboxPilot, { enabled: true }>,
  dependencies: InboxReplyDependencies,
): Promise<'stopped' | 'ignored' | 'pending'> {
  const id = inboxProviderId(rawId);
  // Fetch outside the transaction; no provider call may hold a contact lock.
  const email = await dependencies.getReceived(id);
  if (
    email.id !== id ||
    !Array.isArray(email.to) ||
    !email.to.some(isInboxRecipient)
  )
    throw new Error('Received mailbox mismatch');
  const receivedAt = new Date(email.created_at);
  if (!Number.isFinite(receivedAt.getTime()) || receivedAt < config.startedAt)
    throw new Error('Invalid received timestamp');
  const sender = inboxSenderAddress(email.from);
  const evidence = parseReplyHeaders(email.headers);
  return executor.transaction(async (tx) => {
    await privacyLock(tx);
    await inboxTransactionGuard(tx);
    // Serialize per mailbox, then contact, then receipt, consistently with recovery.
    await tx.execute(
      `/* growth:inbox-mailbox-lock */ select address from growth_reply_mailboxes where address = $1 for share`,
      [config.address],
    );
    const locked = await tx.execute<{
      status: 'pending' | 'stopped' | 'ignored';
      recipient: string;
    }>(
      `/* growth:inbox-receipt-lock */ select * from growth_reply_receipts where id = $1 for update`,
      [id],
    );
    const receipt = locked.rows[0];
    if (!receipt || receipt.recipient !== config.address)
      throw new Error('Missing inbound receipt');
    if (receipt.status !== 'pending') return receipt.status;
    const complete = async (
      status: 'ignored' | 'stopped',
      contactId: string | null = null,
      errorCode: 'contact_deleted' | null = null,
    ): Promise<typeof status> => {
      await tx.execute(
        `/* growth:inbox-complete */ update growth_reply_receipts
        set status = $2, contact_id = $3, reference_ids = null, rfc_message_id = null,
          attempts = attempts + 1, last_error_code = $4, updated_at = now() where id = $1`,
        [id, status, contactId, errorCode],
      );
      return status;
    };
    if (!evidence.references.length || isInboxRecipient(sender))
      return complete('ignored');
    const matches = await tx.execute<{
      contact_id: string;
      rfc_message_id: string;
    }>(
      `/* growth:inbox-match */
      select distinct contact_id, rfc_message_id from growth_jobs
      where rfc_message_id = any($1::text[]) and kind in ('fulfill','send_step') and contact_id is not null`,
      [evidence.references],
    );
    const directMatches = matches.rows.filter(
      (row) => row.rfc_message_id === evidence.direct,
    );
    const candidates = directMatches.length ? directMatches : matches.rows;
    const contacts = [...new Set(candidates.map((row) => row.contact_id))];
    if (contacts.length !== 1) {
      await tx.execute(
        `/* growth:inbox-pending */ update growth_reply_receipts set
        reference_ids = $2::jsonb, received_at = $3, attempts = attempts + 1,
        contact_id = (select id from growth_contacts where email_normalized = $4 and deleted_at is null),
        last_error_code = $5, updated_at = now() where id = $1`,
        [
          id,
          JSON.stringify(evidence.references),
          receivedAt,
          sender,
          contacts.length ? 'ambiguous_references' : 'binding_pending',
        ],
      );
      return 'pending';
    }
    const contactId = contacts[0];
    const contact = await tx.execute<{
      id: string;
      deleted_at: unknown;
      email_normalized: string | null;
    }>(
      `/* growth:inbox-contact-lock */ select id, deleted_at, email_normalized from growth_contacts where id = $1 for update`,
      [contactId],
    );
    if (!contact.rows[0] || contact.rows[0].deleted_at !== null)
      return complete('ignored', null, 'contact_deleted');
    if (contact.rows[0].email_normalized?.toLowerCase() !== sender) {
      await tx.execute(
        `/* growth:inbox-pending */ update growth_reply_receipts set contact_id = $2,
        reference_ids = $3::jsonb, last_error_code = 'sender_mismatch', attempts = attempts + 1, updated_at = now() where id = $1`,
        [id, contactId, JSON.stringify(evidence.references)],
      );
      return 'pending';
    }
    const eventKey = `resend:reply:${id}:stop`;
    await dependencies.stopContact(nestedExecutor(tx), {
      contactId,
      reason: 'campaign.reply_received',
      eventKey,
      occurredAt: receivedAt,
      source: 'resend_inbox',
      provenance: {
        kind: 'mailbox_reply',
        actor: 'resend',
        policyVersion: 'resend-inbox-pilot-v1',
      },
    });
    return complete('stopped', contactId);
  });
}
