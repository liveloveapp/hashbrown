import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { nextPacificBusinessMorning } from '../src/lib/campaign-schedule.ts';
import { approveContactFromInstallDigest } from '../src/lib/contacts.ts';
import {
  createEmailLookupHmac,
  type EmailHmacKeyring,
} from '../src/lib/crypto.ts';
import type { SqlExecutor } from '../src/lib/database.ts';
import type {
  CollectionEventV1,
  CollectionSource,
} from '../src/lib/observability/contracts.ts';
import { acceptObservationBatch } from '../src/lib/observability/ingest.ts';
import {
  enqueueInstallDigestJob,
  markInstallDigestReported,
  readInstallDigestCandidates,
} from '../src/lib/observability/install-digest.ts';
import { processInstallRuntimeActivations } from '../src/lib/observability/install-runtime.ts';
import { deleteCreatedContacts } from './job-fixtures.ts';
import {
  cleanEvidence,
  evidenceDatabase,
  evidenceKeys,
} from './observability-fixtures.ts';

let db: SqlExecutor;
const subjects: string[] = [];
const emails: string[] = [];
const contactIds = new Set<string>();
const jobIds: string[] = [];
const rotatedKeys: EmailHmacKeyring = {
  active: {
    version: 778,
    secret: 'rotated-observation-fixture-secret-32-bytes',
  },
  previous: [evidenceKeys.active],
};

beforeAll(async () => {
  db = await evidenceDatabase();
});

afterAll(async () => {
  const contacts = await db.execute<{ id: string }>(
    'select id from growth_contacts where email_normalized = any($1::citext[])',
    [emails],
  );
  for (const { id } of contacts.rows) contactIds.add(id);
  await db.execute(
    'delete from growth_install_digest_reports where digest_job_id = any($1::uuid[])',
    [jobIds],
  );
  await db.execute('delete from growth_jobs where id = any($1::uuid[])', [
    jobIds,
  ]);
  await deleteCreatedContacts(db, contactIds);
  await cleanEvidence(db, { subjects, emails });
  await db.close?.();
});

/** A fresh synthetic mailbox on a domain; recorded for cleanup. */
function mailbox(domain = 'acme-lifecycle.dev'): string {
  const email = `dev-${randomUUID()}@${domain}`;
  emails.push(email);
  return email;
}

function installEvent(input: {
  email?: string;
  token?: string;
  environment?: 'local' | 'ci';
  packageVersion?: string;
  subjectId?: string;
}): CollectionEventV1 {
  const subjectId = input.subjectId ?? randomUUID();
  subjects.push(subjectId);
  const environment = input.environment ?? 'local';
  return {
    eventId: randomUUID(),
    kind: 'package.installed',
    occurredAt: '',
    collectorVersion: '1',
    subject: { id: subjectId, namespace: 'installation', scope: 'persistent' },
    ...(input.token ? { installationToken: input.token } : {}),
    properties: {
      packageName: '@hashbrownai/core',
      packageVersion: input.packageVersion ?? '0.8.0',
      osFamily: 'linux',
      architecture: 'x64',
      nodeVersion: '24',
      environment,
      environmentEvidence:
        environment === 'ci' ? 'github_actions' : 'interactive_package_manager',
    },
    ...(input.email
      ? {
          identity: {
            gitEmail: input.email,
            gitDisplayName: 'Synthetic Developer',
            gitConfigOrigin: 'global' as const,
          },
        }
      : {}),
  };
}

function runtimeEvent(input: {
  token: string;
  kind?: string;
  integration?: 'react' | 'angular';
  subjectId?: string;
}): CollectionEventV1 {
  const subjectId = input.subjectId ?? randomUUID();
  subjects.push(subjectId);
  const integration = input.integration ?? 'react';
  return {
    eventId: randomUUID(),
    kind: input.kind ?? 'runtime.session_started',
    occurredAt: '',
    collectorVersion: '1',
    subject: {
      id: subjectId,
      namespace: 'development_browser',
      scope: 'persistent',
    },
    sessionId: randomUUID(),
    installationToken: input.token,
    properties: {
      packageName: `@hashbrownai/${integration}`,
      packageVersion: '0.8.0',
      integration,
      transport: 'http',
    },
  };
}

