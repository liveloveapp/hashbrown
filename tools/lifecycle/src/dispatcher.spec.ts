import { expect, test, vi } from 'vitest';

import {
  type GrowthJob,
  JobLeaseConflictError,
  type SqlExecutor,
} from './growth.ts';
import {
  dispatchLifecycleJobs,
  handlerErrorBackoffMs,
  LEASED_KINDS,
  type LifecycleDispatcherDependencies,
  type LifecycleDispatcherInput,
  TICK_JOB_START_BUDGET_MS,
} from './dispatcher.ts';
import { DeterministicLifecycleJobError } from './job-errors.ts';

// A Tuesday, 07:30 Pacific.
const NOW = new Date('2026-09-01T14:30:00.000Z');
const LEASE_TOKEN = '00000000-0000-4000-8000-000000000099';
const EMAIL_KEYRING = {
  active: { version: 1, secret: 'dispatcher-email-test-secret-material' },
};

function leasedJob(id: string, kind = 'reply_reconcile'): GrowthJob {
  return {
    id,
    kind,
    contactId: null,
    projectId: null,
    status: 'leased',
    availableAt: NOW,
    leaseUntil: new Date(NOW.getTime() + 60_000),
    leaseToken: LEASE_TOKEN,
    attempts: 1,
    idempotencyKey: `test:${id}`,
    payload: {},
    providerEmailId: null,
    rfcMessageId: null,
    gmailSeedMessageId: null,
    deliveryStatus: 'not_submitted',
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function input(
  overrides: Partial<LifecycleDispatcherInput> = {},
): LifecycleDispatcherInput {
  return {
    batchSize: 20,
    campaignEnabled: false,
    campaignEnrollmentEnabled: false,
    installRuntimeHelloEnabled: false,
    installDigestEnabled: false,
    observationProcessingEnabled: false,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<LifecycleDispatcherDependencies> = {},
): LifecycleDispatcherDependencies {
  const executor = {
    execute: vi.fn(),
    transaction: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as SqlExecutor;
  return {
    appHandlers: {},
    createDatabase: vi.fn(() => executor),
    dispatchLeasedJob: vi.fn().mockResolvedValue('completed'),
    isRecoveryPaused: vi.fn().mockResolvedValue(false),
    reconcileMessageIds: vi
      .fn()
      .mockResolvedValue({ claimed: 0, bound: 0, deferred: 0 }),
    leaseDueJobs: vi.fn().mockResolvedValue([]),
    loadEmailKeyring: vi.fn(() => EMAIL_KEYRING),
    processInstallRuntimeActivations: vi.fn().mockResolvedValue({
      approved: 0,
      ineligible: 0,
      conflicted: 0,
      disabled: false,
    }),
    materializeCampaignEnrollment: vi.fn().mockResolvedValue({
      enrolledContactIds: [],
      createdJobs: 0,
    }),
    recomputeContactScore: vi.fn().mockResolvedValue(undefined),
    enqueueInstallDigestJob: vi.fn().mockResolvedValue(null),
    processObservations: vi.fn().mockResolvedValue({
      completed: 0,
      leaseLost: 0,
      retryScheduled: 0,
      failed: 0,
      disabled: false,
    }),
    now: vi.fn(() => NOW),
    renewJobLease: vi
      .fn()
      .mockImplementation(async (_executor, request) =>
        leasedJob(request.jobId),
      ),
    quarantineJob: vi
      .fn()
      .mockImplementation(async (_executor, request) =>
        leasedJob(request.jobId),
      ),
    deferJob: vi
      .fn()
      .mockImplementation(async (_executor, request) =>
        leasedJob(request.jobId),
      ),
    hasSubmissionAuthorization: vi.fn().mockResolvedValue(false),
    assertActionOrigin: vi.fn(),
    countUnboundProviderMessages: vi.fn().mockResolvedValue(0),
    clearTimeout,
    setTimeout,
    ...overrides,
  };
}

test('dispatcher runs reconciliation, projection, hello, enrollment, digest, lease, dispatch in order and projection failure only alerts', async () => {
  const calls: string[] = [];
  const record =
    <T>(name: string, value: T) =>
    async () => {
      calls.push(name);
      return value;
    };
  const job = leasedJob('00000000-0000-4000-8000-000000000001', 'fulfill');
  const startAt = new Date('2026-09-01T00:00:00.000Z');
  const deps = dependencies({
    reconcileMessageIds: vi.fn(
      record('reconcile', { claimed: 0, bound: 0, deferred: 0 }),
    ),
    processObservations: vi.fn(async () => {
      calls.push('projection');
      throw new Error('projection exploded');
    }),
    processInstallRuntimeActivations: vi.fn(
      record('hello', {
        approved: 1,
        ineligible: 0,
        conflicted: 0,
        disabled: false,
      }),
    ),
    materializeCampaignEnrollment: vi.fn(
      record('enrollment', {
        enrolledContactIds: ['contact-a', 'contact-b'],
        createdJobs: 6,
      }),
    ),
    recomputeContactScore: vi.fn(record('score', undefined)),
    enqueueInstallDigestJob: vi.fn(record('digest', 'digest-job')),
    isRecoveryPaused: vi.fn(record('recovery', false)),
    leaseDueJobs: vi.fn(record('lease', [job])),
    dispatchLeasedJob: vi.fn(record('dispatch', 'completed' as const)),
  });

  const result = await dispatchLifecycleJobs(
    input({
      batchSize: 7,
      campaignEnabled: true,
      campaignEnrollmentEnabled: true,
      campaignEnrollmentStartAt: startAt,
      installRuntimeHelloEnabled: true,
      installDigestEnabled: true,
      observationProcessingEnabled: true,
    }),
    deps,
  );

  expect(calls).toEqual([
    'reconcile',
    'projection',
    'hello',
    'enrollment',
    'score',
    'score',
    'digest',
    'recovery',
    'lease',
    'dispatch',
  ]);
  expect(result).toEqual({
    leased: 1,
    dispatched: 1,
    recoveryPaused: false,
    operatorAlerts: ['observation_projection_failed'],
  });
  expect(deps.processObservations).toHaveBeenCalledWith(expect.anything(), {
    enabled: true,
    limit: 7,
    now: deps.now,
  });
  expect(deps.processInstallRuntimeActivations).toHaveBeenCalledWith(
    expect.anything(),
    { enabled: true, limit: 7, now: NOW, keyring: EMAIL_KEYRING },
  );
  expect(deps.materializeCampaignEnrollment).toHaveBeenCalledWith(
    expect.anything(),
    {
      enrollmentEnabled: true,
      enrollmentStartAt: startAt,
      now: NOW,
      batchSize: 7,
    },
  );
  expect(deps.recomputeContactScore).toHaveBeenCalledWith(expect.anything(), {
    contactId: 'contact-a',
    now: NOW,
  });
  expect(deps.recomputeContactScore).toHaveBeenCalledWith(expect.anything(), {
    contactId: 'contact-b',
    now: NOW,
  });
  expect(deps.enqueueInstallDigestJob).toHaveBeenCalledWith(expect.anything(), {
    now: NOW,
    idempotencyKey: 'install_digest:2026-09-01',
    businessDate: '2026-09-01',
    keyring: EMAIL_KEYRING,
    availableAt: new Date('2026-09-02T14:00:00.000Z'),
  });
  expect(deps.leaseDueJobs).toHaveBeenCalledWith(expect.anything(), {
    kinds: [...LEASED_KINDS],
    now: NOW,
    batchSize: 7,
    leaseDurationMs: 60_000,
    campaignEnabled: true,
    isSendWindow: expect.any(Function),
  });
  expect(LEASED_KINDS).toEqual([
    'fulfill',
    'notify',
    'send_step',
    'reply_reconcile',
    'digest',
  ]);
});

test('dispatcher skips disabled stages, weekend digests and rejects a bad batch size', async () => {
  const saturday = new Date('2026-09-05T18:00:00.000Z');
  const deps = dependencies({ now: vi.fn(() => saturday) });
  const disabled = dependencies();

  await dispatchLifecycleJobs(input({ installDigestEnabled: true }), deps);
  await dispatchLifecycleJobs(input(), disabled);
  const tooLarge = dispatchLifecycleJobs(input({ batchSize: 26 }), disabled);
  const fractional = dispatchLifecycleJobs(input({ batchSize: 1.5 }), disabled);
  const missingStart = dispatchLifecycleJobs(
    input({ campaignEnrollmentEnabled: true }),
    disabled,
  );

  expect(deps.enqueueInstallDigestJob).not.toHaveBeenCalled();
  expect(disabled.processObservations).not.toHaveBeenCalled();
  expect(disabled.processInstallRuntimeActivations).not.toHaveBeenCalled();
  expect(disabled.materializeCampaignEnrollment).not.toHaveBeenCalled();
  expect(disabled.enqueueInstallDigestJob).not.toHaveBeenCalled();
  expect(disabled.loadEmailKeyring).not.toHaveBeenCalled();
  await expect(tooLarge).rejects.toThrow(/between 1 and 25/u);
  await expect(fractional).rejects.toThrow(/between 1 and 25/u);
  await expect(missingStart).rejects.toThrow(/campaignEnrollmentStartAt/u);
});

test('dispatcher quarantines a DeterministicLifecycleJobError and continues', async () => {
  const poison = leasedJob('00000000-0000-4000-8000-000000000001', 'fulfill');
  const healthy = leasedJob('00000000-0000-4000-8000-000000000002', 'fulfill');
  const dispatchLeasedJob = vi
    .fn()
    .mockRejectedValueOnce(new DeterministicLifecycleJobError('corrupt'))
    .mockResolvedValueOnce('completed');
  const deps = dependencies({
    dispatchLeasedJob,
    leaseDueJobs: vi.fn().mockResolvedValue([poison, healthy]),
  });

  const result = await dispatchLifecycleJobs(input({ batchSize: 2 }), deps);

  expect(result).toMatchObject({ leased: 2, dispatched: 2 });
  expect(deps.quarantineJob).toHaveBeenCalledOnce();
  expect(deps.quarantineJob).toHaveBeenCalledWith(expect.anything(), {
    errorCode: 'deterministic_job_poison',
    jobId: poison.id,
    leaseToken: LEASE_TOKEN,
    now: NOW,
  });
  expect(dispatchLeasedJob).toHaveBeenCalledTimes(2);
  expect(dispatchLeasedJob).toHaveBeenLastCalledWith(
    expect.anything(),
    healthy,
    expect.objectContaining({ appHandlers: deps.appHandlers }),
  );
});

test('dispatcher drops a job whose lease conflicts', async () => {
  const lost = leasedJob('00000000-0000-4000-8000-000000000001', 'notify');
  const next = leasedJob('00000000-0000-4000-8000-000000000002', 'notify');
  const conflicted = dependencies({
    dispatchLeasedJob: vi
      .fn()
      .mockRejectedValueOnce(new JobLeaseConflictError(lost.id))
      .mockResolvedValueOnce('completed'),
    leaseDueJobs: vi.fn().mockResolvedValue([lost, next]),
  });

  const result = await dispatchLifecycleJobs(input(), conflicted);

  expect(result).toMatchObject({ leased: 2, dispatched: 1 });
  expect(conflicted.quarantineJob).not.toHaveBeenCalled();
  expect(conflicted.deferJob).not.toHaveBeenCalled();
});

test('dispatcher defers a recovery_paused job and raises the mailbox alert', async () => {
  const job = leasedJob('00000000-0000-4000-8000-000000000001', 'send_step');
  const deps = dependencies({
    dispatchLeasedJob: vi.fn().mockResolvedValue('recovery_paused'),
    leaseDueJobs: vi.fn().mockResolvedValue([job]),
  });

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(result).toEqual({
    leased: 1,
    dispatched: 1,
    recoveryPaused: true,
    operatorAlerts: ['mailbox_recovery_required'],
  });
  expect(deps.deferJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: job.id,
    leaseToken: LEASE_TOKEN,
    now: NOW,
    availableAt: new Date(NOW.getTime() + 60_000),
    errorCode: 'mailbox_recovery_paused',
  });
});

test('dispatcher runs hello only while enrollment is also enabled', async () => {
  const helloAlone = dependencies();
  const helloWithEnrollment = dependencies();

  await dispatchLifecycleJobs(
    input({ installRuntimeHelloEnabled: true }),
    helloAlone,
  );
  await dispatchLifecycleJobs(
    input({
      installRuntimeHelloEnabled: true,
      campaignEnrollmentEnabled: true,
      campaignEnrollmentStartAt: new Date('2026-09-01T00:00:00.000Z'),
    }),
    helloWithEnrollment,
  );

  expect(helloAlone.processInstallRuntimeActivations).not.toHaveBeenCalled();
  expect(helloAlone.loadEmailKeyring).not.toHaveBeenCalled();
  expect(
    helloWithEnrollment.processInstallRuntimeActivations,
  ).toHaveBeenCalledOnce();
});

test('dispatcher defers a recovery_paused job even when the tick aborts right after it', async () => {
  const controller = new AbortController();
  const job = leasedJob('00000000-0000-4000-8000-000000000001', 'send_step');
  const deps = dependencies({
    dispatchLeasedJob: vi.fn(async () => {
      controller.abort(new Error('tick cancelled'));
      return 'recovery_paused' as const;
    }),
    leaseDueJobs: vi.fn().mockResolvedValue([job]),
  });

  const run = dispatchLifecycleJobs(input({ signal: controller.signal }), deps);

  await expect(run).rejects.toThrow('tick cancelled');
  expect(deps.deferJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: job.id,
    leaseToken: LEASE_TOKEN,
    now: NOW,
    availableAt: new Date(NOW.getTime() + 60_000),
    errorCode: 'mailbox_recovery_paused',
  });
});

test('dispatcher reports an open recovery even with nothing leased and closes the executor', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const executor = {
    execute: vi.fn(),
    transaction: vi.fn(),
    close,
  } as unknown as SqlExecutor;
  const deps = dependencies({
    createDatabase: vi.fn(() => executor),
    isRecoveryPaused: vi.fn().mockResolvedValue(true),
  });

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(result).toEqual({
    leased: 0,
    dispatched: 0,
    recoveryPaused: true,
    operatorAlerts: ['mailbox_recovery_required'],
  });
  expect(close).toHaveBeenCalledOnce();
});

test('dispatcher renews leases every 20 s and aborts the loop when a renewal fails', async () => {
  vi.useFakeTimers({ now: NOW });
  try {
    const first = leasedJob('00000000-0000-4000-8000-000000000001');
    const second = leasedJob('00000000-0000-4000-8000-000000000002');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const renewing = dependencies({
      dispatchLeasedJob: vi
        .fn()
        .mockImplementationOnce(async () => pending.then(() => 'completed'))
        .mockResolvedValue('completed'),
      leaseDueJobs: vi.fn().mockResolvedValue([first, second]),
      now: () => new Date(Date.now()),
    });
    const failingRenewal = vi.fn().mockResolvedValue(null);
    const failing = dependencies({
      dispatchLeasedJob: vi.fn().mockImplementation(
        async (_executor, _job, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
      leaseDueJobs: vi.fn().mockResolvedValue([first, second]),
      now: () => new Date(Date.now()),
      renewJobLease: failingRenewal,
    });

    // Job 1 is held for 40 s; widen the start budget so job 2 still runs.
    const run = dispatchLifecycleJobs(
      input({ tickJobStartBudgetMs: 120_000 }),
      renewing,
    );
    await vi.advanceTimersByTimeAsync(19_999);
    const beforeRenewal = vi.mocked(renewing.renewJobLease).mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);
    const afterFirstRenewal = vi.mocked(renewing.renewJobLease).mock.calls
      .length;
    await vi.advanceTimersByTimeAsync(20_000);
    const afterSecondRenewal = vi.mocked(renewing.renewJobLease).mock.calls
      .length;
    release();
    const result = await run;
    const aborted = dispatchLifecycleJobs(input(), failing);
    const rejection = expect(aborted).rejects.toThrow(/lease renewal failed/u);
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
    const renewalsAtFailure = failingRenewal.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);

    expect(beforeRenewal).toBe(0);
    expect(afterFirstRenewal).toBe(2);
    expect(afterSecondRenewal).toBe(4);
    expect(renewing.renewJobLease).toHaveBeenCalledWith(expect.anything(), {
      jobId: second.id,
      leaseDurationMs: 60_000,
      leaseToken: LEASE_TOKEN,
      now: expect.any(Date),
    });
    expect(result).toMatchObject({ leased: 2, dispatched: 2 });
    expect(failingRenewal).toHaveBeenCalledTimes(renewalsAtFailure);
    expect(failing.dispatchLeasedJob).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

test('dispatcher stops before leasing when the tick is aborted', async () => {
  const controller = new AbortController();
  const deps = dependencies({
    reconcileMessageIds: vi.fn(async () => {
      controller.abort(new Error('tick cancelled'));
      return { claimed: 0, bound: 0, deferred: 0 };
    }),
  });

  const run = dispatchLifecycleJobs(input({ signal: controller.signal }), deps);

  await expect(run).rejects.toThrow('tick cancelled');
  expect(deps.leaseDueJobs).not.toHaveBeenCalled();
});

test('dispatcher stops starting jobs once the tick budget is spent and releases the rest', async () => {
  let clock = NOW.getTime();
  const first = leasedJob('00000000-0000-4000-8000-000000000001', 'send_step');
  const second = leasedJob('00000000-0000-4000-8000-000000000002', 'send_step');
  const third = leasedJob('00000000-0000-4000-8000-000000000003', 'notify');
  const deps = dependencies({
    now: () => new Date(clock),
    leaseDueJobs: vi.fn().mockResolvedValue([first, second, third]),
    dispatchLeasedJob: vi.fn(async () => {
      clock += TICK_JOB_START_BUDGET_MS;
      return 'completed' as const;
    }),
  });

  const result = await dispatchLifecycleJobs(input(), deps);

  const budgetSpentAt = new Date(NOW.getTime() + TICK_JOB_START_BUDGET_MS);
  expect(TICK_JOB_START_BUDGET_MS).toBe(40_000);
  expect(result).toEqual({
    leased: 3,
    dispatched: 1,
    recoveryPaused: false,
    operatorAlerts: [],
  });
  expect(deps.dispatchLeasedJob).toHaveBeenCalledOnce();
  expect(deps.dispatchLeasedJob).toHaveBeenCalledWith(
    expect.anything(),
    first,
    expect.anything(),
  );
  expect(deps.deferJob).toHaveBeenCalledTimes(2);
  expect(deps.deferJob).toHaveBeenNthCalledWith(1, expect.anything(), {
    jobId: second.id,
    leaseToken: LEASE_TOKEN,
    now: budgetSpentAt,
    availableAt: budgetSpentAt,
    errorCode: 'tick_budget_exhausted',
  });
  expect(deps.deferJob).toHaveBeenNthCalledWith(2, expect.anything(), {
    jobId: third.id,
    leaseToken: LEASE_TOKEN,
    now: budgetSpentAt,
    availableAt: budgetSpentAt,
    errorCode: 'tick_budget_exhausted',
  });
});

test('dispatcher skips leasing when preparing the tick used the whole budget', async () => {
  let clock = NOW.getTime();
  const deps = dependencies({
    now: () => new Date(clock),
    reconcileMessageIds: vi.fn(async () => {
      clock += 5_000;
      return { claimed: 0, bound: 0, deferred: 0 };
    }),
  });

  const result = await dispatchLifecycleJobs(
    input({ tickJobStartBudgetMs: 5_000 }),
    deps,
  );

  expect(result).toEqual({
    leased: 0,
    dispatched: 0,
    recoveryPaused: false,
    operatorAlerts: [],
  });
  expect(deps.leaseDueJobs).not.toHaveBeenCalled();
  expect(deps.dispatchLeasedJob).not.toHaveBeenCalled();
});

function failingJob(id: string, attempts: number): GrowthJob {
  return { ...leasedJob(id, 'fulfill'), attempts };
}

test('a failing job defers with backoff, the rest of the batch runs, and the 5th failure quarantines', async () => {
  const failing = failingJob('00000000-0000-4000-8000-000000000001', 1);
  const exhausted = failingJob('00000000-0000-4000-8000-000000000002', 5);
  const healthy = leasedJob('00000000-0000-4000-8000-000000000003', 'notify');
  const dispatchLeasedJob = vi
    .fn()
    .mockRejectedValueOnce(new Error('handler blew up'))
    .mockRejectedValueOnce(new Error('handler blew up'))
    .mockResolvedValueOnce('completed');
  const deps = dependencies({
    dispatchLeasedJob,
    leaseDueJobs: vi.fn().mockResolvedValue([failing, exhausted, healthy]),
  });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const result = await dispatchLifecycleJobs(input(), deps);

  logged.mockRestore();
  expect(result).toMatchObject({ leased: 3, dispatched: 1 });
  expect(dispatchLeasedJob).toHaveBeenCalledTimes(3);
  expect(deps.deferJob).toHaveBeenCalledOnce();
  expect(deps.deferJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: failing.id,
    leaseToken: LEASE_TOKEN,
    now: NOW,
    availableAt: new Date(NOW.getTime() + 60_000),
    errorCode: 'handler_error',
  });
  expect(deps.quarantineJob).toHaveBeenCalledOnce();
  expect(deps.quarantineJob).toHaveBeenCalledWith(expect.anything(), {
    errorCode: 'handler_error_exhausted',
    jobId: exhausted.id,
    leaseToken: LEASE_TOKEN,
    now: NOW,
  });
});

test('backoff is 60, 120, 240, 480 seconds and caps at 3600', async () => {
  const jobs = [1, 2, 3, 4].map((attempts) =>
    failingJob(`00000000-0000-4000-8000-00000000000${attempts}`, attempts),
  );
  const deps = dependencies({
    dispatchLeasedJob: vi.fn().mockRejectedValue(new Error('boom')),
    leaseDueJobs: vi.fn().mockResolvedValue(jobs),
  });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await dispatchLifecycleJobs(input(), deps);

  logged.mockRestore();
  const delays = vi
    .mocked(deps.deferJob)
    .mock.calls.map(
      ([, request]) => request.availableAt.getTime() - NOW.getTime(),
    );
  expect(delays).toEqual([60_000, 120_000, 240_000, 480_000]);
});

test('the backoff doubles from 60 seconds and caps at 3600', () => {
  const attempts = [1, 2, 5, 6, 7, 20];

  const delays = attempts.map(handlerErrorBackoffMs);

  expect(delays).toEqual([
    60_000, 120_000, 960_000, 1_920_000, 3_600_000, 3_600_000,
  ]);
});

test('a lease conflict on the budget-path defer drops that job and the tick continues', async () => {
  let clock = NOW.getTime();
  const first = leasedJob('00000000-0000-4000-8000-000000000001', 'send_step');
  const second = leasedJob('00000000-0000-4000-8000-000000000002', 'send_step');
  const third = leasedJob('00000000-0000-4000-8000-000000000003', 'notify');
  const deps = dependencies({
    now: () => new Date(clock),
    leaseDueJobs: vi.fn().mockResolvedValue([first, second, third]),
    dispatchLeasedJob: vi.fn(async () => {
      clock += TICK_JOB_START_BUDGET_MS;
      return 'completed' as const;
    }),
    deferJob: vi
      .fn()
      .mockRejectedValueOnce(new JobLeaseConflictError(second.id))
      .mockResolvedValueOnce(leasedJob(third.id)),
  });

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(result).toMatchObject({ leased: 3, dispatched: 1 });
  expect(deps.deferJob).toHaveBeenCalledTimes(2);
});

test('a lease conflict on a recovery_paused defer drops that job and the tick continues', async () => {
  const paused = leasedJob('00000000-0000-4000-8000-000000000001', 'send_step');
  const next = leasedJob('00000000-0000-4000-8000-000000000002', 'notify');
  const deps = dependencies({
    leaseDueJobs: vi.fn().mockResolvedValue([paused, next]),
    dispatchLeasedJob: vi
      .fn()
      .mockResolvedValueOnce('recovery_paused')
      .mockResolvedValueOnce('completed'),
    deferJob: vi
      .fn()
      .mockRejectedValueOnce(new JobLeaseConflictError(paused.id)),
  });

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(result).toMatchObject({ leased: 2, dispatched: 1 });
});

test('the logged failure carries only kind and error name', async () => {
  class VendorError extends Error {
    override name = 'VendorError';
  }
  const job = failingJob('00000000-0000-4000-8000-000000000001', 1);
  const other = failingJob('00000000-0000-4000-8000-000000000002', 1);
  const deps = dependencies({
    dispatchLeasedJob: vi
      .fn()
      .mockRejectedValueOnce(new VendorError('secret@example.com leaked'))
      .mockRejectedValueOnce('a thrown string'),
    leaseDueJobs: vi.fn().mockResolvedValue([job, other]),
  });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await dispatchLifecycleJobs(input(), deps);

  const calls = logged.mock.calls;
  logged.mockRestore();
  expect(calls).toEqual([
    ['[lifecycle-job-failed]', { kind: 'fulfill', name: 'VendorError' }],
    ['[lifecycle-job-failed]', { kind: 'fulfill', name: 'Error' }],
  ]);
  expect(JSON.stringify(calls)).not.toContain('secret@example.com');
});

test('an abort still stops the loop after the current job', async () => {
  const controller = new AbortController();
  const first = failingJob('00000000-0000-4000-8000-000000000001', 1);
  const second = leasedJob('00000000-0000-4000-8000-000000000002', 'notify');
  const dispatchLeasedJob = vi.fn(async () => {
    controller.abort(new Error('tick aborted'));
    throw new Error('handler failed while aborting');
  });
  const deps = dependencies({
    dispatchLeasedJob,
    leaseDueJobs: vi.fn().mockResolvedValue([first, second]),
  });

  const failure = dispatchLifecycleJobs(
    input({ signal: controller.signal }),
    deps,
  );

  await expect(failure).rejects.toThrow('tick aborted');
  expect(dispatchLeasedJob).toHaveBeenCalledOnce();
  expect(deps.deferJob).not.toHaveBeenCalled();
});

test('a handler error after submission authorization leaves the job leased and never defers or quarantines it', async () => {
  const authorized = failingJob('00000000-0000-4000-8000-000000000001', 5);
  const healthy = leasedJob('00000000-0000-4000-8000-000000000002', 'notify');
  const deps = dependencies({
    dispatchLeasedJob: vi
      .fn()
      .mockRejectedValueOnce(new Error('acceptance write failed'))
      .mockResolvedValueOnce('completed'),
    leaseDueJobs: vi.fn().mockResolvedValue([authorized, healthy]),
    hasSubmissionAuthorization: vi.fn().mockResolvedValueOnce(true),
  });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const result = await dispatchLifecycleJobs(input(), deps);

  logged.mockRestore();
  expect(result).toMatchObject({ leased: 2, dispatched: 1 });
  expect(deps.hasSubmissionAuthorization).toHaveBeenCalledWith(
    expect.anything(),
    { jobId: authorized.id, leaseToken: LEASE_TOKEN },
  );
  expect(deps.deferJob).not.toHaveBeenCalled();
  expect(deps.quarantineJob).not.toHaveBeenCalled();
});

test('an invalid action origin leases only reply_reconcile, keeps enrollment running and alerts action_origin_invalid', async () => {
  const calls: string[] = [];
  const job = leasedJob('00000000-0000-4000-8000-000000000001');
  const deps = dependencies({
    assertActionOrigin: vi.fn(() => {
      throw new Error(
        'Growth public action origin must be a bare HTTPS origin',
      );
    }),
    reconcileMessageIds: vi.fn(async () => {
      calls.push('reconcile');
    }),
    processObservations: vi.fn(async () => {
      calls.push('projection');
      return {
        completed: 0,
        leaseLost: 0,
        retryScheduled: 0,
        failed: 0,
        disabled: false,
      };
    }),
    processInstallRuntimeActivations: vi.fn(async () => {
      calls.push('hello');
      return { approved: 0, ineligible: 0, conflicted: 0, disabled: false };
    }),
    materializeCampaignEnrollment: vi.fn(async () => {
      calls.push('enrollment');
      return { enrolledContactIds: [], createdJobs: 0 };
    }),
    leaseDueJobs: vi.fn().mockResolvedValue([job]),
  });

  const result = await dispatchLifecycleJobs(
    input({
      campaignEnabled: true,
      campaignEnrollmentEnabled: true,
      campaignEnrollmentStartAt: new Date('2026-09-01T00:00:00.000Z'),
      installRuntimeHelloEnabled: true,
      observationProcessingEnabled: true,
    }),
    deps,
  );

  expect(calls).toEqual(['reconcile', 'projection', 'hello', 'enrollment']);
  expect(deps.leaseDueJobs).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ kinds: ['reply_reconcile'] }),
  );
  expect(result).toEqual({
    leased: 1,
    dispatched: 1,
    recoveryPaused: false,
    operatorAlerts: ['action_origin_invalid'],
  });
});

