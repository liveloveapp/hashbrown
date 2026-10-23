import { timingSafeEqual } from 'node:crypto';

import {
  createDatabaseExecutor,
  createInboxRuntime,
  loadInboxPilot,
  recoverInbox,
} from '@hashbrownai-internal/growth';

interface RecoveryRouteDependencies {
  secret: () => string;
  recover: () => Promise<{ received: number; processed: number }>;
}

/** Builds a bearer-authenticated recovery endpoint suitable for Vercel Cron. */
export function createInboxRecoveryRoute(
  deps: RecoveryRouteDependencies = {
    secret: () => process.env['CRON_SECRET'] ?? '',
    recover: async () => {
      const config = loadInboxPilot();
      if (!config.enabled) throw new Error('Pilot is disabled');
      const runtime = createInboxRuntime();
      const db = createDatabaseExecutor();
      try {
        return await recoverInbox(db, config, runtime);
      } finally {
        await db.close?.();
      }
    },
  },
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
      try {
        return Response.json(await deps.recover(), {
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch {
        return new Response('Recovery unavailable', {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    },
  };
}
