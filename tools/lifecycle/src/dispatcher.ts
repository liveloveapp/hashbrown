import {
  createDefaultLifecycleJobDependencies,
  createLifecycleAppJobHandlers,
  type LifecycleJobDependencyOptions,
} from './campaign/send.ts';
import { loadEmailHmacKeyring } from './email-keyring.ts';
import {
  createDatabaseExecutor,
  deferLeasedJob,
  dispatchGrowthLeasedJob,
  type EmailHmacKeyring,
  enqueueInstallDigestJob,
  failLeasedJob,
  type GrowthAppJobHandlers,
  type GrowthDispatchDependencies,
  type GrowthDispatchResult,
  type GrowthJob,
  isCampaignSendWindow,
  isGoogleMailboxRecoveryPaused,
  JobLeaseConflictError,
  leaseDueJobs,
  materializeCampaignEnrollment,
  nextPacificBusinessMorning,
  pacificCalendarDate,
  processInstallRuntimeActivations,
  processObservations,
  recomputeContactScore,
  reconcilePendingResendMessageIds,
  renewJobLease,
  type SqlExecutor,
} from './growth.ts';
import { DeterministicLifecycleJobError } from './job-errors.ts';

const MAX_BATCH_SIZE = 25;
const OBSERVATION_PROJECTION_MAX_LIMIT = 100;
const LEASE_DURATION_MS = 60_000;
const LEASE_RENEWAL_INTERVAL_MS = 20_000;
const RECOVERY_RETRY_DELAY_MS = 60_000;

/**
 * How long into a tick the dispatcher may still start a job. The last job's
 * 10 s Resend timeout plus its database writes must finish inside the 60 s
 * `maxDuration`, so jobs still leased after 40 s are released for the next
 * tick instead of risking a kill after authorization.
 */
export const TICK_JOB_START_BUDGET_MS = 40_000;

/** Every job kind a tick leases; `reply_reconcile` is settled by growth. */
export const LEASED_KINDS = [
  'fulfill',
  'notify',
  'send_step',
  'reply_reconcile',
  'digest',
] as const;

/** What one tick may do; the switches come from the lifecycle environment. */
export interface LifecycleDispatcherInput {
  /** Jobs to lease, 1..25. */
  batchSize: number;
  campaignEnabled: boolean;
  campaignEnrollmentEnabled: boolean;
  installRuntimeHelloEnabled: boolean;
  installDigestEnabled: boolean;
  observationProcessingEnabled: boolean;
  /** Required when `campaignEnrollmentEnabled`. */
  campaignEnrollmentStartAt?: Date;
  signal: AbortSignal;
  /**
   * Milliseconds from the start of the tick after which no job is started.
   * Defaults to {@link TICK_JOB_START_BUDGET_MS}; a test seam.
   */
  tickJobStartBudgetMs?: number;
}

/** The closed set of alerts a tick reports to operators. */
export type LifecycleOperatorAlert =
  'mailbox_recovery_required' | 'observation_projection_failed';

/** What one tick did. */
export interface LifecycleDispatcherResult {
  leased: number;
  dispatched: number;
  recoveryPaused: boolean;
  operatorAlerts: LifecycleOperatorAlert[];
}

/** The tick's collaborators; every one is injectable for tests. */
export interface LifecycleDispatcherDependencies {
  appHandlers: GrowthAppJobHandlers;
  /** Opens the growth executor for one tick; the tick closes it. */
  createDatabase: () => SqlExecutor;
  dispatchLeasedJob: (
    executor: SqlExecutor,
    job: GrowthJob,
    dependencies: GrowthDispatchDependencies,
  ) => Promise<GrowthDispatchResult>;
  isRecoveryPaused: typeof isGoogleMailboxRecoveryPaused;
  reconcileMessageIds: (
    executor: SqlExecutor,
    input: { now: Date; signal: AbortSignal },
  ) => Promise<unknown>;
  processObservations: typeof processObservations;
  processInstallRuntimeActivations: typeof processInstallRuntimeActivations;
  materializeCampaignEnrollment: typeof materializeCampaignEnrollment;
  recomputeContactScore: (
    executor: SqlExecutor,
    input: { contactId: string; now: Date },
  ) => Promise<unknown>;
  enqueueInstallDigestJob: typeof enqueueInstallDigestJob;
  leaseDueJobs: typeof leaseDueJobs;
  loadEmailKeyring: () => EmailHmacKeyring;
  now: () => Date;
  renewJobLease: typeof renewJobLease;
  quarantineJob: typeof failLeasedJob;
  deferJob: typeof deferLeasedJob;
  clearTimeout: typeof globalThis.clearTimeout;
  setTimeout: typeof globalThis.setTimeout;
}