test('a valid action origin leases every kind and raises no origin alert', async () => {
  const deps = dependencies();

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(deps.leaseDueJobs).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ kinds: [...LEASED_KINDS] }),
  );
  expect(result.operatorAlerts).toEqual([]);
});

test('unbound provider messages alert message_id_unbound after leasing, and none does not', async () => {
  const unbound = dependencies({
    countUnboundProviderMessages: vi.fn().mockResolvedValue(2),
  });
  const clean = dependencies();

  const alerted = await dispatchLifecycleJobs(input(), unbound);
  const quiet = await dispatchLifecycleJobs(input(), clean);

  expect(alerted.operatorAlerts).toEqual(['message_id_unbound']);
  expect(unbound.countUnboundProviderMessages).toHaveBeenCalledWith(
    expect.anything(),
    { now: NOW, olderThanMs: 6 * 60 * 60 * 1000 },
  );
  expect(quiet.operatorAlerts).toEqual([]);
});

test('a failing unbound count is logged by name, adds no alert and the tick still dispatches its jobs', async () => {
  const job = leasedJob('00000000-0000-4000-8000-000000000001');
  const deps = dependencies({
    countUnboundProviderMessages: vi
      .fn()
      .mockRejectedValue(new TypeError('secret detail')),
    leaseDueJobs: vi.fn().mockResolvedValue([job]),
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const result = await dispatchLifecycleJobs(input(), deps);

  expect(result).toMatchObject({
    leased: 1,
    dispatched: 1,
    operatorAlerts: [],
  });
  expect(log).toHaveBeenCalledWith('[lifecycle-unbound-count-failed]', {
    name: 'TypeError',
  });
  log.mockRestore();
});

test('the unbound alert is raised even when the job-start budget is already spent', async () => {
  const deps = dependencies({
    countUnboundProviderMessages: vi.fn().mockResolvedValue(1),
  });

  const result = await dispatchLifecycleJobs(
    input({ tickJobStartBudgetMs: 0 }),
    deps,
  );

  expect(result.operatorAlerts).toEqual(['message_id_unbound']);
  expect(deps.leaseDueJobs).not.toHaveBeenCalled();
});
