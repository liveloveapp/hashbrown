import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import {
  businessMorningAfter,
  isCampaignSendWindow,
} from '../src/lib/campaign-schedule.ts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import {
  authorizeLeasedJobForSubmission,
  claimInternalNotificationSubmission,
  JobLeaseConflictError,
  leaseDueJobs,
  markInternalNotificationUnknown,
  materializeCampaignEnrollment,
  readLifecycleJobContext,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import {
  type CampaignApprovalFixture,
  createApprovedContact,
  createEnrolledContact,
  deleteCreatedContacts,
  insertSendStep,
  UNSTUCK_FORM_APPROVAL,
} from './job-fixtures.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();
// Every contact here is approved after this start, and every other spec's
// contacts before it, so enrollment never reaches another spec's rows.
const enrollmentStartAt = new Date('2031-01-01T00:00:00.000Z');

const FOUNDER_APPROVAL: CampaignApprovalFixture = {
  kind: 'contact.reauthorized',
  data: { provenance: 'founder_action' },
};

function installRuntimeApproval(): CampaignApprovalFixture {
  return {
    kind: 'install_runtime.outreach_approved',
    data: {
      verification: 'linked_observations',
      install_observation_id: randomUUID(),
      runtime_observation_id: randomUUID(),
    },
  };
}

async function deleteCampaignConfiguration(): Promise<void> {
  await executor.execute(
    `delete from growth_activity
     where event_key = 'campaign:v1:configuration'
       and kind = 'campaign.configured:v1'`,
  );
}

function enroll(now: Date) {
  return materializeCampaignEnrollment(executor, {
    enrollmentEnabled: true,
    enrollmentStartAt,
    now,
    batchSize: 1_000,
  });
}

async function sendSteps(contactId: string) {
  const result = await executor.execute<{
    id: string;
    idempotency_key: string;
    available_at: Date;
    status: string;
    step: string;
  }>(
    `select id, idempotency_key, available_at, status, payload->>'step' as step
     from growth_jobs
     where contact_id = $1 and kind = 'send_step'
     order by payload->>'step'`,
    [contactId],
  );
  return result.rows;
}

async function setAvailableAt(jobId: string, availableAt: Date) {
  await executor.execute(
    'update growth_jobs set available_at = $2 where id = $1',
    [jobId, availableAt],
  );
}

async function leaseMine(
  contactId: string,
  now: Date,
  isSendWindow: (now: Date) => boolean = () => true,
) {
  const leased = await leaseDueJobs(executor, {
    kinds: ['send_step'],
    now,
    batchSize: 100,
    leaseDurationMs: 10 * 60_000,
    campaignEnabled: true,
    isSendWindow,
  });
  return leased.filter((job) => job.contactId === contactId);
}

async function sendAndAccept(
  contactId: string,
  leaseAt: Date,
  acceptedAt: Date,
  providerEmailId: string,
) {
  const [job] = await leaseMine(contactId, leaseAt, isCampaignSendWindow);
  if (!job?.leaseToken) throw new Error('expected a leased send step');
  const authorization = await authorizeLeasedJobForSubmission(executor, {
    jobId: job.id,
    leaseToken: job.leaseToken,
    now: leaseAt,
    campaignEnabled: true,
    deliveryEnabled: true,
    isSendWindow: isCampaignSendWindow,
  });
  expect(authorization.authorized).toBe(true);
  const acceptance = {
    jobId: job.id,
    leaseToken: job.leaseToken,
    acceptedAt,
    providerEmailId,
  };
  await recordProviderAcceptance(executor, acceptance);
  return acceptance;
}

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
  await deleteCampaignConfiguration();
});

afterAll(async () => {
  await deleteCreatedContacts(executor, createdContactIds);
  await deleteCampaignConfiguration();
  await executor.close?.();
});

