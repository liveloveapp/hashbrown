import { expect, test, vi } from 'vitest';

import {
  approveContactFromForm,
  type ApproveContactFromFormInput,
  approveContactFromInstallDigest,
  approveContactFromInstallRuntimeInTransaction,
  CONTACT_HARD_STOP_REASONS,
  deleteContact,
  findContactIdByEmail,
  GROWTH_SOURCE_FORMS,
  normalizeInstallRuntimeEmail,
  readContactControlState,
  reauthorizeContact,
} from './contacts.ts';
import { createEmailLookupHmac, type EmailHmacKeyring } from './crypto.ts';
import { executorWith } from './testing/fake-executor.ts';

type TestRow = Record<string, unknown>;

const keyring: EmailHmacKeyring = {
  active: { version: 2, secret: 'active-contact-hmac-secret-32-bytes' },
  previous: [{ version: 1, secret: 'previous-contact-hmac-secret-32-bytes' }],
};
const occurredAt = new Date('2026-09-01T12:00:00.000Z');
const stoppedAt = new Date('2026-08-31T12:00:00.000Z');
const contactId = '00000000-0000-4000-8000-000000000001';
const baseApproval: ApproveContactFromFormInput = {
  email: ' Person@Example.COM ',
  displayName: '  Person Name ',
  companyName: ' Example Company ',
  companyDomain: ' Example.COM ',
  source: 'website',
  sourceForm: 'unstuck',
  noticeText: 'Send me the guide and a short follow-up. Unsubscribe anytime.',
  noticeVersion: 'unstuck-v1',
  policyVersion: 'growth-v1',
  eventKey: 'form:submission-1:accepted',
  occurredAt,
  keyring,
  serverEmailClassification: 'work',
};

function contactRow(overrides: TestRow = {}): TestRow {
  return {
    id: contactId,
    email_hmac_key_version: 2,
    email_lookup_hmac: createEmailLookupHmac(
      'person@example.com',
      keyring.active,
    ).digest,
    outreach_approved_at: null,
    deleted_at: null,
    updated_at: occurredAt,
    ...overrides,
  };
}

const noKeyVersions = () => ({ rows: [] });
const emptyRows = () => ({ rows: [] });

test('CONTACT_HARD_STOP_REASONS lists the eight hard stops in order', () => {
  expect([...CONTACT_HARD_STOP_REASONS]).toEqual([
    'unsubscribe',
    'complaint',
    'hard_bounce',
    'provider_suppression',
    'invalid_address',
    'manual_suppression',
    'campaign.reply_received',
    'deletion',
  ]);
});

test('findContactIdByEmail matches any keyring candidate and throws on two matches', async () => {
  const single = executorWith({
    'founder-find-contact-by-email': () => ({ rows: [{ id: contactId }] }),
  });
  const none = executorWith({ 'founder-find-contact-by-email': emptyRows });
  const double = executorWith({
    'founder-find-contact-by-email': () => ({
      rows: [{ id: 'one' }, { id: 'two' }],
    }),
  });

  const found = await findContactIdByEmail(
    single.executor,
    ' Person@Example.com ',
    keyring,
  );
  const missing = await findContactIdByEmail(
    none.executor,
    'person@example.com',
    keyring,
  );
  const ambiguous = findContactIdByEmail(
    double.executor,
    'person@example.com',
    keyring,
  );

  expect(found).toBe(contactId);
  expect(missing).toBeNull();
  await expect(ambiguous).rejects.toThrow(
    'Email HMAC lookup matched multiple growth contacts',
  );
  const candidates = JSON.parse(String(single.calls[0]?.params[0])) as {
    key_version: number;
    digest: string;
  }[];
  expect(candidates.map((candidate) => candidate.key_version)).toEqual([2, 1]);
  expect(candidates[0]?.digest).toBe(
    createEmailLookupHmac('person@example.com', keyring.active).digest,
  );
});