/**
 * The production dependencies for one tick. The job handlers share one set
 * of job dependencies, so the delivery policy and mail configuration are
 * read at most once per tick, and only when a job needs them.
 *
 * @param environment - The process environment.
 * @param options - Test seams for the job dependencies (the Resend client).
 * @throws When a lifecycle switch is malformed.
 */
export function createLifecycleDispatcherDependencies(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: LifecycleJobDependencyOptions = {},
): LifecycleDispatcherDependencies {
  const jobDependencies = createDefaultLifecycleJobDependencies(
    environment,
    options,
  );
  return {
    appHandlers: createLifecycleAppJobHandlers(jobDependencies),
    createDatabase: () => createDatabaseExecutor(environment['DATABASE_URL']),
    dispatchLeasedJob: dispatchGrowthLeasedJob,
    isRecoveryPaused: isGoogleMailboxRecoveryPaused,
    reconcileMessageIds: (executor, input) =>
      reconcilePendingResendMessageIds(executor, input, {
        fetch: globalThis.fetch,
        env: environment,
      }),
    processObservations,
    processInstallRuntimeActivations,
    materializeCampaignEnrollment,
    recomputeContactScore,
    enqueueInstallDigestJob,
    leaseDueJobs,
    loadEmailKeyring: () => loadEmailHmacKeyring(environment),
    now: () => new Date(),
    renewJobLease,
    quarantineJob: failLeasedJob,
    deferJob: deferLeasedJob,
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  };
}

interface LeaseHeartbeat {
  stop: () => Promise<void>;
}

function startLeaseHeartbeat(
  executor: SqlExecutor,
  job: GrowthJob,
  leaseToken: string,
  dependencies: LifecycleDispatcherDependencies,
  onFailure: (error: Error) => void,
): LeaseHeartbeat {
  let stopped = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const arm = (): void => {
    timer = dependencies.setTimeout(() => {
      inFlight = (async () => {
        const renewed = await dependencies.renewJobLease(executor, {
          jobId: job.id,
          leaseDurationMs: LEASE_DURATION_MS,
          leaseToken,
          now: dependencies.now(),
        });
        if (!stopped && renewed === null) {
          throw new Error('Lifecycle job lease renewal failed');
        }
      })()
        .catch((error: unknown) => {
          if (stopped) return;
          stopped = true;
          onFailure(
            error instanceof Error
              ? error
              : new Error('Lifecycle job lease renewal failed'),
          );
        })
        .finally(() => {
          if (!stopped) arm();
        });
    }, LEASE_RENEWAL_INTERVAL_MS);
  };

  arm();
  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer !== undefined) dependencies.clearTimeout(timer);
      await inFlight;
    },
  };
}

function validBatchSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(
      `batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`,
    );
  }
  return value;
}

function validEnrollmentStart(input: LifecycleDispatcherInput): Date {
  const startAt = input.campaignEnrollmentStartAt;
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error(
      'campaignEnrollmentStartAt is required when enrollment is enabled',
    );
  }
  return startAt;
}

