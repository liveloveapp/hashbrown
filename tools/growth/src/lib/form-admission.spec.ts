import { expect, test, vi } from 'vitest';

import type { SqlTransaction } from './database.ts';
import {
  FormRateLimitError,
  FormSubmissionConflictError,
  prepareFormAdmission,
  recordFormAdmission,
} from './form-admission.ts';
import type { AcceptFormSubmissionInput } from './forms.ts';

const input: AcceptFormSubmissionInput = {
  submissionId: '20000000-0000-4000-8000-000000000002',
  email: 'person@gmail.com',
  form: {
    framework: 'react',
    message: 'My streaming component never finishes rendering.',
  },
  noticeText: 'Brian may follow up by email. Unsubscribe anytime.',
  noticeVersion: 'unstuck-notice-v1',
  policyVersion: 'unstuck_v1.2026-10-22',
  keyring: {
    active: { version: 1, secret: 'a-long-admission-secret-for-tests-only' },
  },
  occurredAt: new Date('2026-09-09T14:01:00Z'),
};

function harness(
  count: number | ((bucketKey: string) => number) = 1,
  unavailable = false,
) {
  const queries: string[] = [];
  const tx: SqlTransaction = {
    execute: vi.fn(async (q: string, parameters: readonly unknown[] = []) => {
      queries.push(q);
      if (q.includes('growth:consume-form-budget')) {
        if (unavailable) throw new Error('provider secret should not leak');
        return {
          rows: [
            {
              count:
                typeof count === 'function'
                  ? count(String(parameters[0]))
                  : count,
            },
          ],
        };
      }
      return { rows: [] };
    }) as SqlTransaction['execute'],
  };
  return { tx, queries };
}

function chargedBuckets(tx: SqlTransaction) {
  return vi
    .mocked(tx.execute)
    .mock.calls.filter(([q]) => q.includes('growth:consume-form-budget'))
    .map(([, parameters]) => ({
      key: String(parameters?.[0]),
      window: parameters?.[1],
    }));
}

async function recordedAssessment(
  result: Parameters<typeof recordFormAdmission>[3],
) {
  const h = harness();
  const admission = await prepareFormAdmission(h.tx, input);
  await recordFormAdmission(h.tx, input, admission, result);
  const call = vi
    .mocked(h.tx.execute)
    .mock.calls.find(([q]) => q.includes('growth:record-form-assessment'));
  return {
    parameters: call?.[1] ?? [],
    data: JSON.parse(String(call?.[1]?.[3])) as Record<string, unknown>,
  };
}

function replayingTransaction(data: Record<string, unknown>): SqlTransaction {
  return {
    execute: vi.fn(async (q: string) => ({
      rows: q.includes('growth:read-form-assessment') ? [{ data }] : [],
    })) as SqlTransaction['execute'],
  };
}

test('records the assessment, result and request digest under form:<id>:assessment', async () => {
  const result = {
    accepted: true as const,
    approved: true,
    contactId: 'contact',
    submissionId: input.submissionId,
  };

  const { parameters, data } = await recordedAssessment(result);

  expect(parameters[0]).toBe(`form:${input.submissionId}:assessment`);
  expect(parameters[1]).toBe('contact');
  expect(data).toMatchObject({
    assessment: { version: 'form-abuse-v1', decision: 'allow' },
    result,
    submission_id: input.submissionId,
    key_version: 1,
    limiter_unavailable: false,
  });
  expect(String(data['request_digest'])).toMatch(/^[0-9a-f]{64}$/u);
  expect(JSON.stringify(data)).not.toContain(input.form.message);
  expect(JSON.stringify(data)).not.toContain(input.email);
});

test('replays the immutable decision without consuming a budget and rejects a changed payload', async () => {
  const result = {
    accepted: true as const,
    approved: true,
    contactId: 'contact',
    submissionId: input.submissionId,
  };
  const { data } = await recordedAssessment(result);
  const tx = replayingTransaction(data);

  const replay = await prepareFormAdmission(tx, input);
  const changedEmail = prepareFormAdmission(tx, {
    ...input,
    email: 'other@gmail.com',
  });
  const changedMessage = prepareFormAdmission(tx, {
    ...input,
    form: { ...input.form, message: `${input.form.message} Also Angular.` },
  });

  expect(replay.replay).toEqual(result);
  expect(
    vi
      .mocked(tx.execute)
      .mock.calls.some(([q]) => q.includes('growth:consume-form-budget')),
  ).toBe(false);
  await expect(changedEmail).rejects.toBeInstanceOf(
    FormSubmissionConflictError,
  );
  await expect(changedMessage).rejects.toBeInstanceOf(
    FormSubmissionConflictError,
  );
  await expect(changedMessage).rejects.toThrow('identity conflict');
});

