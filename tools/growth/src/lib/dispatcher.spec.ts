import { expect, test, vi } from 'vitest';

import { dispatchGrowthLeasedJob } from './dispatcher.ts';
import type { GrowthJob } from './models.ts';
import { executorWith } from './testing/fake-executor.ts';

const now = new Date('2026-10-21T15:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000088';
const leaseToken = '00000000-0000-4000-8000-000000000099';
const contactId = '00000000-0000-4000-8000-000000000077';

function job(overrides: Partial<GrowthJob> = {}): GrowthJob {
  return {
    id: jobId,
    kind: 'send_step',
    contactId,
    projectId: null,
    status: 'leased',
    availableAt: now,
    leaseUntil: new Date(now.getTime() + 60_000),
    leaseToken,
    attempts: 1,
    idempotencyKey: 'send_step:contact:1',
    payload: {},
    providerEmailId: null,
    rfcMessageId: null,
    gmailSeedMessageId: null,
    deliveryStatus: 'not_submitted',
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function pauseExecutor(paused: boolean) {
  return executorWith({
    'read-google-mailbox-recovery-pause': () => ({ rows: [{ paused }] }),
  });
}

test('dispatchGrowthLeasedJob throws for an unleased job and an unknown kind', async () => {
  const { executor } = pauseExecutor(false);
  const handler = vi.fn(async () => 'completed' as const);
  const appHandlers = { send_step: handler, fulfill: handler };

  const unleased = dispatchGrowthLeasedJob(
    executor,
    job({ status: 'pending', leaseToken: null }),
    { appHandlers },
  );
  const unknownKind = dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'enrich' }),
    { appHandlers },
  );
  const missingHandler = dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'digest' }),
    { appHandlers },
  );

  await expect(unleased).rejects.toThrow(
    'Unsupported or inactive growth job kind: send_step',
  );
  await expect(unknownKind).rejects.toThrow(
    'Unsupported or inactive growth job kind: enrich',
  );
  await expect(missingHandler).rejects.toThrow(
    'Unsupported or inactive growth job kind: digest',
  );
  expect(handler).not.toHaveBeenCalled();
});

test('dispatchGrowthLeasedJob pauses send_step and reply_reconcile while mailbox recovery is open', async () => {
  const { executor, calls } = pauseExecutor(true);
  const handler = vi.fn(async () => 'completed' as const);
  const appHandlers = { send_step: handler, fulfill: handler };

  const sendStep = await dispatchGrowthLeasedJob(executor, job(), {
    appHandlers,
  });
  const reconcile = await dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'reply_reconcile', contactId: null }),
    { appHandlers },
  );
  const fulfill = await dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'fulfill' }),
    { appHandlers },
  );

  expect([sendStep, reconcile, fulfill]).toEqual([
    'recovery_paused',
    'recovery_paused',
    'completed',
  ]);
  expect(handler).toHaveBeenCalledOnce();
  expect(calls.map(({ marker }) => marker)).toEqual([
    'read-google-mailbox-recovery-pause',
    'read-google-mailbox-recovery-pause',
  ]);
});

test('dispatchGrowthLeasedJob hands app kinds to their handler with the signal', async () => {
  const { executor } = pauseExecutor(false);
  const signal = new AbortController().signal;
  const handler = vi.fn(async () => 'deferred' as const);
  const leased = job({ kind: 'notify' });

  const result = await dispatchGrowthLeasedJob(executor, leased, {
    signal,
    appHandlers: { notify: handler },
  });

  expect(result).toBe('deferred');
  expect(handler).toHaveBeenCalledWith(executor, leased, { signal });
});

test('dispatchGrowthLeasedJob settles reply_reconcile itself and maps the settlement', async () => {
  const leasedRow = {
    id: jobId,
    kind: 'reply_reconcile',
    contact_id: null,
    status: 'leased',
    lease_token: leaseToken,
    attempts: 1,
    payload: {
      gmail_message_id: 'gmail-1',
      occurred_at: now.toISOString(),
      resolved_candidates: [
        {
          message_id: '<lower@hashbrown.dev>',
          rank: 1,
          contact_id: contactId,
          seed_job_id: '00000000-0000-4000-8000-000000000066',
        },
      ],
    },
  };
  const { executor, calls } = executorWith({
    'read-google-mailbox-recovery-pause': () => ({ rows: [{ paused: false }] }),
    'read-google-reconcile-settlement': () => ({ rows: [leasedRow] }),
    'read-current-google-reconcile-settlement': () => ({ rows: [leasedRow] }),
    'lock-google-reconcile-contact': () => ({
      rows: [{ id: contactId, deleted_at: null }],
    }),
    'lock-leased-google-reconcile': () => ({ rows: [leasedRow] }),
    'complete-leased-google-reconcile': () => ({ rows: [{ id: jobId }] }),
  });
  const stopContact = vi.fn(async () => ({}));

  const result = await dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'reply_reconcile', contactId: null }),
    { googleMailbox: { stopContact }, now: () => now },
  );

  expect(result).toBe('completed');
  expect(stopContact).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ contactId, reason: 'campaign.reply_received' }),
  );
  expect(calls.at(-1)?.marker).toBe('complete-leased-google-reconcile');
});