test('readContactControlState derives authorization from approval and stops', async () => {
  const approved = executorWith({
    'read-control-state': () => ({
      rows: [contactRow({ outreach_approved_at: stoppedAt })],
    }),
  });
  const stopped = executorWith({
    'read-control-state': () => ({
      rows: [
        contactRow({
          outreach_approved_at: stoppedAt,
          latest_hard_stop_kind: 'unsubscribe',
          latest_hard_stop_at: occurredAt,
        }),
      ],
    }),
  });

  const approvedState = await readContactControlState(
    approved.executor,
    contactId,
  );
  const stoppedState = await readContactControlState(
    stopped.executor,
    contactId,
  );

  expect(approvedState).toMatchObject({
    authorization: 'approved',
    canSend: true,
  });
  expect(stoppedState).toMatchObject({
    authorization: 'stopped',
    canSend: false,
  });
});

function approvalHandlers(
  overrides: Record<string, () => { rows: TestRow[] }>,
) {
  return {
    'lock-email': () => ({ rows: [{}] }),
    'read-key-versions': noKeyVersions,
    'read-event-key': emptyRows,
    'find-contact': emptyRows,
    'insert-contact': () => ({ rows: [contactRow()] }),
    'find-hard-stops': emptyRows,
    'insert-activity': () => ({ rows: [{ event_key: 'x' }] }),
    'insert-form-outreach-approved': () => ({ rows: [{ event_key: 'y' }] }),
    'set-form-approval': () => ({
      rows: [contactRow({ outreach_approved_at: occurredAt })],
    }),
    'read-control-state': () => ({
      rows: [contactRow({ outreach_approved_at: occurredAt })],
    }),
    ...overrides,
  };
}

test('approveContactFromForm serializes on the email lock and sets outreach_approved_at once', async () => {
  const harness = executorWith(approvalHandlers({}));

  const result = await approveContactFromForm(harness.executor, baseApproval);

  const markers = harness.calls.map(({ marker }) => marker);
  expect(result.authorization).toBe('approved');
  expect(result.formApprovalGranted).toBe(true);
  expect(markers[0]).toBe('lock-email');
  expect(harness.calls[0]?.params).toEqual(['person@example.com']);
  expect(markers.indexOf('lock-email')).toBeLessThan(
    markers.indexOf('find-contact'),
  );
  expect(
    markers.filter((marker) => marker === 'set-form-approval'),
  ).toHaveLength(1);
  expect(
    harness.calls.find(({ marker }) => marker === 'set-form-approval')?.params,
  ).toEqual([contactId, occurredAt]);
  expect(
    harness.calls
      .filter(({ marker }) => marker === 'insert-activity')
      .map(({ params }) => params[3]),
  ).toEqual(['contact.form_submission']);
  expect(
    markers.filter((marker) => marker === 'insert-form-outreach-approved'),
  ).toHaveLength(1);
});

test('approveContactFromForm refuses when a stored key version is not in the keyring', async () => {
  const harness = executorWith(
    approvalHandlers({
      'read-key-versions': () => ({ rows: [{ email_hmac_key_version: 3 }] }),
    }),
  );

  const result = approveContactFromForm(harness.executor, baseApproval);

  await expect(result).rejects.toThrow(/rotation coverage.*3/iu);
  const markers = harness.calls.map(({ marker }) => marker);
  expect(markers).not.toContain('find-contact');
  expect(markers).not.toContain('insert-activity');
});

test('approveContactFromForm accepts only the unstuck source form', async () => {
  const harness = executorWith(approvalHandlers({}));

  const result = approveContactFromForm(harness.executor, {
    ...baseApproval,
    sourceForm: 'whitepaper',
  } as unknown as ApproveContactFromFormInput);

  expect(GROWTH_SOURCE_FORMS).toEqual(['unstuck']);
  await expect(result).rejects.toThrow('sourceForm must be one of: unstuck');
  expect(harness.calls).toEqual([]);
});

