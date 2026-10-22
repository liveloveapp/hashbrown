import { expect, test, vi } from 'vitest';

import { businessMorningAfter } from './campaign-schedule.ts';
import {
  authorizeLeasedJobForSubmission,
  cancelLeasedJob,
  claimInternalNotificationSubmission,
  completeLeasedJob,
  deferLeasedJob,
  enqueueJob,
  failLeasedJob,
  JobLeaseConflictError,
  leaseDueJobs,
  markInternalNotificationUnknown,
  markProviderAcceptanceUnknown,
  markProviderRejection,
  materializeCampaignEnrollment,
  readLifecycleJobContext,
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
          kind: lockedJob['kind'],
          payload: lockedJob['payload'],
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
    'anchor-campaign-cadence': emptyRows,
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
    'anchor-campaign-cadence',
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

test('leaseDueJobs embeds the Pacific Monday-Friday 07:00 window and the three approval kinds for send_step', async () => {
  const { executor, calls } = executorWith({
    'lease-due-jobs': emptyRows,
  });

  await leaseDueJobs(executor, {
    kinds: ['send_step'],
    now,
    batchSize: 5,
    leaseDurationMs: 60_000,
    campaignEnabled: true,
    isSendWindow: () => true,
  });

  const sql = calls[0]?.sql ?? '';
  expect(sql).toContain(
    "extract(isodow from $2::timestamptz at time zone 'America/Los_Angeles') between 1 and 5",
  );
  expect(sql).toContain(
    "extract(hour from $2::timestamptz at time zone 'America/Los_Angeles') = 7",
  );
  expect(sql).toContain("enrollment.occurred_at + interval '5 minutes' <= $2");
  for (const kind of [
    'form.outreach_approved',
    'contact.reauthorized',
    'install_runtime.outreach_approved',
  ]) {
    expect(sql).toContain(`'${kind}'`);
  }
  expect(sql).not.toMatch(/growth_artifacts|enrichment|project\.claimed/u);
});

test('authorizeLeasedJobForSubmission accepts only unstuck forms, founder reauthorization and linked install runtime approvals', async () => {
  const { executor, calls } = executorWith({
    'lock-contact-for-send': () => ({ rows: [sendContactRow()] }),
    'lock-job-for-send': () => ({ rows: [jobRow()] }),
    'insert-final-send-authorization': () => ({
      rows: [{ event_key: `job:${jobId}:submission-authorized:${leaseToken}` }],
    }),
  });

  await authorizeLeasedJobForSubmission(executor, {
    jobId,
    leaseToken,
    now,
    campaignEnabled: true,
    deliveryEnabled: true,
  });

  const sql =
    calls.find(({ marker }) => marker === 'lock-contact-for-send')?.sql ?? '';
  expect(sql).toContain("array['unstuck']");
  expect(sql).toContain("'install_runtime.outreach_approved'");
  expect(sql).toContain("data->>'verification' = 'linked_observations'");
  expect(sql).toContain("data->>'provenance' = 'founder_action'");
  expect(sql).not.toMatch(/whitepaper|newsletter|pricing/u);
  expect(sql).toContain('from growth_install_runtime_links link');
  expect(sql).toContain("link.outcome = 'approved'");
  expect(sql).toContain('link.contact_id = authoritative.contact_id');
  expect(sql).toContain('runtime_observation.redacted_at is null');
  expect(sql).toContain('install_observation.redacted_at is null');
});

test('materializeCampaignEnrollment validates input and does nothing when enrollment is disabled', async () => {
  const { executor, calls } = executorWith({});
  const input = {
    enrollmentEnabled: false,
    enrollmentStartAt: new Date('2026-09-01T00:00:00.000Z'),
    now,
    batchSize: 10,
  };

  const disabled = await materializeCampaignEnrollment(executor, input);

  expect(disabled).toEqual({ enrolledContactIds: [], createdJobs: 0 });
  expect(calls).toEqual([]);
  await expect(
    materializeCampaignEnrollment(executor, { ...input, batchSize: 1_001 }),
  ).rejects.toThrow('batchSize must be an integer between 1 and 1000');
  await expect(
    materializeCampaignEnrollment(executor, {
      ...input,
      enrollmentStartAt: new Date('invalid'),
    }),
  ).rejects.toThrow('enrollmentStartAt must be a valid Date');
});

test('materializeCampaignEnrollment records the configuration, enrols eligible contacts and schedules step 1 on the next business morning', async () => {
  const enrollmentStartAt = new Date('2026-09-01T00:00:00.000Z');
  const otherContactId = '00000000-0000-4000-8000-000000000002';
  const { executor, calls } = executorWith({
    'privacy-lock': emptyRows,
    'lock-campaign-enrollment': emptyRows,
    'insert-campaign-enrollment-config': emptyRows,
    'read-campaign-enrollment-start': () => ({
      rows: [{ enrollment_start_at: enrollmentStartAt.toISOString() }],
    }),
    'enroll-campaign-v1': () => ({
      rows: [
        { contact_id: contactId, created_jobs: 3 },
        { contact_id: otherContactId, created_jobs: '3' },
      ],
    }),
  });

  const result = await materializeCampaignEnrollment(executor, {
    enrollmentEnabled: true,
    enrollmentStartAt,
    now,
    batchSize: 10,
  });

  expect(result).toEqual({
    enrolledContactIds: [contactId, otherContactId],
    createdJobs: 6,
  });
  expect(calls.map(({ marker }) => marker)).toEqual([
    'privacy-lock',
    'lock-campaign-enrollment',
    'insert-campaign-enrollment-config',
    'read-campaign-enrollment-start',
    'enroll-campaign-v1',
  ]);
  const enroll = calls.at(-1);
  expect(enroll?.params[0]).toEqual(enrollmentStartAt);
  expect(enroll?.params[1]).toEqual(now);
  expect(enroll?.params[2]).toBe(10);
  expect(enroll?.params[4]).toEqual(businessMorningAfter(now, 1));
  expect(enroll?.sql).toContain("'unstuck_form'");
  expect(enroll?.sql).toContain("'install_digest'");
  expect(enroll?.sql).toContain("'install_runtime'");
  expect(enroll?.sql).toContain("link.outcome = 'approved'");
  expect(enroll?.sql).toContain('link.contact_id = approval.contact_id');
  expect(enroll?.sql).toContain(
    "'campaign:v1:' || e.contact_id::text || ':step:' || step::text",
  );
  expect(enroll?.sql).not.toMatch(
    /project\.claimed|form\.abuse_assessed|legacy|whitepaper/u,
  );
});

test('materializeCampaignEnrollment throws when the start differs from the recorded configuration', async () => {
  const { executor, calls } = executorWith({
    'privacy-lock': emptyRows,
    'lock-campaign-enrollment': emptyRows,
    'insert-campaign-enrollment-config': emptyRows,
    'read-campaign-enrollment-start': () => ({
      rows: [{ enrollment_start_at: '2026-08-01T00:00:00.000Z' }],
    }),
  });

  const result = materializeCampaignEnrollment(executor, {
    enrollmentEnabled: true,
    enrollmentStartAt: new Date('2026-09-01T00:00:00.000Z'),
    now,
    batchSize: 10,
  });

  await expect(result).rejects.toThrow(
    'CAMPAIGN_ENROLLMENT_START_AT is immutable after campaign configuration',
  );
  expect(calls.map(({ marker }) => marker)).not.toContain('enroll-campaign-v1');
});

test('recordProviderAcceptance anchors steps 2 and 3 to the step 1 acceptance', async () => {
  const acceptedAt = new Date('2026-09-02T15:01:00.000Z');
  const { executor, calls } = acceptanceExecutor(jobRow(), []);

  await recordProviderAcceptance(executor, {
    jobId,
    leaseToken,
    acceptedAt,
    providerEmailId: 'resend-email-1',
  });

  const anchor = calls.find(
    ({ marker }) => marker === 'anchor-campaign-cadence',
  );
  expect(anchor?.params).toEqual([
    contactId,
    1,
    businessMorningAfter(acceptedAt, 3),
    businessMorningAfter(acceptedAt, 8),
  ]);
  expect(anchor?.sql).toContain('greatest(');
  expect(anchor?.sql).toContain("later.status = 'pending'");
  expect(anchor?.sql).toContain("later.delivery_status = 'not_submitted'");
});

test('recordProviderAcceptance anchors step 3 to the step 2 acceptance and skips non-campaign jobs', async () => {
  const acceptedAt = new Date('2026-09-02T15:01:00.000Z');
  const stepTwo = acceptanceExecutor(
    jobRow({ payload: { campaign_version: 'v1', step: 2 } }),
    [],
  );
  const fulfill = acceptanceExecutor(
    jobRow({ kind: 'fulfill', payload: { submission_id: 'submission-1' } }),
    [],
  );

  await recordProviderAcceptance(stepTwo.executor, {
    jobId,
    leaseToken,
    acceptedAt,
    providerEmailId: 'resend-email-1',
  });
  await recordProviderAcceptance(fulfill.executor, {
    jobId,
    leaseToken,
    acceptedAt,
    providerEmailId: 'resend-email-1',
  });

  const anchor = stepTwo.calls.find(
    ({ marker }) => marker === 'anchor-campaign-cadence',
  );
  expect(anchor?.params).toEqual([
    contactId,
    2,
    businessMorningAfter(acceptedAt, 5),
    businessMorningAfter(acceptedAt, 8),
  ]);
  expect(fulfill.calls.map(({ marker }) => marker)).not.toContain(
    'anchor-campaign-cadence',
  );
});

test('readLifecycleJobContext maps the contact, unstuck form facts and enrollment reason', async () => {
  const enrolledAt = new Date('2026-09-01T15:00:00.000Z');
  const { executor, calls } = executorWith({
    'read-lifecycle-job-context': () => ({
      rows: [
        {
          contact_id: contactId,
          display_name: 'Person Name',
          company_name: 'Example Company',
          company_domain: 'example.com',
          email_classification: 'work',
          form_submission: {
            form_kind: 'unstuck',
            submission_id: 'submission-1',
            message_present: true,
          },
          enrollment_at: enrolledAt.toISOString(),
          campaign_enrollment_reason: 'unstuck_form',
        },
      ],
    }),
  });

  const context = await readLifecycleJobContext(executor, { jobId });

  expect(context).toEqual({
    contactId,
    displayName: 'Person Name',
    companyName: 'Example Company',
    companyDomain: 'example.com',
    emailClassification: 'work',
    formSubmission: {
      form_kind: 'unstuck',
      submission_id: 'submission-1',
      message_present: true,
    },
    enrollmentAt: enrolledAt,
    campaignEnrollmentReason: 'unstuck_form',
  });
  expect(calls[0]?.params).toEqual([jobId]);
  expect(calls[0]?.sql).not.toMatch(/growth_artifacts|'message', a\.data/u);
});

test('readLifecycleJobContext normalizes unknown values and throws for a missing job', async () => {
  const { executor } = executorWith({
    'read-lifecycle-job-context': (params) =>
      params[0] === jobId
        ? {
            rows: [
              {
                contact_id: contactId,
                display_name: null,
                company_name: null,
                company_domain: null,
                email_classification: 'corporate',
                form_submission: { form_kind: 'whitepaper', paper: 'angular' },
                enrollment_at: null,
                campaign_enrollment_reason: 'project_claim',
              },
            ],
          }
        : { rows: [] },
  });

  const context = await readLifecycleJobContext(executor, { jobId });
  const missing = readLifecycleJobContext(executor, { jobId: 'missing' });

  expect(context).toEqual({
    contactId,
    displayName: null,
    companyName: null,
    companyDomain: null,
    emailClassification: 'unknown',
    formSubmission: {},
    enrollmentAt: null,
    campaignEnrollmentReason: null,
  });
  await expect(missing).rejects.toThrow(
    'Growth lifecycle job context not found: missing',
  );
});

test('claimInternalNotificationSubmission claims once per job and refuses a stale lease', async () => {
  let claimed = false;
  const { executor, calls } = executorWith({
    'claim-internal-notification-submission': (params) => {
      if (claimed || params[1] !== leaseToken) return { rows: [] };
      claimed = true;
      return {
        rows: [{ event_key: `job:${jobId}:internal-notification-submission` }],
      };
    },
    'read-internal-notification-claim': () => ({
      rows: claimed
        ? [{ event_key: `job:${jobId}:internal-notification-submission` }]
        : [],
    }),
  });
  const input = { jobId, leaseToken, now, kind: 'digest' } as const;

  const stale = await claimInternalNotificationSubmission(executor, {
    ...input,
    leaseToken: '00000000-0000-4000-8000-000000000299',
  }).catch((error: unknown) => error);
  const first = await claimInternalNotificationSubmission(executor, input);
  const second = await claimInternalNotificationSubmission(executor, input);

  expect(stale).toBeInstanceOf(JobLeaseConflictError);
  expect(first).toBe('claimed');
  expect(second).toBe('already_claimed');
  const claim = calls.find(
    ({ marker }) => marker === 'claim-internal-notification-submission',
  );
  expect(claim?.params).toEqual([
    jobId,
    '00000000-0000-4000-8000-000000000299',
    now,
    'digest',
  ]);
  expect(claim?.sql).toContain("'internal_notification.submission_started'");
  expect(claim?.sql).toContain('j.lease_until > $3');
});

test('markInternalNotificationUnknown fails the job as unknown and records manual review', async () => {
  const occurredAt = new Date('2026-09-02T15:01:00.000Z');
  const { executor, calls } = executorWith({
    'mark-internal-notification-unknown': (params) => ({
      rows:
        params[1] === leaseToken
          ? [
              jobRow({
                kind: params[4],
                status: 'failed',
                lease_token: null,
                lease_until: null,
                delivery_status: 'unknown',
                last_error_code: params[3],
              }),
            ]
          : [],
    }),
    'insert-internal-notification-unknown': emptyRows,
  });

  const job = await markInternalNotificationUnknown(executor, {
    jobId,
    leaseToken,
    occurredAt,
    errorCode: 'resend_timeout',
  });
  const stale = markInternalNotificationUnknown(executor, {
    jobId,
    leaseToken: '00000000-0000-4000-8000-000000000299',
    occurredAt,
    errorCode: 'resend_timeout',
    kind: 'digest',
  });

  expect(job).toMatchObject({
    kind: 'notify',
    status: 'failed',
    deliveryStatus: 'unknown',
    lastErrorCode: 'resend_timeout',
  });
  await expect(stale).rejects.toBeInstanceOf(JobLeaseConflictError);
  expect(calls.map(({ marker }) => marker)).toEqual([
    'mark-internal-notification-unknown',
    'insert-internal-notification-unknown',
    'mark-internal-notification-unknown',
  ]);
  expect(calls[1]?.sql).toContain("'internal_notification.acceptance_unknown'");
  expect(calls[1]?.params).toEqual([
    jobId,
    contactId,
    null,
    occurredAt,
    'resend_timeout',
  ]);
});
