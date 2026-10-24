import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { deleteContact } from '../src/lib/contacts.ts';
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
  ProviderMessageIdBindingError,
  replySubjectSha256,
} from '../src/lib/provider-message-ids.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  type EnrolledContact,
  insertSendStep,
  runCleanup,
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

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  await runCleanup([() => deleteCreatedContacts(executor, createdContactIds)]);
  await executor.close?.();
});

test('leaseDueJobs holds a send_step while a sibling send waits for its Message-ID', async () => {
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
});

test('binding the same Message-ID twice is idempotent and a different one conflicts', async () => {
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    new Date('2037-06-01T00:00:00.000Z'),
  );
  const step = await acceptStepOne(
    executor,
    contact,
    new Date('2037-06-02T14:10:00.000Z'),
    'Engineer to engineer',
  );
  const rfcMessageId = `<${randomUUID()}@resend.dev>`;

  const first = await bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId,
  });
  const repeated = await bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId,
  });
  const conflicting = bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId: `<${randomUUID()}@resend.dev>`,
  });

  expect([first, repeated]).toEqual(['bound', 'bound']);
  await expect(conflicting).rejects.toBeInstanceOf(
    ProviderMessageIdBindingError,
  );
});

test('binding a provider Message-ID after the contact was deleted binds nothing', async () => {
  const at = new Date('2038-02-07T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    new Date('2038-02-01T00:00:00.000Z'),
  );
  const step = await acceptStepOne(
    executor,
    contact,
    at,
    'Engineer to engineer',
  );
  await deleteContact(executor, {
    contactId: contact.contactId,
    eventKey: `delete:${randomUUID()}`,
    occurredAt: at,
    actor: 'founder',
    source: 'test',
    policyVersion: 'growth-v1',
    redactEvidence: async () => undefined,
  });

  const result = await bindProviderMessageId(executor, {
    providerEmailId: step.providerEmailId,
    rfcMessageId: `<${randomUUID()}@resend.dev>`,
  });

  const row = await executor.execute<{ rfc_message_id: string | null }>(
    'select rfc_message_id from growth_jobs where id = $1',
    [step.jobId],
  );
  expect(result).toBe('ignored_deleted');
  expect(row.rows[0]?.rfc_message_id).toBeNull();
});
