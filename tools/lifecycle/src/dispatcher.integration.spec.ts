import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test, vi } from 'vitest';

/* eslint-disable @nx/enforce-module-boundaries -- the integration suite reuses growth's migrations and fixtures */
import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../../growth/scripts/apply-migrations.mts';
import {
  deleteCreatedContacts,
  runCleanup,
} from '../../growth/test/job-fixtures.ts';
/* eslint-enable @nx/enforce-module-boundaries */
import type { LifecycleResendClient } from './campaign/send.ts';
import {
  createLifecycleDispatcherDependencies,
  dispatchLifecycleJobs,
  type LifecycleDispatcherDependencies,
  type LifecycleDispatcherInput,
} from './dispatcher.ts';
import {
  completeLeasedJob,
  createDatabaseExecutor,
  type GrowthJob,
  type SqlExecutor,
} from './growth.ts';

const DATABASE_URL = process.env['TEST_DATABASE_URL'];
// A Monday in 1971: nothing else in the shared test store is due this early.
const NOW = new Date('1971-01-04T18:00:00.000Z');
const executor = createDatabaseExecutor(DATABASE_URL);
const createdJobIds = new Set<string>();
const createdContactIds = new Set<string>();

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  await runCleanup([
    () =>
      executor.execute(
        `delete from growth_activity
         where event_key like any (
           select 'job:' || id::text || ':%' from unnest($1::uuid[]) as id
         )`,
        [[...createdJobIds]],
      ),
    () =>
      executor.execute('delete from growth_jobs where id = any($1::uuid[])', [
        [...createdJobIds],
      ]),
    () => deleteCreatedContacts(executor, createdContactIds),
  ]);
  await executor.close?.();
});

async function insertDueJob(
  kind: string,
  options: {
    contactId?: string;
    payload?: Record<string, unknown>;
    availableAt?: Date;
  } = {},
): Promise<string> {
  const jobId = randomUUID();
  createdJobIds.add(jobId);
  await executor.execute(
    `insert into growth_jobs (
       id, kind, contact_id, status, available_at, idempotency_key, payload
     ) values ($1, $2, $3, 'pending', $4, $5, $6::jsonb)`,
    [
      jobId,
      kind,
      options.contactId ?? null,
      options.availableAt ?? new Date(NOW.getTime() - 60_000),
      `lifecycle-integration:${jobId}`,
      JSON.stringify(options.payload ?? {}),
    ],
  );
  return jobId;
}

async function jobStatuses(ids: readonly string[]): Promise<string[]> {
  const result = await executor.execute<{ status: string }>(
    'select status from growth_jobs where id = any($1::uuid[]) order by id',
    [ids],
  );
  return result.rows.map(({ status }) => status);
}

function input(): LifecycleDispatcherInput {
  return {
    batchSize: 20,
    campaignEnabled: false,
    campaignEnrollmentEnabled: false,
    installRuntimeHelloEnabled: false,
    installDigestEnabled: false,
    observationProcessingEnabled: false,
    signal: new AbortController().signal,
  };
}

function tickDependencies(
  dispatchLeasedJob: LifecycleDispatcherDependencies['dispatchLeasedJob'],
): LifecycleDispatcherDependencies {
  return {
    ...createLifecycleDispatcherDependencies({
      GROWTH_PUBLIC_ACTION_ORIGIN: 'https://preview.hashbrown.test',
    }),
    createDatabase: () => createDatabaseExecutor(DATABASE_URL),
    reconcileMessageIds: async () => ({ claimed: 0, bound: 0, deferred: 0 }),
    now: () => NOW,
    dispatchLeasedJob,
  };
}

function completing(dispatched: string[], gate?: Promise<void>) {
  return async (tickExecutor: SqlExecutor, job: GrowthJob) => {
    dispatched.push(job.id);
    await gate;
    await completeLeasedJob(tickExecutor, {
      jobId: job.id,
      leaseToken: job.leaseToken as string,
      now: NOW,
    });
    return 'completed' as const;
  };
}

test('concurrent dispatches lease each due job once and the loser gets zero jobs', async () => {
  const jobIds = [
    await insertDueJob('digest'),
    await insertDueJob('digest'),
    await insertDueJob('digest'),
  ];
  const winnerDispatched: string[] = [];
  const loserDispatched: string[] = [];
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  let signalLeased!: () => void;
  const leased = new Promise<void>((resolve) => {
    signalLeased = resolve;
  });
  const winnerDispatch = completing(winnerDispatched, gate);

  const winner = dispatchLifecycleJobs(
    input(),
    tickDependencies(async (tickExecutor, job) => {
      signalLeased();
      return winnerDispatch(tickExecutor, job);
    }),
  );
  await leased;
  const loser = await dispatchLifecycleJobs(
    input(),
    tickDependencies(completing(loserDispatched)),
  );
  openGate();
  const winnerResult = await winner;

  expect(loser.leased).toBe(0);
  expect(loser.dispatched).toBe(0);
  expect(loserDispatched).toEqual([]);
  expect(winnerResult).toMatchObject({ leased: 3, dispatched: 3 });
  expect([...winnerDispatched].sort()).toEqual([...jobIds].sort());
  expect(await jobStatuses(jobIds)).toEqual([
    'completed',
    'completed',
    'completed',
  ]);
});

