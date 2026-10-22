import { randomUUID } from 'node:crypto';

import type { SqlExecutor } from './database.ts';
import {
  admitInboxEvent,
  bindOutboundMessageId,
  ensureInboxMailbox,
  type InboxPilot,
  type InboxReplyDependencies,
  inboxTransactionGuard,
  isInboxRecipient,
  processInboxReceipt,
} from './inbox-replies.ts';
import type { InboxReceivedReference } from './inbox-resend.ts';

/** Injectable provider operations for a complete, replayable receiving scan. */
export interface InboxRecoveryDependencies extends InboxReplyDependencies {
  listReceived: () => AsyncIterable<InboxReceivedReference>;
  getSent: (id: string) => Promise<{ message_id: string | null }>;
  now: () => Date;
  /** Independent forwarding of every admitted receipt, including ignored mail. */
  forwardReceipt?: (db: SqlExecutor, id: string) => Promise<string | null>;
}

/**
 * Recovers all retained pilot mail and outbound bindings. Only a full successful
 * scan may publish its start time as coverage, guarded by the recovery generation.
 * A failure deliberately leaves recovery_id set and campaigns blocked.
 */
export async function recoverInbox(
  executor: SqlExecutor,
  config: Extract<InboxPilot, { enabled: true }>,
  dependencies: InboxRecoveryDependencies,
): Promise<{ received: number; processed: number }> {
  const started = dependencies.now();
  if (!Number.isFinite(started.getTime()) || started < config.startedAt)
    throw new Error('Invalid recovery clock');
  const generation = randomUUID();
  const previous = await executor.transaction(async (tx) => {
    await inboxTransactionGuard(tx);
    await ensureInboxMailbox(tx, config);
    const result = await tx.execute<{ healthy_through: Date | string | null }>(
      `/* growth:inbox-recovery-start */ update growth_reply_mailboxes set recovery_id = $2::uuid where address = $1 returning healthy_through`,
      [config.address, generation],
    );
    if (result.rows.length !== 1) throw new Error('Missing recovery mailbox');
    return result.rows[0].healthy_through;
  });
  // Transactional receiving retention is 30 days. Never silently bridge a gap
  // close to that horizon: an operator must account for unavailable history.
  if (
    started.getTime() - new Date(previous ?? config.startedAt).getTime() >
    29 * 86400000
  )
    throw new Error('Receiving retention gap requires manual recovery');
  const unbound = await executor.execute<{ provider_email_id: string }>(
    `/* growth:inbox-unbound */
    select j.provider_email_id from growth_jobs j join growth_contacts c on c.id = j.contact_id
    where c.deleted_at is null and j.kind in ('fulfill','send_step')
      and j.provider_email_id is not null and j.rfc_message_id is null
      and (j.created_at >= $1 or exists (select 1 from growth_activity accepted
        where accepted.event_key = 'job:' || j.id::text || ':provider-accepted'
          and accepted.occurred_at >= $1))`,
    [config.startedAt],
  );
  for (const job of unbound.rows) {
    const sent = await dependencies.getSent(job.provider_email_id);
    if (!sent.message_id) throw new Error('Outbound binding not available');
    await bindOutboundMessageId(
      executor,
      job.provider_email_id,
      sent.message_id,
    );
  }
  let received = 0;
  for await (const email of dependencies.listReceived()) {
    if (!Array.isArray(email.to) || !email.to.some(isInboxRecipient)) continue;
    const id = await admitInboxEvent(
      executor,
      {
        type: 'email.received',
        created_at: email.created_at,
        data: { email_id: email.id, to: email.to },
      },
      config,
    );
    if (id) received++;
  }
  // All admitted work is re-readable after a crash, including early replies.
  const pending = await executor.execute<{ id: string }>(
    `/* growth:inbox-list-pending */
    select id from growth_reply_receipts where recipient = $1 and status = 'pending' order by created_at, id`,
    [config.address],
  );
  let processed = 0;
  let failed = false;
  for (const receipt of pending.rows) {
    try {
      await processInboxReceipt(executor, receipt.id, config, dependencies);
      processed++;
    } catch {
      failed = true;
    }
  }
  if (dependencies.forwardReceipt) {
    const unforwarded = await executor.execute<{ id: string }>(
      `/* growth:inbox-list-unforwarded */
      select id from growth_reply_receipts where recipient = $1
        and forward_provider_id is null
        and last_error_code is distinct from 'contact_deleted'
      order by created_at, id`,
      [config.address],
    );
    for (const receipt of unforwarded.rows) {
      try {
        await dependencies.forwardReceipt(executor, receipt.id);
      } catch {
        failed = true;
      }
    }
  }
  if (failed) throw new Error('Inbox recovery processing or forwarding failed');
  const checkpoint = await executor.transaction(async (tx) => {
    await inboxTransactionGuard(tx);
    return tx.execute(
      `/* growth:inbox-recovery-complete */
    update growth_reply_mailboxes set healthy_through = $3, recovery_id = null
    where address = $1 and recovery_id = $2::uuid
      and not exists (select 1 from growth_reply_receipts where recipient = $1
        and status = 'pending' and reference_ids is null)
    returning address`,
      [config.address, generation, started],
    );
  });
  if (!checkpoint.rows.length)
    throw new Error('Recovery superseded or unread replies remain');
  return { received, processed };
}
