import { expect, test, vi } from 'vitest';

import {
  type ContactHardStopReason,
  FULFILLMENT_ALLOWED_PRIOR_STOPS,
  FULFILLMENT_EPOCH_FATAL_STOP_REASONS,
} from './contacts.ts';
import type { EmailHmacKeyring } from './crypto.ts';
import type { SqlExecutor, SqlTransaction } from './database.ts';
import {
  acceptFormSubmission,
  type AcceptFormSubmissionInput,
} from './forms.ts';
import { FormSubmissionConflictError } from './form-admission.ts';

const keyring: EmailHmacKeyring = {
  active: {
    version: 1,
    secret: 'forms-test-secret-that-is-at-least-32-bytes-long',
  },
};

const occurredAt = new Date('2026-10-22T18:00:00.000Z');
const contactId = '10000000-0000-4000-8000-000000000001';

type Authorization = 'approved' | 'stopped' | 'deleted';

function createHarness(
  authorization: Authorization = 'approved',
  options: {
    stopReason?: ContactHardStopReason;
    /** Whether a delivery-fatal stop exists since approval; derived by default. */
    fatalStop?: boolean;
    validJobReplay?: boolean;
  } = {},
) {
  const validJobReplay = options.validJobReplay ?? true;
  const stopReason =
    options.stopReason ??
    (authorization === 'deleted' ? 'deletion' : 'unsubscribe');
  const fatalStop =
    options.fatalStop ??
    (authorization === 'stopped' &&
      !(FULFILLMENT_ALLOWED_PRIOR_STOPS as readonly string[]).includes(
        stopReason,
      ));
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const transaction: SqlTransaction = {
    execute: vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('growth:read-form-delivery-block')) {
        return { rows: [{ blocked: fatalStop }] };
      }
      if (sql.includes('growth:enqueue-form-jobs') && validJobReplay) {
        return {
          rows: ['fulfill', 'notify'].map((kind) => ({
            idempotency_key: `form:${String(parameters[2])}:${kind}`,
          })),
        };
      }
      return { rows: [] };
    }) as SqlTransaction['execute'],
  };
  const executor: SqlExecutor = {
    execute: transaction.execute,
    transaction: vi.fn(async (operation) => operation(transaction)),
  };
  const approveContact = vi.fn(async () => ({
    contactId,
    authorization,
    canSend: authorization === 'approved',
    formApprovalGranted: authorization === 'approved',
    outreachApprovedAt: authorization === 'approved' ? occurredAt : null,
    latestHardStop:
      authorization === 'approved' ? null : { reason: stopReason, occurredAt },
    deletedAt: authorization === 'deleted' ? occurredAt : null,
    updatedAt: occurredAt,
  }));
  return { executor, transaction, queries, approveContact };
}

const baseInput: AcceptFormSubmissionInput = {
  submissionId: '20000000-0000-4000-8000-000000000002',
  email: ' Person@Gmail.com ',
  form: {
    message: '  My chat component re-renders on every streamed token.  ',
  },
  occurredAt,
  keyring,
};

function enqueueQuery(
  queries: { sql: string; parameters: readonly unknown[] }[],
) {
  return queries.find(({ sql }) => sql.includes('growth:enqueue-form-jobs'));
}

test('accepts an unstuck submission and enqueues fulfill and notify in one transaction', async () => {
  const harness = createHarness();

  const result = await acceptFormSubmission(harness.executor, baseInput, {
    approveContact: harness.approveContact,
  });

  expect(harness.executor.transaction).toHaveBeenCalledTimes(1);
  expect(harness.approveContact).toHaveBeenCalledWith(harness.transaction, {
    email: baseInput.email,
    source: 'website',
    sourceForm: 'unstuck',
    eventKey: `form:${baseInput.submissionId}:accepted`,
    occurredAt,
    keyring,
    serverEmailClassification: 'personal',
    submittedFacts: {
      form_kind: 'unstuck',
      submission_id: baseInput.submissionId,
      message: 'My chat component re-renders on every streamed token.',
    },
  });
  expect(result).toEqual({
    accepted: true,
    approved: true,
    contactId,
    submissionId: baseInput.submissionId,
  });
  const enqueue = enqueueQuery(harness.queries);
  expect(enqueue?.sql).toContain("'fulfill'");
  expect(enqueue?.sql).toContain("'notify'");
  expect(enqueue?.sql).not.toContain("'send_step'");
  expect(enqueue?.sql).not.toContain("'enrich'");
  expect(enqueue?.sql).toContain('on conflict (idempotency_key) do nothing');
  expect(enqueue?.parameters).toEqual([
    contactId,
    occurredAt,
    baseInput.submissionId,
    JSON.stringify({
      form_kind: 'unstuck',
      submission_id: baseInput.submissionId,
    }),
    `form:contact:${contactId}:fulfill:2026-10-22`,
  ]);
  expect(
    harness.queries.some(({ sql }) =>
      sql.includes('growth:record-form-assessment'),
    ),
  ).toBe(true);
});

