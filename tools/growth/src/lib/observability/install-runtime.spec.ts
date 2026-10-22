import { expect, test } from 'vitest';

import { executorWith } from '../testing/fake-executor.ts';
import { processInstallRuntimeActivations } from './install-runtime.ts';

const keyring = {
  active: { version: 4, secret: 'install-runtime-unit-secret-32-bytes!' },
};
const now = new Date('2026-10-21T15:00:00.000Z');
const ids = {
  personalRuntime: '00000000-0000-4000-8000-000000000001',
  conflictRuntime: '00000000-0000-4000-8000-000000000002',
  workRuntime: '00000000-0000-4000-8000-000000000003',
  ciRuntime: '00000000-0000-4000-8000-000000000004',
  personalInstall: '00000000-0000-4000-8000-000000000011',
  conflictInstallA: '00000000-0000-4000-8000-000000000012',
  conflictInstallB: '00000000-0000-4000-8000-000000000013',
  workInstall: '00000000-0000-4000-8000-000000000014',
  ciInstall: '00000000-0000-4000-8000-000000000015',
  contact: '00000000-0000-4000-8000-000000000021',
};

function install(id: string, email: string | null, environment = 'local') {
  return { id, email_normalized: email, redacted_at: null, environment };
}

test('processInstallRuntimeActivations does nothing while disabled and validates its input', async () => {
  const { executor, calls } = executorWith({});

  const counts = await processInstallRuntimeActivations(executor, {
    enabled: false,
    limit: 10,
    now,
    keyring,
  });

  expect(counts).toEqual({
    approved: 0,
    ineligible: 0,
    conflicted: 0,
    disabled: true,
  });
  expect(calls).toEqual([]);
  for (const input of [
    { limit: 0, now },
    { limit: 101, now },
    { limit: 5, now: new Date(Number.NaN) },
  ]) {
    await expect(
      processInstallRuntimeActivations(executor, {
        enabled: true,
        keyring,
        ...input,
      }),
    ).rejects.toThrow('invalid_activation_input');
  }
});

test('processInstallRuntimeActivations links by installation token and approves only one non-CI work email', async () => {
  const installs: Record<string, Record<string, unknown>[]> = {
    personal: [install(ids.personalInstall, 'someone@gmail.com')],
    conflict: [
      install(ids.conflictInstallA, 'a@acme.dev'),
      install(ids.conflictInstallB, 'b@acme.dev'),
    ],
    work: [install(ids.workInstall, 'dev@acme.dev')],
    ci: [install(ids.ciInstall, 'ci@acme.dev', 'ci')],
  };
  const { executor, calls } = executorWith({
    'observation-read-key-coverage': () => ({ rows: [] }),
    'observation-read-unfenced-deletions': () => ({ rows: [] }),
    'read-install-runtime-candidates': () => ({
      rows: [
        { id: ids.personalRuntime, installation_token_digest: 'personal' },
        { id: ids.conflictRuntime, installation_token_digest: 'conflict' },
        { id: ids.workRuntime, installation_token_digest: 'work' },
        { id: ids.ciRuntime, installation_token_digest: 'ci' },
      ],
    }),
    'read-install-runtime-installs': (params) => ({
      rows: installs[String(params[0])] ?? [],
    }),
    'lock-email': () => ({ rows: [] }),
    'read-key-versions': () => ({ rows: [] }),
    'find-install-runtime-contact': () => ({ rows: [] }),
    'insert-install-runtime-contact': () => ({
      rows: [
        {
          id: ids.contact,
          email_lookup_hmac: 'x',
          email_hmac_key_version: 4,
          outreach_approved_at: null,
          deleted_at: null,
          updated_at: now,
        },
      ],
    }),
    'find-hard-stops': () => ({ rows: [] }),
    'set-install-runtime-approval': () => ({ rows: [{ id: ids.contact }] }),
    'insert-activity': () => ({ rows: [{ event_key: 'k' }] }),
    'insert-install-runtime-link': () => ({ rows: [] }),
  });

  const counts = await processInstallRuntimeActivations(executor, {
    enabled: true,
    limit: 10,
    now,
    keyring,
  });

  expect(counts).toEqual({
    approved: 1,
    ineligible: 2,
    conflicted: 1,
    disabled: false,
  });
  const candidatesSql =
    calls.find(({ marker }) => marker === 'read-install-runtime-candidates')
      ?.sql ?? '';
  expect(candidatesSql).toContain("r.kind = 'runtime.session_started'");
  expect(candidatesSql).toContain(
    'i.installation_token_digest = r.installation_token_digest',
  );
  expect(candidatesSql).not.toContain('packageName');
  const links = calls
    .filter(({ marker }) => marker === 'insert-install-runtime-link')
    .map(({ params }) => params.slice(0, 4));
  expect(links).toEqual([
    [ids.personalRuntime, ids.personalInstall, null, 'ineligible'],
    [ids.conflictRuntime, ids.conflictInstallA, null, 'conflicted'],
    [ids.workRuntime, ids.workInstall, ids.contact, 'approved'],
    [ids.ciRuntime, null, null, 'ineligible'],
  ]);
  const inserted = calls.find(
    ({ marker }) => marker === 'insert-install-runtime-contact',
  );
  expect(inserted?.params[0]).toBe('dev@acme.dev');
  expect(inserted?.params[3]).toBe('install_runtime');
  const activity = calls.find(({ marker }) => marker === 'insert-activity');
  expect(activity?.params[3]).toBe('install_runtime.outreach_approved');
  expect(JSON.parse(String(activity?.params[4]))).toEqual({
    install_observation_id: ids.workInstall,
    runtime_observation_id: ids.workRuntime,
    policy_version: 'growth-v1',
    verification: 'linked_observations',
  });
  expect(
    calls.filter(({ marker }) => marker === 'insert-install-runtime-contact'),
  ).toHaveLength(1);
});

test('processInstallRuntimeActivations never approves when a redacted install shares the token with an unredacted work email', async () => {
  const runtimeId = '00000000-0000-4000-8000-000000000031';
  const workInstall = '00000000-0000-4000-8000-000000000032';
  const redactedInstall = '00000000-0000-4000-8000-000000000033';
  const { executor, calls } = executorWith({
    'observation-read-key-coverage': () => ({ rows: [] }),
    'observation-read-unfenced-deletions': () => ({ rows: [] }),
    'read-install-runtime-candidates': () => ({
      rows: [{ id: runtimeId, installation_token_digest: 'shared' }],
    }),
    'read-install-runtime-installs': () => ({
      rows: [
        install(workInstall, 'dev@acme.dev'),
        {
          id: redactedInstall,
          email_normalized: null,
          redacted_at: now,
          environment: 'local',
        },
      ],
    }),
    'insert-install-runtime-link': () => ({ rows: [] }),
  });

  const counts = await processInstallRuntimeActivations(executor, {
    enabled: true,
    limit: 10,
    now,
    keyring,
  });

  expect(counts).toEqual({
    approved: 0,
    ineligible: 1,
    conflicted: 0,
    disabled: false,
  });
  expect(
    calls
      .filter(({ marker }) => marker === 'insert-install-runtime-link')
      .map(({ params }) => params.slice(0, 4)),
  ).toEqual([[runtimeId, workInstall, null, 'ineligible']]);
  expect(calls.map(({ marker }) => marker)).not.toContain(
    'insert-install-runtime-contact',
  );
});
