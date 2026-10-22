import { expect, test } from 'vitest';

import {
  createEmailLookupCandidates,
  type EmailHmacKey,
  type EmailHmacKeyring,
} from '../crypto.ts';
import { executorWith, type MarkerHandler } from '../testing/fake-executor.ts';
import { identityDigest, publicDigest } from './canonical.ts';
import type { CollectionEventV1 } from './contracts.ts';
import { acceptObservationBatch } from './ingest.ts';
import {
  initializeObservationRedactions,
  redactObservationEvidence,
} from './redaction.ts';

const now = new Date('2026-10-21T12:00:00.000Z');
const operationId = '33333333-3333-4333-8333-333333333333';
const subjectId = '44444444-4444-4444-8444-444444444444';
const observationId = '55555555-5555-4555-8555-555555555555';
const contactA = '66666666-6666-4666-8666-666666666666';
const contactB = '77777777-7777-4777-8777-777777777777';
const contactC = '88888888-8888-4888-8888-888888888888';
const email = 'developer@example.com';
const previousKey: EmailHmacKey = {
  version: 1,
  secret: 'previous-redaction-secret-32-bytes!',
};
const activeKey: EmailHmacKey = {
  version: 2,
  secret: 'active-redaction-secret-32-bytes!!',
};
const keyring: EmailHmacKeyring = {
  active: activeKey,
  previous: [previousKey],
};
const emptyRows = () => ({ rows: [] });

const REDACTION_MARKERS = [
  'observation-select-redaction-targets',
  'observation-insert-fence',
  'observation-lock-redaction-work',
  'observation-delete-identities',
  'observation-redact-observations',
  'observation-delete-redacted-facts',
  'observation-reset-redacted-work',
];

/** Handlers for one redaction; fences land in `fences` as `version:digest`. */
function redactionHandlers(
  options: {
    targets?: Record<string, unknown>[];
    operation?: Record<string, unknown>;
    fences?: Set<string>;
  } = {},
): Record<string, MarkerHandler> {
  return {
    'observation-lock-operation': emptyRows,
    'observation-read-operation': () => ({
      rows: options.operation ? [options.operation] : [],
    }),
    'observation-select-redaction-targets': () => ({
      rows: options.targets ?? [],
    }),
    'observation-insert-fence': (params, sql) => {
      if (sql.includes("'email'"))
        options.fences?.add(`${params[1]}:${params[0]}`);
      return emptyRows();
    },
    'observation-lock-redaction-work': emptyRows,
    'observation-delete-identities': emptyRows,
    'observation-redact-observations': emptyRows,
    'observation-delete-redacted-facts': emptyRows,
    'observation-reset-redacted-work': emptyRows,
    'observation-insert-operation': emptyRows,
  };
}

function installEvent(): CollectionEventV1 {
  return {
    eventId: '99999999-9999-4999-8999-999999999999',
    kind: 'package.installed',
    occurredAt: '2026-10-21T11:59:00.000Z',
    collectorVersion: '1',
    subject: { id: subjectId, namespace: 'installation', scope: 'persistent' },
    installationToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    properties: {
      packageName: '@hashbrownai/core',
      packageVersion: '0.8.0',
      osFamily: 'darwin',
      architecture: 'arm64',
      nodeVersion: '22',
      environment: 'local',
      environmentEvidence: 'interactive_package_manager',
    },
    identity: { gitEmail: email },
  };
}

