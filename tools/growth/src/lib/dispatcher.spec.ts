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
    deliveryStatus: 'not_submitted',
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('dispatchGrowthLeasedJob throws for an unleased job and an unknown kind', async () => {
  const { executor } = executorWith({});
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
  const retiredKind = dispatchGrowthLeasedJob(
    executor,
    job({ kind: 'reply_reconcile', contactId: null }),
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
  await expect(retiredKind).rejects.toThrow(
    'Unsupported or inactive growth job kind: reply_reconcile',
  );
  await expect(missingHandler).rejects.toThrow(
    'Unsupported or inactive growth job kind: digest',
  );
  expect(handler).not.toHaveBeenCalled();
});

test('dispatchGrowthLeasedJob hands app kinds to their handler with the signal', async () => {
  const { executor } = executorWith({});
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
