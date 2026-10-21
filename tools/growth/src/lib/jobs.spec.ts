import { expect, test, vi } from 'vitest';

import {
  authorizeLeasedJobForSubmission,
  cancelLeasedJob,
  completeLeasedJob,
  deferLeasedJob,
  enqueueJob,
  failLeasedJob,
  JobLeaseConflictError,
  leaseDueJobs,
  markProviderAcceptanceUnknown,
  markProviderRejection,
  recordProviderAcceptance,
} from './jobs.ts';
import { executorWith, type MarkerHandler } from './testing/fake-executor.ts';

type TestRow = Record<string, unknown>;

const contactId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000101';
const leaseToken = '00000000-0000-4000-8000-000000000201';
const approvedAt = new Date('2026-09-01T12:00:00.000Z');
const now = new Date('2026-09-02T15:00:00.000Z');
const leaseUntil = new Date('2026-09-02T15:10:00.000Z');
const emptyRows = () => ({ rows: [] });

function jobRow(overrides: TestRow = {}): TestRow {
  return {
    id: jobId,
    kind: 'send_step',
    contact_id: contactId,
    project_id: null,
    status: 'leased',
    available_at: now,
    lease_until: leaseUntil,
    lease_token: leaseToken,
    attempts: 1,
    idempotency_key: 'campaign:v1:step:1',
    payload: { campaign_version: 'v1', step: 1 },
    provider_email_id: null,
    rfc_message_id: null,
    gmail_seed_message_id: null,
    delivery_status: 'not_submitted',
    last_error_code: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function sendContactRow(overrides: TestRow = {}): TestRow {
  return {
    id: contactId,
    email_normalized: 'person@example.com',
    outreach_approved_at: approvedAt,
    deleted_at: null,
    latest_hard_stop_kind: null,
    latest_hard_stop_at: null,
    fulfillment_delivery_blocked: false,
    fulfillment_deletion_blocked: false,
    campaign_approval_valid: true,
    campaign_enrollment_valid: true,
    ...overrides,
  };
}

function authorizationRow(occurredAt: Date = now): TestRow {
  return {
    event_key: `job:${jobId}:submission-authorized:${leaseToken}`,
    contact_id: contactId,
    project_id: null,
    kind: 'delivery.submission_authorized',
    occurred_at: occurredAt,
    data: { bounded_stop_race: true, lease_token: leaseToken },
  };
}

test('enqueueJob inserts once and returns exists for the same idempotency key', async () => {
  let stored: TestRow | undefined;
  const { executor, calls } = executorWith({
    'enqueue-job': (params) => {
      if (stored) return { rows: [] };
      stored = jobRow({
        kind: params[0],
        contact_id: params[1],
        status: 'pending',
        available_at: params[2],
        idempotency_key: params[3],
        payload: JSON.parse(String(params[4])),
        lease_until: null,
        lease_token: null,
        attempts: 0,
      });
      return { rows: [stored] };
    },
    'read-enqueued-job': () => ({ rows: stored ? [stored] : [] }),
  });
  const input = {
    kind: 'fulfill',
    contactId,
    availableAt: now,
    idempotencyKey: 'form:submission-1:fulfill',
    payload: { submission_id: 'submission-1', form_kind: 'unstuck' },
  } as const;

  const first = await enqueueJob(executor, input);
  const second = await enqueueJob(executor, {
    ...input,
    payload: { form_kind: 'unstuck', submission_id: 'submission-1' },
  });

  expect(first.status).toBe('inserted');
  expect(first.job).toMatchObject({
    kind: 'fulfill',
    contactId,
    status: 'pending',
    idempotencyKey: 'form:submission-1:fulfill',
  });
  expect(second.status).toBe('exists');
  expect(second.job.id).toBe(first.job.id);
  expect(calls.map(({ marker }) => marker)).toEqual([
    'enqueue-job',
    'enqueue-job',
    'read-enqueued-job',
  ]);
});

test('enqueueJob throws when the existing job differs in kind or payload', async () => {
  const existing = jobRow({
    kind: 'fulfill',
    status: 'pending',
    idempotency_key: 'form:submission-1:fulfill',
    payload: { submission_id: 'submission-1' },
  });
  const { executor } = executorWith({
    'enqueue-job': emptyRows,
    'read-enqueued-job': () => ({ rows: [existing] }),
  });
  const input = {
    kind: 'fulfill',
    contactId,
    availableAt: now,
    idempotencyKey: 'form:submission-1:fulfill',
    payload: { submission_id: 'submission-1' },
  } as const;

  const otherKind = enqueueJob(executor, { ...input, kind: 'notify' });
  const otherPayload = enqueueJob(executor, {
    ...input,
    payload: { submission_id: 'submission-2' },
  });
  const otherContact = enqueueJob(executor, {
    ...input,
    contactId: '00000000-0000-4000-8000-000000000002',
  });

  await expect(otherKind).rejects.toThrow(
    'Growth job idempotency conflict: form:submission-1:fulfill',
  );
  await expect(otherPayload).rejects.toThrow('Growth job idempotency conflict');
  await expect(otherContact).rejects.toThrow('Growth job idempotency conflict');
});

test('leaseDueJobs leases only due pending or expired jobs and increments attempts', async () => {
  const { executor, calls } = executorWith({
    'lease-due-jobs': () => ({ rows: [jobRow({ attempts: 2 })] }),
  });
  const isSendWindow = vi.fn(() => false);

  const leased = await leaseDueJobs(executor, {
    kinds: ['send_step', 'fulfill', 'send_step'],
    now,
    batchSize: 10,
    leaseDurationMs: 60_000,
    campaignEnabled: true,
    isSendWindow,
  });
  const defaulted = await leaseDueJobs(executor, {
    kinds: ['fulfill'],
    now,
    batchSize: 10,
    leaseDurationMs: 60_000,
    campaignEnabled: false,
  });

  expect(leased[0]).toMatchObject({ id: jobId, status: 'leased', attempts: 2 });
  expect(defaulted).toHaveLength(1);
  expect(isSendWindow).toHaveBeenCalledWith(now);
  const [first, second] = calls;
  expect(first?.params).toEqual([
    ['send_step', 'fulfill'],
    now,
    10,
    new Date(now.getTime() + 60_000),
    true,
    false,
  ]);
  expect(second?.params[5]).toBe(true);
  expect(first?.sql).toContain("j.status = 'pending'");
  expect(first?.sql).toContain("j.status = 'leased' and j.lease_until <= $2");
  expect(first?.sql).toContain('attempts = j.attempts + 1');
  expect(first?.sql).toContain('for update skip locked');
  expect(first?.sql).not.toMatch(/form\.abuse_assessed|mailbox\.recovery/u);
  await expect(
    leaseDueJobs(executor, {
      kinds: ['fulfill'],
      now,
      batchSize: 101,
      leaseDurationMs: 60_000,
      campaignEnabled: true,
    }),
  ).rejects.toThrow('batchSize must be an integer between 1 and 100');
});

test('leaseDueJobs fails expired leases that were already authorized for submission', async () => {
  const { executor, calls } = executorWith({
    'lease-due-jobs': emptyRows,
  });

  await leaseDueJobs(executor, {
    kinds: ['send_step'],
    now,
    batchSize: 5,
    leaseDurationMs: 60_000,
    campaignEnabled: true,
  });

  const sql = calls[0]?.sql ?? '';
  expect(sql).toContain("'delivery.submission_authorized'");
  expect(sql).toContain("delivery_status = 'unknown'");
  expect(sql).toContain("'worker_interrupted_after_authorization'");
  expect(sql).toContain("'delivery.acceptance_unknown'");
});

test('lease-guarded transitions throw JobLeaseConflictError on a stale token', async () => {
  const { executor } = executorWith({
    'completed-leased-job': emptyRows,
    'failed-leased-job': emptyRows,
    'cancelled-leased-job': emptyRows,
    'defer-leased-job': emptyRows,
    'mark-provider-rejected': emptyRows,
  });
  const stale = { jobId, leaseToken, now };

  const attempts = await Promise.allSettled([
    completeLeasedJob(executor, stale),
    failLeasedJob(executor, { ...stale, errorCode: 'boom' }),
    cancelLeasedJob(executor, stale),
    deferLeasedJob(executor, { ...stale, availableAt: leaseUntil }),
    markProviderRejection(executor, {
      jobId,
      leaseToken,
      occurredAt: now,
      errorCode: 'rejected',
    }),
  ]);

  expect(attempts).toHaveLength(5);
  for (const attempt of attempts) {
    expect(attempt.status).toBe('rejected');
    expect(
      attempt.status === 'rejected' ? attempt.reason : undefined,
    ).toBeInstanceOf(JobLeaseConflictError);
  }
});

function authorizationExecutor(
  contact: TestRow,
  job: TestRow,
  inserted = true,
) {
  return executorWith({
    'lock-contact-for-send': () => ({ rows: [contact] }),
    'lock-job-for-send': () => ({ rows: [job] }),
    'insert-final-send-authorization': () => ({
      rows: inserted ? [{ event_key: 'inserted' }] : [],
    }),
    'read-final-send-authorization': () => ({ rows: [authorizationRow()] }),
  });
}

test('authorizeLeasedJobForSubmission gates in order and records submission_authorized once', async () => {
  const enabled = {
    jobId,
    leaseToken,
    now,
    campaignEnabled: true,
    deliveryEnabled: true,
  };
  const deleted = sendContactRow({ deleted_at: now });
  const stopped = sendContactRow({
    latest_hard_stop_kind: 'unsubscribe',
    latest_hard_stop_at: now,
  });
  const staleJob = jobRow({
    lease_token: '00000000-0000-4000-8000-000000000299',
  });
  const authorize = (
    contact: TestRow,
    job: TestRow,
    overrides: Partial<Parameters<typeof authorizeLeasedJobForSubmission>[1]>,
  ) =>
    authorizeLeasedJobForSubmission(
      authorizationExecutor(contact, job).executor,
      { ...enabled, ...overrides },
    );

  const deliveryDisabled = await authorize(deleted, staleJob, {
    deliveryEnabled: false,
    campaignEnabled: false,
  });
  const campaignDisabled = await authorize(deleted, staleJob, {
    campaignEnabled: false,
  });
  const contactDeleted = await authorize(deleted, staleJob, {});
  const contactStopped = await authorize(stopped, staleJob, {});
  const staleLease = authorize(sendContactRow(), staleJob, {
    isSendWindow: () => false,
  });
  const outsideWindow = await authorize(sendContactRow(), jobRow(), {
    isSendWindow: () => false,
  });
  const fresh = authorizationExecutor(sendContactRow(), jobRow());
  const authorized = await authorizeLeasedJobForSubmission(
    fresh.executor,
    enabled,
  );
  const replay = authorizationExecutor(sendContactRow(), jobRow(), false);
  const replayed = await authorizeLeasedJobForSubmission(
    replay.executor,
    enabled,
  );

  expect(deliveryDisabled).toMatchObject({
    authorized: false,
    reason: 'delivery_disabled',
  });
  expect(campaignDisabled).toMatchObject({ reason: 'campaign_disabled' });
  expect(contactDeleted).toMatchObject({ reason: 'contact_deleted' });
  expect(contactStopped).toMatchObject({ reason: 'contact_stopped' });
  await expect(staleLease).rejects.toBeInstanceOf(JobLeaseConflictError);
  expect(outsideWindow).toMatchObject({ reason: 'outside_send_window' });
  expect(authorized).toMatchObject({
    authorized: true,
    recipient: { contactId, emailNormalized: 'person@example.com' },
    boundedRaceNotice: 'a_future_stop_can_overlap_provider_submission',
  });
  expect(fresh.calls.map(({ marker }) => marker)).toEqual([
    'privacy-lock',
    'lock-contact-for-send',
    'lock-job-for-send',
    'insert-final-send-authorization',
  ]);
  expect(
    fresh.calls.find(
      ({ marker }) => marker === 'insert-final-send-authorization',
    )?.params,
  ).toEqual([jobId, contactId, null, leaseToken, now]);
  expect(replayed.authorized).toBe(true);
  expect(replay.calls.map(({ marker }) => marker)).toContain(
    'read-final-send-authorization',
  );
});

function acceptanceExecutor(lockedJob: TestRow, acceptance: TestRow[]) {
  const handlers: Record<string, MarkerHandler> = {
    'discover-provider-acceptance-contact': () => ({
      rows: [{ contact_id: contactId }],
    }),
    'lock-provider-acceptance-contact': () => ({ rows: [{ id: contactId }] }),
    'lock-provider-acceptance-job': () => ({ rows: [lockedJob] }),
    'read-final-send-authorization': () => ({ rows: [authorizationRow()] }),
    'accept-provider-submission': () => ({
      rows: [
        jobRow({
          status: 'completed',
          lease_token: null,
          lease_until: null,
          provider_email_id: 'resend-email-1',
          delivery_status: 'submitted',
        }),
      ],
    }),
    'insert-provider-acceptance-activity': () => ({
      rows: [{ event_key: `job:${jobId}:provider-accepted` }],
    }),
    'read-provider-acceptance-activity': () => ({ rows: acceptance }),
  };
  return executorWith(handlers);
}

test('recordProviderAcceptance completes the job and replays idempotently', async () => {
  const input = {
    jobId,
    leaseToken,
    acceptedAt: new Date('2026-09-02T15:01:00.000Z'),
    providerEmailId: 'resend-email-1',
  };
  const first = acceptanceExecutor(jobRow(), []);
  const replay = acceptanceExecutor(
    jobRow({
      status: 'completed',
      lease_token: null,
      lease_until: null,
      provider_email_id: 'resend-email-1',
      delivery_status: 'submitted',
    }),
    [
      {
        event_key: `job:${jobId}:provider-accepted`,
        contact_id: contactId,
        project_id: null,
        kind: 'campaign.step_accepted',
        occurred_at: input.acceptedAt,
        data: {
          lease_token: leaseToken,
          provider_ref: 'resend-email-1',
          step: 1,
        },
      },
    ],
  );

  const accepted = await recordProviderAcceptance(first.executor, input);
  const replayed = await recordProviderAcceptance(replay.executor, input);

  expect(accepted).toMatchObject({
    status: 'completed',
    providerEmailId: 'resend-email-1',
    deliveryStatus: 'submitted',
  });
  expect(first.calls.map(({ marker }) => marker)).toEqual([
    'discover-provider-acceptance-contact',
    'lock-provider-acceptance-contact',
    'lock-provider-acceptance-job',
    'read-final-send-authorization',
    'accept-provider-submission',
    'insert-provider-acceptance-activity',
  ]);
  expect(
    first.calls.find(
      ({ marker }) => marker === 'insert-provider-acceptance-activity',
    )?.params[3],
  ).toBe('campaign.step_accepted');
  expect(replayed).toMatchObject({ status: 'completed' });
  expect(replay.calls.map(({ marker }) => marker)).toEqual([
    'discover-provider-acceptance-contact',
    'lock-provider-acceptance-contact',
    'lock-provider-acceptance-job',
    'read-final-send-authorization',
    'read-provider-acceptance-activity',
  ]);
});

test('markProviderAcceptanceUnknown sets unknown and never completes', async () => {
  const { executor, calls } = executorWith({
    'discover-provider-unknown-contact': () => ({
      rows: [{ contact_id: contactId }],
    }),
    'lock-provider-unknown-contact': () => ({ rows: [{ id: contactId }] }),
    'lock-provider-unknown-job': () => ({ rows: [jobRow()] }),
    'read-final-send-authorization': () => ({ rows: [authorizationRow()] }),
    'mark-provider-unknown': () => ({
      rows: [
        jobRow({
          status: 'failed',
          lease_token: null,
          lease_until: null,
          delivery_status: 'unknown',
          last_error_code: 'timeout',
        }),
      ],
    }),
    'insert-provider-unknown-activity': emptyRows,
  });

  const job = await markProviderAcceptanceUnknown(executor, {
    jobId,
    leaseToken,
    occurredAt: new Date('2026-09-02T15:01:00.000Z'),
    errorCode: 'timeout',
  });

  expect(job).toMatchObject({ status: 'failed', deliveryStatus: 'unknown' });
  const update = calls.find(({ marker }) => marker === 'mark-provider-unknown');
  expect(update?.sql).toContain("set status = 'failed'");
  expect(update?.sql).not.toContain("set status = 'completed'");
  expect(calls.map(({ marker }) => marker)).not.toContain(
    'accept-provider-submission',
  );
  expect(calls.at(-1)?.marker).toBe('insert-provider-unknown-activity');
});