/** Accepts events at `at` and returns their observation ids in order. */
async function accept(
  source: CollectionSource,
  events: CollectionEventV1[],
  at: Date,
  keyring: EmailHmacKeyring = evidenceKeys,
): Promise<string[]> {
  const stamped = events.map((event) => ({
    ...event,
    occurredAt: at.toISOString(),
  }));
  await acceptObservationBatch(
    db,
    source,
    { schemaVersion: 1, events: stamped },
    { now: at, keyring },
  );
  const rows = await db.execute<{ id: string; event_id: string }>(
    'select id, event_id from growth_observations where source = $1 and event_id = any($2::uuid[])',
    [source, stamped.map(({ eventId }) => eventId)],
  );
  const byEvent = new Map(rows.rows.map((row) => [row.event_id, row.id]));
  return stamped.map(({ eventId }) => byEvent.get(eventId) as string);
}

/** Runs activations until every runtime observation has a link decision. */
async function activate(
  runtimeIds: readonly string[],
  now: Date,
  keyring: EmailHmacKeyring = evidenceKeys,
): Promise<
  Map<
    string,
    {
      outcome: string;
      contact_id: string | null;
      install_observation_id: string | null;
    }
  >
> {
  for (let pass = 0; pass < 20; pass++) {
    const links = await db.execute<{
      runtime_observation_id: string;
      install_observation_id: string | null;
      contact_id: string | null;
      outcome: string;
    }>(
      'select * from growth_install_runtime_links where runtime_observation_id = any($1::uuid[])',
      [runtimeIds],
    );
    if (links.rows.length === runtimeIds.length) {
      for (const row of links.rows) {
        if (row.contact_id) contactIds.add(row.contact_id);
      }
      return new Map(
        links.rows.map((row) => [row.runtime_observation_id, row]),
      );
    }
    await processInstallRuntimeActivations(db, {
      enabled: true,
      limit: 100,
      now,
      keyring,
    });
  }
  throw new Error('install runtime activations did not settle');
}

