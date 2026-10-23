import { expect, test } from 'vitest';

import { readInboxHealth, reviewInboxReceipt } from './receiving-operations.ts';
import { executorWith } from './testing/fake-executor.ts';

const now = new Date('2026-10-22T01:00:00Z');
const evidence = {
  receiptId: 'receipt-1',
  actor: 'brian',
  evidence: 'review-1',
  occurredAt: now,
};

test('operator ignore requires bounded audit references before storage', async () => {
  const { executor, calls } = executorWith({});

  await expect(
    reviewInboxReceipt(executor, { ...evidence, actor: '' }),
  ).rejects.toThrow();
  await expect(
    reviewInboxReceipt(executor, {
      ...evidence,
      evidence: 'private email text',
    }),
  ).rejects.toThrow();

  expect(calls).toEqual([]);
});

test('individual ignore audits before clearing pending evidence under privacy and inbox locks', async () => {
  const { executor, calls } = executorWith({
    'inbox-review-receipt': () => ({
      rows: [{ id: 'receipt-1', status: 'pending' }],
    }),
    'inbox-review-audit': () => ({ rows: [] }),
    'inbox-review-ignore': () => ({ rows: [] }),
  });

  await reviewInboxReceipt(executor, evidence);

  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'inbox-send-lock',
    'inbox-review-receipt',
    'inbox-review-audit',
    'inbox-review-ignore',
  ]);
  expect(
    calls.find((call) => call.marker === 'inbox-review-audit')?.params,
  ).toContain('review-1');
  expect(
    calls.find((call) => call.marker === 'inbox-review-ignore')?.sql,
  ).toContain('contact_id = null');
});

test('resolved or erased receipts cannot be reviewed again', async () => {
  const { executor, calls } = executorWith({
    'inbox-review-receipt': () => ({
      rows: [{ id: 'receipt-1', status: 'ignored' }],
    }),
  });

  await expect(reviewInboxReceipt(executor, evidence)).rejects.toThrow(
    'resolved',
  );

  expect(calls.some((call) => call.marker === 'inbox-review-audit')).toBe(
    false,
  );
});

test('health emits only aggregate closed codes and stays blocked for incomplete evidence', async () => {
  const { executor } = executorWith({
    'inbox-health': () => ({
      rows: [
        {
          enabled: true,
          fresh: false,
          recovering: true,
          unread: 2,
          pending: 3,
          unforwarded: 1,
          unbound: 1,
          unknown_sends: 0,
          expired_attempts: 0,
          private: 'private@example.com',
        },
      ],
    }),
  });

  const health = await readInboxHealth(executor, now);

  expect(health.healthy).toBe(false);
  expect(health.codes).toEqual([
    'recovery_in_progress',
    'coverage_stale',
    'unread_receipts',
    'pending_receipts',
    'unforwarded_receipts',
    'unbound_messages',
  ]);
  expect(JSON.stringify(health)).not.toContain('private');
});

test('health fails closed when the mailbox row is missing', async () => {
  const { executor } = executorWith({ 'inbox-health': () => ({ rows: [] }) });

  const health = await readInboxHealth(executor, now);

  expect(health.healthy).toBe(false);
  expect(health.codes).toEqual(['mailbox_disabled']);
});

for (const [unknownSends, expiredAttempts, codes] of [
  [0, 0, []],
  [1, 0, ['send_outcome_unknown']],
  [0, 1, ['provider_attempt_expired']],
  [1, 1, ['send_outcome_unknown', 'provider_attempt_expired']],
] as const) {
  test(`health reports unresolved delivery counts ${unknownSends}/${expiredAttempts} without exposing evidence`, async () => {
    const { executor, calls } = executorWith({
      'inbox-health': () => ({
        rows: [
          {
            enabled: true,
            fresh: true,
            recovering: false,
            unread: 0,
            pending: 0,
            unforwarded: 0,
            unbound: 0,
            unknown_sends: unknownSends,
            expired_attempts: expiredAttempts,
            provider_email_id: 'private-provider-id',
            payload_sha256: 'private-payload-digest',
          },
        ],
      }),
    });

    const health = await readInboxHealth(executor, now);

    expect(health).toEqual({ healthy: codes.length === 0, codes });
    const query = calls.find(({ marker }) => marker === 'inbox-health');
    expect(query?.sql).toContain("delivery_status = 'unknown'");
    expect(query?.sql).toMatch(
      /provider_email_id is null and first_attempted_at <= \$2::timestamptz - interval '23 hours'/u,
    );
    expect(query?.params).toEqual(['brian@replies.hashbrown.dev', now]);
    expect(JSON.stringify(health)).not.toContain('private');
  });
}
