import { createHmac } from 'node:crypto';

import { expect, test, vi } from 'vitest';

import {
  BRIAN_EMAIL,
  GOOGLE_REPLY_HEADERS,
  GOOGLE_REPLY_HMAC_SECRET_ENV,
  GoogleReplyReplayError,
  normalizeReplySubject,
  parseGoogleMailboxEvent,
  processGoogleMailboxEvent,
  rankGoogleReplyCandidates,
  replySubjectSha256,
  selectBestGoogleReplyResolution,
  settleGoogleReplyReconciliation,
  sha256Base64Url,
  verifyGoogleReplySignature,
} from './replies.ts';
import { executorWith } from './testing/fake-executor.ts';

const now = new Date('2026-10-21T15:00:00.000Z');
const timestamp = String(now.getTime());
const secret = 'g'.repeat(32);
const nonce = 'nonce_0123456789abcdef';
const contactId = '00000000-0000-4000-8000-000000000002';
const jobId = '00000000-0000-4000-8000-000000000001';
const leaseToken = '00000000-0000-4000-8000-000000000003';

function sign(rawBody: string, at = timestamp, key = secret): string {
  return `v1=${createHmac('sha256', key)
    .update(`${at}\n${nonce}\n${sha256Base64Url(rawBody)}`)
    .digest('base64url')}`;
}

function seed(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'seed',
    version: 1,
    gmail_message_id: '18cafe123abc',
    rfc_message_id: '<seed.1@hashbrown.dev>',
    occurred_at: now.toISOString(),
    from: 'Brian at Hashbrown <brian@hashbrown.dev>',
    verification: 'gmail_auth_aligned',
    x_hashbrown_job_id: jobId,
    ...overrides,
  });
}

function reply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'reply',
    version: 1,
    gmail_message_id: '18cafe123abd',
    rfc_message_id: '<reply.1@example.com>',
    occurred_at: now.toISOString(),
    from: 'Developer <Developer@Example.com>',
    in_reply_to: '<seed.1@hashbrown.dev>',
    references: ['<older@example.com>', '<seed.1@hashbrown.dev>'],
    ...overrides,
  });
}

function errorOf(operation: () => unknown): string {
  try {
    operation();
    return 'accepted';
  } catch (error) {
    return (error as Error).message;
  }
}

test('the reply envelope uses the hashbrown headers, secret and founder mailbox', () => {
  const headers = GOOGLE_REPLY_HEADERS;

  const values = [headers, GOOGLE_REPLY_HMAC_SECRET_ENV, BRIAN_EMAIL];

  expect(values).toEqual([
    {
      timestamp: 'x-hashbrown-timestamp',
      nonce: 'x-hashbrown-nonce',
      signature: 'x-hashbrown-signature',
    },
    'GOOGLE_REPLY_HMAC_SECRET',
    'brian@hashbrown.dev',
  ]);
});

test('verifyGoogleReplySignature rejects a stale timestamp, a short secret and a tampered body', () => {
  const rawBody = reply();
  const valid = {
    rawBody,
    timestamp,
    nonce,
    signature: sign(rawBody),
    secret,
    now,
  };
  const stale = String(now.getTime() - 5 * 60 * 1_000 - 1);

  const outcomes = [
    errorOf(() => verifyGoogleReplySignature(valid)),
    errorOf(() =>
      verifyGoogleReplySignature({
        ...valid,
        timestamp: stale,
        signature: sign(rawBody, stale),
      }),
    ),
    errorOf(() =>
      verifyGoogleReplySignature({
        ...valid,
        secret: 'short',
        signature: sign(rawBody, timestamp, 'short'),
      }),
    ),
    errorOf(() =>
      verifyGoogleReplySignature({ ...valid, rawBody: `${rawBody} ` }),
    ),
    errorOf(() => verifyGoogleReplySignature({ ...valid, nonce: 'short' })),
    errorOf(() =>
      verifyGoogleReplySignature({ ...valid, signature: 'v1=AAAA' }),
    ),
  ];

  expect(outcomes).toEqual([
    'accepted',
    'Google reply timestamp is outside the accepted window',
    'Google reply HMAC secret must be at least 32 bytes',
    'Google reply signature is invalid',
    'Google reply nonce is invalid',
    'Google reply signature encoding is invalid',
  ]);
});

