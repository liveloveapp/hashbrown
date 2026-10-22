import { nestedExecutor, type SqlExecutor } from './database.ts';
import { findContactIdByEmail } from './contacts.ts';
import { parseEmailHmacKeyring } from './email-keyring.ts';
import { downloadInboxRaw, forwardInboxReceipt } from './inbox-forward.ts';
import { createInboxResendClient } from './inbox-resend.ts';
import { stopContact } from './stops.ts';
import { loadGrowthDatabaseEnvironment } from './webhooks.ts';

/**
 * Creates receiving, reply processing, and forwarding collaborators with fixed
 * credentials and environment. Sending always uses the separate sending key.
 */
export function createInboxRuntime(
  environment: Record<string, string | undefined> = process.env,
) {
  const deliveryEnvironment = loadGrowthDatabaseEnvironment(environment);
  const sendingKey = environment['RESEND_API_KEY'];
  if (!sendingKey || /[\r\n\0]/u.test(sendingKey))
    throw new Error('Resend sending key is required');
  const client = createInboxResendClient(
    environment['RESEND_INBOX_READ_API_KEY'] ?? '',
  );
  const keyring = parseEmailHmacKeyring(environment);
  const now = () => new Date();
  return {
    ...client,
    stopContact,
    now,
    forwardReceipt: (db: SqlExecutor, id: string) =>
      forwardInboxReceipt(db, id, {
        environment: deliveryEnvironment,
        getReceived: client.getReceived,
        getRaw: downloadInboxRaw,
        now,
        isErasedSender: async (tx, sender) => {
          const contactId = await findContactIdByEmail(
            nestedExecutor(tx),
            sender,
            keyring,
          );
          if (contactId === null) return false;
          const result = await tx.execute<{ deleted_at: Date | string | null }>(
            `/* growth:inbox-forward-sender-deletion */ select deleted_at from growth_contacts where id = $1`,
            [contactId],
          );
          if (result.rows.length !== 1)
            throw new Error('Missing forwarding sender contact');
          return result.rows[0].deleted_at !== null;
        },
        send: async (payload, key) => {
          const { replyTo, ...message } = payload;
          try {
            const response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${sendingKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': key,
              },
              redirect: 'error',
              signal: AbortSignal.timeout(15000),
              body: JSON.stringify({ ...message, reply_to: replyTo }),
            });
            if (!response.ok) {
              await response.body?.cancel();
              throw new Error('Inbox forward submission failed');
            }
            const result = (await response.json()) as { id?: unknown } | null;
            if (typeof result?.id !== 'string' || !result.id)
              throw new Error('Inbox forward submission failed');
            return result.id;
          } catch {
            throw new Error('Inbox forward submission failed');
          }
        },
      }),
  };
}
