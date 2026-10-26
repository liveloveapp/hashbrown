import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import type { EmailHmacKeyring } from '../src/lib/crypto.ts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import { FormRateLimitError } from '../src/lib/form-admission.ts';
import {
  acceptFormSubmission,
  type AcceptFormSubmissionInput,
} from '../src/lib/forms.ts';
import {
  materializeCampaignEnrollment,
  readNotificationSubmission,
} from '../src/lib/jobs.ts';
import { stopContact } from '../src/lib/stops.ts';
import { deleteCreatedContacts, runCleanup } from './job-fixtures.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const keyring: EmailHmacKeyring = {
  active: { version: 1, secret: randomBytes(32).toString('hex') },
};
const createdEmails = new Set<string>();
const createdContactIds = new Set<string>();
let recordedCampaignConfiguration = false;

const MESSAGE = 'My streaming chat component never finishes rendering.';

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  const emails = [...createdEmails];
  await runCleanup([
    async () => {
      const contacts = await executor.execute<{ id: string }>(
        'select id from growth_contacts where email_normalized = any($1::text[])',
        [emails],
      );
      for (const { id } of contacts.rows) createdContactIds.add(id);
      await deleteCreatedContacts(executor, createdContactIds);
    },
    () =>
      executor.execute(
        'delete from growth_collection_budgets where bucket_key = any($1::text[])',
        [emails.flatMap(emailBucketKeys)],
      ),
    async () => {
      if (recordedCampaignConfiguration) await deleteCampaignConfiguration();
    },
  ]);
  await executor.close?.();
});

function emailBucketKeys(email: string): string[] {
  const digest = createHmac('sha256', keyring.active.secret)
    .update(`form-email:${email}`)
    .digest('hex');
  return [`form:email:${digest}`, `form:email-day:${digest}`];
}

function newEmail(label: string): string {
  const email = `unstuck-${label}-${randomUUID()}@example.com`;
  createdEmails.add(email);
  return email;
}

function submission(
  email: string,
  occurredAt: Date,
  overrides: {
    submissionId?: string;
    message?: string;
  } = {},
): AcceptFormSubmissionInput {
  return {
    submissionId: overrides.submissionId ?? randomUUID(),
    email,
    form: { message: overrides.message ?? MESSAGE },
    occurredAt,
    keyring,
  };
}

async function accept(input: AcceptFormSubmissionInput) {
  const result = await acceptFormSubmission(executor, input);
  createdContactIds.add(result.contactId);
  return result;
}

async function counts(email: string, submissionId: string) {
  const result = await executor.execute<{
    contacts: string;
    accepted: string;
    approvals: string;
    assessments: string;
    jobs: string;
  }>(
    `select
       (select count(*)::text from growth_contacts
         where email_normalized = $1) as contacts,
       (select count(*)::text from growth_activity
         where event_key = 'form:' || $2 || ':accepted') as accepted,
       (select count(*)::text from growth_activity
         where event_key = 'form:' || $2 || ':accepted:outreach-approved')
         as approvals,
       (select count(*)::text from growth_activity
         where event_key = 'form:' || $2 || ':assessment') as assessments,
       (select count(*)::text from growth_jobs
         where payload->>'submission_id' = $2) as jobs`,
    [email, submissionId],
  );
  return result.rows[0];
}

async function formJobs(submissionId: string) {
  const result = await executor.execute<{
    id: string;
    kind: string;
    idempotency_key: string;
    status: string;
    payload: Record<string, unknown>;
  }>(
    `select id, kind, idempotency_key, status, payload
     from growth_jobs
     where payload->>'submission_id' = $1
     order by kind`,
    [submissionId],
  );
  return result.rows;
}

async function activityData(eventKey: string) {
  const result = await executor.execute<{
    kind: string;
    data: Record<string, unknown>;
  }>('select kind, data from growth_activity where event_key = $1', [eventKey]);
  return result.rows[0];
}

async function deleteCampaignConfiguration(): Promise<void> {
  await executor.execute(
    `delete from growth_activity
     where event_key = 'campaign:v1:configuration'
       and kind = 'campaign.configured:v1'`,
  );
}