test('digest candidates exclude CI, redacted, personal-domain, contact-matched and already-reported identities and group package@version newest 20', async () => {
  const now = new Date();
  const later = new Date(now.getTime() + 1_000);
  const work = mailbox();
  const installOnly = mailbox();
  const ci = mailbox();
  const redacted = mailbox();
  const personal = mailbox('gmail.com');
  const contactMatched = mailbox();
  const reported = mailbox();
  const token = randomUUID();
  const workSubject = randomUUID();
  await accept(
    'install',
    Array.from({ length: 20 }, (_, index) =>
      installEvent({
        email: work,
        packageVersion: `0.8.${index}`,
        subjectId: workSubject,
      }),
    ),
    now,
  );
  await accept(
    'install',
    [installEvent({ email: work, token, packageVersion: '0.9.0' })],
    later,
  );
  const browser = randomUUID();
  await accept(
    'runtime',
    [
      runtimeEvent({ token, subjectId: browser, integration: 'angular' }),
      runtimeEvent({
        token,
        subjectId: browser,
        integration: 'angular',
        kind: 'runtime.first_stream_completed',
      }),
    ],
    later,
  );
  const [installOnlyId] = await accept(
    'install',
    [installEvent({ email: installOnly })],
    now,
  );
  await accept(
    'install',
    [installEvent({ email: ci, environment: 'ci' })],
    now,
  );
  const [redactedId] = await accept(
    'install',
    [installEvent({ email: redacted })],
    now,
  );
  await db.execute(
    'update growth_observations set redacted_at = $2 where id = $1',
    [redactedId, now],
  );
  await accept('install', [installEvent({ email: personal })], now);
  await accept('install', [installEvent({ email: contactMatched })], now);
  const contactLookup = createEmailLookupHmac(
    contactMatched,
    evidenceKeys.active,
  );
  const contact = await db.execute<{ id: string }>(
    `insert into growth_contacts (email_normalized, email_lookup_hmac, email_hmac_key_version, source)
     values ($1, $2, $3, 'install-lifecycle-integration') returning id`,
    [contactMatched, contactLookup.digest, contactLookup.keyVersion],
  );
  contactIds.add(contact.rows[0]?.id as string);
  const [reportedId] = await accept(
    'install',
    [installEvent({ email: reported })],
    now,
  );
  const reportJob = await db.execute<{ id: string }>(
    `insert into growth_jobs (kind, status, available_at, idempotency_key, payload)
     values ('digest', 'completed', $1, $2, '{}'::jsonb) returning id`,
    [now, `install-lifecycle-integration:${randomUUID()}`],
  );
  const reportJobId = reportJob.rows[0]?.id as string;
  jobIds.push(reportJobId);
  const reportedLookup = createEmailLookupHmac(reported, evidenceKeys.active);
  await markInstallDigestReported(db, {
    digestJobId: reportJobId,
    reportedAt: now,
    candidates: [
      {
        emailLookupHmac: reportedLookup.digest,
        emailKeyVersion: reportedLookup.keyVersion,
        firstInstallObservationId: reportedId as string,
      },
    ],
  });
  const mine = new Set(emails);

  const candidates = (
    await readInstallDigestCandidates(db, {
      limit: 1000,
      keyring: evidenceKeys,
    })
  ).filter(({ email }) => mine.has(email));

  expect(candidates.map(({ email }) => email).sort()).toEqual(
    [work, installOnly].sort(),
  );
  const workCandidate = candidates.find(({ email }) => email === work);
  expect(workCandidate).toMatchObject({
    companyDomain: 'acme-lifecycle.dev',
    installCount: 21,
    framework: 'angular',
    highestMilestone: 'streamed',
    scoreTier: 'medium',
  });
  expect(workCandidate?.packages).toHaveLength(20);
  expect(workCandidate?.packages[0]).toEqual({
    packageName: '@hashbrownai/core',
    packageVersion: '0.9.0',
  });
  expect(workCandidate?.lastSeenAt).toEqual(later);
  expect(candidates.find(({ email }) => email === installOnly)).toMatchObject({
    firstInstallObservationId: installOnlyId,
    framework: null,
    highestMilestone: 'installed',
    scoreTier: 'low',
  });
});

test('enqueueInstallDigestJob is idempotent per business date and due at the next Pacific business morning', async () => {
  const now = new Date();
  await accept('install', [installEvent({ email: mailbox() })], now);
  const availableAt = nextPacificBusinessMorning(now);
  const idempotencyKey = `install_digest:2031-${randomUUID()}`;
  const input = {
    now,
    idempotencyKey,
    businessDate: '2031-03-04',
    keyring: evidenceKeys,
    availableAt,
  };

  const first = await enqueueInstallDigestJob(db, input);
  const second = await enqueueInstallDigestJob(db, input);

  expect(first).toEqual(expect.any(String));
  jobIds.push(first as string);
  expect(second).toBeNull();
  const jobs = await db.execute<{
    kind: string;
    status: string;
    available_at: Date;
    payload: Record<string, unknown>;
  }>(
    'select kind, status, available_at, payload from growth_jobs where idempotency_key = $1',
    [idempotencyKey],
  );
  expect(jobs.rows).toHaveLength(1);
  expect(jobs.rows[0]).toMatchObject({
    kind: 'digest',
    status: 'pending',
    payload: { business_date: '2031-03-04', digest_kind: 'install_identities' },
  });
  expect(new Date(jobs.rows[0]?.available_at as Date)).toEqual(availableAt);
});

