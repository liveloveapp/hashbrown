import { randomUUID } from 'node:crypto';
import {
  nestedExecutor,
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import {
  admitInboxEvent,
  bindOutboundMessageId,
  ensureInboxMailbox,
  type InboxPilot,
  inboxProviderId,
  type InboxReplyDependencies,
  inboxTransactionGuard,
  processInboxReceipt,
} from './inbox-replies.ts';
import type { InboxReceivedReference } from './inbox-resend.ts';

/** Injectable provider operations and clocks for a resumable receiving scan. */
export interface InboxRecoveryDependencies extends InboxReplyDependencies {
  listReceived: (after?: string) => AsyncIterable<InboxReceivedReference>;
  getSent: (id: string) => Promise<{ message_id: string | null }>;
  now: () => Date;
  /** Wall-clock work budget, capped at 240 seconds beneath the route timeout. */
  budgetMs?: number;
  /** Monotonic clock; independent of the provider receipt/coverage timestamp. */
  monotonicNow?: () => number;
  forwardReceipt?: (db: SqlExecutor, id: string) => Promise<string | null>;
}

const UNBOUND_PREDICATE = `c.deleted_at is null and j.kind in ('fulfill','send_step')
  and j.provider_email_id is not null and j.rfc_message_id is null`;

/** Includes previously queued jobs whose actual provider acceptance is new. */
function activeReceivingSendSql(start: '$1' | '$4'): string {
  return `(j.created_at >= ${start}::timestamptz or exists (
    select 1 from growth_activity accepted
    where accepted.event_key = 'job:' || j.id::text || ':provider-accepted'
      and accepted.occurred_at >= ${start}::timestamptz))`;
}

/**
 * Each invocation has a generation; one full scan may span many invocations.
 * Admission and its cursor commit together. Partial/error runs retain the scan
 * start and keep campaigns paused. After catch-up, incremental scans stop at the
 * last fully covered head instead of repeatedly scanning all retained mail.
 */
export async function recoverInbox(
  executor: SqlExecutor,
  config: Extract<InboxPilot, { enabled: true }>,
  dependencies: InboxRecoveryDependencies,
): Promise<{ received: number; processed: number; complete: boolean }> {
  const started = dependencies.now();
  if (!Number.isFinite(started.getTime()) || started < config.startedAt)
    throw new Error('Invalid recovery clock');
  const budget = Math.min(dependencies.budgetMs ?? 240000, 240000);
  if (!Number.isFinite(budget) || budget <= 0)
    throw new Error('Invalid recovery budget');
  const clock = dependencies.monotonicNow ?? (() => performance.now());
  const deadline = clock() + budget;
  // A read can retry three 15s requests plus waits; forwarding also downloads
  // MIME and sends. Reserve time before starting either bounded operation.
  const hasTime = (reserve = 80000) => clock() + reserve < deadline;
  const generation = randomUUID();
  const state = await executor.transaction(async (tx) => {
    await privacyLock(tx);
    await inboxTransactionGuard(tx);
    await ensureInboxMailbox(tx, config);
    const result = await tx.execute<{
      healthy_through: Date | string | null;
      scan_cursor: string | null;
      scan_started_at: Date | string;
      scan_complete: boolean;
      scan_head_id: string | null;
      covered_head_id: string | null;
    }>(
      `/* growth:inbox-recovery-start */
      update growth_reply_mailboxes set recovery_id = $2::uuid,
        scan_cursor = case when recovery_id is null then null else scan_cursor end,
        scan_head_id = case when recovery_id is null then null else scan_head_id end,
        scan_started_at = case when recovery_id is null then $3::timestamptz else coalesce(scan_started_at, $3::timestamptz) end,
        scan_complete = case when recovery_id is null then false else scan_complete end
      where address = $1 returning healthy_through, scan_cursor, scan_started_at, scan_complete, scan_head_id, covered_head_id`,
      [config.address, generation, started],
    );
    if (result.rows.length !== 1) throw new Error('Missing recovery mailbox');
    return result.rows[0];
  });
  const scanStarted = new Date(state.scan_started_at);
  if (!Number.isFinite(scanStarted.getTime()) || scanStarted > started)
    throw new Error('Invalid recovery scan start');
  if (
    started.getTime() -
      new Date(state.healthy_through ?? config.startedAt).getTime() >
    29 * 86400000
  )
    throw new Error('Receiving retention gap requires manual recovery');

  const guarded = <T>(operation: (tx: SqlTransaction) => Promise<T>) =>
    executor.transaction(async (tx) => {
      await privacyLock(tx);
      await inboxTransactionGuard(tx);
      const result = await tx.execute(
        `/* growth:inbox-recovery-generation-lock */
        select address from growth_reply_mailboxes where address = $1 and recovery_id = $2::uuid for update`,
        [config.address, generation],
      );
      if (result.rows.length !== 1)
        throw new Error('Inbox recovery superseded');
      return operation(tx);
    });
  const progress = async (
    tx: SqlTransaction,
    cursor: string | null,
    complete: boolean,
    head: string | null = null,
  ) => {
    const result = await tx.execute(
      `/* growth:inbox-scan-progress */
      update growth_reply_mailboxes set scan_cursor = coalesce($3, scan_cursor), scan_complete = $4,
        scan_head_id = coalesce(scan_head_id, $5)
      where address = $1 and recovery_id = $2::uuid returning address`,
      [config.address, generation, cursor, complete, head],
    );
    if (result.rows.length !== 1) throw new Error('Inbox recovery superseded');
  };
  let received = 0;
  let processed = 0;
  let failed = false;
  let partial = false;
  const unbound = await executor.execute<{
    provider_email_id: string;
  }>(
    `/* growth:inbox-unbound */
    select j.provider_email_id from growth_jobs j join growth_contacts c on c.id = j.contact_id
    where ${UNBOUND_PREDICATE} and ${activeReceivingSendSql('$1')}
    order by j.created_at, j.id limit 100`,
    [config.startedAt],
  );
  for (const job of unbound.rows) {
    if (!hasTime()) {
      partial = true;
      break;
    }
    await guarded(async () => undefined);
    try {
      const sent = await dependencies.getSent(job.provider_email_id);
      const messageId = sent.message_id;
      if (!messageId) throw new Error('Outbound binding not available');
      await guarded(async (tx) => {
        await bindOutboundMessageId(
          nestedExecutor(tx),
          job.provider_email_id,
          messageId,
        );
      });
    } catch {
      failed = true;
    }
  }
  if (unbound.rows.length === 100) partial = true;

  let scanComplete = state.scan_complete;
  if (!scanComplete && hasTime()) {
    const iterator = dependencies
      .listReceived(state.scan_cursor ?? undefined)
      [Symbol.asyncIterator]();
    try {
      for (let count = 0; count < 100 && hasTime(); count++) {
        await guarded(async () => undefined);
        const next = await iterator.next();
        if (next.done) {
          await guarded((tx) => progress(tx, null, true));
          scanComplete = true;
          break;
        }
        const email = next.value;
        const cursor = inboxProviderId(email.id);
        // Stable newest-to-oldest pagination makes the last fully covered head
        // a safe incremental boundary, including foreign-product account mail.
        if (cursor === state.covered_head_id) {
          await guarded((tx) => progress(tx, cursor, true, cursor));
          scanComplete = true;
          break;
        }
        // A fetched item is committed even if the clock expired during fetch.
        // Foreign-product items also advance the shared-account scan cursor.
        await guarded(async (tx) => {
          const id = await admitInboxEvent(
            nestedExecutor(tx),
            {
              type: 'email.received',
              created_at: email.created_at,
              data: { email_id: cursor, to: email.to },
            },
            config,
          );
          if (id) received++;
          await progress(tx, cursor, false, cursor);
        });
      }
    } finally {
      await iterator.return?.();
    }
  }
  if (!scanComplete) partial = true;

  const pending = await executor.execute<{ id: string }>(
    `/* growth:inbox-list-pending */
    select id from growth_reply_receipts where recipient = $1 and status = 'pending'
    order by (reference_ids is null) desc, attempts, updated_at, created_at, id limit 100`,
    [config.address],
  );
  for (const receipt of pending.rows) {
    if (!hasTime()) {
      partial = true;
      break;
    }
    await guarded(async () => undefined);
    try {
      await processInboxReceipt(executor, receipt.id, config, {
        ...dependencies,
        recoveryGeneration: generation,
      });
      processed++;
    } catch {
      failed = true;
    }
  }
  const unforwarded = await executor.execute<{ id: string }>(
    `/* growth:inbox-list-unforwarded */
    select id from growth_reply_receipts where recipient = $1 and forward_provider_id is null
      and (last_error_code is null or last_error_code not in ('contact_deleted','forward_loop_suppressed'))
    order by updated_at, created_at, id limit 100`,
    [config.address],
  );
  if (dependencies.forwardReceipt) {
    for (const receipt of unforwarded.rows) {
      if (!hasTime(110000)) {
        partial = true;
        break;
      }
      await guarded(async (tx) => {
        // Round-robin failed forwards so one unavailable MIME cannot starve mail.
        await tx.execute(
          `/* growth:inbox-forward-attempt */
          update growth_reply_receipts set updated_at = now() where id = $1`,
          [receipt.id],
        );
      });
      try {
        await dependencies.forwardReceipt(executor, receipt.id);
      } catch {
        failed = true;
      }
    }
  } else if (unforwarded.rows.length) partial = true;
  if (unforwarded.rows.length === 100) partial = true;
  if (failed) throw new Error('Inbox recovery processing or forwarding failed');
  if (partial || !hasTime(0)) return { received, processed, complete: false };
  const checkpoint = await guarded((tx) =>
    tx.execute(
      `/* growth:inbox-recovery-complete */
    update growth_reply_mailboxes set healthy_through = $3, recovery_id = null,
      covered_head_id = coalesce(scan_head_id, covered_head_id)
    where address = $1 and recovery_id = $2::uuid and scan_complete
      and not exists (select 1 from growth_reply_receipts where recipient = $1
        and status = 'pending' and (reference_ids is null or contact_id is null))
      and not exists (select 1 from growth_reply_receipts where recipient = $1 and forward_provider_id is null
        and (last_error_code is null or last_error_code not in ('contact_deleted','forward_loop_suppressed')))
      and not exists (select 1 from growth_jobs j join growth_contacts c on c.id = j.contact_id where ${UNBOUND_PREDICATE} and ${activeReceivingSendSql(
        '$4',
      )})
    returning address`,
      [config.address, generation, scanStarted, config.startedAt],
    ),
  );
  return { received, processed, complete: checkpoint.rows.length === 1 };
}