test('accepts an unstuck submission: one contact, a submission record with no notice or framework, fulfill and notify jobs', async () => {
  const email = newEmail('accept');
  const input = submission(email, new Date('2026-10-22T15:10:00.000Z'));

  const result = await accept(input);

  expect(result).toEqual({
    accepted: true,
    approved: true,
    contactId: result.contactId,
    submissionId: input.submissionId,
  });
  expect(await counts(email, input.submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '1',
    assessments: '1',
    jobs: '2',
  });
  const consent = await activityData(`form:${input.submissionId}:accepted`);
  expect(consent?.kind).toBe('contact.form_submission');
  expect(consent?.data).toMatchObject({
    approval_granted: true,
    form_kind: 'unstuck',
    submission_id: input.submissionId,
    message: MESSAGE,
    source: 'website',
    source_form: 'unstuck',
    email_classification: 'work',
  });
  expect(consent?.data).not.toHaveProperty('paper');
  for (const key of [
    'notice_text',
    'notice_version',
    'policy_version',
    'framework',
  ]) {
    expect(consent?.data).not.toHaveProperty(key);
  }
  const approval = await activityData(
    `form:${input.submissionId}:accepted:outreach-approved`,
  );
  expect(approval).toMatchObject({
    kind: 'form.outreach_approved',
    data: { source_form: 'unstuck', verification: 'server_verified' },
  });
  const assessment = await activityData(
    `form:${input.submissionId}:assessment`,
  );
  expect(assessment?.kind).toBe('form.abuse_assessed');
  expect(JSON.stringify(assessment?.data)).not.toContain(MESSAGE);
  const payload = { form_kind: 'unstuck', submission_id: input.submissionId };
  expect(await formJobs(input.submissionId)).toMatchObject([
    {
      kind: 'fulfill',
      idempotency_key: `form:contact:${result.contactId}:fulfill:2026-10-22`,
      status: 'pending',
      payload,
    },
    {
      kind: 'notify',
      idempotency_key: `form:${input.submissionId}:notify`,
      status: 'pending',
      payload,
    },
  ]);
});

test('replaying a submission id returns the original result and a changed payload conflicts', async () => {
  const email = newEmail('replay');
  const input = submission(email, new Date('2026-10-22T15:10:00.000Z'));
  const first = await accept(input);

  const replay = await acceptFormSubmission(executor, {
    ...input,
    occurredAt: new Date('2026-10-22T15:10:05.000Z'),
  });
  const changed = acceptFormSubmission(executor, {
    ...input,
    form: { ...input.form, message: `${MESSAGE} It is Angular too.` },
  });

  expect(replay).toEqual(first);
  await expect(changed).rejects.toThrow(/identity conflict/u);
  expect(await counts(email, input.submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '1',
    assessments: '1',
    jobs: '2',
  });
});

test('concurrent identical submissions create exactly one contact, activity set and job set', async () => {
  const email = newEmail('concurrent');
  const submissionId = randomUUID();

  const [first, second] = await Promise.all([
    accept(
      submission(email, new Date('2026-10-22T15:10:00.000Z'), {
        submissionId,
      }),
    ),
    accept(
      submission(email, new Date('2026-10-22T15:10:01.000Z'), {
        submissionId,
      }),
    ),
  ]);

  expect(first).toEqual(second);
  expect(first).toMatchObject({ accepted: true, approved: true });
  expect(await counts(email, submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '1',
    assessments: '1',
    jobs: '2',
  });
});

test('prior unsubscribe still gets fulfill and notify but no approval', async () => {
  const email = newEmail('unsubscribed');
  const earlier = await accept(
    submission(email, new Date('2026-10-22T15:10:00.000Z')),
  );
  await stopContact(executor, {
    contactId: earlier.contactId,
    reason: 'unsubscribe',
    eventKey: `forms-integration:${randomUUID()}`,
    occurredAt: new Date('2026-10-22T15:11:00.000Z'),
    source: 'forms-integration',
    provenance: { kind: 'one_click', policyVersion: 'growth-lifecycle-v1' },
  });
  // The next UTC day, so the earlier submission's acknowledgement is not reused.
  const input = submission(email, new Date('2026-10-23T15:12:00.000Z'));

  const result = await accept(input);

  expect(result).toEqual({
    accepted: true,
    approved: false,
    contactId: earlier.contactId,
    submissionId: input.submissionId,
  });
  expect(await counts(email, input.submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '0',
    assessments: '1',
    jobs: '2',
  });
  expect((await formJobs(input.submissionId)).map(({ kind }) => kind)).toEqual([
    'fulfill',
    'notify',
  ]);
  const consent = await activityData(`form:${input.submissionId}:accepted`);
  expect(consent?.data).toMatchObject({
    approval_granted: false,
    blocked_by: 'unsubscribe',
  });
});