test('materializeCampaignEnrollment enrols unstuck, founder-digest and install-runtime approvals once and never an unapproved or stopped contact', async () => {
  // Monday 2031-01-06 06:00 PST.
  const now = new Date('2031-01-06T14:00:00.000Z');
  const approvedAt = new Date('2031-01-05T18:00:00.000Z');
  const create = (
    approval: CampaignApprovalFixture,
    options: { approved?: boolean; at?: Date } = {},
  ) =>
    createApprovedContact(
      executor,
      createdContactIds,
      options.at ?? approvedAt,
      { approval, approved: options.approved },
    );
  const unstuck = await create(UNSTUCK_FORM_APPROVAL);
  const founder = await create(FOUNDER_APPROVAL);
  const install = await create(installRuntimeApproval());
  const whitepaper = await create({
    kind: 'form.outreach_approved',
    data: { source_form: 'whitepaper', verification: 'server_verified' },
  });
  const unverifiedInstall = await create({
    kind: 'install_runtime.outreach_approved',
    data: { verification: 'self_reported', install_observation_id: 'i' },
  });
  const nonFounder = await create({
    kind: 'contact.reauthorized',
    data: { provenance: 'import' },
  });
  const unapproved = await create(UNSTUCK_FORM_APPROVAL, { approved: false });
  const beforeStart = await create(UNSTUCK_FORM_APPROVAL, {
    at: new Date('2030-12-31T18:00:00.000Z'),
  });
  const stopped = await create(UNSTUCK_FORM_APPROVAL);
  await executor.execute(
    `insert into growth_activity (event_key, contact_id, kind, occurred_at, data)
     values ($1, $2, 'unsubscribe', $3, '{}'::jsonb)`,
    [
      `campaign-integration:stop:${stopped.contactId}`,
      stopped.contactId,
      new Date('2031-01-05T19:00:00.000Z'),
    ],
  );
  const eligible = [unstuck, founder, install].map(
    ({ contactId }) => contactId,
  );
  const ineligible = [
    whitepaper,
    unverifiedInstall,
    nonFounder,
    unapproved,
    beforeStart,
    stopped,
  ].map(({ contactId }) => contactId);
  const mine = new Set([...eligible, ...ineligible]);

  const first = await enroll(now);
  const second = await enroll(new Date(now.getTime() + 60_000));

  expect(
    new Set(first.enrolledContactIds.filter((id) => mine.has(id))),
  ).toEqual(new Set(eligible));
  expect(first.createdJobs).toBeGreaterThanOrEqual(9);
  expect(second.enrolledContactIds.filter((id) => mine.has(id))).toEqual([]);
  const enrollments = await executor.execute<{
    contact_id: string;
    occurred_at: Date;
    data: Record<string, unknown>;
  }>(
    `select contact_id, occurred_at, data from growth_activity
     where kind = 'campaign.enrolled:v1' and contact_id = any($1::uuid[])`,
    [[...mine]],
  );
  const reasons = Object.fromEntries(
    enrollments.rows.map(({ contact_id, data }) => [
      contact_id,
      data['enrollment_reason'],
    ]),
  );
  expect(reasons).toEqual({
    [unstuck.contactId]: 'unstuck_form',
    [founder.contactId]: 'install_digest',
    [install.contactId]: 'install_runtime',
  });
  for (const row of enrollments.rows) {
    expect(new Date(row.occurred_at)).toEqual(now);
    expect(row.data['campaign_version']).toBe('v1');
    expect(new Date(String(row.data['enrollment_start_at']))).toEqual(
      enrollmentStartAt,
    );
  }
  for (const contactId of eligible) {
    const steps = await sendSteps(contactId);
    expect(
      steps.map(({ idempotency_key, available_at, status, step }) => ({
        idempotency_key,
        available_at: new Date(available_at).toISOString(),
        status,
        step,
      })),
    ).toEqual(
      [1, 2, 3].map((step) => ({
        idempotency_key: `campaign:v1:${contactId}:step:${step}`,
        // Tuesday 2031-01-07 07:00 PST.
        available_at: '2031-01-07T15:00:00.000Z',
        status: 'pending',
        step: String(step),
      })),
    );
  }
  for (const contactId of ineligible) {
    expect(await sendSteps(contactId)).toEqual([]);
  }
});

