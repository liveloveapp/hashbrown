import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test, vi } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { deleteContact } from '../src/lib/contacts.ts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import { dispatchGrowthLeasedJob } from '../src/lib/dispatcher.ts';
import {
  authorizeLeasedJobForSubmission,
  leaseDueJobs,
  recordProviderAcceptance,
} from '../src/lib/jobs.ts';
import {
  bindProviderMessageId,
  type GoogleMailboxEvent,
  parseGoogleMailboxEvent,
  processGoogleMailboxEvent,
  replySubjectSha256,
  sha256Base64Url,
} from '../src/lib/replies.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  type EnrolledContact,
  insertSendStep,
  runCleanup,
} from './job-fixtures.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const createdContactIds = new Set<string>();
const createdActivityKeys = new Set<string>();
const createdGmailIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  await runCleanup([
    () =>
      executor.execute(
        `delete from growth_jobs
         where kind = 'reply_reconcile' and idempotency_key = any($1::text[])`,
        [[...createdGmailIds].map((id) => `reply_reconcile:gmail:${id}`)],
      ),
    () =>
      executor.execute(
        `delete from growth_activity
         where event_key = any($1::text[])
            or event_key like any($2::text[])`,
        [
          [...createdActivityKeys],
          [...createdGmailIds].map(
            (id) => `google:gmail:${sha256Base64Url(id)}%`,
          ),
        ],
      ),
    () => deleteCreatedContacts(executor, createdContactIds),
  ]);
  await executor.close?.();
});

/** Posts one mailbox event the way the www route will, with a fresh nonce. */
async function post(body: Record<string, unknown>, receivedAt: Date) {
  const rawBody = JSON.stringify(body);
  const nonce = `replies_${randomUUID().replaceAll('-', '')}`;
  createdActivityKeys.add(`google:nonce:${sha256Base64Url(nonce)}`);
  if (typeof body['gmail_message_id'] === 'string') {
    createdGmailIds.add(body['gmail_message_id']);
  }
  if (typeof body['recovery_id'] === 'string') {
    createdActivityKeys.add(`google:recovery:${body['recovery_id']}:required`);
    createdActivityKeys.add(`google:recovery:${body['recovery_id']}:completed`);
  }
  const event: GoogleMailboxEvent = parseGoogleMailboxEvent(rawBody);
  return processGoogleMailboxEvent(executor, {
    event,
    nonce,
    timestamp: String(receivedAt.getTime()),
    requestDigest: sha256Base64Url(rawBody),
    receivedAt,
  });
}

function replyBody(
  contact: EnrolledContact,
  occurredAt: Date,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    kind: 'reply',
    version: 1,
    gmail_message_id: `gmail-${randomUUID()}`,
    rfc_message_id: `<reply.${randomUUID()}@example.com>`,
    occurred_at: occurredAt.toISOString(),
    from: `Recipient <${contact.contactId}@example.com>`,
    ...overrides,
  };
}

/** Leases, authorizes and accepts step 1, leaving its Message-ID unbound. */
async function acceptStepOne(
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

async function jobStatuses(ids: readonly string[]) {
  const result = await executor.execute<{ id: string; status: string }>(
    'select id, status from growth_jobs where id = any($1::uuid[])',
    [ids],
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.status]));
}

async function replyStops(contactId: string) {
  const result = await executor.execute<{ kind: string; data: unknown }>(
    `select kind, data from growth_activity
     where contact_id = $1 and kind = 'campaign.reply_received'`,
    [contactId],
  );
  return result.rows;
}

