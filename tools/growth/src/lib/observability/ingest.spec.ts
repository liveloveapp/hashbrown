import { expect, test } from 'vitest';

import {
  createEmailLookupCandidates,
  createEmailLookupHmac,
  type EmailHmacKeyring,
} from '../crypto.ts';
import { executorWith, type MarkerHandler } from '../testing/fake-executor.ts';
import { identityDigest, publicDigest } from './canonical.ts';
import type { CollectionEventV1 } from './contracts.ts';
import { acceptObservationBatch } from './ingest.ts';

const now = new Date('2026-10-21T12:00:00.000Z');
const occurredAt = '2026-10-21T11:59:00.000Z';
const subjectA = '11111111-1111-4111-8111-111111111111';
const subjectB = '22222222-2222-4222-8222-222222222222';
const eventA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const eventB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const installationToken = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const gitEmail = 'developer@example.com';
const previousKey = {
  version: 1,
  secret: 'previous-observation-secret-32-byte',
};
const keyring: EmailHmacKeyring = {
  active: { version: 2, secret: 'active-observation-secret-32-bytes!' },
  previous: [previousKey],
};
const emptyRows = () => ({ rows: [] });

function rowId(externalId: string): string {
  return `row-${externalId}`;
}

function websiteEvent(eventId: string, subjectId: string): CollectionEventV1 {
  return {
    eventId,
    kind: 'website.content_viewed',
    occurredAt,
    collectorVersion: '1',
    subject: { id: subjectId, namespace: 'website_session', scope: 'session' },
    properties: { contentId: '/docs/react/start/quick', topic: 'react' },
  };
}

function installEvent(): CollectionEventV1 {
  return {
    eventId: eventA,
    kind: 'package.installed',
    occurredAt,
    collectorVersion: '1',
    subject: { id: subjectA, namespace: 'installation', scope: 'persistent' },
    installationToken,
    properties: {
      packageName: '@hashbrownai/core',
      packageVersion: '0.8.0',
      osFamily: 'darwin',
      architecture: 'arm64',
      nodeVersion: '22',
      environment: 'local',
      environmentEvidence: 'interactive_package_manager',
    },
    identity: {
      gitEmail,
      gitDisplayName: 'Synthetic Developer',
      gitConfigOrigin: 'global',
    },
  };
}

function publicDigestOf(event: CollectionEventV1): string {
  const publicEvent: Partial<CollectionEventV1> = { ...event };
  delete publicEvent.identity;
  return publicDigest(publicEvent);
}

function ingestExecutor(
  options: {
    stored?: Record<string, Record<string, unknown>>;
    redacted?: boolean;
    extra?: Record<string, MarkerHandler>;
  } = {},
) {
  const stored = options.stored ?? {};
  return executorWith({
    'observation-read-key-coverage': emptyRows,
    'observation-read-unfenced-deletions': emptyRows,
    'observation-insert-subject': emptyRows,
    'observation-lock-subject': (params) => ({
      rows: [{ id: rowId(String(params[1])) }],
    }),
    'observation-read-redaction': () => ({
      rows: options.redacted ? [{ '?column?': 1 }] : [],
    }),
    'observation-insert-event': (params) => ({
      rows: String(params[2]) in stored ? [] : [{ id: params[0] }],
    }),
    'observation-read-replay': (params) => ({
      rows: [stored[String(params[1])]],
    }),
    'observation-insert-identity': emptyRows,
    'observation-update-token-digest': emptyRows,
    'observation-update-subject': emptyRows,
    'observation-insert-work': emptyRows,
    ...options.extra,
  });
}

