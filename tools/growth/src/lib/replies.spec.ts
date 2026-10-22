import { expect, test } from 'vitest';
import {
  normalizeReplySubject,
  rankGoogleReplyCandidates,
  replySubjectSha256,
  selectBestGoogleReplyResolution,
  settleGoogleReplyReconciliation,
  sha256Base64Url,
} from './replies.ts';
import { executorWith } from './testing/fake-executor.ts';

const now = new Date('2026-10-21T15:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const leaseToken = '00000000-0000-4000-8000-000000000003';

test('replySubjectSha256 hashes the subject after stripping reply prefixes and whitespace', () => {
  const sent = 'Engineer to engineer';

  const normalized = normalizeReplySubject(
    '  RE: Fwd:re:  Engineer   to engineer ',
  );
  const digests = [
    replySubjectSha256(sent),
    replySubjectSha256('Re: Engineer to engineer'),
    replySubjectSha256('AW: engineer TO engineer'),
  ];

  expect(normalized).toBe('engineer to engineer');
  expect(new Set(digests)).toEqual(
    new Set([sha256Base64Url('engineer to engineer')]),
  );
  expect(replySubjectSha256('Got your note')).not.toBe(digests[0]);
});

test('rankGoogleReplyCandidates ranks In-Reply-To first and selectBestGoogleReplyResolution picks the lowest rank', () => {
  const event = {
    inReplyTo: '<b@hashbrown.dev>',
    references: ['<a@hashbrown.dev>', '<c@hashbrown.dev>', '<b@hashbrown.dev>'],
  };

  const ranked = rankGoogleReplyCandidates(event);
  const best = selectBestGoogleReplyResolution([
    {
      message_id: '<c@hashbrown.dev>',
      rank: 1,
      contact_id: 'z',
      seed_job_id: 'j1',
    },
    {
      message_id: '<a@hashbrown.dev>',
      rank: 2,
      contact_id: 'a',
      seed_job_id: 'j2',
    },
  ]);

  expect(ranked).toEqual([
    { message_id: '<b@hashbrown.dev>', rank: 0 },
    { message_id: '<c@hashbrown.dev>', rank: 1 },
    { message_id: '<a@hashbrown.dev>', rank: 2 },
  ]);
  expect(best?.message_id).toBe('<c@hashbrown.dev>');
  expect(selectBestGoogleReplyResolution([])).toBeNull();
});

test('settleGoogleReplyReconciliation backs off an unresolved reply and hands the fifth attempt to founder review', async () => {
  const leased = (attempts: number) => ({
    id: jobId,
    kind: 'reply_reconcile',
    contact_id: null,
    status: 'leased',
    lease_token: leaseToken,
    attempts,
    payload: { gmail_message_id: 'gmail-1', occurred_at: now.toISOString() },
  });
  const settle = async (attempts: number) => {
    const { executor, calls } = executorWith({
      'read-google-reconcile-settlement': () => ({ rows: [leased(attempts)] }),
      'read-google-mailbox-recovery-pause': () => ({
        rows: [{ paused: false }],
      }),
      'read-current-google-reconcile-settlement': () => ({
        rows: [leased(attempts)],
      }),
      'lock-unresolved-google-reconcile': () => ({ rows: [leased(attempts)] }),
      'defer-unresolved-google-reconcile': () => ({ rows: [{ id: jobId }] }),
    });
    const result = await settleGoogleReplyReconciliation(executor, {
      jobId,
      leaseToken,
      now,
    });
    const deferral = calls.find(
      ({ marker }) => marker === 'defer-unresolved-google-reconcile',
    );
    return { result, params: deferral?.params };
  };

  const second = await settle(2);
  const fifth = await settle(5);

  expect(second).toEqual({
    result: 'retry_scheduled',
    params: [
      jobId,
      leaseToken,
      'pending',
      new Date(now.getTime() + 4 * 60_000),
      'reply_reference_unresolved',
    ],
  });
  expect(fifth.result).toBe('founder_review');
  expect(fifth.params?.[2]).toBe('failed');
  expect(fifth.params?.[4]).toBe('founder_review');
});