test('materializeCampaignEnrollment throws when CAMPAIGN_ENROLLMENT_START_AT differs from the recorded configuration', async () => {
  const now = new Date('2031-01-06T15:00:00.000Z');
  await enroll(now);

  const changed = materializeCampaignEnrollment(executor, {
    enrollmentEnabled: true,
    enrollmentStartAt: new Date('2031-01-02T00:00:00.000Z'),
    now,
    batchSize: 1_000,
  });

  await expect(changed).rejects.toThrow(
    'CAMPAIGN_ENROLLMENT_START_AT is immutable after campaign configuration',
  );
  const configuration = await executor.execute<{ start: string }>(
    `select data->>'enrollment_start_at' as start from growth_activity
     where event_key = 'campaign:v1:configuration'`,
  );
  expect(configuration.rows.map(({ start }) => new Date(start))).toEqual([
    enrollmentStartAt,
  ]);
});

test('step 1 is not leased within five minutes of enrollment', async () => {
  // Tuesday 2031-01-07 06:58 PST.
  const enrolledAt = new Date('2031-01-07T14:58:00.000Z');
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    new Date('2031-01-07T10:00:00.000Z'),
  );
  await enroll(enrolledAt);
  const [stepOne] = await sendSteps(contact.contactId);
  if (!stepOne) throw new Error('expected step 1');
  await setAvailableAt(stepOne.id, enrolledAt);

  const tooSoon = await leaseMine(
    contact.contactId,
    new Date('2031-01-07T15:02:59.999Z'),
  );
  const fiveMinutes = await leaseMine(
    contact.contactId,
    new Date('2031-01-07T15:03:00.000Z'),
  );

  expect(tooSoon).toEqual([]);
  expect(fiveMinutes.map(({ id }) => id)).toEqual([stepOne.id]);
});

test('recordProviderAcceptance pushes steps 2 and 3 out by 3 and 8 business days and a replay never moves them earlier', async () => {
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    new Date('2031-01-12T12:00:00.000Z'),
  );
  // Monday 2031-01-13 06:00 PST; step 1 is due Tuesday 07:00 PST.
  await enroll(new Date('2031-01-13T14:00:00.000Z'));
  const [, stepTwo] = await sendSteps(contact.contactId);
  if (!stepTwo) throw new Error('expected step 2');
  // A later time already on step 2 must survive the anchoring.
  await setAvailableAt(stepTwo.id, new Date('2031-01-20T15:00:00.000Z'));
  const availability = async () =>
    (await sendSteps(contact.contactId)).map(({ available_at, status }) => [
      new Date(available_at).toISOString(),
      status,
    ]);

  const stepOneAcceptance = await sendAndAccept(
    contact.contactId,
    new Date('2031-01-14T15:10:00.000Z'),
    new Date('2031-01-14T15:11:00.000Z'),
    `resend-${randomUUID()}`,
  );
  const afterStepOne = await availability();
  await recordProviderAcceptance(executor, stepOneAcceptance);
  const afterReplay = await availability();
  await sendAndAccept(
    contact.contactId,
    new Date('2031-01-20T15:05:00.000Z'),
    new Date('2031-01-20T15:06:00.000Z'),
    `resend-${randomUUID()}`,
  );
  const afterStepTwo = await availability();
  await recordProviderAcceptance(executor, stepOneAcceptance);
  const afterLateReplay = await availability();

  expect(afterStepOne).toEqual([
    ['2031-01-14T15:00:00.000Z', 'completed'],
    // greatest(2031-01-20, businessMorningAfter(Tue 01-14, 3) = Fri 01-17).
    ['2031-01-20T15:00:00.000Z', 'pending'],
    // businessMorningAfter(Tue 01-14, 8) = Fri 01-24.
    ['2031-01-24T15:00:00.000Z', 'pending'],
  ]);
  expect(afterReplay).toEqual(afterStepOne);
  expect(afterStepTwo).toEqual([
    ['2031-01-14T15:00:00.000Z', 'completed'],
    ['2031-01-20T15:00:00.000Z', 'completed'],
    // businessMorningAfter(Mon 01-20, 5) = Mon 01-27.
    ['2031-01-27T15:00:00.000Z', 'pending'],
  ]);
  expect(afterLateReplay).toEqual(afterStepTwo);
  expect(businessMorningAfter(new Date('2031-01-20T15:06:00.000Z'), 5)).toEqual(
    new Date('2031-01-27T15:00:00.000Z'),
  );
});