test('redacting by email fences every candidate key version and scrubs identity', async () => {
  const candidates = createEmailLookupCandidates(email, keyring);
  const { executor, calls } = executorWith(
    redactionHandlers({
      targets: [
        {
          observation_id: observationId,
          email_lookup_hmac: 'stored-hmac',
          email_key_version: 2,
        },
      ],
    }),
  );

  const result = await redactObservationEvidence(
    executor,
    { email: ' Developer@Example.COM ' },
    { operationId, now, keyring },
  );

  expect(result).toEqual({ selectedCount: 1 });
  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-lock-operation',
    'observation-read-operation',
    'observation-select-redaction-targets',
    'observation-insert-fence',
    'observation-insert-fence',
    'observation-insert-fence',
    ...REDACTION_MARKERS.slice(2),
    'observation-insert-operation',
  ]);
  expect(calls[0].sql).toContain('pg_advisory_xact_lock(');
  expect(calls[0].sql).not.toContain('_shared');
  expect(calls[1].params).toEqual([`observation-operation:${operationId}`]);
  expect(calls[2].params).toEqual([operationId]);
  expect(calls[3].params).toEqual([
    null,
    email,
    candidates.map((c) => c.keyVersion),
    candidates.map((c) => c.digest),
  ]);
  expect(calls.slice(4, 7).map((call) => call.params)).toEqual([
    [candidates[0].digest, candidates[0].keyVersion, now],
    [candidates[1].digest, candidates[1].keyVersion, now],
    ['stored-hmac', 2, now],
  ]);
  expect(candidates.map((c) => c.keyVersion)).toEqual([2, 1]);
  expect(calls[7].params).toEqual([[observationId]]);
  expect(calls[8].params).toEqual([[observationId]]);
  expect(calls[9].params).toEqual([[observationId], now]);
  expect(calls[9].sql).toContain('identity_digest=null');
  expect(calls[9].sql).toContain('redacted_at=coalesce(redacted_at,$2)');
  expect(calls[10].params).toEqual([[observationId]]);
  expect(calls[11].params).toEqual([[observationId], now]);
  expect(calls[11].sql).toContain("status='pending'");
  expect(calls[11].sql).toContain('generation=generation+1');
  expect(calls[12].params).toEqual([
    operationId,
    now,
    `2:${identityDigest({ email }, keyring).digest}`,
    1,
  ]);
});

test('redacting by subject writes the subject fence under key version zero', async () => {
  const { executor, calls } = executorWith(
    redactionHandlers({
      targets: [
        {
          observation_id: observationId,
          email_lookup_hmac: null,
          email_key_version: null,
        },
      ],
    }),
  );

  const result = await redactObservationEvidence(
    executor,
    { subjectId },
    { operationId, now, keyring },
  );

  expect(result).toEqual({ selectedCount: 1 });
  expect(calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-lock-operation',
    'observation-read-operation',
    ...REDACTION_MARKERS,
    'observation-insert-operation',
  ]);
  expect(calls[3].params).toEqual([subjectId, null, [], []]);
  expect(calls[4].sql).toContain("'subject'");
  expect(calls[4].params).toEqual([subjectId, now]);
  expect(calls[10].params).toEqual([
    operationId,
    now,
    publicDigest({ subjectId }),
    1,
  ]);
});

test('a fence written under the previous key suppresses an install signed with the active key', async () => {
  const fences = new Set<string>();
  const before = executorWith(redactionHandlers({ fences }));
  await redactObservationEvidence(
    before.executor,
    { email },
    { operationId, now, keyring: { active: previousKey } },
  );
  const ingest = executorWith({
    'observation-read-key-coverage': emptyRows,
    'observation-read-unfenced-deletions': emptyRows,
    'observation-insert-subject': emptyRows,
    'observation-lock-subject': () => ({ rows: [{ id: 'subject-row' }] }),
    'observation-read-redaction': (params) => {
      const versions = params[1] as number[];
      const digests = params[2] as string[];
      return {
        rows: versions.some((v, i) => fences.has(`${v}:${digests[i]}`))
          ? [{ '?column?': 1 }]
          : [],
      };
    },
    'observation-insert-event': (params) => ({ rows: [{ id: params[0] }] }),
    'observation-update-token-digest': emptyRows,
    'observation-update-subject': emptyRows,
    'observation-insert-work': emptyRows,
  });

  const result = await acceptObservationBatch(
    ingest.executor,
    'install',
    { schemaVersion: 1, events: [installEvent()] },
    { now, keyring },
  );

  expect([...fences]).toEqual([
    `1:${createEmailLookupCandidates(email, { active: previousKey })[0].digest}`,
  ]);
  expect(result.events).toEqual([
    { eventId: installEvent().eventId, disposition: 'redacted' },
  ]);
  expect(ingest.calls.map((call) => call.marker)).not.toContain(
    'observation-insert-identity',
  );
});

