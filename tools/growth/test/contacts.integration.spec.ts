import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import {
  approveContactFromForm,
  deleteContact,
  findContactIdByEmail,
  readContactControlState,
  reauthorizeContact,
} from '../src/lib/contacts.ts';
import type { EmailHmacKeyring } from '../src/lib/crypto.ts';
import { createDatabaseExecutor } from '../src/lib/database.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
const keyring: EmailHmacKeyring = {
  active: { version: 1, secret: randomBytes(32).toString('hex') },
};
const createdContactIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  const ids = [...createdContactIds];
  if (ids.length > 0) {
    await executor.transaction(async (tx) => {
      await tx.execute(
        'delete from growth_artifacts where contact_id = any($1::uuid[])',
        [ids],
      );
      await tx.execute(
        'delete from growth_activity where contact_id = any($1::uuid[])',
        [ids],
      );
      await tx.execute(
        'delete from growth_jobs where contact_id = any($1::uuid[])',
        [ids],
      );
      await tx.execute(
        'delete from growth_projects where contact_id = any($1::uuid[])',
        [ids],
      );
      await tx.execute(
        'delete from growth_contacts where id = any($1::uuid[])',
        [ids],
      );
    });
  }
  await executor.close?.();
});

test('approving then deleting a contact works end to end against Postgres', async () => {
  const email = `Growth-Test-${randomBytes(8).toString('hex')}@Example.com`;
  const occurredAt = new Date('2026-09-01T12:00:00.000Z');
  const form = {
    email,
    displayName: 'Integration Person',
    source: 'integration-test',
    sourceForm: 'whitepaper',
    noticeText: 'Send me the guide. Unsubscribe anytime.',
    noticeVersion: 'whitepaper-v1',
    policyVersion: 'growth-v1',
    eventKey: `test:${randomUUID()}`,
    occurredAt,
    keyring,
    serverEmailClassification: 'work',
  } as const;

  const approved = await approveContactFromForm(executor, form);
  createdContactIds.add(approved.contactId);
  const replayed = await approveContactFromForm(executor, form);
  const found = await findContactIdByEmail(executor, email, keyring);

  expect(approved).toMatchObject({
    authorization: 'approved',
    canSend: true,
    formApprovalGranted: true,
  });
  expect(replayed.outreachApprovedAt).toEqual(approved.outreachApprovedAt);
  expect(found).toBe(approved.contactId);
  const kinds = await executor.execute<{ kind: string }>(
    'select kind from growth_activity where contact_id = $1 order by kind',
    [approved.contactId],
  );
  expect(kinds.rows.map((row) => row.kind)).toEqual([
    'contact.form_submission',
    'form.outreach_approved',
  ]);

  await executor.execute(
    `insert into growth_jobs (kind, contact_id, status, available_at, idempotency_key)
     values ('send_step', $1, 'pending', now(), $2)`,
    [approved.contactId, `test:job:${randomUUID()}`],
  );
  const deletion = {
    contactId: approved.contactId,
    eventKey: `test:delete:${randomUUID()}`,
    occurredAt: new Date('2026-09-02T12:00:00.000Z'),
    actor: 'integration-test',
    source: 'integration-test',
    policyVersion: 'growth-v1',
  };
  let redacted: string | undefined;
  const deleted = await deleteContact(executor, {
    ...deletion,
    redactEvidence: async (_tx, contactId) => {
      redacted = contactId;
    },
  });
  const repeated = await deleteContact(executor, deletion);

  expect(deleted.deleted).toBe(true);
  expect(deleted.state).toMatchObject({
    authorization: 'deleted',
    canSend: false,
  });
  expect(deleted.cancelledJobIds).toHaveLength(1);
  expect(redacted).toBe(approved.contactId);
  expect(repeated.deleted).toBe(false);
  const row = await executor.execute<{
    email_normalized: string | null;
    display_name: string | null;
  }>(
    'select email_normalized, display_name from growth_contacts where id = $1',
    [approved.contactId],
  );
  expect(row.rows[0]).toEqual({ email_normalized: null, display_name: null });
  const job = await executor.execute<{ status: string }>(
    'select status from growth_jobs where contact_id = $1',
    [approved.contactId],
  );
  expect(job.rows.map((r) => r.status)).toEqual(['cancelled']);
  const retained = await executor.execute<{ kind: string }>(
    `select kind from growth_activity where contact_id = $1 and kind = 'deletion'`,
    [approved.contactId],
  );
  expect(retained.rows).toHaveLength(1);

  const reauthorized = await reauthorizeContact(executor, {
    ...deletion,
    eventKey: `test:reauth:${randomUUID()}`,
    reason: 'integration test',
    allowedPriorStops: [],
  });
  const resubmitted = await approveContactFromForm(executor, {
    ...form,
    eventKey: `test:${randomUUID()}`,
  });
  const state = await readContactControlState(executor, approved.contactId);

  expect(reauthorized.reauthorized).toBe(false);
  expect(resubmitted.authorization).toBe('deleted');
  expect(state.authorization).toBe('deleted');
});
