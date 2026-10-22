import { expect, test } from 'vitest';

import { executorWith } from '../testing/fake-executor.ts';
import {
  enqueueInstallDigestJob,
  INSTALL_DIGEST_MAX_PACKAGES,
  isPersonalEmailDomain,
  markInstallDigestReported,
  PERSONAL_EMAIL_DOMAINS,
  readInstallDigestCandidates,
  readInstallDigestContext,
} from './install-digest.ts';

const keyring = {
  active: { version: 3, secret: 'install-digest-unit-secret-32-bytes!!' },
};
const observationId = '00000000-0000-4000-8000-0000000000a1';
const now = new Date('2026-10-21T15:00:00.000Z');
const availableAt = new Date('2026-10-22T14:00:00.000Z');
const token = 'a'.repeat(64);

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'dev@acme.dev',
    git_display_name: 'Dev',
    repository_provider: 'github',
    repository_owner: 'acme',
    local_origin: false,
    packages: ['@hashbrownai/core@0.8.0', '@hashbrownai/react@0.8.0'],
    install_count: '3',
    first_seen_at: '2026-10-20T10:00:00.000Z',
    last_seen_at: '2026-10-21T10:00:00.000Z',
    first_install_observation_id: observationId,
    email_lookup_hmac: 'hmac',
    email_key_version: '3',
    installation_token_digests: [token],
    ...overrides,
  };
}

test('PERSONAL_EMAIL_DOMAINS is the shared consumer mailbox list', () => {
  const domains = PERSONAL_EMAIL_DOMAINS;

  const checks = ['GMail.com', 'acme.dev'].map(isPersonalEmailDomain);

  expect(domains).toEqual([
    'aol.com',
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'icloud.com',
    'live.com',
    'me.com',
    'msn.com',
    'outlook.com',
    'proton.me',
    'protonmail.com',
    'yahoo.com',
    'ymail.com',
  ]);
  expect(checks).toEqual([true, false]);
  expect(INSTALL_DIGEST_MAX_PACKAGES).toBe(20);
});

test('readInstallDigestCandidates excludes CI, redacted, personal and known identities in SQL and fills framework, milestone and tier per batch', async () => {
  const { executor, calls } = executorWith({
    'read-install-digest-candidates': () => ({
      rows: [
        candidateRow(),
        candidateRow({
          email: 'solo@other.dev',
          first_install_observation_id: '00000000-0000-4000-8000-0000000000a2',
          installation_token_digests: null,
        }),
        candidateRow({ email: 'someone@gmail.com' }),
      ],
    }),
    'read-install-digest-runtime': () => ({
      rows: [
        {
          installation_token_digest: token,
          subject_id: 's1',
          kind: 'runtime.session_started',
          day: '2026-10-21',
          integration: 'angular',
          received_at: '2026-10-21T11:00:00.000Z',
        },
        {
          installation_token_digest: token,
          subject_id: 's1',
          kind: 'runtime.first_stream_completed',
          day: '2026-10-21',
          integration: 'angular',
          received_at: '2026-10-21T11:01:00.000Z',
        },
      ],
    }),
  });

  const candidates = await readInstallDigestCandidates(executor, {
    limit: 10,
  });

  const sql = calls[0]?.sql ?? '';
  expect(sql).toContain("o.kind = 'package.installed'");
  expect(sql).toContain('o.redacted_at is null');
  expect(sql).toContain(
    "coalesce(o.properties->>'environment', 'unknown') <> 'ci'",
  );
  expect(sql).toContain('growth_install_digest_reports');
  expect(sql).toContain('from growth_contacts c');
  expect(sql).toContain(`[1:${INSTALL_DIGEST_MAX_PACKAGES}]`);
  expect(calls[0]?.params).toEqual([10, [...PERSONAL_EMAIL_DOMAINS]]);
  expect(calls[1]?.params).toEqual([[token]]);
  expect(calls).toHaveLength(2);
  expect(candidates).toEqual([
    {
      email: 'dev@acme.dev',
      companyDomain: 'acme.dev',
      gitDisplayName: 'Dev',
      repositoryProvider: 'github',
      repositoryOwner: 'acme',
      gitConfigOrigin: 'global',
      packages: [
        { packageName: '@hashbrownai/core', packageVersion: '0.8.0' },
        { packageName: '@hashbrownai/react', packageVersion: '0.8.0' },
      ],
      installCount: 3,
      firstSeenAt: new Date('2026-10-20T10:00:00.000Z'),
      lastSeenAt: new Date('2026-10-21T10:00:00.000Z'),
      firstInstallObservationId: observationId,
      emailLookupHmac: 'hmac',
      emailKeyVersion: 3,
      framework: 'angular',
      highestMilestone: 'streamed',
      scoreTier: 'medium',
    },
    expect.objectContaining({
      email: 'solo@other.dev',
      framework: null,
      highestMilestone: 'installed',
      scoreTier: 'low',
    }),
  ]);
});

test('readInstallDigestCandidates validates the limit and skips the runtime read when nothing matches', async () => {
  const { executor, calls } = executorWith({
    'read-install-digest-candidates': () => ({ rows: [] }),
  });

  const candidates = await readInstallDigestCandidates(executor, {
    limit: 1000,
    keyring,
  });

  expect(candidates).toEqual([]);
  expect(calls.map(({ marker }) => marker)).toEqual([
    'read-install-digest-candidates',
  ]);
  for (const limit of [0, 1001, 1.5]) {
    await expect(
      readInstallDigestCandidates(executor, { limit }),
    ).rejects.toThrow(
      'Install digest limit must be an integer between 1 and 1000',
    );
  }
});