async function prepareTick(
  executor: SqlExecutor,
  input: LifecycleDispatcherInput,
  batchSize: number,
  dependencies: LifecycleDispatcherDependencies,
): Promise<LifecycleOperatorAlert[]> {
  const { signal } = input;
  const alerts: LifecycleOperatorAlert[] = [];
  await dependencies.reconcileMessageIds(executor, {
    now: dependencies.now(),
    signal,
  });
  signal.throwIfAborted();
  if (input.observationProcessingEnabled) {
    try {
      await dependencies.processObservations(executor, {
        enabled: true,
        limit: Math.min(batchSize, OBSERVATION_PROJECTION_MAX_LIMIT),
        now: dependencies.now,
      });
    } catch {
      // A projection failure must not hold back mail; operators are told.
      alerts.push('observation_projection_failed');
    }
    signal.throwIfAborted();
  }
  // Hello runs only alongside enrollment: an approval made while enrollment
  // is off can predate a later CAMPAIGN_ENROLLMENT_START_AT and would never
  // be enrolled.
  if (input.campaignEnrollmentEnabled && input.installRuntimeHelloEnabled) {
    // Returns counts only; newly approved contacts are scored once enrolled.
    await dependencies.processInstallRuntimeActivations(executor, {
      enabled: true,
      limit: batchSize,
      now: dependencies.now(),
      keyring: dependencies.loadEmailKeyring(),
    });
    signal.throwIfAborted();
  }
  if (input.campaignEnrollmentEnabled) {
    const now = dependencies.now();
    const { enrolledContactIds } =
      await dependencies.materializeCampaignEnrollment(executor, {
        enrollmentEnabled: true,
        enrollmentStartAt: validEnrollmentStart(input),
        now,
        batchSize,
      });
    for (const contactId of enrolledContactIds) {
      await dependencies.recomputeContactScore(executor, { contactId, now });
    }
    signal.throwIfAborted();
  }
  if (input.installDigestEnabled) {
    const now = dependencies.now();
    const calendar = pacificCalendarDate(now);
    if (calendar.weekday) {
      await dependencies.enqueueInstallDigestJob(executor, {
        now,
        idempotencyKey: `install_digest:${calendar.date}`,
        businessDate: calendar.date,
        keyring: dependencies.loadEmailKeyring(),
        availableAt: nextPacificBusinessMorning(now),
      });
      signal.throwIfAborted();
    }
  }
  return alerts;
}

/**
 * One lifecycle tick. In order: Resend message-id reconciliation,
 * observation projection (a failure only raises
 * `observation_projection_failed`), hello activations (only while enrollment
 * is also on), enrollment
 * materialization (then rescoring each enrolled contact), the Pacific-weekday
 * install digest enqueue, then a lease of up to `batchSize` due jobs that are
 * dispatched one at a time. Each lease lasts 60 s and is renewed every 20 s
 * while the tick runs; a failed renewal aborts the loop. A
 * {@link DeterministicLifecycleJobError} quarantines its job
 * (`deterministic_job_poison`); a {@link JobLeaseConflictError} drops the job
 * (it is no longer ours); a `recovery_paused` job is deferred 60 s with
 * `mailbox_recovery_paused`. Once {@link TICK_JOB_START_BUDGET_MS} has passed
 * since the tick began, no further job starts: each remaining leased job is
 * deferred to now with `tick_budget_exhausted` (and not counted as
 * dispatched), and when preparing the tick alone used the budget nothing is
 * leased. Overlapping ticks never share a job, because leasing skips locked
 * and live-leased rows.
 *
 * @param input - The batch size, switches and abort signal.
 * @param dependencies - The tick's collaborators.
 * @throws When the batch size or enrollment start is invalid, the tick is
 *   aborted, a lease renewal fails, or a non-deterministic error occurs.
 */
