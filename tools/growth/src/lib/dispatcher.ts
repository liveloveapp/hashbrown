import type { SqlExecutor } from './database.ts';
import type { GrowthJob } from './models.ts';

/**
 * What dispatching one leased job did. `recovery_paused` means the Resend
 * reply mailbox is unhealthy, so the job is still leased and the caller
 * defers it.
 */
export type GrowthDispatchResult =
  'completed' | 'deferred' | 'cancelled' | 'failed' | 'recovery_paused';

/** The leased job kinds the lifecycle app handles. */
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
  appHandlers?: GrowthAppJobHandlers;
}

const APP_JOB_KINDS: ReadonlySet<string> = new Set<GrowthAppJobKind>([
  'fulfill',
  'notify',
  'send_step',
  'digest',
]);

/**
 * The one dispatch boundary for jobs returned by `leaseDueJobs`: hands the
 * job to the app handler for its kind with the abort signal.
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
  if (job.status !== 'leased' || !job.leaseToken || !appHandler) {
    throw new Error(`Unsupported or inactive growth job kind: ${job.kind}`);
  }
  return appHandler(executor, job, { signal });
}