test('readInstallDigestCandidates drops a candidate whose keyring pair was reported or became a contact', async () => {
  const { executor } = executorWith({
    'read-install-digest-candidates': () => ({
      rows: [
        candidateRow(),
        candidateRow({
          email: 'kept@acme.dev',
          installation_token_digests: [],
        }),
      ],
    }),
    'read-install-digest-reported-pairs': (params) => {
      const pairs = JSON.parse(String(params[0])) as {
        email_key_version: number;
        email_lookup_hmac: string;
      }[];
      return { rows: [pairs[0]] };
    },
    'read-install-digest-runtime': () => ({ rows: [] }),
  });

  const candidates = await readInstallDigestCandidates(executor, {
    limit: 5,
    keyring,
  });

  expect(candidates.map(({ email }) => email)).toEqual(['kept@acme.dev']);
});

test('readInstallDigestContext counts anonymous and CI install subjects since a date', async () => {
  const since = new Date('2026-10-20T00:00:00.000Z');
  const { executor, calls } = executorWith({
    'read-install-digest-context': () => ({
      rows: [{ anonymous: '4', ci: 2 }],
    }),
  });

  const context = await readInstallDigestContext(executor, { since });

  expect(context).toEqual({
    since,
    anonymousInstallSubjects: 4,
    ciInstallSubjects: 2,
  });
  expect(calls[0]?.params).toEqual([since]);
  await expect(
    readInstallDigestContext(executor, { since: new Date(Number.NaN) }),
  ).rejects.toThrow('Install digest context requires a valid since date');
});

test('enqueueInstallDigestJob inserts one digest job due at the caller-supplied time', async () => {
  const { executor, calls } = executorWith({
    'install-digest-job-exists': () => ({ rows: [] }),
    'read-install-digest-candidates': () => ({ rows: [candidateRow()] }),
    'read-install-digest-reported-pairs': () => ({ rows: [] }),
    'read-install-digest-runtime': () => ({ rows: [] }),
    'enqueue-install-digest': () => ({ rows: [{ id: 'job-1' }] }),
  });

  const jobId = await enqueueInstallDigestJob(executor, {
    now,
    idempotencyKey: 'install_digest:2026-10-22',
    businessDate: '2026-10-22',
    keyring,
    availableAt,
  });

  expect(jobId).toBe('job-1');
  expect(calls.at(-1)?.params).toEqual([
    availableAt,
    'install_digest:2026-10-22',
    '2026-10-22',
  ]);
  expect(calls.at(-1)?.sql).toContain("'digest', 'pending'");
  expect(calls.at(-1)?.sql).toContain(
    'on conflict (idempotency_key) do nothing',
  );
});

test('enqueueInstallDigestJob returns null when the job exists or no candidate remains, and validates input', async () => {
  const existing = executorWith({
    'install-digest-job-exists': () => ({ rows: [{ '?column?': 1 }] }),
  });
  const empty = executorWith({
    'install-digest-job-exists': () => ({ rows: [] }),
    'read-install-digest-candidates': () => ({ rows: [] }),
  });
  const input = {
    now,
    idempotencyKey: 'install_digest:2026-10-22',
    businessDate: '2026-10-22',
    keyring,
    availableAt,
  };

  const results = [
    await enqueueInstallDigestJob(existing.executor, input),
    await enqueueInstallDigestJob(empty.executor, input),
  ];

  expect(results).toEqual([null, null]);
  await expect(
    enqueueInstallDigestJob(empty.executor, {
      ...input,
      businessDate: '10/22',
    }),
  ).rejects.toThrow('Install digest business date must be YYYY-MM-DD');
  await expect(
    enqueueInstallDigestJob(empty.executor, {
      ...input,
      idempotencyKey: 'digest:2026-10-22',
    }),
  ).rejects.toThrow(
    'Install digest idempotency key must start with install_digest:',
  );
  await expect(
    enqueueInstallDigestJob(empty.executor, {
      ...input,
      availableAt: new Date(Number.NaN),
    }),
  ).rejects.toThrow('Install digest availableAt must be a valid Date');
});

test('markInstallDigestReported records each identity once and skips an empty list', async () => {
  const reportedAt = new Date('2026-10-22T14:05:00.000Z');
  const { executor, calls } = executorWith({
    'mark-install-digest-reported': () => ({ rows: [] }),
  });

  await markInstallDigestReported(executor, {
    digestJobId: 'job-1',
    reportedAt,
    candidates: [],
  });
  await markInstallDigestReported(executor, {
    digestJobId: 'job-1',
    reportedAt,
    candidates: [
      {
        emailLookupHmac: 'hmac',
        emailKeyVersion: 3,
        firstInstallObservationId: observationId,
      },
    ],
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.sql).toContain(
    'on conflict (email_key_version, email_lookup_hmac) do nothing',
  );
  expect(calls[0]?.params.slice(0, 2)).toEqual(['job-1', reportedAt]);
  expect(JSON.parse(String(calls[0]?.params[2]))).toEqual([
    { hmac: 'hmac', version: 3, observation_id: observationId },
  ]);
});