test('a reply matched by subject fallback stops the contact and cancels pending steps', async () => {
  const approvedAt = new Date('2037-03-01T00:00:00.000Z');
  const sentAt = new Date('2037-03-03T15:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const stepOne = await acceptStepOne(contact, sentAt, 'Engineer to engineer');
  const stepTwo = await insertSendStep(executor, contact, {
    status: 'pending',
    availableAt: new Date('2037-03-06T15:00:00.000Z'),
    step: 2,
  });
  const stepThree = await insertSendStep(executor, contact, {
    status: 'pending',
    availableAt: new Date('2037-03-13T15:00:00.000Z'),
    step: 3,
  });
  const repliedAt = new Date('2037-03-03T16:00:00.000Z');

  const result = await post(
    replyBody(contact, repliedAt, {
      in_reply_to: `<${randomUUID()}@resend.dev>`,
      subject_sha256: replySubjectSha256('RE: Engineer to engineer'),
    }),
    repliedAt,
  );

  expect(result).toEqual({ applied: true, outcome: 'reply_stopped' });
  expect(await jobStatuses([stepOne.jobId, stepTwo, stepThree])).toEqual({
    [stepOne.jobId]: 'completed',
    [stepTwo]: 'cancelled',
    [stepThree]: 'cancelled',
  });
  const stops = await replyStops(contact.contactId);
  expect(stops).toHaveLength(1);
  expect(stops[0]?.data).toMatchObject({
    provenance: 'mailbox_reply',
    source: 'google_mailbox_poller',
  });
  const approval = await executor.execute<{ outreach_approved_at: unknown }>(
    'select outreach_approved_at from growth_contacts where id = $1',
    [contact.contactId],
  );
  expect(approval.rows[0]?.outreach_approved_at).toBeNull();
});

test('an unmatched reply enqueues reply_reconcile 5 minutes out and settles once the message id binds', async () => {
  const approvedAt = new Date('2037-04-01T00:00:00.000Z');
  const sentAt = new Date('2037-04-07T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const stepOne = await acceptStepOne(contact, sentAt, 'Engineer to engineer');
  const stepTwo = await insertSendStep(executor, contact, {
    status: 'pending',
    availableAt: new Date('2037-04-10T14:00:00.000Z'),
    step: 2,
  });
  const rfcMessageId = `<${randomUUID()}@resend.dev>`;
  const repliedAt = new Date('2037-04-07T15:00:00.000Z');
  const body = replyBody(contact, repliedAt, { in_reply_to: rfcMessageId });

  const queued = await post(body, repliedAt);
  const pending = await executor.execute<{
    id: string;
    status: string;
    available_at: Date;
    contact_id: string | null;
    payload: Record<string, unknown>;
  }>(
    `select id, status, available_at, contact_id, payload from growth_jobs
     where idempotency_key = $1`,
    [`reply_reconcile:gmail:${String(body['gmail_message_id'])}`],
  );
  const beforeBinding = await jobStatuses([stepTwo]);
  const bound = await bindProviderMessageId(executor, {
    providerEmailId: stepOne.providerEmailId,
    rfcMessageId,
  });

  expect(queued).toEqual({ applied: true, outcome: 'reconcile_queued' });
  const reconcile = pending.rows[0];
  expect(reconcile).toMatchObject({ status: 'pending', contact_id: null });
  expect(new Date(reconcile?.available_at ?? 0)).toEqual(
    new Date(repliedAt.getTime() + 5 * 60_000),
  );
  expect(JSON.stringify(reconcile?.payload)).not.toContain(
    `${contact.contactId}@example.com`,
  );
  expect(beforeBinding).toEqual({ [stepTwo]: 'pending' });
  expect(bound).toBe('bound');
  const settled = await executor.execute<{
    status: string;
    contact_id: string;
  }>('select status, contact_id from growth_jobs where id = $1', [
    reconcile?.id,
  ]);
  expect(settled.rows[0]).toEqual({
    status: 'completed',
    contact_id: contact.contactId,
  });
  expect(await jobStatuses([stepTwo])).toEqual({ [stepTwo]: 'cancelled' });
  expect(await replyStops(contact.contactId)).toHaveLength(1);
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

test('recovery_required pauses send_step and reply_reconcile dispatch until recovery_completed', async () => {
  const approvedAt = new Date('2037-06-01T00:00:00.000Z');
  // Tuesday 2037-06-02 07:10 PDT.
  const leaseAt = new Date('2037-06-02T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const stepOne = await insertSendStep(executor, contact, {
    status: 'pending',
    availableAt: approvedAt,
  });
  const alreadyLeasedToken = randomUUID();
  const alreadyLeased = await insertSendStep(executor, contact, {
    status: 'leased',
    availableAt: approvedAt,
    leaseUntil: new Date(leaseAt.getTime() + 60_000),
    leaseToken: alreadyLeasedToken,
    step: 2,
  });
  const reconcileGmailId = `gmail-${randomUUID()}`;
  createdGmailIds.add(reconcileGmailId);
  const reconcile = await executor.execute<{ id: string }>(
    `insert into growth_jobs (kind, status, available_at, idempotency_key, payload)
     values ('reply_reconcile', 'pending', $1, $2, $3::jsonb)
     returning id`,
    [
      approvedAt,
      `reply_reconcile:gmail:${reconcileGmailId}`,
      JSON.stringify({
        gmail_message_id: reconcileGmailId,
        occurred_at: approvedAt.toISOString(),
        ranked_candidates: [],
        resolved_candidates: [],
      }),
    ],
  );
  const reconcileId = reconcile.rows[0]?.id ?? '';
  const recoveryId = randomUUID();
  const lease = async () =>
    (
      await leaseDueJobs(executor, {
        kinds: ['send_step', 'reply_reconcile'],
        now: leaseAt,
        batchSize: 100,
        leaseDurationMs: 60_000,
        campaignEnabled: true,
      })
    ).filter((job) => job.id === stepOne || job.id === reconcileId);
  const sendHandler = vi.fn(async () => 'completed' as const);
  const appHandlers = { send_step: sendHandler };

  const opened = await post(
    {
      kind: 'recovery_required',
      version: 1,
      recovery_id: recoveryId,
      occurred_at: leaseAt.toISOString(),
      reason: 'history_expired',
    },
    leaseAt,
  );
  let whilePaused: Awaited<ReturnType<typeof lease>> = [];
  let pausedDispatch = '';
  let closed: Awaited<ReturnType<typeof post>>;
  try {
    whilePaused = await lease();
    const [leasedBefore] = await executor
      .execute<Record<string, unknown>>(
        'select * from growth_jobs where id = $1',
        [alreadyLeased],
      )
      .then(({ rows }) => rows);
    pausedDispatch = await dispatchGrowthLeasedJob(
      executor,
      {
        id: alreadyLeased,
        kind: 'send_step',
        contactId: contact.contactId,
        projectId: null,
        status: 'leased',
        availableAt: approvedAt,
        leaseUntil: new Date(leaseAt.getTime() + 60_000),
        leaseToken: alreadyLeasedToken,
        attempts: 0,
        idempotencyKey: String(leasedBefore?.['idempotency_key']),
        payload: {},
        providerEmailId: null,
        rfcMessageId: null,
        gmailSeedMessageId: null,
        deliveryStatus: 'not_submitted',
        lastErrorCode: null,
        createdAt: approvedAt,
        updatedAt: approvedAt,
      },
      { appHandlers },
    );
  } finally {
    closed = await post(
      {
        kind: 'recovery_completed',
        version: 1,
        recovery_id: recoveryId,
        occurred_at: new Date(leaseAt.getTime() + 1_000).toISOString(),
      },
      leaseAt,
    );
  }
  const afterRecovery = await lease();
  const leasedReconcile = afterRecovery.find(({ id }) => id === reconcileId);
  const leasedStep = afterRecovery.find(({ id }) => id === stepOne);
  const settled = leasedReconcile
    ? await dispatchGrowthLeasedJob(executor, leasedReconcile, {
        appHandlers,
        now: () => leaseAt,
      })
    : 'missing';
  const sent = leasedStep
    ? await dispatchGrowthLeasedJob(executor, leasedStep, { appHandlers })
    : 'missing';

  expect(opened).toEqual({ applied: true, outcome: 'recovery_paused' });
  expect(whilePaused).toEqual([]);
  expect(pausedDispatch).toBe('recovery_paused');
  expect(closed).toEqual({ applied: true, outcome: 'recovery_completed' });
  expect(new Set(afterRecovery.map(({ id }) => id))).toEqual(
    new Set([stepOne, reconcileId]),
  );
  expect(settled).toBe('deferred');
  expect(sent).toBe('completed');
  expect(sendHandler).toHaveBeenCalledOnce();
  const deferred = await executor.execute<{
    status: string;
    last_error_code: string;
  }>('select status, last_error_code from growth_jobs where id = $1', [
    reconcileId,
  ]);
  expect(deferred.rows[0]).toEqual({
    status: 'pending',
    last_error_code: 'reply_reference_unresolved',
  });
});

/** Inserts a `reply_reconcile` job the way an unmatched reply leaves it. */
async function insertReconcile(
  occurredAt: Date,
  reply: Record<string, unknown>,
  resolvedContactId?: string,
): Promise<string> {
  const gmailId = `gmail-${randomUUID()}`;
  createdGmailIds.add(gmailId);
  const inserted = await executor.execute<{ id: string }>(
    `insert into growth_jobs (kind, status, available_at, idempotency_key, payload)
     values ('reply_reconcile', 'pending', $1, $2, $3::jsonb)
     returning id`,
    [
      occurredAt,
      `reply_reconcile:gmail:${gmailId}`,
      JSON.stringify({
        schema_version: 1,
        gmail_message_id: gmailId,
        rfc_message_id: `<reply.${randomUUID()}@example.com>`,
        occurred_at: occurredAt.toISOString(),
        in_reply_to: null,
        references: [],
        subject_sha256: null,
        ranked_candidates: [],
        resolved_candidates: resolvedContactId
          ? [{ message_id: 'x', rank: 0, contact_id: resolvedContactId }]
          : [],
        ...reply,
      }),
    ],
  );
  return inserted.rows[0]?.id ?? '';
}

async function readReconcile(id: string) {
  const result = await executor.execute<{
    status: string;
    payload: Record<string, unknown>;
  }>('select status, payload from growth_jobs where id = $1', [id]);
  return result.rows[0];
}

const deletion = (contactId: string, at: Date) => ({
  contactId,
  eventKey: `delete:${randomUUID()}`,
  occurredAt: at,
  actor: 'founder',
  source: 'test',
  policyVersion: 'growth-v1',
  redactEvidence: async () => undefined,
});

test('deleting a contact clears unmatched reply_reconcile payloads that reference its messages', async () => {
  const approvedAt = new Date('2037-07-01T00:00:00.000Z');
  const sentAt = new Date('2037-07-07T14:10:00.000Z');
  const contact = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const stepOne = await acceptStepOne(contact, sentAt, 'Engineer to engineer');
  const rfcMessageId = `<${randomUUID()}@resend.dev>`;
  await bindProviderMessageId(executor, {
    providerEmailId: stepOne.providerEmailId,
    rfcMessageId,
  });
  const byInReplyTo = await insertReconcile(sentAt, {
    in_reply_to: rfcMessageId,
  });
  const byReferences = await insertReconcile(sentAt, {
    references: [`<other.${randomUUID()}@x>`, rfcMessageId],
  });
  const byResolved = await insertReconcile(sentAt, {}, contact.contactId);
  const unrelated = await insertReconcile(sentAt, {
    in_reply_to: `<${randomUUID()}@resend.dev>`,
  });

  await deleteContact(executor, deletion(contact.contactId, sentAt));

  for (const id of [byInReplyTo, byReferences, byResolved]) {
    const job = await readReconcile(id);
    expect(job?.status).toBe('cancelled');
    expect(job?.payload).toEqual({});
  }
  expect((await readReconcile(unrelated))?.status).toBe('pending');
});

test("deleting a contact leaves other contacts' reply_reconcile payloads intact", async () => {
  const approvedAt = new Date('2037-08-01T00:00:00.000Z');
  const sentAt = new Date('2037-08-07T14:10:00.000Z');
  const deleted = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const kept = await createEnrolledContact(
    executor,
    createdContactIds,
    approvedAt,
  );
  const keptStep = await acceptStepOne(kept, sentAt, 'Engineer to engineer');
  await acceptStepOne(deleted, sentAt, 'Another subject');
  const keptRfc = `<${randomUUID()}@resend.dev>`;
  await bindProviderMessageId(executor, {
    providerEmailId: keptStep.providerEmailId,
    rfcMessageId: keptRfc,
  });
  const reply = await insertReconcile(sentAt, {
    in_reply_to: keptRfc,
    references: [keptRfc],
  });

  await deleteContact(executor, deletion(deleted.contactId, sentAt));

  const job = await readReconcile(reply);
  expect(job?.status).toBe('pending');
  expect(job?.payload).toMatchObject({
    in_reply_to: keptRfc,
    references: [keptRfc],
  });
});
