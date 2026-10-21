import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import {
  authorizeLeasedJobForSubmission,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import { stopContact, type StopContactInput } from '../src/lib/stops.ts';
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

function stopInput(contactId: string, occurredAt: Date): StopContactInput {
  return {
    contactId,
    reason: 'unsubscribe',
    eventKey: `stops-integration:${randomUUID()}`,
    occurredAt,
    source: 'stops-integration',
    provenance: { kind: 'one_click', policyVersion: 'growth-lifecycle-v1' },
  };
}

test('stopContact cancels pending jobs, clears approval, and replays the persisted result', async () => {
  const approvedAt = new Date('1994-01-01T00:00:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const jobId = await insertSendStep(executor, contact, {
    status: 'pending',
    availableAt: approvedAt,
  });
  const input = stopInput(
    contact.contactId,
    new Date('1994-01-02T00:00:00.000Z'),
  );

  const stopped = await stopContact(executor, input);
  const replayed = await stopContact(executor, input);

  expect(stopped).toMatchObject({
    applied: true,
    effective: true,
    cancelledJobIds: [jobId],
    providerSync: { action: 'suppress_contact', required: true },
    race: { manualReviewRequired: false },
  });
  expect(replayed).toEqual({ ...stopped, applied: false });
  const contactRow = await executor.execute<{ outreach_approved_at: unknown }>(
    'select outreach_approved_at from growth_contacts where id = $1',
    [contact.contactId],
  );
  expect(contactRow.rows[0]?.outreach_approved_at).toBeNull();
  const job = await executor.execute<Record<string, unknown>>(
    'select status, payload, last_error_code from growth_jobs where id = $1',
    [jobId],
  );
  expect(job.rows[0]).toEqual({
    status: 'cancelled',
    payload: {},
    last_error_code: 'contact_stopped',
  });
  const activity = await executor.execute<{ data: Record<string, unknown> }>(
    'select data from growth_activity where event_key = $1',
    [input.eventKey],
  );
  expect(activity.rows[0]?.data['result']).toMatchObject({
    effective: true,
    cancelled_job_ids: [jobId],
  });
});

test('a stop after submission authorization records a race review and acceptance settles the job', async () => {
  const approvedAt = new Date('1995-01-01T00:00:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const leaseToken = randomUUID();
  const jobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: approvedAt,
    leaseUntil: new Date('1995-01-02T00:10:00.000Z'),
    leaseToken,
  });
  const authorization = await authorizeLeasedJobForSubmission(executor, {
    jobId,
    leaseToken,
    now: new Date('1995-01-02T00:00:00.000Z'),
    campaignEnabled: true,
    deliveryEnabled: true,
  });

  const stopped = await stopContact(
    executor,
    stopInput(contact.contactId, new Date('1995-01-02T00:01:00.000Z')),
  );
  const accepted = await recordProviderAcceptance(executor, {
    jobId,
    leaseToken,
    acceptedAt: new Date('1995-01-02T00:02:00.000Z'),
    providerEmailId: `resend-${randomUUID()}`,
  });

  expect(authorization.authorized).toBe(true);
  expect(stopped.race).toEqual({
    boundedProviderSubmissionPossible: true,
    manualReviewRequired: true,
    jobIds: [jobId],
    providerSubmissionAlreadyRecordedJobIds: [],
    unknownDeliveryJobIds: [],
  });
  expect(accepted).toMatchObject({
    status: 'completed',
    deliveryStatus: 'submitted',
    payload: { campaign_version: 'v1', step: 1 },
  });
  const review = await executor.execute<{ data: Record<string, unknown> }>(
    `select data from growth_activity
     where contact_id = $1 and kind = 'delivery.stop_race_review'`,
    [contact.contactId],
  );
  expect(review.rows).toHaveLength(1);
  expect(review.rows[0]?.data).toMatchObject({
    bounded_provider_submission: true,
    job_id: jobId,
    step: 1,
  });
});
