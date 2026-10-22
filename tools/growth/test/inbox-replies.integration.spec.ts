import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../src/lib/database.ts';
import { deleteContact } from '../src/lib/contacts.ts';
import {
  admitInboxEvent,
  bindOutboundMessageId,
  processInboxReceipt,
} from '../src/lib/inbox-replies.ts';
import {
  authorizeLeasedJobForSubmission,
  leaseDueJobs,
} from '../src/lib/jobs.ts';
import { stopContact } from '../src/lib/stops.ts';
import {
  createEnrolledContact,
  deleteCreatedContacts,
  insertSendStep,
} from './job-fixtures.ts';
import { cleanContactObservationFences } from './observability-fixtures.ts';

test('pilot recovers an early reply, stops once, and blocks leased follow-ups before processing', async () => {
  const db = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
  const contactIds = new Set<string>();
  const config = {
    enabled: true as const,
    address: 'brian@replies.hashbrown.dev',
    startedAt: new Date('2026-10-22T00:00:00Z'),
  };
  const now = new Date('2026-10-22T01:00:00Z');
  const receivedAt = new Date('2026-10-22T00:59:00Z');
  const emailId = randomUUID(),
    providerId = randomUUID();
  const rfcId = `<${providerId}@resend.com>`;
  let ownsMailbox = false;
  try {
    await applyMigrations({
      directory: defaultMigrationsDirectory(),
      executor: db,
    });
    const existing = await db.execute(
      'select address from growth_reply_mailboxes',
    );
    expect(existing.rows).toEqual([]);
    ownsMailbox = true;
    const contact = await createEnrolledContact(
      db,
      contactIds,
      new Date('2026-10-22T00:01:00Z'),
    );
    const campaignJobId = await insertSendStep(db, contact, {
      status: 'pending',
      availableAt: now,
    });
    await db.execute(
      `insert into growth_jobs(kind, contact_id, status, available_at, idempotency_key, provider_email_id, delivery_status, created_at)
      values ('fulfill', $1, 'completed', $2, $3, $4, 'delivered', $2)`,
      [contact.contactId, config.startedAt, providerId, providerId],
    );
    await admitInboxEvent(
      db,
      {
        type: 'email.received',
        created_at: receivedAt.toISOString(),
        data: { email_id: emailId, to: [config.address] },
      },
      config,
    );
    expect(
      await leaseDueJobs(db, {
        kinds: ['send_step'],
        now,
        batchSize: 100,
        leaseDurationMs: 60000,
        campaignEnabled: true,
      }),
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: campaignJobId })]),
    );
    const getReceived = async () => ({
      id: emailId,
      to: [config.address],
      from: `${contact.contactId}@example.com`,
      created_at: receivedAt.toISOString(),
      headers: {
        'Message-ID': `<${emailId}@example.com>`,
        'In-Reply-To': rfcId,
      },
    });
    expect(
      await processInboxReceipt(db, emailId, config, {
        getReceived,
        stopContact,
      }),
    ).toBe('pending');
    await bindOutboundMessageId(db, providerId, rfcId);
    await db.execute('update growth_reply_mailboxes set healthy_through = $1', [
      now,
    ]);
    await db.execute(
      `update growth_jobs set status = 'leased', lease_token = $2, lease_until = $3 where id = $1`,
      [campaignJobId, randomUUID(), new Date(now.getTime() + 60000)],
    );
    const job = await db.execute<{ lease_token: string }>(
      'select lease_token from growth_jobs where id = $1',
      [campaignJobId],
    );
    expect(
      await authorizeLeasedJobForSubmission(db, {
        jobId: campaignJobId,
        leaseToken: job.rows[0].lease_token,
        now,
        campaignEnabled: true,
        deliveryEnabled: true,
      }),
    ).toMatchObject({ authorized: false, reason: 'reply_binding_pending' });

    expect(
      await processInboxReceipt(db, emailId, config, {
        getReceived,
        stopContact,
      }),
    ).toBe('stopped');
    expect(
      await processInboxReceipt(db, emailId, config, {
        getReceived,
        stopContact,
      }),
    ).toBe('stopped');

    const stopped = await db.execute<{ status: string }>(
      'select status from growth_jobs where id = $1',
      [campaignJobId],
    );
    expect(stopped.rows[0].status).toBe('cancelled');
    const activity = await db.execute<{ occurred_at: Date }>(
      "select occurred_at from growth_activity where contact_id = $1 and kind = 'campaign.reply_received'",
      [contact.contactId],
    );
    expect(activity.rows).toHaveLength(1);
    expect(new Date(activity.rows[0].occurred_at)).toEqual(receivedAt);
    await db.execute(
      `update growth_reply_receipts set reference_ids = $2::jsonb where id = $1`,
      [emailId, JSON.stringify([rfcId])],
    );
    await deleteContact(db, {
      contactId: contact.contactId,
      eventKey: `pilot-delete:${emailId}`,
      occurredAt: now,
      actor: 'test',
      source: 'pilot-integration',
      policyVersion: 'pilot-v1',
    });
    const scrubbed = await db.execute(
      'select contact_id, reference_ids, rfc_message_id, status from growth_reply_receipts where id = $1',
      [emailId],
    );
    expect(scrubbed.rows[0]).toEqual({
      contact_id: null,
      reference_ids: null,
      rfc_message_id: null,
      status: 'ignored',
    });
  } finally {
    if (ownsMailbox) {
      await db.execute(
        'delete from growth_reply_receipts where recipient = $1',
        [config.address],
      );
      await db.execute(
        'delete from growth_reply_mailboxes where address = $1',
        [config.address],
      );
    }
    for (const contactId of contactIds) {
      await cleanContactObservationFences(db, contactId);
    }
    await deleteCreatedContacts(db, contactIds);
    await db.close?.();
  }
});
