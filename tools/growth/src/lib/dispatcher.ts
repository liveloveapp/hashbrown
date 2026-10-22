import type { SqlExecutor } from './database.ts';
import type { GrowthJob } from './models.ts';
import {
  isGoogleMailboxRecoveryPaused,
  type ProcessGoogleMailboxEventDependencies,
  settleGoogleReplyReconciliation,
} from './replies.ts';

/** What dispatching one leased job did. */
export type GrowthDispatchResult =
  'completed' | 'deferred' | 'cancelled' | 'failed' | 'recovery_paused';

/** The leased job kinds the lifecycle app handles; `reply_reconcile` is handled here. */
export type GrowthAppJobKind = 'fulfill' | 'notify' | 'send_step' | 'digest';

/** Per-dispatch context handed to an app handler. */
export interface GrowthAppJobDispatchContext {
  signal?: AbortSignal;
}

/** Runs one leased job of an app kind and settles its lease. */
export type GrowthAppJobHandler = (
  executor: SqlExecutor,
  job: GrowthJob,
  context: GrowthAppJobDispatchContext,
) => Promise<GrowthDispatchResult>;

/** The app's handlers by kind; a leased kind without one is a programming error. */
export type GrowthAppJobHandlers = Partial<
  Record<GrowthAppJobKind, GrowthAppJobHandler>
>;

/** Collaborators of {@link dispatchGrowthLeasedJob}. */
export interface GrowthDispatchDependencies {
  signal?: AbortSignal;
  /** The clock for reply settlement; defaults to the system clock. */
  now?: () => Date;
  /** Overrides for the reply path, such as the stop; defaults to the canonical stop. */
  googleMailbox?: ProcessGoogleMailboxEventDependencies;
  appHandlers?: GrowthAppJobHandlers;
}

const APP_JOB_KINDS: ReadonlySet<string> = new Set<GrowthAppJobKind>([
  'fulfill',
  'notify',
  'send_step',
  'digest',
]);

const SETTLEMENT_RESULTS = {
  completed: 'completed',
  retry_scheduled: 'deferred',
  founder_review: 'failed',
  ignored_deleted: 'cancelled',
  recovery_paused: 'recovery_paused',
} as const satisfies Record<
  Awaited<ReturnType<typeof settleGoogleReplyReconciliation>>,
  GrowthDispatchResult
>;

/**
 * The one dispatch boundary for jobs returned by `leaseDueJobs`. It settles
 * `reply_reconcile` itself, returns `recovery_paused` for `send_step` and
 * `reply_reconcile` while Google mailbox recovery is open, and otherwise hands
 * the job to the app handler for its kind. Reply settlements map as
 * `retry_scheduled → deferred`, `founder_review → failed` and
 * `ignored_deleted → cancelled`.
 *
 * @throws When the job is not leased, its kind is unknown, or no app handler
 *   is registered for it.
 */
export async function dispatchGrowthLeasedJob(
  executor: SqlExecutor,
  job: GrowthJob,
  dependencies: GrowthDispatchDependencies = {},
): Promise<GrowthDispatchResult> {
  const { signal } = dependencies;
  signal?.throwIfAborted();
  const appHandler = APP_JOB_KINDS.has(job.kind)
    ? dependencies.appHandlers?.[job.kind as GrowthAppJobKind]
    : undefined;
  if (
    job.status !== 'leased' ||
    !job.leaseToken ||
    (job.kind !== 'reply_reconcile' && !appHandler)
  ) {
    throw new Error(`Unsupported or inactive growth job kind: ${job.kind}`);
  }
  if (
    (job.kind === 'reply_reconcile' || job.kind === 'send_step') &&
    (await isGoogleMailboxRecoveryPaused(executor))
  ) {
    return 'recovery_paused';
  }
  signal?.throwIfAborted();
  if (appHandler) return appHandler(executor, job, { signal });
  const settlement = await settleGoogleReplyReconciliation(
    executor,
    {
      jobId: job.id,
      leaseToken: job.leaseToken,
      now: (dependencies.now ?? (() => new Date()))(),
    },
    dependencies.googleMailbox,
  );
  return SETTLEMENT_RESULTS[settlement];
}
