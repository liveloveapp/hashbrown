import { expect, test } from 'vitest';

import type { EmailHmacKeyring } from './crypto.ts';
import {
  CANONICAL_STOP_REASONS,
  providerSyncActionForStopReason,
  stopContact,
  type StopContactInput,
  stopLegacyEmailUnsubscribe,
} from './stops.ts';
import { executorWith, type MarkerHandler } from './testing/fake-executor.ts';

type TestRow = Record<string, unknown>;

const contactId = '00000000-0000-4000-8000-000000000001';
const pendingJobId = '00000000-0000-4000-8000-000000000101';
const leasedJobId = '00000000-0000-4000-8000-000000000102';
const submittedJobId = '00000000-0000-4000-8000-000000000103';
const leaseToken = '00000000-0000-4000-8000-000000000201';
const approvedAt = new Date('2026-09-01T12:00:00.000Z');
const stopAt = new Date('2026-09-02T12:00:00.000Z');
const emptyRows = () => ({ rows: [] });
const keyring: EmailHmacKeyring = {
  active: { version: 1, secret: 'active-stop-hmac-secret-32-bytes-long' },
};

const baseStop: StopContactInput = {
  contactId,
  reason: 'unsubscribe',
  eventKey: 'stop:unsubscribe:1',
  occurredAt: stopAt,
  source: 'one-click',
  provenance: { kind: 'one_click', policyVersion: 'growth-lifecycle-v1' },
};

function stopJobRow(overrides: TestRow = {}): TestRow {
  return {
    id: pendingJobId,
    kind: 'send_step',
    contact_id: contactId,
    project_id: null,
    status: 'pending',
    delivery_status: 'not_submitted',
    provider_email_id: null,
    lease_token: null,
    payload: { campaign_version: 'v1', step: 2 },
    authorization_event_key: null,
    authorization_contact_id: null,
    authorization_project_id: null,
    authorization_kind: null,
    authorization_occurred_at: null,
    authorization_data: null,
    ...overrides,
  };
}

function authorizedLeasedJob(): TestRow {
  return stopJobRow({
    id: leasedJobId,
    status: 'leased',
    lease_token: leaseToken,
    payload: { campaign_version: 'v1', step: 1, approval_kind: 'x' },
    authorization_event_key: `job:${leasedJobId}:submission-authorized:${leaseToken}`,
    authorization_contact_id: contactId,
    authorization_project_id: null,
    authorization_kind: 'delivery.submission_authorized',
    authorization_occurred_at: new Date('2026-09-02T11:59:00.000Z'),
    authorization_data: { bounded_stop_race: true, lease_token: leaseToken },
  });
}

function stopExecutor(options: {
  approvedAt?: Date | null;
  jobs?: TestRow[];
  storedActivity?: TestRow;
  extra?: Record<string, MarkerHandler>;
}) {
  const raceReviews: TestRow[] = [];
  return executorWith({
    'lock-contact-for-stop': () => ({
      rows: [
        {
          id: contactId,
          outreach_approved_at:
            options.approvedAt === undefined ? approvedAt : options.approvedAt,
          deleted_at: null,
        },
      ],
    }),
    'insert-stop-activity': () => ({
      rows: options.storedActivity ? [] : [{ event_key: baseStop.eventKey }],
    }),
    'read-stop-activity': () => ({
      rows: options.storedActivity ? [options.storedActivity] : [],
    }),
    'clear-stop-approval': () => ({ rows: [{ id: contactId }] }),
    'lock-stop-jobs': () => ({ rows: options.jobs ?? [] }),
    'insert-stop-race-review': (params) => {
      raceReviews.push({
        event_key: params[0],
        contact_id: params[1],
        project_id: params[2],
        kind: 'delivery.stop_race_review',
        occurred_at: params[3],
        data: JSON.parse(String(params[4])),
      });
      return { rows: [{ event_key: params[0] }] };
    },
    'cancel-stop-jobs': emptyRows,
    'settle-stop-ledger-jobs': emptyRows,
    'read-stop-race-reviews': () => ({
      rows: raceReviews.map((review) => ({
        ...review,
        job_id: (review['data'] as TestRow)['job_id'],
      })),
    }),
    'finalize-stop-activity': () => ({
      rows: [{ event_key: baseStop.eventKey }],
    }),
    ...options.extra,
  });
}