test('accepts a multi-subject batch, inserts subjects and events in sorted order, and queues work', async () => {
  const { executor, calls } = ingestExecutor();
  const batch = {
    schemaVersion: 1,
    events: [websiteEvent(eventB, subjectA), websiteEvent(eventA, subjectB)],
  };

  const result = await acceptObservationBatch(executor, 'website', batch, {
    now,
  });

  expect(result).toEqual({
    schemaVersion: 1,
    events: [
      { eventId: eventB, disposition: 'accepted' },
      { eventId: eventA, disposition: 'accepted' },
    ],
  });
  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-insert-subject',
    'observation-lock-subject',
    'observation-insert-subject',
    'observation-lock-subject',
    'observation-read-redaction',
    'observation-insert-event',
    'observation-update-subject',
    'observation-insert-work',
    'observation-read-redaction',
    'observation-insert-event',
    'observation-update-subject',
    'observation-insert-work',
  ]);
  expect(calls[1].params).toEqual(['website_session', subjectA, now]);
  expect(calls[2].params).toEqual(['website_session', subjectA]);
  expect(calls[3].params).toEqual(['website_session', subjectB, now]);
  expect(calls[5].params).toEqual([rowId(subjectB), [], []]);
  const firstId = calls[6].params[0];
  expect(calls[6].params).toEqual([
    firstId,
    'website',
    eventA,
    rowId(subjectB),
    null,
    'website.content_viewed',
    '1',
    'session',
    occurredAt,
    now,
    JSON.stringify({ contentId: '/docs/react/start/quick', topic: 'react' }),
    publicDigestOf(websiteEvent(eventA, subjectB)),
    null,
    null,
    null,
  ]);
  expect(calls[7].params).toEqual([rowId(subjectB), now]);
  expect(calls[8].params).toEqual([firstId, now]);
  expect(calls[10].params[2]).toBe(eventB);
  expect(calls[10].params[3]).toBe(rowId(subjectA));
});

test('a duplicate event returns duplicate and does not refresh the subject', async () => {
  const event = websiteEvent(eventA, subjectA);
  const { executor, calls } = ingestExecutor({
    stored: {
      [eventA]: {
        public_digest: publicDigestOf(event),
        identity_digest: null,
        identity_digest_key_version: null,
        redacted_at: null,
      },
    },
  });

  const result = await acceptObservationBatch(
    executor,
    'website',
    { schemaVersion: 1, events: [event] },
    { now },
  );

  expect(result.events).toEqual([
    { eventId: eventA, disposition: 'duplicate' },
  ]);
  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-insert-subject',
    'observation-lock-subject',
    'observation-read-redaction',
    'observation-insert-event',
    'observation-read-replay',
  ]);
  expect(calls[5].params).toEqual(['website', eventA]);
});

test('a replay of a redacted event returns redacted without comparing identity', async () => {
  const event = installEvent();
  const { executor } = ingestExecutor({
    stored: {
      [eventA]: {
        public_digest: publicDigestOf(event),
        identity_digest: null,
        identity_digest_key_version: null,
        redacted_at: now,
      },
    },
  });

  const result = await acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [event] },
    { now, keyring },
  );

  expect(result.events).toEqual([{ eventId: eventA, disposition: 'redacted' }]);
});

test('a conflicting replay rolls back the batch', async () => {
  const original = websiteEvent(eventA, subjectA);
  const { executor, calls } = ingestExecutor({
    stored: {
      [eventA]: {
        public_digest: publicDigestOf(original),
        identity_digest: null,
        identity_digest_key_version: null,
        redacted_at: null,
      },
    },
  });
  const changed = {
    ...original,
    properties: { contentId: '/blog/changed', topic: 'blog' },
  };

  const accepted = acceptObservationBatch(
    executor,
    'website',
    { schemaVersion: 1, events: [changed, websiteEvent(eventB, subjectB)] },
    { now },
  );

  await expect(accepted).rejects.toMatchObject({ code: 'event_conflict' });
  expect(calls.map((call) => call.marker).slice(-2)).toEqual([
    'observation-insert-event',
    'observation-read-replay',
  ]);
  expect(calls.some((call) => call.marker === 'observation-insert-work')).toBe(
    false,
  );
});

