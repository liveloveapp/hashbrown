import { privacyLock, type SqlExecutor } from './database.ts';
import {
  INBOX_PILOT_ADDRESS,
  inboxProviderId,
  inboxTransactionGuard,
} from './inbox-replies.ts';

interface Evidence {
  actor: string;
  evidence: string;
  occurredAt: Date;
}
function validateEvidence(input: Evidence): void {
  for (const value of [input.actor, input.evidence]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
      throw new Error('A bounded operator and evidence reference are required');
    }
  }
  if (!Number.isFinite(input.occurredAt.getTime()))
    throw new Error('Invalid operation clock');
}

/** Audits an operator decision to ignore one unresolved receipt. */
export async function reviewInboxReceipt(
  db: SqlExecutor,
  input: Evidence & { receiptId: string },
): Promise<void> {
  validateEvidence(input);
  const id = inboxProviderId(input.receiptId);
  await db.transaction(async (tx) => {
    await privacyLock(tx);
    await inboxTransactionGuard(tx);
    const receipt = await tx.execute<{ id: string; status: string }>(
      `/* growth:inbox-review-receipt */ select id, status from growth_reply_receipts
       where id = $1 and recipient = $2 for update`,
      [id, INBOX_PILOT_ADDRESS],
    );
    if (receipt.rows.length !== 1) throw new Error('Unknown receiving receipt');
    if (receipt.rows[0].status !== 'pending')
      throw new Error('Receipt is already resolved');
    await tx.execute(
      `/* growth:inbox-review-audit */ insert into growth_activity(event_key, kind, occurred_at, data)
       values ($1, 'mailbox.receipt_reviewed', $2,
         jsonb_build_object('receipt_id', $3::text, 'actor', $4::text,
           'evidence_reference', $5::text, 'decision', 'ignore', 'policy_version', 'resend-receiving-v1'))`,
      [
        `resend:receipt:${id}:reviewed-ignore`,
        input.occurredAt,
        id,
        input.actor,
        input.evidence,
      ],
    );
    await tx.execute(
      `/* growth:inbox-review-ignore */ update growth_reply_receipts
       set status = 'ignored', reference_ids = null, rfc_message_id = null,
         contact_id = null, last_error_code = 'operator_reviewed_ignore', updated_at = $2
       where id = $1`,
      [id, input.occurredAt],
    );
  });
}

/** Closed diagnostic codes suitable for operator alerts without personal data. */
export type InboxHealthCode =
  | 'mailbox_disabled'
  | 'recovery_in_progress'
  | 'coverage_stale'
  | 'unread_receipts'
  | 'pending_receipts'
  | 'unforwarded_receipts'
  | 'unbound_messages'
  | 'send_outcome_unknown'
  | 'provider_attempt_expired';

/** Reads aggregate receiving health; missing or incomplete coverage fails closed. */
export async function readInboxHealth(
  db: SqlExecutor,
  now: Date,
): Promise<{ healthy: boolean; codes: InboxHealthCode[] }> {
  if (!Number.isFinite(now.getTime()))
    throw new Error('Invalid operation clock');
  return db.transaction(async (tx) => {
    await privacyLock(tx);
    await inboxTransactionGuard(tx);
    const result = await tx.execute<{
      enabled: boolean;
      fresh: boolean;
      recovering: boolean;
      unread: number;
      pending: number;
      unforwarded: number;
      unbound: number;
      unknown_sends: number;
      expired_attempts: number;
    }>(
      `/* growth:inbox-health */ select m.enabled,
       coalesce(m.healthy_through between $2::timestamptz - interval '10 minutes' and $2::timestamptz, false) as fresh,
       m.recovery_id is not null as recovering,
       (select count(*)::integer from growth_reply_receipts where recipient = m.address
         and status = 'pending' and (reference_ids is null or contact_id is null)) as unread,
       (select count(*)::integer from growth_reply_receipts where recipient = m.address and status = 'pending') as pending,
       (select count(*)::integer from growth_reply_receipts where recipient = m.address
         and forward_provider_id is null
         and (last_error_code is null or last_error_code not in ('contact_deleted','forward_loop_suppressed'))) as unforwarded,
       (select count(*)::integer from growth_jobs j join growth_contacts c on c.id = j.contact_id
         where c.deleted_at is null and j.kind in ('fulfill','send_step')
         and j.provider_email_id is not null and j.rfc_message_id is null
         and (j.created_at >= m.started_at or exists (select 1 from growth_activity accepted
           where accepted.event_key = 'job:' || j.id::text || ':provider-accepted'
             and accepted.occurred_at >= m.started_at))) as unbound,
       (select count(*)::integer from growth_jobs where delivery_status = 'unknown') as unknown_sends,
       (select count(*)::integer from growth_provider_attempts
         where provider_email_id is null and first_attempted_at <= $2::timestamptz - interval '23 hours') as expired_attempts
       from growth_reply_mailboxes m where m.address = $1`,
      [INBOX_PILOT_ADDRESS, now],
    );
    const row = result.rows[0];
    if (!row || row.enabled !== true)
      return { healthy: false, codes: ['mailbox_disabled'] };
    const codes: InboxHealthCode[] = [
      ...(row.recovering !== false ? ['recovery_in_progress' as const] : []),
      ...(row.fresh !== true ? ['coverage_stale' as const] : []),
      ...(row.unread !== 0 ? ['unread_receipts' as const] : []),
      ...(row.pending !== 0 ? ['pending_receipts' as const] : []),
      ...(row.unforwarded !== 0 ? ['unforwarded_receipts' as const] : []),
      ...(row.unbound !== 0 ? ['unbound_messages' as const] : []),
      ...(row.unknown_sends !== 0 ? ['send_outcome_unknown' as const] : []),
      ...(row.expired_attempts !== 0
        ? ['provider_attempt_expired' as const]
        : []),
    ];
    return { healthy: codes.length === 0, codes };
  });
}