test('complaint suppresses all mail and returns deliverySuppressed', async () => {
  const email = newEmail('complained');
  const earlier = await accept(
    submission(email, new Date('2026-10-22T15:10:00.000Z')),
  );
  await stopContact(executor, {
    contactId: earlier.contactId,
    reason: 'complaint',
    eventKey: `forms-integration:${randomUUID()}`,
    occurredAt: new Date('2026-10-22T15:11:00.000Z'),
    source: 'forms-integration',
    provenance: {
      kind: 'provider_webhook',
      policyVersion: 'growth-lifecycle-v1',
    },
  });
  const input = submission(email, new Date('2026-10-22T15:12:00.000Z'));

  const result = await accept(input);

  expect(result).toEqual({
    accepted: true,
    approved: false,
    contactId: earlier.contactId,
    submissionId: input.submissionId,
    deliverySuppressed: true,
  });
  expect(await counts(email, input.submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '0',
    assessments: '1',
    jobs: '0',
  });
});

test('complaint then unsubscribe suppresses all mail and returns deliverySuppressed', async () => {
  const email = newEmail('complained-then-unsubscribed');
  const earlier = await accept(
    submission(email, new Date('2026-10-22T15:10:00.000Z')),
  );
  await stopContact(executor, {
    contactId: earlier.contactId,
    reason: 'complaint',
    eventKey: `forms-integration:${randomUUID()}`,
    occurredAt: new Date('2026-10-22T15:11:00.000Z'),
    source: 'forms-integration',
    provenance: {
      kind: 'provider_webhook',
      policyVersion: 'growth-lifecycle-v1',
    },
  });
  await stopContact(executor, {
    contactId: earlier.contactId,
    reason: 'unsubscribe',
    eventKey: `forms-integration:${randomUUID()}`,
    occurredAt: new Date('2026-10-22T15:12:00.000Z'),
    source: 'forms-integration',
    provenance: { kind: 'one_click', policyVersion: 'growth-lifecycle-v1' },
  });
  const input = submission(email, new Date('2026-10-22T15:13:00.000Z'));

  const result = await accept(input);

  expect(result).toEqual({
    accepted: true,
    approved: false,
    contactId: earlier.contactId,
    submissionId: input.submissionId,
    deliverySuppressed: true,
  });
  expect(await counts(email, input.submissionId)).toEqual({
    contacts: '1',
    accepted: '1',
    approvals: '0',
    assessments: '1',
    jobs: '0',
  });
});

test('sixth submission for one email within the hour throws FormRateLimitError with a bounded Retry-After', async () => {
  const email = newEmail('limited');
  const hour = Date.parse('2026-10-22T16:00:00.000Z');
  for (let index = 0; index < 5; index += 1) {
    await accept(submission(email, new Date(hour + index * 60_000)));
  }
  const sixth = submission(email, new Date(hour + 10 * 60_000));

  const rejected = acceptFormSubmission(executor, sixth);

  await expect(rejected).rejects.toBeInstanceOf(FormRateLimitError);
  await expect(rejected).rejects.toMatchObject({ retryAfterSec: 3_000 });
  expect(await counts(email, sixth.submissionId)).toEqual({
    contacts: '1',
    accepted: '0',
    approvals: '0',
    assessments: '0',
    jobs: '0',
  });
});