test('normalizes the submission id before keying the submission', async () => {
  const harness = createHarness();

  const result = await acceptFormSubmission(
    harness.executor,
    { ...baseInput, submissionId: ` ${baseInput.submissionId.toUpperCase()} ` },
    { approveContact: harness.approveContact },
  );

  expect(result.submissionId).toBe(baseInput.submissionId);
  expect(harness.approveContact).toHaveBeenCalledWith(
    harness.transaction,
    expect.objectContaining({
      eventKey: `form:${baseInput.submissionId}:accepted`,
    }),
  );
});

const blockedInputs: [string, AcceptFormSubmissionInput][] = [
  ['honeypot', { ...baseInput, honeypot: 'https://bot.invalid' }],
  [
    'abuse score >= 80',
    {
      ...baseInput,
      email: 'test@example.com',
      form: { message: 'qRsTuVwXyZaBcDeFgHiJ' },
    },
  ],
];

for (const [label, input] of blockedInputs) {
  test(`honeypot and abuse score >= 80 are recorded without jobs or approval: ${label}`, async () => {
    const harness = createHarness();

    const result = await acceptFormSubmission(harness.executor, input, {
      approveContact: harness.approveContact,
    });

    expect(harness.approveContact).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({ serverFormBlocked: true }),
    );
    expect(result).toEqual({
      accepted: true,
      approved: false,
      contactId,
      submissionId: baseInput.submissionId,
      deliverySuppressed: true,
    });
    expect(enqueueQuery(harness.queries)).toBeUndefined();
    expect(
      harness.queries.some(({ sql }) =>
        sql.includes('growth:record-form-assessment'),
      ),
    ).toBe(true);
  });
}

for (const stopReason of ['unsubscribe', 'campaign.reply_received'] as const) {
  test(`prior ${stopReason} still enqueues fulfill and notify without approval`, async () => {
    const harness = createHarness('stopped', { stopReason });

    const result = await acceptFormSubmission(harness.executor, baseInput, {
      approveContact: harness.approveContact,
    });

    expect(result).toEqual({
      accepted: true,
      approved: false,
      contactId,
      submissionId: baseInput.submissionId,
    });
    const enqueue = enqueueQuery(harness.queries);
    expect(enqueue?.sql).toContain("'fulfill'");
    expect(enqueue?.sql).toContain("'notify'");
  });
}

const suppressingStops: [Authorization, ContactHardStopReason][] = [
  ['stopped', 'complaint'],
  ['stopped', 'hard_bounce'],
  ['stopped', 'provider_suppression'],
  ['stopped', 'invalid_address'],
  ['stopped', 'manual_suppression'],
  ['deleted', 'deletion'],
];

for (const [authorization, stopReason] of suppressingStops) {
  test(`a ${stopReason} stop suppresses all mail and returns deliverySuppressed`, async () => {
    const harness = createHarness(authorization, { stopReason });

    const result = await acceptFormSubmission(harness.executor, baseInput, {
      approveContact: harness.approveContact,
    });

    expect(result).toEqual({
      accepted: true,
      approved: false,
      contactId,
      submissionId: baseInput.submissionId,
      deliverySuppressed: true,
    });
    expect(enqueueQuery(harness.queries)).toBeUndefined();
  });
}

const invalidInputs: [string, AcceptFormSubmissionInput, RegExp][] = [
  [
    'a message shorter than 20 characters after trimming',
    {
      ...baseInput,
      form: { message: `  ${'x'.repeat(19)}  ` },
    },
    /message/u,
  ],
  [
    'a message longer than 1000 characters',
    { ...baseInput, form: { message: 'x'.repeat(1_001) } },
    /message/u,
  ],
];