test('approveContactFromForm rekeys an old digest and records a lookup alias', async () => {
  const deletedAt = stoppedAt;
  const previousKey = keyring.previous?.[0];
  if (!previousKey) throw new Error('Expected the previous test key');
  const oldDigest = createEmailLookupHmac(
    'person@example.com',
    previousKey,
  ).digest;
  const harness = executorWith(
    approvalHandlers({
      'read-key-versions': () => ({ rows: [{ email_hmac_key_version: 1 }] }),
      'find-contact': () => ({
        rows: [
          contactRow({
            deleted_at: deletedAt,
            email_hmac_key_version: 1,
            email_lookup_hmac: oldDigest,
          }),
        ],
      }),
      'rekey-contact': () => ({
        rows: [contactRow({ deleted_at: deletedAt })],
      }),
      'find-hard-stops': () => ({
        rows: [{ kind: 'deletion', occurred_at: deletedAt }],
      }),
      'read-control-state': () => ({
        rows: [
          contactRow({
            deleted_at: deletedAt,
            latest_hard_stop_kind: 'deletion',
            latest_hard_stop_at: deletedAt,
          }),
        ],
      }),
    }),
  );

  const result = await approveContactFromForm(harness.executor, baseApproval);

  const alias = harness.calls.find(
    ({ marker }) => marker === 'insert-activity',
  );
  expect(result.authorization).toBe('deleted');
  expect(alias?.params[0]).toBe(`contact.lookup_alias_added:${contactId}:v1`);
  expect(alias?.params[3]).toBe('contact.lookup_alias_added');
  expect(JSON.parse(String(alias?.params[4]))).toEqual({
    digest: oldDigest,
    key_version: 1,
  });
  expect(
    harness.calls.find(({ marker }) => marker === 'rekey-contact')?.params[1],
  ).toBe(2);
  expect(harness.calls.map(({ marker }) => marker)).not.toContain(
    'set-form-approval',
  );
});

test('approveContactFromForm does not approve a contact with a hard stop', async () => {
  const harness = executorWith(
    approvalHandlers({
      'find-contact': () => ({ rows: [contactRow()] }),
      'find-hard-stops': () => ({
        rows: [{ kind: 'unsubscribe', occurred_at: stoppedAt }],
      }),
      'read-control-state': () => ({
        rows: [
          contactRow({
            latest_hard_stop_kind: 'unsubscribe',
            latest_hard_stop_at: stoppedAt,
          }),
        ],
      }),
    }),
  );

  const result = await approveContactFromForm(harness.executor, baseApproval);

  const markers = harness.calls.map(({ marker }) => marker);
  expect(result.formApprovalGranted).toBe(false);
  expect(result.authorization).toBe('stopped');
  expect(markers).not.toContain('set-form-approval');
  expect(markers).not.toContain('insert-form-outreach-approved');
  const submission = harness.calls.find(
    ({ marker }) => marker === 'insert-activity',
  );
  expect(JSON.parse(String(submission?.params[4]))).toMatchObject({
    approval_granted: false,
    blocked_by: 'unsubscribe',
  });
});

const reauthorizeInput = {
  contactId,
  eventKey: 'founder:reauthorize:1',
  occurredAt,
  actor: 'founder',
  reason: 'verified renewed request',
  source: 'growth-control',
  policyVersion: 'growth-v1',
} as const;