test('redaction is idempotent by operation id and conflicts on a different selection', async () => {
  const stored = {
    kind: 'redact',
    selection_digest: `1:${identityDigest({ email }, { active: previousKey }).digest}`,
    selected_count: 3,
  };
  const repeat = executorWith(redactionHandlers({ operation: stored }));
  const otherEmail = executorWith(redactionHandlers({ operation: stored }));
  const replayKind = executorWith(
    redactionHandlers({ operation: { ...stored, kind: 'replay' } }),
  );
  const subjectSelector = executorWith(
    redactionHandlers({ operation: stored }),
  );

  const result = await redactObservationEvidence(
    repeat.executor,
    { email },
    { operationId, now, keyring },
  );
  const conflicts = [
    redactObservationEvidence(
      otherEmail.executor,
      { email: 'other@example.com' },
      { operationId, now, keyring },
    ),
    redactObservationEvidence(
      replayKind.executor,
      { email },
      { operationId, now, keyring },
    ),
    redactObservationEvidence(
      subjectSelector.executor,
      { subjectId },
      { operationId, now, keyring },
    ),
  ];

  expect(result).toEqual({ selectedCount: 3 });
  expect(repeat.calls.map((call) => call.marker)).toEqual([
    'privacy-lock',
    'observation-lock-operation',
    'observation-read-operation',
  ]);
  for (const conflict of conflicts)
    await expect(conflict).rejects.toThrow('operation_conflict');
});

test('redaction rejects an invalid operation id or time before opening a transaction', async () => {
  const { executor, calls } = executorWith(redactionHandlers());

  const badId = redactObservationEvidence(
    executor,
    { email },
    { operationId: 'nope', now, keyring },
  );
  const badTime = redactObservationEvidence(
    executor,
    { email },
    { operationId, now: new Date(Number.NaN), keyring },
  );

  await expect(badId).rejects.toThrow('invalid_payload');
  await expect(badTime).rejects.toThrow('invalid_payload');
  expect(calls).toEqual([]);
});

test('initializeObservationRedactions backfills fences for deleted contacts with a cursor', async () => {
  const contactKey = createEmailLookupCandidates(email, keyring)[0];
  const { executor, calls } = executorWith({
    ...redactionHandlers(),
    'observation-read-deleted-contacts': () => ({
      rows: [{ id: contactA }, { id: contactB }, { id: contactC }],
    }),
    'observation-lock-deleted-contact': emptyRows,
    'observation-read-contact-identity': (params) => ({
      rows:
        params[0] === contactA
          ? [
              {
                email_normalized: null,
                email_lookup_hmac: contactKey.digest,
                email_hmac_key_version: contactKey.keyVersion,
              },
            ]
          : [],
    }),
    'observation-read-contact-aliases': () => ({
      rows: [{ digest: 'alias-hmac', version: 1 }],
    }),
  });

  const result = await initializeObservationRedactions(
    executor,
    { limit: 2, cursor: subjectId },
    now,
  );
  const invalid = initializeObservationRedactions(executor, { limit: 101 });

  expect(result).toEqual({ processed: 2, nextCursor: contactB });
  expect(calls.map((call) => call.marker)).toEqual([
    'observation-read-deleted-contacts',
    'privacy-lock',
    'observation-lock-deleted-contact',
    'privacy-lock',
    'observation-read-contact-identity',
    'observation-read-contact-aliases',
    'observation-select-redaction-targets',
    'observation-insert-fence',
    'observation-insert-fence',
    ...REDACTION_MARKERS.slice(2),
    'privacy-lock',
    'observation-lock-deleted-contact',
    'privacy-lock',
    'observation-read-contact-identity',
  ]);
  expect(calls[0].params).toEqual([subjectId, 3]);
  expect(calls[2].params).toEqual([contactA]);
  expect(calls[5].params).toEqual([contactA]);
  expect(calls[6].params).toEqual([
    null,
    null,
    [contactKey.keyVersion, 1],
    [contactKey.digest, 'alias-hmac'],
  ]);
  expect(calls[7].params).toEqual([
    contactKey.digest,
    contactKey.keyVersion,
    now,
  ]);
  expect(calls[8].params).toEqual(['alias-hmac', 1, now]);
  expect(calls[15].params).toEqual([contactB]);
  await expect(invalid).rejects.toThrow('invalid_payload');
});