test('stopContact cancels pending jobs, clears approval, and persists the result', async () => {
  const submitted = stopJobRow({
    id: submittedJobId,
    status: 'completed',
    provider_email_id: 'resend-email-1',
    delivery_status: 'submitted',
  });
  const { executor, calls } = stopExecutor({
    jobs: [stopJobRow(), submitted],
  });

  const result = await stopContact(executor, baseStop);

  expect(result).toEqual({
    applied: true,
    effective: true,
    contactId,
    reason: 'unsubscribe',
    providerSync: { action: 'suppress_contact', required: true },
    cancelledJobIds: [pendingJobId],
    legacyProviderCancellationIds: [],
    preservedJobIds: [submittedJobId],
    race: {
      boundedProviderSubmissionPossible: false,
      manualReviewRequired: true,
      jobIds: [submittedJobId],
      providerSubmissionAlreadyRecordedJobIds: [submittedJobId],
      unknownDeliveryJobIds: [],
    },
  });
  expect(calls.map(({ marker }) => marker)).toEqual([
    'lock-contact-for-stop',
    'insert-stop-activity',
    'clear-stop-approval',
    'lock-stop-jobs',
    'cancel-stop-jobs',
    'read-stop-race-reviews',
    'finalize-stop-activity',
  ]);
  const cancel = calls.find(({ marker }) => marker === 'cancel-stop-jobs');
  expect(cancel?.params).toEqual([contactId, [pendingJobId], []]);
  const finalized = calls.find(
    ({ marker }) => marker === 'finalize-stop-activity',
  );
  expect(JSON.parse(String(finalized?.params[1]))).toMatchObject({
    effective: true,
    cancelled_job_ids: [pendingJobId],
    provider_sync: { action: 'suppress_contact', required: true },
  });
});

test('replaying a stop returns the persisted result without new writes', async () => {
  const first = stopExecutor({ jobs: [stopJobRow()] });
  const result = await stopContact(first.executor, baseStop);
  const finalized = first.calls.find(
    ({ marker }) => marker === 'finalize-stop-activity',
  );
  const storedActivity = {
    event_key: baseStop.eventKey,
    contact_id: contactId,
    project_id: null,
    kind: 'unsubscribe',
    occurred_at: stopAt,
    data: {
      policy_version: 'growth-lifecycle-v1',
      provenance: 'one_click',
      reason: 'unsubscribe',
      source: 'one-click',
      result: JSON.parse(String(finalized?.params[1])),
    },
  };
  const replay = stopExecutor({ jobs: [], storedActivity });

  const replayed = await stopContact(replay.executor, baseStop);

  expect(replayed).toEqual({ ...result, applied: false });
  expect(replay.calls.map(({ marker }) => marker)).toEqual([
    'lock-contact-for-stop',
    'insert-stop-activity',
    'read-stop-activity',
  ]);
  await expect(
    stopContact(replay.executor, { ...baseStop, source: 'other-source' }),
  ).rejects.toThrow('Growth activity event key conflict: stop:unsubscribe:1');
});

test('stop after submission authorization keeps the job and records a race review', async () => {
  const { executor, calls } = stopExecutor({
    jobs: [authorizedLeasedJob()],
  });

  const result = await stopContact(executor, baseStop);

  expect(result.cancelledJobIds).toEqual([leasedJobId]);
  expect(result.race).toEqual({
    boundedProviderSubmissionPossible: true,
    manualReviewRequired: true,
    jobIds: [leasedJobId],
    providerSubmissionAlreadyRecordedJobIds: [],
    unknownDeliveryJobIds: [],
  });
  const review = calls.find(
    ({ marker }) => marker === 'insert-stop-race-review',
  );
  expect(String(review?.params[0])).toMatch(
    new RegExp(`^job:${leasedJobId}:stop-race-review:[0-9a-f]{64}$`, 'u'),
  );
  expect(JSON.parse(String(review?.params[4]))).toEqual({
    bounded_provider_submission: true,
    campaign_version: 'v1',
    job_id: leasedJobId,
    reason: 'unsubscribe',
    step: 1,
    stop_event_key: baseStop.eventKey,
  });
  const cancel = calls.find(({ marker }) => marker === 'cancel-stop-jobs');
  expect(cancel?.params[2]).toEqual([leasedJobId]);
  expect(cancel?.sql).toContain(
    "'campaign_version', payload->'campaign_version'",
  );
});

