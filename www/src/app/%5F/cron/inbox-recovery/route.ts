import { timingSafeEqual } from 'node:crypto';

import {
  createDatabaseExecutor,
  createInboxRuntime,
  loadInboxPilot,
  readInboxHealth,
  type ReceivingHealthAlertResult,
  recoverInbox,
  reportReceivingHealth,
  type SqlExecutor,
} from '@hashbrownai-internal/growth';

interface RecoveryRouteHealth {
  codes: readonly string[];
}

interface RecoveryRouteDependencies {
  secret: () => string;
  recover: () => Promise<{ received: number; processed: number }>;
  readHealth?: () => Promise<RecoveryRouteHealth>;
  report?: (codes: readonly string[]) => Promise<ReceivingHealthAlertResult>;
}

/** Closes each server-side database operation even when recovery or reporting fails. */
async function withDatabase<T>(
  operation: (db: SqlExecutor) => Promise<T>,
): Promise<T> {
  const db = createDatabaseExecutor();
  try {
    return await operation(db);
  } finally {
    await db.close?.();
  }
}

const defaultDependencies: RecoveryRouteDependencies = {
  secret: () => process.env['CRON_SECRET'] ?? '',
  recover: async () => {
    const config = loadInboxPilot();
    if (!config.enabled) throw new Error('Receiving is disabled');
    const runtime = createInboxRuntime();
    return withDatabase((db) => recoverInbox(db, config, runtime));
  },
  readHealth: () =>
    withDatabase(async (db) => {
      const health = await readInboxHealth(db, new Date());
      return health;
    }),
  report: (codes) =>
    withDatabase((db) => reportReceivingHealth(db, codes, process.env)),
};

/** Builds an authenticated recovery endpoint with fail-closed health reporting. */
export function createInboxRecoveryRoute(
  deps: RecoveryRouteDependencies = defaultDependencies,
): { GET: (request: Request) => Promise<Response> } {
  return {
    async GET(request) {
      const secret = deps.secret();
      const expected = Buffer.from(`Bearer ${secret}`);
      const received = Buffer.from(request.headers.get('authorization') ?? '');
      if (
        secret.length < 32 ||
        received.length !== expected.length ||
        !timingSafeEqual(received, expected)
      )
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        });

      let failed = false;
      let result: { received: number; processed: number } | undefined;
      try {
        result = await deps.recover();
      } catch {
        failed = true;
      }
      const recoveryCodes = failed ? ['recovery_failed'] : [];
      let health: RecoveryRouteHealth | undefined;
      let healthCodes: readonly string[] = [];
      if (deps.readHealth || deps.report) {
        try {
          if (!deps.readHealth) throw new Error('Health reader unavailable');
          health = await deps.readHealth();
          healthCodes = health.codes;
        } catch {
          failed = true;
          healthCodes = ['health_read_failed'];
        }
      }
      let notification: ReceivingHealthAlertResult | undefined;
      try {
        const reported = await deps.report?.([
          ...recoveryCodes,
          ...healthCodes,
        ]);
        if (reported) {
          notification = { status: reported.status, queued: reported.queued };
          if (reported.status === 'pending' || reported.status === 'failed') {
            console.warn('Receiving health notification needs attention', {
              status: reported.status,
            });
          }
        }
      } catch {
        failed = true;
      }
      if (failed)
        return new Response('Recovery unavailable', {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        });
      return Response.json(
        {
          ...result,
          ...(health ? { health } : {}),
          ...(notification ? { notification } : {}),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },
  };
}

/** Allow bounded receiving recovery and durable notification on a supported Vercel plan. */
export const maxDuration = 300;

/** GET /_/cron/inbox-recovery. */
export const { GET } = createInboxRecoveryRoute();