test('leaseDueJobs never leases a send_step outside Monday-Friday 07:00 Pacific even when isSendWindow says yes', async () => {
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    new Date('2031-01-26T12:00:00.000Z'),
  );
  // Monday 2031-01-27 02:00 PST.
  const enrolledAt = new Date('2031-01-27T10:00:00.000Z');
  await enroll(enrolledAt);
  const [stepOne] = await sendSteps(contact.contactId);
  if (!stepOne) throw new Error('expected step 1');
  await setAvailableAt(stepOne.id, enrolledAt);
  const outside = [
    '2031-01-27T14:59:59.999Z', // Monday 06:59:59.999 PST
    '2031-01-27T16:00:00.000Z', // Monday 08:00 PST
    '2031-02-01T15:30:00.000Z', // Saturday 07:30 PST
    '2031-02-02T15:30:00.000Z', // Sunday 07:30 PST
  ];

  const outsideLeases = [];
  for (const instant of outside) {
    outsideLeases.push(
      ...(await leaseMine(contact.contactId, new Date(instant), () => true)),
    );
  }
  const callbackSaysNo = await leaseMine(
    contact.contactId,
    new Date('2031-02-03T15:00:00.000Z'),
    () => false,
  );
  const bothAgree = await leaseMine(
    contact.contactId,
    new Date('2031-02-03T15:00:00.000Z'),
    () => true,
  );

  expect(outsideLeases).toEqual([]);
  expect(callbackSaysNo).toEqual([]);
  expect(bothAgree.map(({ id }) => id)).toEqual([stepOne.id]);
});

test('final authorization accepts source_form unstuck and install_runtime.outreach_approved and rejects whitepaper', async () => {
  const approvedAt = new Date('2031-02-10T12:00:00.000Z');
  const now = new Date('2031-02-11T15:30:00.000Z');
  const authorize = async (approval: CampaignApprovalFixture) => {
    const contact = await createEnrolledContact(
      executor,
      createdContactIds,
      approvedAt,
      approval,
    );
    const leaseToken = randomUUID();
    const jobId = await insertSendStep(executor, contact, {
      status: 'leased',
      availableAt: approvedAt,
      leaseUntil: new Date(now.getTime() + 10 * 60_000),
      leaseToken,
    });
    return authorizeLeasedJobForSubmission(executor, {
      jobId,
      leaseToken,
      now,
      campaignEnabled: true,
      deliveryEnabled: true,
      isSendWindow: isCampaignSendWindow,
    });
  };

  const unstuck = await authorize(UNSTUCK_FORM_APPROVAL);
  const install = await authorize(installRuntimeApproval());
  const founder = await authorize(FOUNDER_APPROVAL);
  const whitepaper = await authorize({
    kind: 'form.outreach_approved',
    data: { source_form: 'whitepaper', verification: 'server_verified' },
  });
  const unlinkedInstall = await authorize({
    kind: 'install_runtime.outreach_approved',
    data: { verification: 'linked_observations' },
  });

  expect(unstuck.authorized).toBe(true);
  expect(install.authorized).toBe(true);
  expect(founder.authorized).toBe(true);
  expect(whitepaper).toMatchObject({
    authorized: false,
    reason: 'contact_unapproved',
  });
  expect(unlinkedInstall).toMatchObject({
    authorized: false,
    reason: 'contact_unapproved',
  });
});

