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
  type FinalSendAuthorization,
  JobLeaseConflictError,
  leaseDueJobs,
  recordProviderAcceptance,
  renewJobLease,
} from '../src/lib/jobs.ts';
import { stopContact } from '../src/lib/stops.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  insertSendStep,
} from './job-fixtures.ts';

const stopExecutor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const workerExecutor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor: stopExecutor,
  });
});

afterAll(async () => {
  await deleteCreatedContacts(stopExecutor, createdContactIds);
  await Promise.all([stopExecutor.close?.(), workerExecutor.close?.()]);
});

test('two workers lease each job once and a stale lease cannot complete', async () => {
  const availableAt = new Date('1996-01-01T00:00:00.000Z');
  const contact = await createEnrolledContact(
    stopExecutor,
    createdContactIds,
    availableAt,
  );
  const jobIds: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const result = await stopExecutor.execute<{ id: string }>(
      `insert into growth_jobs (
         kind, contact_id, status, available_at, idempotency_key
       ) values ('digest', $1, 'pending', $2, $3)
       returning id`,
      [contact.contactId, availableAt, `concurrency:${randomUUID()}`],
    );
    jobIds.push(String(result.rows[0]?.id));
  }
  const leaseInput = {
    kinds: ['digest'],
    now: availableAt,
    batchSize: 4,
    leaseDurationMs: 60_000,
    campaignEnabled: false,
  };

  const [first, second] = await Promise.all([
    leaseDueJobs(stopExecutor, leaseInput),
    leaseDueJobs(workerExecutor, leaseInput),
  ]);
  const reclaimed = await leaseDueJobs(workerExecutor, {
    ...leaseInput,
    now: new Date('1996-01-01T00:01:00.001Z'),
    batchSize: 1,
  });

  const leased = [...first, ...second].map(({ id }) => id);
  expect(leased).toHaveLength(8);
  expect(new Set(leased)).toEqual(new Set(jobIds));
  const expired = [...first, ...second].find(
    ({ id }) => id === reclaimed[0]?.id,
  );
  expect(reclaimed[0]?.attempts).toBe(2);
  expect(reclaimed[0]?.leaseToken).not.toBe(expired?.leaseToken);
  const staleToken = String(expired?.leaseToken);
  await expect(
    renewJobLease(stopExecutor, {
      jobId: String(expired?.id),
      leaseToken: staleToken,
      now: new Date('1996-01-01T00:01:00.002Z'),
      leaseDurationMs: 60_000,
    }),
  ).resolves.toBeNull();
  await expect(
    completeLeasedJob(stopExecutor, {
      jobId: String(expired?.id),
      leaseToken: staleToken,
      now: new Date('1996-01-01T00:01:00.002Z'),
    }),
  ).rejects.toBeInstanceOf(JobLeaseConflictError);
});

test('a stop racing a lease and authorization on two connections never loses the job', async () => {
  for (let round = 0; round < 3; round += 1) {
    const approvedAt = new Date(Date.UTC(1997, 0, 1 + round * 2));
    const now = new Date(approvedAt.getTime() + 24 * 60 * 60 * 1000);
    const contact = await createEnrolledContact(
      stopExecutor,
      createdContactIds,
      approvedAt,
    );
    const jobId = await insertSendStep(stopExecutor, contact, {
      status: 'pending',
      availableAt: approvedAt,
    });
    const worker = async (): Promise<FinalSendAuthorization | null> => {
      const leased = await leaseDueJobs(workerExecutor, {
        kinds: ['send_step'],
        now,
        batchSize: 100,
        leaseDurationMs: 10 * 60_000,
        campaignEnabled: true,
      });
      const job = leased.find(({ id }) => id === jobId);
      if (!job?.leaseToken) return null;
      return authorizeLeasedJobForSubmission(workerExecutor, {
        jobId,
        leaseToken: job.leaseToken,
        now,
        campaignEnabled: true,
        deliveryEnabled: true,
      });
    };

    const [stop, authorization] = await Promise.all([
      stopContact(stopExecutor, {
        contactId: contact.contactId,
        reason: 'unsubscribe',
        eventKey: `concurrency:stop:${randomUUID()}`,
        occurredAt: now,
        source: 'concurrency-integration',
        provenance: { kind: 'one_click', policyVersion: 'growth-lifecycle-v1' },
      }),
      worker(),
    ]);

    expect(stop.effective).toBe(true);
    if (authorization?.authorized) {
      expect(stop.race.boundedProviderSubmissionPossible).toBe(true);
      expect(stop.race.jobIds).toEqual([jobId]);
      const accepted = await recordProviderAcceptance(workerExecutor, {
        jobId,
        leaseToken: String(authorization.job.leaseToken),
        acceptedAt: new Date(now.getTime() + 60_000),
        providerEmailId: `resend-${randomUUID()}`,
      });
      expect(accepted).toMatchObject({
        status: 'completed',
        deliveryStatus: 'submitted',
      });
    } else {
      expect(stop.race.boundedProviderSubmissionPossible).toBe(false);
      const job = await stopExecutor.execute<{ status: string }>(
        'select status from growth_jobs where id = $1',
        [jobId],
      );
      expect(job.rows[0]?.status).toBe('cancelled');
      const authorized = await stopExecutor.execute<{ kind: string }>(
        `select kind from growth_activity
         where contact_id = $1 and kind = 'delivery.submission_authorized'`,
        [contact.contactId],
      );
      expect(authorized.rows).toEqual([]);
    }
  }
});