export async function dispatchLifecycleJobs(
  input: LifecycleDispatcherInput,
  dependencies: LifecycleDispatcherDependencies,
): Promise<LifecycleDispatcherResult> {
  const tickStartedAt = dependencies.now().getTime();
  const budgetMs = input.tickJobStartBudgetMs ?? TICK_JOB_START_BUDGET_MS;
  const budgetSpent = (now: Date): boolean =>
    now.getTime() - tickStartedAt >= budgetMs;
  const batchSize = validBatchSize(input.batchSize);
  if (input.campaignEnrollmentEnabled) validEnrollmentStart(input);
  input.signal.throwIfAborted();
  const executor = dependencies.createDatabase();
  try {
    const operatorAlerts = await prepareTick(
      executor,
      input,
      batchSize,
      dependencies,
    );
    let recoveryPaused = await dependencies.isRecoveryPaused(executor);
    input.signal.throwIfAborted();
    const withAlerts = (
      leased: number,
      dispatched: number,
    ): LifecycleDispatcherResult => ({
      leased,
      dispatched,
      recoveryPaused,
      operatorAlerts: recoveryPaused
        ? [...operatorAlerts, 'mailbox_recovery_required']
        : operatorAlerts,
    });
    if (budgetSpent(dependencies.now())) return withAlerts(0, 0);
    const jobs = await dependencies.leaseDueJobs(executor, {
      kinds: [...LEASED_KINDS],
      now: dependencies.now(),
      batchSize,
      leaseDurationMs: LEASE_DURATION_MS,
      campaignEnabled: input.campaignEnabled,
      isSendWindow: isCampaignSendWindow,
    });
    const leaseFailure = new AbortController();
    let leaseFailureReason: Error | null = null;
    const failLease = (error: Error): void => {
      if (leaseFailureReason) return;
      leaseFailureReason = error;
      leaseFailure.abort(error);
    };
    const signal = AbortSignal.any([input.signal, leaseFailure.signal]);
    const heartbeats = new Map<string, LeaseHeartbeat>();
    for (const job of jobs) {
      if (!job.leaseToken) {
        throw new Error('Lifecycle leased job is missing its lease token');
      }
      heartbeats.set(
        job.id,
        startLeaseHeartbeat(
          executor,
          job,
          job.leaseToken,
          dependencies,
          failLease,
        ),
      );
    }
    let dispatched = 0;
    let budgetExhausted = false;
    try {
      for (const job of jobs) {
        signal.throwIfAborted();
        const leaseToken = job.leaseToken as string;
        const startAt = dependencies.now();
        if (budgetExhausted || budgetSpent(startAt)) {
          // Release at once so the next tick can lease it, instead of
          // leaving it leased until the lease expires.
          budgetExhausted = true;
          const heartbeat = heartbeats.get(job.id);
          heartbeats.delete(job.id);
          await heartbeat?.stop();
          await dependencies.deferJob(executor, {
            jobId: job.id,
            leaseToken,
            now: startAt,
            availableAt: startAt,
            errorCode: 'tick_budget_exhausted',
          });
          continue;
        }
        try {
          const result = await dependencies.dispatchLeasedJob(executor, job, {
            appHandlers: dependencies.appHandlers,
            signal,
            now: dependencies.now,
          });
          // Release a paused job before honouring an abort, so it is not
          // left leased until the lease expires.
          if (result === 'recovery_paused') {
            recoveryPaused = true;
            const now = dependencies.now();
            await dependencies.deferJob(executor, {
              jobId: job.id,
              leaseToken,
              now,
              availableAt: new Date(now.getTime() + RECOVERY_RETRY_DELAY_MS),
              errorCode: 'mailbox_recovery_paused',
            });
          }
          signal.throwIfAborted();
          dispatched += 1;
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof JobLeaseConflictError) continue;
          if (!(error instanceof DeterministicLifecycleJobError)) throw error;
          await dependencies.quarantineJob(executor, {
            errorCode: 'deterministic_job_poison',
            jobId: job.id,
            leaseToken,
            now: dependencies.now(),
          });
          dispatched += 1;
        } finally {
          const heartbeat = heartbeats.get(job.id);
          heartbeats.delete(job.id);
          await heartbeat?.stop();
        }
      }
    } finally {
      await Promise.all([...heartbeats.values()].map(({ stop }) => stop()));
    }
    if (leaseFailureReason) throw leaseFailureReason;
    return withAlerts(jobs.length, dispatched);
  } finally {
    await executor.close?.();
  }
}
