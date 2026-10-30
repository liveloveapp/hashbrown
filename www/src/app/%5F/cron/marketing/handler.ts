import { timingSafeEqual } from 'node:crypto';

import {
  deleteMarketingThread,
  invokeMarketing,
  type InvokeMarketingInput,
  type InvokeMarketingResult,
  MARKETING_THREAD_DELETE_TIMEOUT_MS,
  type MarketingOperatorAlert,
  marketingThreadId,
} from '../../../../lib/marketing/marketing-client';

// Matches the entrypoint's statically declared 60-second runtime limit.
const CRON_MAX_DURATION_MS = 60_000;

// Just under the route's own limit, so a long tick still reports its alerts.
const CRON_INVOKE_TIMEOUT_MS = 58_000;

// Left unspent so the response always lands inside the route's own limit.
const CRON_RESPONSE_MARGIN_MS = 1_000;
const MIN_DELETE_MS = 250;

interface MarketingCronDependencies {
  invoke: (input: InvokeMarketingInput) => Promise<InvokeMarketingResult>;
  deleteThread?: typeof deleteMarketingThread;
  /** The clock in milliseconds, replaceable for tests. */
  now?: () => number;
}

const defaultDependencies: MarketingCronDependencies = {
  invoke: invokeMarketing,
  deleteThread: deleteMarketingThread,
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
    operator_alerts?: MarketingOperatorAlert[];
  },
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/**
 * Builds the `GET /_/cron/marketing` handler: a constant-time `CRON_SECRET`
 * bearer check, then one marketing dispatch. 503 when the cron is disabled,
 * unconfigured or the dispatch fails.
 *
 * @param dependencies - The dispatch function, replaceable for tests.
 */
export function createMarketingCronRoute(
  dependencies: MarketingCronDependencies = defaultDependencies,
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
    const enabled = process.env['MARKETING_CRON_ENABLED'];
    if (enabled !== 'true') {
      if (enabled !== undefined && enabled !== 'false') {
        console.warn('[marketing-cron-misconfigured]');
      }
      return response({ accepted: false }, 503);
    }
    const baseUrl = process.env['MARKETING_URL']?.trim();
    const serviceSecret = process.env['MARKETING_SERVICE_SECRET'];
    if (!baseUrl || !serviceSecret) return response({ accepted: false }, 503);
    const deleteThread = dependencies.deleteThread ?? deleteMarketingThread;
    const now = dependencies.now ?? Date.now;
    const startedAt = now();
    // Runs after the outcome is logged. It deletes the cron's own thread under
    // a budget: the time left in the route's limit, capped per delete, with the
    // wait raced so a stuck delete cannot push the response past it.
    const cleanUp = async (threadId: string | undefined): Promise<void> => {
      if (threadId === undefined) return;
      const budgetMs = Math.min(
        MARKETING_THREAD_DELETE_TIMEOUT_MS,
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
        console.warn('[marketing-operator-alert]', alert);
      }
      await cleanUp(result.threadId);
      return response(
        { accepted: true, operator_alerts: result.operatorAlerts },
        200,
      );
    } catch (error) {
      console.warn(
        '[marketing-cron-failed]',
        error instanceof Error ? error.message : 'unknown',
      );
      // Only when the service answered: an unreachable one could not delete.
      await cleanUp(marketingThreadId(error));
      return response({ accepted: false }, 503);
    }
  };
}