test('readLifecycleJobContext reads the unstuck form facts, never the message, and the enrollment reason', async () => {
  const approvedAt = new Date('2031-02-17T12:00:00.000Z');
  const enrolledAt = new Date('2031-02-17T14:00:00.000Z');
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  await executor.execute(
    `update growth_contacts
     set display_name = 'Row Name', company_name = 'Row Co'
     where id = $1`,
    [contact.contactId],
  );
  await executor.execute(
    `insert into growth_activity (event_key, contact_id, kind, occurred_at, data)
     values ('form:' || $2::text || ':accepted', $1, 'contact.form_submission',
             $3, $4::jsonb)`,
    [
      contact.contactId,
      `submission-${contact.contactId}`,
      approvedAt,
      JSON.stringify({
        form_kind: 'unstuck',
        submission_id: `submission-${contact.contactId}`,
        display_name: 'Form Name',
        email_classification: 'work',
        message: 'Streaming stalls after the first chunk.',
      }),
    ],
  );
  await enroll(enrolledAt);
  const [stepOne] = await sendSteps(contact.contactId);
  if (!stepOne) throw new Error('expected step 1');
  const fulfillJobId = randomUUID();
  await executor.execute(
    `insert into growth_jobs (id, kind, contact_id, status, available_at,
       idempotency_key, payload)
     values ($1, 'fulfill', $2, 'pending', $3, $4, $5::jsonb)`,
    [
      fulfillJobId,
      contact.contactId,
      approvedAt,
      `campaign-integration:${fulfillJobId}`,
      JSON.stringify({ submission_id: 'some-other-submission' }),
    ],
  );

  const sendContext = await readLifecycleJobContext(executor, {
    jobId: stepOne.id,
  });
  const unmatchedContext = await readLifecycleJobContext(executor, {
    jobId: fulfillJobId,
  });

  expect(sendContext).toEqual({
    contactId: contact.contactId,
    displayName: 'Form Name',
    companyName: 'Row Co',
    companyDomain: null,
    emailClassification: 'work',
    formSubmission: {
      form_kind: 'unstuck',
      submission_id: `submission-${contact.contactId}`,
      message_present: true,
    },
    enrollmentAt: enrolledAt,
    campaignEnrollmentReason: 'unstuck_form',
  });
  expect(unmatchedContext).toMatchObject({
    displayName: 'Row Name',
    emailClassification: 'unknown',
    formSubmission: null,
  });
  expect(JSON.stringify([sendContext, unmatchedContext])).not.toContain(
    'Streaming stalls',
  );
});

test('an internal notification is claimed once per job and an unknown outcome needs manual review', async () => {
  const contact = await createApprovedContact(
    executor,
    createdContactIds,
    new Date('2031-02-24T12:00:00.000Z'),
  );
  const now = new Date('2031-02-24T13:00:00.000Z');
  const jobId = randomUUID();
  const leaseToken = randomUUID();
  await executor.execute(
    `insert into growth_jobs (id, kind, contact_id, status, available_at,
       lease_until, lease_token, idempotency_key, payload)
     values ($1, 'notify', $2, 'leased', $3, $4, $5, $6, '{}'::jsonb)`,
    [
      jobId,
      contact.contactId,
      now,
      new Date(now.getTime() + 60_000),
      leaseToken,
      `campaign-integration:${jobId}`,
    ],
  );

  const wrongKind = await claimInternalNotificationSubmission(executor, {
    jobId,
    leaseToken,
    now,
    kind: 'digest',
  }).catch((error: unknown) => error);
  const first = await claimInternalNotificationSubmission(executor, {
    jobId,
    leaseToken,
    now,
    kind: 'notify',
  });
  const second = await claimInternalNotificationSubmission(executor, {
    jobId,
    leaseToken,
    now,
    kind: 'notify',
  });
  const unknown = await markInternalNotificationUnknown(executor, {
    jobId,
    leaseToken,
    occurredAt: new Date(now.getTime() + 1_000),
    errorCode: 'resend_timeout',
  });

  expect(wrongKind).toBeInstanceOf(JobLeaseConflictError);
  expect(first).toBe('claimed');
  expect(second).toBe('already_claimed');
  expect(unknown).toMatchObject({
    status: 'failed',
    deliveryStatus: 'unknown',
    lastErrorCode: 'resend_timeout',
  });
  const activity = await executor.execute<{ kind: string }>(
    `select kind from growth_activity
     where contact_id = $1 and event_key like 'job:%'
     order by kind`,
    [contact.contactId],
  );
  expect(activity.rows.map(({ kind }) => kind)).toEqual([
    'internal_notification.acceptance_unknown',
    'internal_notification.submission_started',
  ]);
});