test('a stop dated before approval is not effective', async () => {
  const { executor, calls } = stopExecutor({
    approvedAt: new Date('2026-09-03T12:00:00.000Z'),
    jobs: [stopJobRow()],
  });

  const result = await stopContact(executor, baseStop);

  expect(result).toMatchObject({
    applied: true,
    effective: false,
    providerSync: { action: 'none', required: false },
    cancelledJobIds: [],
  });
  expect(calls.map(({ marker }) => marker)).toEqual([
    'lock-contact-for-stop',
    'insert-stop-activity',
    'finalize-stop-activity',
  ]);
});

test('providerSyncActionForStopReason suppresses for provider reasons and not for a reply', () => {
  const providerReasons = CANONICAL_STOP_REASONS.filter(
    (reason) => reason !== 'campaign.reply_received',
  );

  const reply = providerSyncActionForStopReason('campaign.reply_received');

  expect(CANONICAL_STOP_REASONS).not.toContain('deletion');
  for (const reason of providerReasons) {
    expect(providerSyncActionForStopReason(reason)).toEqual({
      action: 'suppress_contact',
      required: true,
    });
  }
  expect(reply).toEqual({ action: 'none', required: false });
  expect(() =>
    providerSyncActionForStopReason('deletion' as 'unsubscribe'),
  ).toThrow('Unsupported contact stop reason: deletion');
});

test('stopLegacyEmailUnsubscribe is idempotent per approval epoch', async () => {
  const legacyExecutor = (
    approval: Date | null,
    latestLegacyStop: TestRow[] = [],
  ) =>
    stopExecutor({
      approvedAt: approval,
      extra: {
        'lock-contact-by-email-for-legacy-stop': () => ({
          rows: [
            { id: contactId, outreach_approved_at: approval, deleted_at: null },
          ],
        }),
        'read-latest-legacy-stop': () => ({ rows: latestLegacyStop }),
      },
    });
  const input = {
    email: 'Person@Example.com',
    keyring,
    occurredAt: stopAt,
    policyVersion: 'growth-lifecycle-v1',
    source: 'legacy-footer',
  };
  const first = legacyExecutor(approvedAt);
  const later = legacyExecutor(approvedAt);
  const reapproved = legacyExecutor(new Date('2026-09-01T18:00:00.000Z'));
  const alreadyStopped = legacyExecutor(null, [
    { event_key: 'legacy:unsubscribe:x', occurred_at: stopAt },
  ]);
  const unmatched = executorWith({
    'lock-contact-by-email-for-legacy-stop': emptyRows,
  });

  const firstResult = await stopLegacyEmailUnsubscribe(first.executor, input);
  await stopLegacyEmailUnsubscribe(later.executor, {
    ...input,
    occurredAt: new Date('2026-09-05T12:00:00.000Z'),
  });
  await stopLegacyEmailUnsubscribe(reapproved.executor, input);
  const replayed = await stopLegacyEmailUnsubscribe(
    alreadyStopped.executor,
    input,
  );
  const missing = await stopLegacyEmailUnsubscribe(unmatched.executor, input);

  const eventKeyOf = (calls: typeof first.calls) =>
    calls.find(({ marker }) => marker === 'insert-stop-activity')?.params[0];
  expect(firstResult).toEqual({
    applied: true,
    contactMatched: true,
    effective: true,
  });
  expect(String(eventKeyOf(first.calls))).toMatch(/^legacy:unsubscribe:/u);
  expect(eventKeyOf(later.calls)).toBe(eventKeyOf(first.calls));
  expect(eventKeyOf(reapproved.calls)).not.toBe(eventKeyOf(first.calls));
  expect(replayed).toEqual({
    applied: false,
    contactMatched: true,
    effective: true,
  });
  expect(alreadyStopped.calls.map(({ marker }) => marker)).toEqual([
    'lock-contact-by-email-for-legacy-stop',
    'read-latest-legacy-stop',
  ]);
  expect(missing).toEqual({
    applied: false,
    contactMatched: false,
    effective: false,
  });
});
