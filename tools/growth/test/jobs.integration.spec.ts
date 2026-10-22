import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import {
  authorizeLeasedJobForSubmission,
  completeLeasedJob,
  enqueueJob,
  JobLeaseConflictError,
  leaseDueJobs,
  markProviderAcceptanceUnknown,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  insertSendStep,
} from './job-fixtures.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  await deleteCreatedContacts(executor, createdContactIds);
  await executor.close?.();
});

test('enqueueJob inserts once, returns exists, and rejects a mismatched payload', async () => {
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    new Date('1990-01-01T00:00:00.000Z'),
  );
  const input = {
    kind: 'fulfill',
    contactId: contact.contactId,
    availableAt: new Date('1990-01-01T00:00:00.000Z'),
    idempotencyKey: `jobs-integration:fulfill:${randomUUID()}`,
    payload: { submission_id: 'one', form_kind: 'unstuck' },
  } as const;

  const first = await executor.transaction((tx) => enqueueJob(tx, input));
  const second = await executor.transaction((tx) =>
    enqueueJob(tx, {
      ...input,
      payload: { form_kind: 'unstuck', submission_id: 'one' },
    }),
  );
  const mismatched = executor.transaction((tx) =>
    enqueueJob(tx, { ...input, payload: { submission_id: 'two' } }),
  );

  expect(first.status).toBe('inserted');
  expect(second).toMatchObject({ status: 'exists', job: { id: first.job.id } });
  await expect(mismatched).rejects.toThrow('Growth job idempotency conflict');
});

test('leaseDueJobs leases only due pending or expired jobs and increments attempts', async () => {
  const now = new Date('1991-01-01T00:00:00.000Z');
  const contact = await createEnrolledContact(executor, createdContactIds, now);
  const insert = async (
    status: string,
    availableAt: Date,
    leaseUntil: Date | null,
  ) => {
    const result = await executor.execute<{ id: string }>(
      `insert into growth_jobs (
         kind, contact_id, status, available_at, lease_until, lease_token,
         attempts, idempotency_key
       ) values ('fulfill', $1, $2, $3, $4, $5, 1, $6)
       returning id`,
      [
        contact.contactId,
        status,
        availableAt,
        leaseUntil,
        leaseUntil ? randomUUID() : null,
        `jobs-integration:${randomUUID()}`,
      ],
    );
    return result.rows[0]?.id;
  };
  const due = await insert(
    'pending',
    new Date('1990-12-31T00:00:00.000Z'),
    null,
  );
  await insert('pending', new Date('1991-01-02T00:00:00.000Z'), null);
  const expired = await insert(
    'leased',
    new Date('1990-12-31T00:00:00.000Z'),
    new Date('1990-12-31T23:00:00.000Z'),
  );
  await insert(
    'leased',
    new Date('1990-12-31T00:00:00.000Z'),
    new Date('1991-01-01T01:00:00.000Z'),
  );
  await insert('completed', new Date('1990-12-31T00:00:00.000Z'), null);

  const leased = await leaseDueJobs(executor, {
    kinds: ['fulfill'],
    now,
    batchSize: 100,
    leaseDurationMs: 60_000,
    campaignEnabled: false,
  });

  const mine = leased.filter((job) => job.contactId === contact.contactId);
  expect(new Set(mine.map(({ id }) => id))).toEqual(new Set([due, expired]));
  for (const job of mine) {
    expect(job).toMatchObject({
      status: 'leased',
      attempts: 2,
      leaseUntil: new Date(now.getTime() + 60_000),
    });
  }
});