test('blocks a placeholder email with a gibberish message', async () => {
  const h = harness();

  const admission = await prepareFormAdmission(h.tx, {
    ...input,
    email: 'test@example.com',
    form: { framework: 'react', message: 'qRsTuVwXyZaBcDeFgHiJ' },
  });

  expect(admission.assessment).toMatchObject({
    score: 100,
    decision: 'blocked',
    category: 'placeholder_email',
    reasons: ['gibberish_message', 'placeholder_email'],
  });
});

test('sixth submission for one email within the hour is limited with a bounded Retry-After', async () => {
  const h = harness(6);

  const admission = prepareFormAdmission(h.tx, input);

  await expect(admission).rejects.toBeInstanceOf(FormRateLimitError);
  await expect(admission).rejects.toMatchObject({ retryAfterSec: 3540 });
  expect(h.queries).toContain('savepoint growth_form_budget');
  expect(h.queries).toContain('rollback to savepoint growth_form_budget');
});

test('a limiter fault fails open', async () => {
  const h = harness(1, true);

  const admission = await prepareFormAdmission(h.tx, input);

  expect(admission).toMatchObject({
    limiterUnavailable: true,
    assessment: { decision: 'allow' },
  });
  expect(h.queries).toContain('rollback to savepoint growth_form_budget');
});

test('charges the IP budget only for a trusted client IP and denies over 20', async () => {
  const withoutIp = harness(5);
  const overIp = harness(21);

  await prepareFormAdmission(withoutIp.tx, input);
  const denied = prepareFormAdmission(overIp.tx, {
    ...input,
    trustedClientIp: '203.0.113.5',
  });

  const budgetKeys = chargedBuckets(withoutIp.tx).map(({ key }) => key);
  expect(budgetKeys).toHaveLength(2);
  expect(budgetKeys.some((key) => /^form:email:[0-9a-f]{64}$/u.test(key))).toBe(
    true,
  );
  await expect(denied).rejects.toBeInstanceOf(FormRateLimitError);
});

test('locks the submission and the normalized email before reading the assessment', async () => {
  const h = harness();

  await prepareFormAdmission(h.tx, { ...input, email: ' Person@Gmail.com ' });

  expect(h.tx.execute).toHaveBeenCalledWith(
    expect.stringContaining('growth:lock-form-email'),
    ['person@gmail.com'],
  );
  const lockSubmission = h.queries.findIndex((q) =>
    q.includes('growth:lock-form-submission'),
  );
  const lockEmail = h.queries.findIndex((q) =>
    q.includes('growth:lock-form-email'),
  );
  const read = h.queries.findIndex((q) =>
    q.includes('growth:read-form-assessment'),
  );
  expect(lockSubmission).toBeGreaterThanOrEqual(0);
  expect(lockSubmission).toBeLessThan(lockEmail);
  expect(lockEmail).toBeLessThan(read);
});

test('charges a daily email budget by UTC day and limits the eleventh submission until midnight', async () => {
  const allowed = harness((key) =>
    key.startsWith('form:email-day:') ? 10 : 1,
  );
  const limited = harness((key) =>
    key.startsWith('form:email-day:') ? 11 : 1,
  );

  await prepareFormAdmission(allowed.tx, input);
  const denied = prepareFormAdmission(limited.tx, input);

  const day = chargedBuckets(allowed.tx).find(({ key }) =>
    key.startsWith('form:email-day:'),
  );
  expect(day?.key).toMatch(/^form:email-day:[0-9a-f]{64}$/u);
  expect(day?.window).toEqual(new Date('2026-09-09T00:00:00Z'));
  await expect(denied).rejects.toBeInstanceOf(FormRateLimitError);
  await expect(denied).rejects.toMatchObject({ retryAfterSec: 35_940 });
  expect(limited.queries).toContain('rollback to savepoint growth_form_budget');
});

test('a blocked submission charges only the IP budget, never the email budgets', async () => {
  const h = harness();

  const admission = await prepareFormAdmission(h.tx, {
    ...input,
    honeypot: 'https://bot.invalid',
    trustedClientIp: '203.0.113.5',
  });

  expect(admission.assessment.decision).toBe('blocked');
  const keys = chargedBuckets(h.tx).map(({ key }) => key);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^form:ip:[0-9a-f]{64}$/u);
});