test('hello activation outcomes: approved for one work email; ineligible for CI, redacted, personal domain; conflicted for two emails; one contact across key rotation', async () => {
  const now = new Date();
  const work = mailbox();
  const tokens = {
    work: randomUUID(),
    ci: randomUUID(),
    redacted: randomUUID(),
    personal: randomUUID(),
    conflict: randomUUID(),
    rotated: randomUUID(),
  };
  const [workInstall] = await accept(
    'install',
    [installEvent({ email: work, token: tokens.work })],
    now,
  );
  await accept(
    'install',
    [
      installEvent({ email: mailbox(), token: tokens.ci, environment: 'ci' }),
      installEvent({ email: mailbox('gmail.com'), token: tokens.personal }),
      installEvent({ email: mailbox(), token: tokens.conflict }),
      installEvent({ email: mailbox(), token: tokens.conflict }),
    ],
    now,
  );
  const [redactedInstall] = await accept(
    'install',
    [installEvent({ email: mailbox(), token: tokens.redacted })],
    now,
  );
  await db.execute(
    'delete from growth_observation_identities where observation_id = $1',
    [redactedInstall],
  );
  await db.execute(
    'update growth_observations set redacted_at = $2 where id = $1',
    [redactedInstall, now],
  );
  const [
    workRuntime,
    ciRuntime,
    redactedRuntime,
    personalRuntime,
    conflictRuntime,
  ] = await accept(
    'runtime',
    [
      runtimeEvent({ token: tokens.work }),
      runtimeEvent({ token: tokens.ci }),
      runtimeEvent({ token: tokens.redacted }),
      runtimeEvent({ token: tokens.personal }),
      runtimeEvent({ token: tokens.conflict }),
    ],
    now,
  );

  const links = await activate(
    [workRuntime, ciRuntime, redactedRuntime, personalRuntime, conflictRuntime],
    now,
  );
  await accept(
    'install',
    [installEvent({ email: work, token: tokens.rotated })],
    now,
    rotatedKeys,
  );
  const [rotatedRuntime] = await accept(
    'runtime',
    [runtimeEvent({ token: tokens.rotated })],
    now,
  );
  const rotatedLinks = await activate([rotatedRuntime], now, rotatedKeys);

  const outcomes = [
    workRuntime,
    ciRuntime,
    redactedRuntime,
    personalRuntime,
    conflictRuntime,
  ].map((id) => links.get(id)?.outcome);
  expect(outcomes).toEqual([
    'approved',
    'ineligible',
    'ineligible',
    'ineligible',
    'conflicted',
  ]);
  const approved = links.get(workRuntime);
  expect(approved?.install_observation_id).toBe(workInstall);
  const contactId = approved?.contact_id as string;
  expect(contactId).toEqual(expect.any(String));
  for (const id of [
    ciRuntime,
    redactedRuntime,
    personalRuntime,
    conflictRuntime,
  ]) {
    expect(links.get(id)?.contact_id).toBeNull();
  }
  expect(rotatedLinks.get(rotatedRuntime)).toMatchObject({
    outcome: 'approved',
    contact_id: contactId,
  });
  const contacts = await db.execute<{
    id: string;
    source: string;
    outreach_approved_at: Date | null;
    email_hmac_key_version: number;
  }>(
    `select id, source, outreach_approved_at, email_hmac_key_version
     from growth_contacts where email_normalized = $1`,
    [work],
  );
  expect(contacts.rows).toHaveLength(1);
  expect(contacts.rows[0]).toMatchObject({
    id: contactId,
    source: 'install_runtime',
    email_hmac_key_version: evidenceKeys.active.version,
  });
  expect(new Date(contacts.rows[0]?.outreach_approved_at as Date)).toEqual(now);
  const activity = await db.execute<{
    event_key: string;
    data: Record<string, unknown>;
  }>(
    `select event_key, data from growth_activity
     where contact_id = $1 and kind = 'install_runtime.outreach_approved'`,
    [contactId],
  );
  expect(activity.rows).toEqual([
    {
      event_key: `install_runtime.outreach_approved:${contactId}`,
      data: {
        install_observation_id: workInstall,
        runtime_observation_id: workRuntime,
        policy_version: 'growth-v1',
        verification: 'linked_observations',
      },
    },
  ]);
  const personalContacts = await db.execute(
    `select 1 from growth_contacts where split_part(email_normalized::text, '@', 2) = 'gmail.com'
       and email_normalized = any($1::citext[])`,
    [emails],
  );
  expect(personalContacts.rows).toEqual([]);
});