test('reauthorizeContact is blocked by deletion and by a stop after the request time', async () => {
  const deleted = executorWith({
    'lock-contact': () => ({ rows: [contactRow({ deleted_at: stoppedAt })] }),
    'find-hard-stops': () => ({
      rows: [{ kind: 'deletion', occurred_at: stoppedAt }],
    }),
    'read-control-state': () => ({
      rows: [
        contactRow({
          deleted_at: stoppedAt,
          latest_hard_stop_kind: 'deletion',
          latest_hard_stop_at: stoppedAt,
        }),
      ],
    }),
  });
  const laterStop = new Date('2026-09-02T00:00:00.000Z');
  const stoppedLater = executorWith({
    'lock-contact': () => ({ rows: [contactRow()] }),
    'find-hard-stops': () => ({
      rows: [{ kind: 'unsubscribe', occurred_at: laterStop }],
    }),
    'read-control-state': () => ({
      rows: [
        contactRow({
          latest_hard_stop_kind: 'unsubscribe',
          latest_hard_stop_at: laterStop,
        }),
      ],
    }),
  });

  const afterDeletion = await reauthorizeContact(deleted.executor, {
    ...reauthorizeInput,
    allowedPriorStops: ['unsubscribe'],
  });
  const afterLaterStop = await reauthorizeContact(stoppedLater.executor, {
    ...reauthorizeInput,
    allowedPriorStops: ['unsubscribe'],
  });

  expect(afterDeletion.reauthorized).toBe(false);
  expect(afterDeletion.blockedBy).toEqual(['deletion']);
  expect(afterLaterStop.reauthorized).toBe(false);
  expect(afterLaterStop.blockedBy).toEqual(['unsubscribe']);
  for (const harness of [deleted, stoppedLater]) {
    expect(harness.calls.map(({ marker }) => marker)).not.toContain(
      'set-reauthorized',
    );
  }
});

test('reauthorizeContact restores approval when policy allows every prior stop', async () => {
  const harness = executorWith({
    'lock-contact': () => ({ rows: [contactRow()] }),
    'find-hard-stops': () => ({
      rows: [{ kind: 'campaign.reply_received', occurred_at: stoppedAt }],
    }),
    'insert-activity': () => ({
      rows: [{ event_key: 'founder:reauthorize:1' }],
    }),
    'set-reauthorized': () => ({
      rows: [contactRow({ outreach_approved_at: occurredAt })],
    }),
    'read-control-state': () => ({
      rows: [
        contactRow({
          outreach_approved_at: occurredAt,
          latest_hard_stop_kind: 'campaign.reply_received',
          latest_hard_stop_at: stoppedAt,
        }),
      ],
    }),
  });

  const result = await reauthorizeContact(harness.executor, {
    ...reauthorizeInput,
    allowedPriorStops: ['campaign.reply_received'],
  });

  expect(result.reauthorized).toBe(true);
  expect(result.state.authorization).toBe('approved');
});

const deleteInput = {
  contactId,
  eventKey: 'founder:delete:1',
  occurredAt,
  actor: 'founder',
  source: 'verified-deletion-request',
  policyVersion: 'growth-v1',
} as const;

test('deleteContact nulls contact fields, cancels jobs, keeps stop and delivery activity', async () => {
  const deletedRow = contactRow({
    deleted_at: occurredAt,
    latest_hard_stop_kind: 'deletion',
    latest_hard_stop_at: occurredAt,
  });
  const harness = executorWith({
    'lock-contact': () => ({ rows: [contactRow()] }),
    'delete-artifacts': () => ({ rows: [{ id: 'artifact-id' }] }),
    'cancel-and-scrub-jobs': () => ({
      rows: [
        { id: 'pending-job', status: 'cancelled' },
        { id: 'submitted-job', status: 'completed' },
      ],
    }),
    'unlink-projects': () => ({ rows: [{ id: 'project-id' }] }),
    'delete-private-activity': () => ({ rows: [{ id: 1 }] }),
    'scrub-retained-activity': () => ({ rows: [{ id: 2 }] }),
    'insert-activity': () => ({ rows: [{ event_key: 'founder:delete:1' }] }),
    'scrub-contact': () => ({ rows: [deletedRow] }),
    'read-control-state': () => ({ rows: [deletedRow] }),
  });
  const redactEvidence = vi.fn(async () => undefined);

  const result = await deleteContact(harness.executor, {
    ...deleteInput,
    redactEvidence,
  });

  const sqlFor = (marker: string) =>
    harness.calls.find((call) => call.marker === marker)?.sql;
  expect(result).toMatchObject({
    deleted: true,
    cancelledJobIds: ['pending-job'],
    retainedJobIds: ['submitted-job'],
    unlinkedProjectIds: ['project-id'],
    deletedArtifactIds: ['artifact-id'],
  });
  expect(result.state).toMatchObject({
    authorization: 'deleted',
    canSend: false,
  });
  expect(redactEvidence).toHaveBeenCalledWith(
    expect.anything(),
    contactId,
    deleteInput.occurredAt,
  );
  expect(sqlFor('cancel-and-scrub-jobs')).toMatch(/project_id\s*=\s*null/u);
  expect(sqlFor('scrub-retained-activity')).toMatch(
    /delivery\.submission_authorized[\s\S]*bounded_stop_race/u,
  );
  expect(sqlFor('delete-private-activity')).toMatch(
    /contact\.lookup_alias_added/u,
  );
  expect(harness.calls.map(({ marker }) => marker)).toEqual([
    'privacy-lock',
    'lock-contact',
    'insert-activity',
    'cancel-and-scrub-jobs',
    'delete-artifacts',
    'unlink-projects',
    'delete-private-activity',
    'scrub-retained-activity',
    'scrub-contact',
    'read-control-state',
  ]);
  expect(harness.calls[0]?.sql).toContain('pg_advisory_xact_lock(');
});