test('simultaneous dispatches never dispatch a job twice', async () => {
  const jobIds = [
    await insertDueJob('digest'),
    await insertDueJob('digest'),
    await insertDueJob('digest'),
    await insertDueJob('digest'),
  ];
  const first: string[] = [];
  const second: string[] = [];

  const [firstResult, secondResult] = await Promise.all([
    dispatchLifecycleJobs(input(), tickDependencies(completing(first))),
    dispatchLifecycleJobs(input(), tickDependencies(completing(second))),
  ]);

  expect(firstResult.leased + secondResult.leased).toBe(4);
  expect([...first, ...second].sort()).toEqual([...jobIds].sort());
  expect(await jobStatuses(jobIds)).toEqual([
    'completed',
    'completed',
    'completed',
    'completed',
  ]);
});

test('a notify job reads the submission, mails the founder once and completes', async () => {
  const contactId = randomUUID();
  const submissionId = randomUUID();
  createdContactIds.add(contactId);
  await executor.execute(
    `insert into growth_contacts (
       id, email_normalized, email_lookup_hmac, email_hmac_key_version, source
     ) values ($1, $2, $3, 1, 'lifecycle-integration')`,
    [
      contactId,
      `${contactId}@example.com`,
      `lifecycle-integration:${contactId}`,
    ],
  );
  await executor.execute(
    `insert into growth_activity (event_key, contact_id, kind, occurred_at, data)
     values ($1, $2, 'contact.form_submission', $3, $4::jsonb)`,
    [
      `form:${submissionId}:accepted`,
      contactId,
      new Date(NOW.getTime() - 120_000),
      JSON.stringify({
        form_kind: 'unstuck',
        submission_id: submissionId,
        framework: 'angular',
        message: 'My tool call never resolves in the second turn.',
      }),
    ],
  );
  const jobId = await insertDueJob('notify', {
    contactId,
    payload: { submission_id: submissionId },
  });
  const send = vi.fn().mockResolvedValue({
    data: { id: 'provider-internal-1' },
    error: null,
  });
  const resend = { emails: { send } } as unknown as LifecycleResendClient;
  const environment = {
    DELIVERY_ENABLED: 'true',
    DELIVERY_ENVIRONMENT: 'test',
    GROWTH_DATABASE_ENVIRONMENT: 'test',
    RESEND_SENDER_VERIFIED: 'true',
    RESEND_TRACKING_DISABLED: 'true',
    RESEND_NON_PRODUCTION_ALLOWLIST: 'founder@hashbrown.test',
    RESEND_API_KEY: 're_test_not_a_real_key',
    FOUNDER_NOTIFICATION_EMAIL: 'founder@hashbrown.test',
    GROWTH_PUBLIC_ACTION_ORIGIN: 'https://preview.hashbrown.test',
    GROWTH_ACTION_TOKEN_ACTIVE_VERSION: '1',
    GROWTH_ACTION_TOKEN_ACTIVE_SECRET:
      'lifecycle-integration-token-secret-material',
  };
  const tick = (): LifecycleDispatcherDependencies => ({
    ...createLifecycleDispatcherDependencies(environment, {
      resend: () => resend,
      now: () => NOW,
    }),
    createDatabase: () => createDatabaseExecutor(DATABASE_URL),
    reconcileMessageIds: async () => ({ claimed: 0, bound: 0, deferred: 0 }),
    now: () => NOW,
  });

  const first = await dispatchLifecycleJobs(input(), tick());
  const second = await dispatchLifecycleJobs(input(), tick());
  const claims = await executor.execute(
    `select kind from growth_activity where event_key = $1`,
    [`job:${jobId}:internal-notification-submission`],
  );

  expect(first).toMatchObject({ leased: 1, dispatched: 1 });
  expect(second).toMatchObject({ leased: 0, dispatched: 0 });
  expect(send).toHaveBeenCalledOnce();
  const [payload, options] = send.mock.calls[0] ?? [];
  expect(payload).toMatchObject({
    from: 'Brian at Hashbrown <brian@hashbrown.dev>',
    to: 'founder@hashbrown.test',
    subject: 'Hashbrown lifecycle review',
    tags: [
      { name: 'environment', value: 'test' },
      { name: 'job_kind', value: 'notify' },
    ],
  });
  expect(payload.text).toContain('Framework: angular');
  expect(payload.text).toContain(
    '> My tool call never resolves in the second turn.',
  );
  expect(payload.text).toContain(
    'https://preview.hashbrown.test/_/growth/stop?token=g1.',
  );
  expect(options).toEqual({
    idempotencyKey: `internal:lifecycle-integration:${jobId}`,
  });
  expect(await jobStatuses([jobId])).toEqual(['completed']);
  expect(claims.rows).toEqual([
    { kind: 'internal_notification.submission_started' },
  ]);
});