test('parseGoogleMailboxEvent accepts hashbrown seeds and replies and rejects content, subjects and founder replies', () => {
  const digest = replySubjectSha256('Re: Engineer to engineer');

  const parsedSeed = parseGoogleMailboxEvent(seed());
  const parsedReply = parseGoogleMailboxEvent(
    reply({ subject_sha256: digest }),
  );
  const rejected = [
    reply({ subject: 'Re: Engineer to engineer' }),
    reply({ body_text: 'hello' }),
    reply({ references: [{ snippet: 'hi' }] }),
    reply({ subject_sha256: 'not-a-digest' }),
    reply({ from: 'Brian <brian@hashbrown.dev>' }),
    reply({ in_reply_to: undefined, references: [] }),
    seed({ x_threadplane_job_id: jobId }),
  ].map((body) => errorOf(() => parseGoogleMailboxEvent(body)));

  expect(parsedSeed).toMatchObject({
    kind: 'seed',
    from: 'brian@hashbrown.dev',
    jobId,
    rfcMessageId: '<seed.1@hashbrown.dev>',
  });
  expect(parsedReply).toEqual({
    kind: 'reply',
    version: 1,
    gmailMessageId: '18cafe123abd',
    rfcMessageId: '<reply.1@example.com>',
    occurredAt: now,
    from: 'developer@example.com',
    inReplyTo: '<seed.1@hashbrown.dev>',
    references: ['<older@example.com>', '<seed.1@hashbrown.dev>'],
    subjectSha256: digest,
  });
  expect(rejected).toEqual([
    'Google mailbox event contains a prohibited field: subject',
    'Google mailbox event contains a prohibited field: body_text',
    'Google mailbox event contains a prohibited field: snippet',
    'subject_sha256 is invalid',
    'Google mailbox reply candidate is invalid',
    'Google mailbox reply candidate is invalid',
    'Google mailbox event has an unsupported schema',
  ]);
});

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

test('processGoogleMailboxEvent rejects a replayed nonce before any domain work', async () => {
  const { executor, calls } = executorWith({
    'claim-google-reply-nonce': () => ({ rows: [] }),
  });
  const stopContact = vi.fn();

  const attempt = processGoogleMailboxEvent(
    executor,
    {
      event: parseGoogleMailboxEvent(reply()),
      nonce,
      timestamp,
      requestDigest: sha256Base64Url(reply()),
      receivedAt: now,
    },
    { stopContact },
  );

  await expect(attempt).rejects.toBeInstanceOf(GoogleReplyReplayError);
  expect(calls.map(({ marker }) => marker)).toEqual([
    'claim-google-reply-nonce',
  ]);
  expect(stopContact).not.toHaveBeenCalled();
});

test('a reply whose Message-ID is not bound yet falls back to its subject digest and stops the sender', async () => {
  const digest = replySubjectSha256('Engineer to engineer');
  const rawBody = reply({
    in_reply_to: '<unbound@resend.dev>',
    references: undefined,
    subject_sha256: digest,
  });
  const { executor, calls } = executorWith({
    'claim-google-reply-nonce': () => ({ rows: [{ event_key: 'nonce' }] }),
    'insert-google-mailbox-event': () => ({ rows: [{ event_key: 'event' }] }),
    'find-google-reply-job-by-rfc': () => ({ rows: [] }),
    'read-google-mailbox-recovery-pause': () => ({ rows: [{ paused: false }] }),
    'find-google-reply-subject-fallback': () => ({
      rows: [{ contact_id: contactId }],
    }),
    'lock-google-reply-contact': () => ({
      rows: [{ id: contactId, deleted_at: null }],
    }),
  });
  const stopContact = vi.fn(async () => ({}));

  const result = await processGoogleMailboxEvent(
    executor,
    {
      event: parseGoogleMailboxEvent(rawBody),
      nonce,
      timestamp,
      requestDigest: sha256Base64Url(rawBody),
      receivedAt: now,
    },
    { stopContact },
  );

  expect(result).toEqual({ applied: true, outcome: 'reply_stopped' });
  const fallback = calls.find(
    ({ marker }) => marker === 'find-google-reply-subject-fallback',
  );
  expect(fallback?.params.slice(0, 2)).toEqual([
    'developer@example.com',
    digest,
  ]);
  expect(fallback?.sql).toContain('job.rfc_message_id is null');
  expect(stopContact).toHaveBeenCalledWith(expect.anything(), {
    contactId,
    reason: 'campaign.reply_received',
    eventKey: `google:reply:${sha256Base64Url('18cafe123abd')}:stop`,
    occurredAt: now,
    source: 'google_mailbox_poller',
    provenance: {
      actor: 'mailbox_recipient',
      kind: 'mailbox_reply',
      policyVersion: 'google-reply-v1',
    },
  });
  const stored = calls
    .filter(({ marker }) => marker === 'insert-google-mailbox-event')
    .map(({ params }) => JSON.stringify(params));
  expect(stored.join('')).not.toMatch(/developer@example\.com|engineer/iu);
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