test('deleteContact runs the observation redaction inside its transaction', async () => {
  const deletedRow = contactRow({
    deleted_at: occurredAt,
    latest_hard_stop_kind: 'deletion',
    latest_hard_stop_at: occurredAt,
  });
  const storedRow = contactRow();
  const harness = executorWith({
    'lock-contact': () => ({ rows: [storedRow] }),
    'insert-activity': () => ({ rows: [{ event_key: 'founder:delete:1' }] }),
    'observation-read-contact-identity': () => ({
      rows: [
        {
          email_normalized: 'person@example.com',
          email_lookup_hmac: storedRow['email_lookup_hmac'],
          email_hmac_key_version: 2,
        },
      ],
    }),
    'observation-read-contact-aliases': emptyRows,
    'observation-select-redaction-targets': emptyRows,
    'observation-insert-fence': emptyRows,
    'observation-lock-redaction-work': emptyRows,
    'observation-delete-identities': emptyRows,
    'observation-redact-observations': emptyRows,
    'observation-delete-redacted-facts': emptyRows,
    'observation-reset-redacted-work': emptyRows,
    'cancel-and-scrub-jobs': emptyRows,
    'delete-artifacts': emptyRows,
    'unlink-projects': emptyRows,
    'delete-private-activity': emptyRows,
    'scrub-retained-activity': emptyRows,
    'scrub-contact': () => ({ rows: [deletedRow] }),
    'read-control-state': () => ({ rows: [deletedRow] }),
  });

  const result = await deleteContact(harness.executor, deleteInput);

  expect(result.deleted).toBe(true);
  expect(harness.calls.map(({ marker }) => marker)).toEqual([
    'privacy-lock',
    'lock-contact',
    'insert-activity',
    'privacy-lock',
    'observation-read-contact-identity',
    'observation-read-contact-aliases',
    'observation-select-redaction-targets',
    'observation-insert-fence',
    'observation-lock-redaction-work',
    'observation-delete-identities',
    'observation-redact-observations',
    'observation-delete-redacted-facts',
    'observation-reset-redacted-work',
    'cancel-and-scrub-jobs',
    'delete-artifacts',
    'unlink-projects',
    'delete-private-activity',
    'scrub-retained-activity',
    'scrub-contact',
    'read-control-state',
  ]);
  expect(harness.calls[4]?.params).toEqual([contactId]);
  expect(harness.calls[6]?.params).toEqual([
    null,
    'person@example.com',
    [2],
    [storedRow['email_lookup_hmac']],
  ]);
  expect(harness.calls[7]?.params).toEqual([
    storedRow['email_lookup_hmac'],
    2,
    occurredAt,
  ]);
  expect(harness.calls[12]?.params).toEqual([[], occurredAt]);
});

