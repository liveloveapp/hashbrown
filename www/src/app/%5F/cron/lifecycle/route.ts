import { timingSafeEqual } from 'node:crypto';

import {
  invokeLifecycle,
  type InvokeLifecycleInput,
  type InvokeLifecycleResult,
  type LifecycleOperatorAlert,
} from '../../../../lib/growth/lifecycle-client';

/** Always evaluated per request; a cron tick is never cached. */
export const dynamic = 'force-dynamic';

interface LifecycleCronDependencies {
  invoke: (input: InvokeLifecycleInput) => Promise<InvokeLifecycleResult>;
}

const defaultDependencies: LifecycleCronDependencies = {
  invoke: invokeLifecycle,
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
    if (process.env['LIFECYCLE_CRON_ENABLED'] !== 'true') {
      return response({ accepted: false }, 503);
    }
    const baseUrl = process.env['LIFECYCLE_URL']?.trim();
    const serviceSecret = process.env['LIFECYCLE_SERVICE_SECRET'];
    if (!baseUrl || !serviceSecret) return response({ accepted: false }, 503);
    try {
      const result = await dependencies.invoke({
        baseUrl,
        serviceSecret,
        timeoutMs: 15_000,
        trigger: 'cron',
      });
      for (const alert of result.operatorAlerts) {
        console.warn('[lifecycle-operator-alert]', alert);
      }
      return response(
        { accepted: true, operator_alerts: result.operatorAlerts },
        200,
      );
    } catch {
      return response({ accepted: false }, 503);
    }
  };
}

/** GET /_/cron/lifecycle. */
export const GET = createLifecycleCronRoute();