for (const [label, input, error] of invalidInputs) {
  test(`message outside 20..1000 characters is rejected before the transaction: ${label}`, async () => {
    const harness = createHarness();

    const accepted = acceptFormSubmission(harness.executor, input, {
      approveContact: harness.approveContact,
    });

    await expect(accepted).rejects.toThrow(error);
    expect(harness.executor.transaction).not.toHaveBeenCalled();
  });
}

test('a submission id that is not a UUIDv4 is rejected before the transaction', async () => {
  const harness = createHarness();

  const accepted = acceptFormSubmission(
    harness.executor,
    { ...baseInput, submissionId: 'not-a-uuid' },
    { approveContact: harness.approveContact },
  );

  await expect(accepted).rejects.toThrow(/submissionId/u);
  expect(harness.executor.transaction).not.toHaveBeenCalled();
});

test('complaint then unsubscribe suppresses all mail even though the latest stop is an unsubscribe', async () => {
  const harness = createHarness('stopped', {
    stopReason: 'unsubscribe',
    fatalStop: true,
  });

  const result = await acceptFormSubmission(harness.executor, baseInput, {
    approveContact: harness.approveContact,
  });

  expect(result).toEqual({
    accepted: true,
    approved: false,
    contactId,
    submissionId: baseInput.submissionId,
    deliverySuppressed: true,
  });
  expect(enqueueQuery(harness.queries)).toBeUndefined();
  const check = harness.queries.find(({ sql }) =>
    sql.includes('growth:read-form-delivery-block'),
  );
  expect(check?.parameters).toEqual([
    contactId,
    FULFILLMENT_EPOCH_FATAL_STOP_REASONS,
  ]);
});

test('accepts messages of exactly 20 and 1000 characters', async () => {
  const short = createHarness();
  const long = createHarness();

  const shortResult = await acceptFormSubmission(
    short.executor,
    { ...baseInput, form: { message: 'x'.repeat(20) } },
    { approveContact: short.approveContact },
  );
  const longResult = await acceptFormSubmission(
    long.executor,
    {
      ...baseInput,
      form: { message: 'y'.repeat(1_000) },
    },
    { approveContact: long.approveContact },
  );

  expect(shortResult.accepted).toBe(true);
  expect(longResult.accepted).toBe(true);
});

test('a submission id colliding with jobs owned by another contact throws', async () => {
  const harness = createHarness('approved', { validJobReplay: false });

  const accepted = acceptFormSubmission(harness.executor, baseInput, {
    approveContact: harness.approveContact,
  });

  await expect(accepted).rejects.toBeInstanceOf(FormSubmissionConflictError);
  await expect(accepted).rejects.toThrow(/job idempotency conflict/u);
});

test('keys fulfill once per contact per UTC day and notify per submission', async () => {
  const harness = createHarness();
  const lateInTheDay = new Date('2026-10-22T23:59:59.999Z');

  await acceptFormSubmission(
    harness.executor,
    { ...baseInput, occurredAt: lateInTheDay },
    { approveContact: harness.approveContact },
  );

  const enqueue = enqueueQuery(harness.queries);
  expect(enqueue?.parameters[4]).toBe(
    `form:contact:${contactId}:fulfill:2026-10-22`,
  );
  expect(enqueue?.sql).toContain("'form:' || $3 || ':notify'");
});

test('classifies a work domain as work and a personal domain as personal', async () => {
  const work = createHarness();
  const personal = createHarness();

  await acceptFormSubmission(
    work.executor,
    { ...baseInput, email: 'Jordan@Acme.dev' },
    { approveContact: work.approveContact },
  );
  await acceptFormSubmission(
    personal.executor,
    { ...baseInput, email: 'jordan@gmail.com' },
    { approveContact: personal.approveContact },
  );

  expect(work.approveContact).toHaveBeenCalledWith(
    work.transaction,
    expect.objectContaining({ serverEmailClassification: 'work' }),
  );
  expect(personal.approveContact).toHaveBeenCalledWith(
    personal.transaction,
    expect.objectContaining({ serverEmailClassification: 'personal' }),
  );
});
