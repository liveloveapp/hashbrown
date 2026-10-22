import {
  inboxProviderId,
  type InboxReceivedEmail,
  inboxSenderAddress,
} from './inbox-replies.ts';
import {
  completeProviderAttempt,
  providerIdempotencyKey,
  reserveProviderAttempt,
} from './provider-attempts.ts';
import {
  nestedExecutor,
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';

/** Operator-requested destination; inbound messages cannot choose a recipient. */
export const INBOX_FORWARD_TO = 'brian@cacheplane.ai';

/** Full forwarded message, reconstructed transiently from provider-held content. */
export function buildInboxForward(
  email: InboxReceivedEmail,
  raw: Uint8Array,
  environment: string,
) {
  return {
    from: 'Brian at Hashbrown <brian@hashbrown.dev>',
    to: INBOX_FORWARD_TO,
    replyTo: email.from,
    subject: `Fwd: ${email.subject ?? '(no subject)'}`,
    text:
      email.text ?? 'The original email, including attachments, is attached.',
    ...(email.html ? { html: email.html } : {}),
    attachments: [
      {
        filename: 'original.eml',
        content: Buffer.from(raw).toString('base64'),
      },
    ],
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Hashbrown-Forwarded': email.id,
    },
    tags: [
      { name: 'app', value: 'hashbrown' },
      { name: 'environment', value: environment },
      { name: 'job_kind', value: 'inbox_forward' },
    ],
  };
}

/** Side effects needed to forward a receipt independently of its reply classification. */
export interface InboxForwardDependencies {
  /** Checks retained contact tombstones inside the forwarding privacy lock. */
  isErasedSender: (tx: SqlTransaction, sender: string) => Promise<boolean>;
  environment: string;
  getReceived: (id: string) => Promise<InboxReceivedEmail>;
  getRaw: (url: string) => Promise<Uint8Array>;
  send: (
    payload: ReturnType<typeof buildInboxForward>,
    key: string,
  ) => Promise<string>;
  now?: () => Date;
}

/**
 * Forwards admitted pilot mail once per provider receipt. Provider retries use
 * an immutable payload and the same environment-scoped key for at most 23h.
 */
export async function forwardInboxReceipt(
  db: SqlExecutor,
  rawId: string,
  deps: InboxForwardDependencies,
): Promise<string | null> {
  const id = inboxProviderId(rawId);
  const key = providerIdempotencyKey(deps.environment, `inbox-forward:${id}`);
  const readReceipt = async (tx: SqlTransaction) => {
    const result = await tx.execute<{
      recipient: string;
      forward_provider_id: string | null;
      last_error_code: string | null;
    }>(
      `/* growth:inbox-forward-receipt */ select recipient, forward_provider_id, last_error_code from growth_reply_receipts where id = $1`,
      [id],
    );
    const receipt = result.rows[0];
    if (!receipt || receipt.recipient !== 'brian@replies.hashbrown.dev')
      throw new Error('Unknown forwarding receipt');
    return receipt;
  };
  const finish = async (tx: SqlTransaction, providerId: string) => {
    inboxProviderId(providerId);
    const completed = await tx.execute(
      `/* growth:inbox-forward-complete */ update growth_reply_receipts set forward_provider_id = $2 where id = $1 and (forward_provider_id is null or forward_provider_id = $2) returning id`,
      [id, providerId],
    );
    if (completed.rows.length !== 1)
      throw new Error('Forwarding receipt conflict');
    return providerId;
  };
  const receipt = await readReceipt(db);
  if (receipt.last_error_code === 'contact_deleted') return null;
  if (receipt.forward_provider_id) return receipt.forward_provider_id;
  // Known acceptance is enough to finish a crashed receipt, even when provider
  // retention or signed download expiry makes the original unavailable.
  const accepted = await db.execute<{ provider_email_id: string }>(
    `/* growth:inbox-forward-accepted */ select provider_email_id from growth_provider_attempts where idempotency_key = $1 and provider_email_id is not null`,
    [key],
  );
  if (accepted.rows.length) {
    return db.transaction(async (tx) => {
      await privacyLock(tx);
      if ((await readReceipt(tx)).last_error_code === 'contact_deleted')
        return null;
      return finish(tx, accepted.rows[0].provider_email_id);
    });
  }
  const email = await deps.getReceived(id);
  if (
    email.id !== id ||
    !Array.isArray(email.to) ||
    !email.to.some((to) => to.toLowerCase() === receipt.recipient) ||
    !email.raw?.download_url
  )
    throw new Error('Forward source mismatch or raw unavailable');
  const payload = buildInboxForward(
    email,
    await deps.getRaw(email.raw.download_url),
    deps.environment,
  );
  // Commit first-attempt evidence before network I/O; an uncertain send must
  // never roll this timestamp back and reopen the 24-hour provider horizon.
  await reserveProviderAttempt(
    db,
    key,
    payload,
    (deps.now ?? (() => new Date()))(),
  );
  return db.transaction(async (tx) => {
    // Fetching is outside the lock. Recheck erasure after fetching, then retain
    // the shared privacy lock through the bounded send so erasure cannot commit
    // before a newly authorized forward. No contact row lock is held.
    await privacyLock(tx);
    const current = await readReceipt(tx);
    if (current.last_error_code === 'contact_deleted') return null;
    if (current.forward_provider_id) return current.forward_provider_id;
    if (await deps.isErasedSender(tx, inboxSenderAddress(email.from))) {
      await tx.execute(
        `/* growth:inbox-forward-erased */ update growth_reply_receipts
         set status = 'ignored', contact_id = null, reference_ids = null,
           rfc_message_id = null, last_error_code = 'contact_deleted', updated_at = now()
         where id = $1`,
        [id],
      );
      return null;
    }
    const known = await reserveProviderAttempt(
      nestedExecutor(tx),
      key,
      payload,
      (deps.now ?? (() => new Date()))(),
    );
    const providerId = known ?? (await deps.send(payload, key));
    inboxProviderId(providerId);
    await completeProviderAttempt(tx, key, providerId);
    return finish(tx, providerId);
  });
}

/** Downloads provider-held raw MIME with a size limit and no redirect following. */
export async function downloadInboxRaw(url: string): Promise<Uint8Array> {
  if (new URL(url).protocol !== 'https:') throw new Error('Invalid raw URL');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw new Error('Raw email unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Raw email exceeds forwarding limit');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