test('leaseDueJobs fails expired leases that were already authorized for submission', async () => {
  const leasedAt = new Date('1992-01-01T00:00:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    leasedAt,
  );
  const leaseToken = randomUUID();
  const jobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: leasedAt,
    leaseUntil: new Date('1992-01-01T00:10:00.000Z'),
    leaseToken,
  });
  const authorization = await authorizeLeasedJobForSubmission(executor, {
    jobId,
    leaseToken,
    now: new Date('1992-01-01T00:01:00.000Z'),
    campaignEnabled: true,
    deliveryEnabled: true,
  });

  const leased = await leaseDueJobs(executor, {
    kinds: ['send_step'],
    now: new Date('1992-01-01T00:20:00.000Z'),
    batchSize: 100,
    leaseDurationMs: 60_000,
    campaignEnabled: true,
  });

  expect(authorization.authorized).toBe(true);
  expect(leased.map(({ id }) => id)).not.toContain(jobId);
  const job = await executor.execute<Record<string, unknown>>(
    `select status, delivery_status, last_error_code, lease_token
     from growth_jobs where id = $1`,
    [jobId],
  );
  expect(job.rows[0]).toEqual({
    status: 'failed',
    delivery_status: 'unknown',
    last_error_code: 'worker_interrupted_after_authorization',
    lease_token: null,
  });
  const unknown = await executor.execute<{ kind: string }>(
    'select kind from growth_activity where event_key = $1',
    [`job:${jobId}:provider-acceptance-unknown`],
  );
  expect(unknown.rows).toEqual([{ kind: 'delivery.acceptance_unknown' }]);
});

test('authorization, acceptance, and unknown outcomes settle leased send steps', async () => {
  const approvedAt = new Date('1993-01-01T00:00:00.000Z');
  const now = new Date('1993-01-02T00:00:00.000Z');
  const leaseUntil = new Date('1993-01-02T00:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const acceptedToken = randomUUID();
  const unknownToken = randomUUID();
  const acceptedJobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: approvedAt,
    leaseUntil,
    leaseToken: acceptedToken,
  });
  const unknownJobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: approvedAt,
    leaseUntil,
    leaseToken: unknownToken,
    step: 2,
  });
  const authorize = (jobId: string, leaseToken: string) =>
    authorizeLeasedJobForSubmission(executor, {
      jobId,
      leaseToken,
      now,
      campaignEnabled: true,
      deliveryEnabled: true,
    });
  const acceptance = {
    jobId: acceptedJobId,
    leaseToken: acceptedToken,
    acceptedAt: new Date('1993-01-02T00:01:00.000Z'),
    providerEmailId: `resend-${randomUUID()}`,
  };

  const outsideWindow = await authorizeLeasedJobForSubmission(executor, {
    jobId: acceptedJobId,
    leaseToken: acceptedToken,
    now,
    campaignEnabled: true,
    deliveryEnabled: true,
    isSendWindow: () => false,
  });
  const authorized = await authorize(acceptedJobId, acceptedToken);
  const reauthorized = await authorize(acceptedJobId, acceptedToken);
  const accepted = await recordProviderAcceptance(executor, acceptance);
  const replayed = await recordProviderAcceptance(executor, acceptance);
  const completeSendStep = await completeLeasedJob(executor, {
    jobId: unknownJobId,
    leaseToken: unknownToken,
    now,
  }).catch((error: unknown) => error);
  await authorize(unknownJobId, unknownToken);
  const unknown = await markProviderAcceptanceUnknown(executor, {
    jobId: unknownJobId,
    leaseToken: unknownToken,
    occurredAt: new Date('1993-01-02T00:02:00.000Z'),
    errorCode: 'provider_timeout',
  });

  expect(outsideWindow).toMatchObject({
    authorized: false,
    reason: 'outside_send_window',
  });
  expect(authorized.authorized).toBe(true);
  expect(reauthorized.authorized).toBe(true);
  expect(accepted).toMatchObject({
    status: 'completed',
    deliveryStatus: 'submitted',
    providerEmailId: acceptance.providerEmailId,
    leaseToken: null,
  });
  expect(replayed).toEqual(accepted);
  expect(completeSendStep).toBeInstanceOf(JobLeaseConflictError);
  expect(unknown).toMatchObject({
    status: 'failed',
    deliveryStatus: 'unknown',
    lastErrorCode: 'provider_timeout',
  });
  const activity = await executor.execute<{ kind: string }>(
    `select kind from growth_activity
     where event_key like 'job:%' and contact_id = $1
     order by kind`,
    [contact.contactId],
  );
  expect(activity.rows.map(({ kind }) => kind)).toEqual([
    'campaign.step_accepted',
    'delivery.acceptance_unknown',
    'delivery.submission_authorized',
    'delivery.submission_authorized',
  ]);
});
