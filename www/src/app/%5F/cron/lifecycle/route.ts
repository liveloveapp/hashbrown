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

/** Always evaluated per request; a cron tick is never cached. */
export const dynamic = 'force-dynamic';

/** Seconds the route may run: a lifecycle tick may take up to 60 s. */
export const maxDuration = 60;

// Just under the route's own limit, so a long tick still reports its alerts.
const CRON_INVOKE_TIMEOUT_MS = 58_000;

interface LifecycleCronDependencies {
  invoke: (input: InvokeLifecycleInput) => Promise<InvokeLifecycleResult>;
  deleteThread?: typeof deleteLifecycleThread;
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
    const cleanUp = async (threadId: string | undefined): Promise<void> => {
      if (threadId === undefined) return;
      try {
        await deleteThread({
          baseUrl,
          serviceSecret,
          threadId,
          timeoutMs: LIFECYCLE_THREAD_DELETE_TIMEOUT_MS,
        });
      } catch {
        // Best effort: the dispatch outcome stands.
      }
    };
    try {
      const result = await dependencies.invoke({
        baseUrl,
        serviceSecret,
        timeoutMs: CRON_INVOKE_TIMEOUT_MS,
        trigger: 'cron',
      });
      await cleanUp(result.threadId);
      for (const alert of result.operatorAlerts) {
        console.warn('[lifecycle-operator-alert]', alert);
      }
      return response(
        { accepted: true, operator_alerts: result.operatorAlerts },
        200,
      );
    } catch (error) {
      await cleanUp(lifecycleThreadId(error));
      console.warn(
        '[lifecycle-cron-failed]',
        error instanceof Error ? error.message : 'unknown',
      );
      return response({ accepted: false }, 503);
    }
  };
}

/** GET /_/cron/lifecycle. */
export const GET = createLifecycleCronRoute();
