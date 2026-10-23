import { timingSafeEqual } from 'node:crypto';

import {
  deleteLifecycleThread,
  invokeLifecycle,
  type InvokeLifecycleInput,
  type InvokeLifecycleResult,
  LIFECYCLE_THREAD_DELETE_TIMEOUT_MS,
  type LifecycleOperatorAlert,
  lifecycleThreadId,
} from '../../../../lib/growth/lifecycle-client';

// Matches the entrypoint's statically declared 60-second runtime limit.
const CRON_MAX_DURATION_MS = 60_000;

// Just under the route's own limit, so a long tick still reports its alerts.
const CRON_INVOKE_TIMEOUT_MS = 58_000;

// Left unspent so the response always lands inside the route's own limit.
const CRON_RESPONSE_MARGIN_MS = 1_000;
const MIN_DELETE_MS = 250;

interface LifecycleCronDependencies {
  invoke: (input: InvokeLifecycleInput) => Promise<InvokeLifecycleResult>;
  deleteThread?: typeof deleteLifecycleThread;
  /** The clock in milliseconds, replaceable for tests. */
  now?: () => number;
}

const defaultDependencies: LifecycleCronDependencies = {
  invoke: invokeLifecycle,
  deleteThread: deleteLifecycleThread,
};

function exactBearer(
  value: string | null,
  secret: string | undefined,
): boolean {
  if (!value || !secret) return false;
  const actual = Buffer.from(value, 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function response(
  body: {
    accepted: boolean;
    operator_alerts?: LifecycleOperatorAlert[];
  },
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/**
 * Builds the `GET /_/cron/lifecycle` handler: a constant-time `CRON_SECRET`
 * bearer check, then one lifecycle dispatch. 503 when the cron is disabled,
 * unconfigured or the dispatch fails.
 *
 * @param dependencies - The dispatch function, replaceable for tests.
 */
export function createLifecycleCronRoute(
  dependencies: LifecycleCronDependencies = defaultDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (
      !exactBearer(
        request.headers.get('authorization'),
        process.env['CRON_SECRET'],
      )
    ) {
      return response({ accepted: false }, 401);
    }
    const enabled = process.env['LIFECYCLE_CRON_ENABLED'];
    if (enabled !== 'true') {
      if (enabled !== undefined && enabled !== 'false') {
        console.warn('[lifecycle-cron-misconfigured]');
      }
      return response({ accepted: false }, 503);
    }
    const baseUrl = process.env['LIFECYCLE_URL']?.trim();
    const serviceSecret = process.env['LIFECYCLE_SERVICE_SECRET'];
    if (!baseUrl || !serviceSecret) return response({ accepted: false }, 503);
    const deleteThread = dependencies.deleteThread ?? deleteLifecycleThread;
    const now = dependencies.now ?? Date.now;
    const startedAt = now();
    // Runs after the outcome is logged. The delete is capped by the time left
    // in the route's budget, and the wait is raced so a stuck delete cannot
    // push the response past it.
    const cleanUp = async (threadId: string | undefined): Promise<void> => {
      if (threadId === undefined) return;
      const budgetMs = Math.min(
        LIFECYCLE_THREAD_DELETE_TIMEOUT_MS,
        CRON_MAX_DURATION_MS - (now() - startedAt) - CRON_RESPONSE_MARGIN_MS,
      );
      if (budgetMs < MIN_DELETE_MS) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          deleteThread({
            baseUrl,
            serviceSecret,
            threadId,
            timeoutMs: budgetMs,
          }),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, budgetMs);
          }),
        ]);
      } catch {
        // Best effort: the dispatch outcome stands.
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      const result = await dependencies.invoke({
        baseUrl,
        serviceSecret,
        timeoutMs: CRON_INVOKE_TIMEOUT_MS,
        trigger: 'cron',
      });
      for (const alert of result.operatorAlerts) {
        console.warn('[lifecycle-operator-alert]', alert);
      }
      await cleanUp(result.threadId);
      return response(
        { accepted: true, operator_alerts: result.operatorAlerts },
        200,
      );
    } catch (error) {
      console.warn(
        '[lifecycle-cron-failed]',
        error instanceof Error ? error.message : 'unknown',
      );
      await cleanUp(lifecycleThreadId(error));
      return response({ accepted: false }, 503);
    }
  };
}