test('deleteContact is inert for an already deleted contact and rejects an altered replay', async () => {
  const deletedRow = contactRow({ deleted_at: occurredAt });
  const stored = {
    contact_id: contactId,
    project_id: null,
    kind: 'deletion',
    occurred_at: occurredAt,
    data: {
      actor: 'founder',
      policy_version: 'growth-v1',
      provenance: 'verified_deletion',
      source: 'verified-deletion-request',
    },
  };
  const handlers = (row: TestRow) => ({
    'lock-contact': () => ({ rows: [deletedRow] }),
    'read-event-key': () => ({ rows: [row] }),
    'read-control-state': () => ({ rows: [deletedRow] }),
  });
  const inert = executorWith(handlers(stored));
  const altered = executorWith(handlers({ ...stored, kind: 'other' }));

  const result = await deleteContact(inert.executor, deleteInput);
  const rejected = deleteContact(altered.executor, deleteInput);

  expect(result.deleted).toBe(false);
  expect(result.cancelledJobIds).toEqual([]);
  await expect(rejected).rejects.toThrow(
    'Growth activity event key conflict: founder:delete:1',
  );
});

test('the fake executor throws on an unexpected marker', async () => {
  const harness = executorWith({});

  const result = harness.executor.execute('/* growth:mystery */ select 1');

  await expect(result).rejects.toThrow('Unexpected growth SQL marker: mystery');
});

test('normalizeInstallRuntimeEmail keeps a usable recipient and drops bots and malformed mailboxes', () => {
  const inputs = [
    ' Dev@Acme.DEV ',
    'not-an-email',
    'noreply@acme.dev',
    'dependabot+1@acme.dev',
    'dev@no-reply.acme.dev',
    '.dev@acme.dev',
    'd..ev@acme.dev',
    'dev@-acme.dev',
  ];

  const results = inputs.map(normalizeInstallRuntimeEmail);

  expect(results).toEqual([
    'dev@acme.dev',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('approveContactFromInstallRuntimeInTransaction refuses personal-domain and bot emails before any SQL', async () => {
  const { executor, calls } = executorWith({});
  const input = {
    keyring,
    now: occurredAt,
    installObservationId: '00000000-0000-4000-8000-0000000000a1',
    runtimeObservationId: '00000000-0000-4000-8000-0000000000b1',
  };

  const results = [
    await approveContactFromInstallRuntimeInTransaction(executor, {
      ...input,
      email: 'someone@gmail.com',
    }),
    await approveContactFromInstallRuntimeInTransaction(executor, {
      ...input,
      email: 'noreply@acme.dev',
    }),
  ];

  expect(results).toEqual([null, null]);
  expect(calls).toEqual([]);
  await expect(
    approveContactFromInstallRuntimeInTransaction(executor, {
      ...input,
      email: 'dev@acme.dev',
      runtimeObservationId: 'runtime-1',
    }),
  ).rejects.toThrow('Install/runtime approval requires observation UUIDs');
});

test('approveContactFromInstallDigest reports an unavailable identity and requires an observation UUID', async () => {
  const { executor, calls } = executorWith({
    'read-install-digest-identity': () => ({ rows: [] }),
  });
  const input = {
    installObservationId: '00000000-0000-4000-8000-0000000000a1',
    occurredAt,
    eventKey: 'install_digest:approve:1',
    keyring,
  };

  const result = await approveContactFromInstallDigest(executor, input);

  expect(result).toEqual({ approved: false, reason: 'identity_unavailable' });
  expect(calls[0]?.sql).toContain("o.kind = 'package.installed'");
  expect(calls[0]?.sql).toContain('o.redacted_at is null');
  await expect(
    approveContactFromInstallDigest(executor, {
      ...input,
      installObservationId: 'install-1',
    }),
  ).rejects.toThrow('Install digest approval requires an observation UUID');
});
