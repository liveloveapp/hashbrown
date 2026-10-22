import { randomUUID } from 'node:crypto';

import { expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import {
  createDatabaseExecutor,
  type SqlExecutor,
} from '../src/lib/database.ts';
import {
  authorizeLeasedJobForSubmission,
  leaseDueJobs,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import {
  bindProviderMessageId,
  replySubjectSha256,
} from '../src/lib/replies.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  type EnrolledContact,
  insertSendStep,
} from './job-fixtures.ts';

/** Leases, authorizes and accepts step 1, leaving its Message-ID unbound. */
async function acceptStepOne(
  executor: SqlExecutor,
  contact: EnrolledContact,
  sentAt: Date,
  subject: string,
): Promise<{ jobId: string; providerEmailId: string }> {
  const leaseToken = randomUUID();
  const jobId = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: sentAt,
    leaseUntil: new Date(sentAt.getTime() + 10 * 60_000),
    leaseToken,
  });
  const authorization = await authorizeLeasedJobForSubmission(executor, {
    jobId,
    leaseToken,
    now: sentAt,
    campaignEnabled: true,
    deliveryEnabled: true,
  });
  if (!authorization.authorized) throw new Error('expected authorization');
  const providerEmailId = `resend-${randomUUID()}`;
  await recordProviderAcceptance(executor, {
    jobId,
    leaseToken,
    acceptedAt: new Date(sentAt.getTime() + 1_000),
    providerEmailId,
    subjectSha256: replySubjectSha256(subject),
  });
  return { jobId, providerEmailId };
}

test('leaseDueJobs holds a send_step while a sibling send waits for its Message-ID', async () => {
  const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
  const createdContactIds = new Set<string>();
  try {
    await applyMigrations({
      directory: defaultMigrationsDirectory(),
      executor,
    });

    const approvedAt = new Date('2037-05-01T00:00:00.000Z');
    // Tuesday 2037-05-05 07:10 PDT.
    const leaseAt = new Date('2037-05-05T14:10:00.000Z');
    const contact = await createEnrolledContact(
      executor,
      createdContactIds,
      approvedAt,
    );
    const stepOne = await acceptStepOne(
      executor,
      contact,
      new Date('2037-05-04T14:10:00.000Z'),
      'Engineer to engineer',
    );
    const stepTwo = await insertSendStep(executor, contact, {
      status: 'pending',
      availableAt: approvedAt,
      step: 2,
    });
    const lease = async () =>
      (
        await leaseDueJobs(executor, {
          kinds: ['send_step'],
          now: leaseAt,
          batchSize: 100,
          leaseDurationMs: 60_000,
          campaignEnabled: true,
        })
      ).filter((job) => job.contactId === contact.contactId);

    const whileUnbound = await lease();
    await bindProviderMessageId(executor, {
      providerEmailId: stepOne.providerEmailId,
      rfcMessageId: `<${randomUUID()}@resend.dev>`,
    });
    const afterBinding = await lease();

    expect(whileUnbound).toEqual([]);
    expect(afterBinding.map(({ id }) => id)).toEqual([stepTwo]);
  } finally {
    try {
      await deleteCreatedContacts(executor, createdContactIds);
    } finally {
      await executor.close?.();
    }
  }
});
