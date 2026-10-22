import { Resend } from 'resend';

import {
  admitInboxEvent,
  createDatabaseExecutor,
  createInboxRuntime,
  type InboxPilot,
  loadInboxPilot,
  processInboxReceipt,
  type SqlExecutor,
} from '@hashbrownai-internal/growth';
import { readBoundedBody } from '../../_internal/read-bounded-body';

interface InboundDependencies {
  forwardReceipt?: (db: SqlExecutor, id: string) => Promise<string | null>;
  loadConfig: () => InboxPilot;
  loadSecret: () => string;
  verify: (input: {
    payload: string;
    headers: { id: string; timestamp: string; signature: string };
    webhookSecret: string;
  }) => unknown;
  createDatabase: () => SqlExecutor;
  admit: typeof admitInboxEvent;
  process: (
    db: SqlExecutor,
    id: string,
    config: Extract<InboxPilot, { enabled: true }>,
  ) => Promise<string>;
}

const defaults = (): InboundDependencies => ({
  loadConfig: loadInboxPilot,
  loadSecret: () => process.env['RESEND_INBOUND_WEBHOOK_SECRET'] ?? '',
  verify: (input) => new Resend('re_verify_only').webhooks.verify(input),
  createDatabase: createDatabaseExecutor,
  admit: admitInboxEvent,
  process: (db, id, config) =>
    processInboxReceipt(db, id, config, createInboxRuntime()),
  forwardReceipt: (db, id) => createInboxRuntime().forwardReceipt(db, id),
});

/** Builds an isolated, signed receiving endpoint; acknowledgements require durable admission. */
export function createResendInboundRoute(
  deps: InboundDependencies = defaults(),
): { POST: (request: Request) => Promise<Response> } {
  const response = (status: number) =>
    new Response(status === 200 ? 'Accepted' : 'Unable to process request', {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  return {
    async POST(request) {
      let config: InboxPilot;
      let secret: string;
      try {
        config = deps.loadConfig();
        secret = deps.loadSecret();
      } catch {
        return response(503);
      }
      if (!config.enabled || !secret || secret.length > 2048)
        return response(503);
      const header = (name: string) => {
        const value = request.headers.get(name);
        return value && value.length <= 2048 && !/[\r\n\0]/.test(value)
          ? value
          : null;
      };
      const id = header('svix-id'),
        timestamp = header('svix-timestamp'),
        signature = header('svix-signature');
      if (!id || !timestamp || !signature) return response(400);
      const payload = await readBoundedBody(request, 65536);
      if (payload === null) return response(413);
      let verified: unknown;
      try {
        verified = deps.verify({
          payload,
          headers: { id, timestamp, signature },
          webhookSecret: secret,
        });
      } catch {
        return response(400);
      }
      let db: SqlExecutor | undefined;
      try {
        db = deps.createDatabase();
        const emailId = await deps.admit(db, verified, config);
        if (emailId) {
          let failed = false;
          try {
            await deps.process(db, emailId, config);
          } catch {
            failed = true;
          }
          try {
            await deps.forwardReceipt?.(db, emailId);
          } catch {
            failed = true;
          }
          if (failed) return response(503);
        }
        return response(200);
      } catch {
        return response(503);
      } finally {
        await db?.close?.();
      }
    },
  };
}

/** POST /_/webhooks/resend-inbound. */
export const { POST } = createResendInboundRoute();