test('a replay compares the identity digest under the stored key version', async () => {
  const event = installEvent();
  const previousOnly: EmailHmacKeyring = { active: previousKey };
  const stored = {
    public_digest: publicDigestOf(event),
    identity_digest: identityDigest(event.identity, previousOnly).digest,
    identity_digest_key_version: 1,
    redacted_at: null,
  };
  const matching = ingestExecutor({ stored: { [eventA]: stored } });
  const mismatched = ingestExecutor({
    stored: { [eventA]: { ...stored, identity_digest_key_version: 2 } },
  });

  const result = await acceptObservationBatch(
    matching.executor,
    'install',
    { schemaVersion: 1, events: [event] },
    { now, keyring },
  );
  const conflict = acceptObservationBatch(
    mismatched.executor,
    'install',
    { schemaVersion: 1, events: [event] },
    { now, keyring },
  );

  expect(result.events).toEqual([
    { eventId: eventA, disposition: 'duplicate' },
  ]);
  await expect(conflict).rejects.toMatchObject({ code: 'event_conflict' });
});

test('an install with identity stores the identity under the active key and digests the token', async () => {
  const event = installEvent();
  const { executor, calls } = ingestExecutor();
  const candidates = createEmailLookupCandidates(gitEmail, keyring);
  const active = createEmailLookupHmac(gitEmail, keyring.active);

  const result = await acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [event] },
    { now, keyring },
  );

  expect(result.events).toEqual([{ eventId: eventA, disposition: 'accepted' }]);
  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-read-key-coverage',
    'observation-read-unfenced-deletions',
    'observation-insert-subject',
    'observation-lock-subject',
    'observation-read-redaction',
    'observation-insert-event',
    'observation-insert-identity',
    'observation-update-token-digest',
    'observation-update-subject',
    'observation-insert-work',
  ]);
  expect(calls[1].params).toEqual([[2, 1]]);
  expect(calls[5].params).toEqual([
    rowId(subjectA),
    [2, 1],
    candidates.map((candidate) => candidate.digest),
  ]);
  const id = calls[6].params[0];
  expect(calls[6].params.slice(11)).toEqual([
    publicDigestOf(event),
    identityDigest(event.identity, keyring).digest,
    2,
    null,
  ]);
  expect(calls[7].params).toEqual([
    id,
    gitEmail,
    'Synthetic Developer',
    'global',
    null,
    null,
    active.digest,
    2,
  ]);
  expect(calls[8].params).toEqual([id, publicDigest({ installationToken })]);
});

test('a fenced subject or email is stored redacted without identity', async () => {
  const event = installEvent();
  const { executor, calls } = ingestExecutor({ redacted: true });

  const result = await acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [event] },
    { now, keyring },
  );

  expect(result.events).toEqual([{ eventId: eventA, disposition: 'redacted' }]);
  expect(calls.map((call) => call.marker).slice(5)).toEqual([
    'observation-read-redaction',
    'observation-insert-event',
    'observation-update-token-digest',
    'observation-update-subject',
    'observation-insert-work',
  ]);
  expect(calls[6].params.slice(12)).toEqual([null, null, now]);
});

test('identity without a keyring throws identity_key_unavailable', async () => {
  const { executor, calls } = ingestExecutor();

  const accepted = acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [installEvent()] },
    { now },
  );

  await expect(accepted).rejects.toMatchObject({
    code: 'identity_key_unavailable',
  });
  expect(calls.map((call) => call.marker)).toEqual(['privacy-lock']);
});

test('an email fence under a key outside the keyring throws identity_key_unavailable', async () => {
  const { executor } = ingestExecutor({
    extra: {
      'observation-read-key-coverage': () => ({ rows: [{ '?column?': 1 }] }),
    },
  });

  const accepted = acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [installEvent()] },
    { now, keyring },
  );

  await expect(accepted).rejects.toMatchObject({
    code: 'identity_key_unavailable',
  });
});

test('a deleted contact without an email fence throws redaction_initialization_required', async () => {
  const { executor, calls } = ingestExecutor({
    extra: {
      'observation-read-unfenced-deletions': () => ({
        rows: [{ '?column?': 1 }],
      }),
    },
  });

  const accepted = acceptObservationBatch(
    executor,
    'install',
    { schemaVersion: 1, events: [installEvent()] },
    { now, keyring },
  );

  await expect(accepted).rejects.toMatchObject({
    code: 'redaction_initialization_required',
  });
  expect(calls.at(-1)?.sql).toContain('growth_contacts');
});