test('a failing job backs off, never delays the healthy job behind it, and is quarantined on its 5th attempt', async () => {
  // The failing job is due earlier, so leasing orders it ahead of the
  // healthy one and the test proves the batch continues past it.
  const failingId = await insertDueJob('digest', {
    availableAt: new Date(NOW.getTime() - 120_000),
  });
  const healthyId = await insertDueJob('digest');
  const order: string[] = [];
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let clock = NOW;
  const tick = async (): Promise<string[]> => {
    const dispatched: string[] = [];
    const complete = completing(dispatched);
    await dispatchLifecycleJobs(input(), {
      ...tickDependencies(async (tickExecutor, job) => {
        order.push(job.id);
        if (job.id === failingId) throw new Error('always fails');
        return complete(tickExecutor, job);
      }),
      now: () => clock,
    });
    return dispatched;
  };

  const firstTick = await tick();
  const afterFirst = await executor.execute<{
    status: string;
    attempts: number;
    last_error_code: string;
    available_at: Date;
  }>(
    'select status, attempts, last_error_code, available_at from growth_jobs where id = $1',
    [failingId],
  );
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    clock = new Date(clock.getTime() + 3_600_001);
    await tick();
  }
  const final = await executor.execute<{
    status: string;
    attempts: number;
    last_error_code: string;
  }>(
    'select status, attempts, last_error_code from growth_jobs where id = $1',
    [failingId],
  );

  logged.mockRestore();
  expect(order.slice(0, 2)).toEqual([failingId, healthyId]);
  expect(firstTick).toContain(healthyId);
  expect(afterFirst.rows[0]).toMatchObject({
    status: 'pending',
    attempts: 1,
    last_error_code: 'handler_error',
  });
  expect(afterFirst.rows[0].available_at.getTime()).toBe(
    NOW.getTime() + 60_000,
  );
  expect(final.rows[0]).toMatchObject({
    status: 'failed',
    attempts: 5,
    last_error_code: 'handler_error_exhausted',
  });
  expect(await jobStatuses([healthyId])).toEqual(['completed']);
});

test('a handler that authorizes submission and then throws is never returned to pending or authorized again', async () => {
  const jobId = await insertDueJob('digest');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let authorizations = 0;
  const authorizeThenThrow = async (
    tickExecutor: SqlExecutor,
    job: GrowthJob,
  ) => {
    authorizations += 1;
    await tickExecutor.execute(
      `insert into growth_activity (event_key, kind, occurred_at, data)
       values ($1, 'delivery.submission_authorized', $2, $3::jsonb)`,
      [
        `job:${job.id}:submission-authorized:${job.leaseToken}`,
        NOW,
        JSON.stringify({
          bounded_stop_race: true,
          lease_token: job.leaseToken,
        }),
      ],
    );
    throw new Error('acceptance write failed');
  };

  await dispatchLifecycleJobs(input(), tickDependencies(authorizeThenThrow));
  const afterFailure = await executor.execute<{
    status: string;
    last_error_code: string | null;
  }>('select status, last_error_code from growth_jobs where id = $1', [jobId]);
  const later = new Date(NOW.getTime() + 3_600_000);
  await dispatchLifecycleJobs(input(), {
    ...tickDependencies(authorizeThenThrow),
    now: () => later,
  });
  const afterRecovery = await executor.execute<{
    status: string;
    last_error_code: string | null;
    delivery_status: string;
  }>(
    'select status, last_error_code, delivery_status from growth_jobs where id = $1',
    [jobId],
  );

  logged.mockRestore();
  await executor.execute(
    'delete from growth_activity where event_key like $1',
    [`job:${jobId}:%`],
  );
  expect(afterFailure.rows[0]).toEqual({
    status: 'leased',
    last_error_code: null,
  });
  expect(authorizations).toBe(1);
  expect(afterRecovery.rows[0]).toEqual({
    status: 'failed',
    last_error_code: 'worker_interrupted_after_authorization',
    delivery_status: 'unknown',
  });
});