test('approveContactFromInstallDigest creates and approves once, reports stopped and deleted, and is inert on replay', async () => {
  const now = new Date();
  const fresh = mailbox();
  const stopped = mailbox();
  const deleted = mailbox();
  const [freshInstall, stoppedInstall, deletedInstall] = await accept(
    'install',
    [
      installEvent({ email: fresh }),
      installEvent({ email: stopped }),
      installEvent({ email: deleted }),
    ],
    now,
  );
  const [anonymousInstall] = await accept('install', [installEvent({})], now);
  const preexisting = async (email: string, stopKind: string) => {
    const lookup = createEmailLookupHmac(email, evidenceKeys.active);
    const row = await db.execute<{ id: string }>(
      `insert into growth_contacts (email_normalized, email_lookup_hmac, email_hmac_key_version, source)
       values ($1, $2, $3, 'install-lifecycle-integration') returning id`,
      [email, lookup.digest, lookup.keyVersion],
    );
    const id = row.rows[0]?.id as string;
    contactIds.add(id);
    await db.execute(
      `insert into growth_activity (event_key, contact_id, kind, occurred_at, data)
       values ($1, $2, $3, $4, '{}'::jsonb)`,
      [
        `install-lifecycle:${stopKind}:${id}`,
        id,
        stopKind,
        new Date(now.getTime() - 60_000),
      ],
    );
    return id;
  };
  await preexisting(stopped, 'unsubscribe');
  await preexisting(deleted, 'deletion');
  const approve = (installObservationId: string, eventKey: string) =>
    approveContactFromInstallDigest(db, {
      installObservationId,
      occurredAt: now,
      eventKey,
      keyring: evidenceKeys,
    });
  const eventKey = `install_digest:approve:${freshInstall}`;

  const first = await approve(freshInstall as string, eventKey);
  const replay = await approve(freshInstall as string, eventKey);
  const stoppedResult = await approve(
    stoppedInstall as string,
    `install_digest:approve:${stoppedInstall}`,
  );
  const deletedResult = await approve(
    deletedInstall as string,
    `install_digest:approve:${deletedInstall}`,
  );
  const anonymousResult = await approve(
    anonymousInstall as string,
    `install_digest:approve:${anonymousInstall}`,
  );

  expect(first).toEqual({
    approved: true,
    contactId: expect.any(String),
    changed: true,
  });
  if (!first.approved) throw new Error('expected approval');
  contactIds.add(first.contactId);
  expect(replay).toEqual({
    approved: true,
    contactId: first.contactId,
    changed: false,
  });
  expect(stoppedResult).toEqual({ approved: false, reason: 'stopped' });
  expect(deletedResult).toEqual({ approved: false, reason: 'deleted' });
  expect(anonymousResult).toEqual({
    approved: false,
    reason: 'identity_unavailable',
  });
  const contact = await db.execute<{
    source: string;
    outreach_approved_at: Date;
  }>('select source, outreach_approved_at from growth_contacts where id = $1', [
    first.contactId,
  ]);
  expect(contact.rows[0]?.source).toBe('signed_founder_approve_install');
  expect(new Date(contact.rows[0]?.outreach_approved_at as Date)).toEqual(now);
  const activity = await db.execute<{
    event_key: string;
    data: Record<string, unknown>;
  }>(
    `select event_key, data from growth_activity
     where contact_id = $1 and kind = 'contact.reauthorized'`,
    [first.contactId],
  );
  expect(activity.rows).toHaveLength(1);
  expect(activity.rows[0]).toMatchObject({
    event_key: eventKey,
    data: {
      actor: 'founder',
      provenance: 'founder_action',
      reason: 'founder_install_digest_approval',
      source: 'signed_founder_approve_install',
      policy_version: 'growth-v1',
      install_observation_id: freshInstall,
    },
  });
});