test('enrollment picks up an accepted unstuck approval with reason unstuck_form', async () => {
  // Far after every other spec's approvals so enrollment only reaches this one.
  const enrollmentStartAt = new Date('2041-01-01T00:00:00.000Z');
  const email = newEmail('enrollment');
  const input = submission(email, new Date('2041-03-05T15:00:00.000Z'));
  const result = await accept(input);
  await deleteCampaignConfiguration();
  recordedCampaignConfiguration = true;

  const enrollment = await materializeCampaignEnrollment(executor, {
    enrollmentEnabled: true,
    enrollmentStartAt,
    now: new Date('2041-03-05T15:10:00.000Z'),
    batchSize: 1_000,
  });

  expect(enrollment.enrolledContactIds).toContain(result.contactId);
  const enrolled = await activityData(
    `campaign:v1:${result.contactId}:enrolled`,
  );
  expect(enrolled?.data).toMatchObject({
    enrollment_reason: 'unstuck_form',
    approval_kind: 'form.outreach_approved',
    approval_event_key: `form:${input.submissionId}:accepted:outreach-approved`,
  });
});

test('readNotificationSubmission reads the message from the accepted submission', async () => {
  const email = newEmail('notify');
  const input = submission(email, new Date('2026-10-22T15:10:00.000Z'));
  await accept(input);
  const notify = (await formJobs(input.submissionId)).find(
    ({ kind }) => kind === 'notify',
  );
  if (!notify) throw new Error('expected a notify job');

  const read = await readNotificationSubmission(executor, {
    jobId: notify.id,
  });
  const missing = await readNotificationSubmission(executor, {
    jobId: randomUUID(),
  });

  expect(read).toEqual({ message: MESSAGE });
  expect(missing).toBeNull();
});

test('two submissions from one address on one UTC day enqueue one fulfill and two notify jobs', async () => {
  const email = newEmail('daily-fulfill');
  const first = submission(email, new Date('2026-10-22T09:00:00.000Z'));
  const second = submission(email, new Date('2026-10-22T21:00:00.000Z'), {
    message: `${MESSAGE} Still stuck after the docs.`,
  });
  const nextDay = submission(email, new Date('2026-10-23T09:00:00.000Z'));

  const firstResult = await accept(first);
  const secondResult = await accept(second);
  const nextDayResult = await accept(nextDay);

  expect(secondResult).toMatchObject({ accepted: true });
  expect(secondResult).not.toHaveProperty('deliverySuppressed');
  const jobs = await executor.execute<{
    kind: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
  }>(
    `select kind, idempotency_key, payload from growth_jobs
     where contact_id = $1 and kind in ('fulfill', 'notify')
     order by kind, idempotency_key`,
    [firstResult.contactId],
  );
  expect(nextDayResult.contactId).toBe(firstResult.contactId);
  expect(jobs.rows).toEqual(
    expect.arrayContaining([
      {
        kind: 'fulfill',
        idempotency_key: `form:contact:${firstResult.contactId}:fulfill:2026-10-22`,
        payload: { form_kind: 'unstuck', submission_id: first.submissionId },
      },
      {
        kind: 'fulfill',
        idempotency_key: `form:contact:${firstResult.contactId}:fulfill:2026-10-23`,
        payload: { form_kind: 'unstuck', submission_id: nextDay.submissionId },
      },
    ]),
  );
  expect(jobs.rows.filter(({ kind }) => kind === 'fulfill')).toHaveLength(2);
  expect(
    jobs.rows
      .filter(({ kind }) => kind === 'notify')
      .map(({ idempotency_key }) => idempotency_key)
      .sort(),
  ).toEqual(
    [
      `form:${first.submissionId}:notify`,
      `form:${second.submissionId}:notify`,
      `form:${nextDay.submissionId}:notify`,
    ].sort(),
  );
});

test('the eleventh submission for one email in a UTC day throws FormRateLimitError until midnight', async () => {
  const email = newEmail('daily-limited');
  const day = Date.parse('2026-10-24T00:00:00.000Z');
  for (let index = 0; index < 10; index += 1) {
    // Five per clock hour, so only the daily budget can refuse.
    const hour = Math.floor(index / 5) * 3_600_000;
    await accept(submission(email, new Date(day + hour + index * 60_000)));
  }
  const eleventh = submission(email, new Date(day + 3 * 3_600_000));

  const rejected = acceptFormSubmission(executor, eleventh);

  await expect(rejected).rejects.toBeInstanceOf(FormRateLimitError);
  await expect(rejected).rejects.toMatchObject({ retryAfterSec: 75_600 });
});
