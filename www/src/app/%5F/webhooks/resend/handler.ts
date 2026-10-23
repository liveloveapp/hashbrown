import { Resend } from 'resend';

import {
  createDatabaseExecutor,
  type DeliveryEnvironment,
  loadGrowthDatabaseEnvironment,
  processVerifiedResendWebhook,
  ResendWebhookPayloadError,
  type SqlExecutor,
  stopContact,
} from '@hashbrownai-internal/growth';

import { readBoundedBody } from '../../_internal/read-bounded-body';

const MAX_WEBHOOK_BODY_BYTES = 65_536;
const MAX_SVIX_HEADER_LENGTH = 2_048;

interface VerifyWebhookInput {
  payload: string;
  headers: { id: string; timestamp: string; signature: string };
  webhookSecret: string;
}

interface ResendWebhookRouteDependencies {
  loadWebhookSecret: () => string;
  loadDatabaseEnvironment: () => DeliveryEnvironment;
  verify: (input: VerifyWebhookInput) => unknown;
  createDatabase: () => SqlExecutor;
  processVerifiedResendWebhook: typeof processVerifiedResendWebhook;
  stopContact: typeof stopContact;
}

function response(status: number): Response {
  return new Response(
    status === 200 ? 'Accepted' : 'Unable to process request',
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    },
  );
}

function requiredHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim() ?? '';
  if (
    value.length === 0 ||
    value.length > MAX_SVIX_HEADER_LENGTH ||
    /[\r\n\0]/u.test(value)
  ) {
    return null;
  }
  return value;
}

function defaultDependencies(): ResendWebhookRouteDependencies {
  return {
    loadWebhookSecret: () => process.env['RESEND_WEBHOOK_SECRET'] ?? '',
    loadDatabaseEnvironment: () => loadGrowthDatabaseEnvironment(),
    // The SDK's verify only wraps svix with the webhook secret; no API key is needed.
    verify: (input) =>
      new Resend(
        process.env['RESEND_API_KEY'] ?? 're_webhook_verify_only',
      ).webhooks.verify(input),
    createDatabase: () => createDatabaseExecutor(),
    processVerifiedResendWebhook,
    stopContact,
  };
}

/**
 * Builds the `/_/webhooks/resend` handler: verifies the svix signature over the
 * raw body, then applies the event.
 *
 * @param dependencies - Dependencies to use; defaults to the real ones.
 */
export function createResendWebhookRoute(
  dependencies: ResendWebhookRouteDependencies = defaultDependencies(),
): { POST: (request: Request) => Promise<Response> } {
  return {
    async POST(request: Request): Promise<Response> {
      let secret: string;
      try {
        secret = dependencies.loadWebhookSecret().trim();
      } catch {
        return response(503);
      }
      if (secret.length === 0 || secret.length > 2_048) return response(503);

      const id = requiredHeader(request, 'svix-id');
      const timestamp = requiredHeader(request, 'svix-timestamp');
      const signature = requiredHeader(request, 'svix-signature');
      if (!id || !timestamp || !signature) return response(400);

      const rawPayload = await readBoundedBody(request, MAX_WEBHOOK_BODY_BYTES);
      if (rawPayload === null) return response(413);

      let verifiedPayload: unknown;
      try {
        verifiedPayload = dependencies.verify({
          payload: rawPayload,
          headers: { id, timestamp, signature },
          webhookSecret: secret,
        });
      } catch {
        return response(400);
      }

      let database: SqlExecutor;
      let databaseEnvironment: DeliveryEnvironment;
      try {
        databaseEnvironment = dependencies.loadDatabaseEnvironment();
        database = dependencies.createDatabase();
      } catch {
        return response(503);
      }
      try {
        const result = await dependencies.processVerifiedResendWebhook(
          database,
          {
            providerEventId: id,
            payload: verifiedPayload,
          },
          { databaseEnvironment, stopContact: dependencies.stopContact },
        );
        const status =
          !result.applied && result.reason === 'retryable_unmatched_job'
            ? 503
            : 200;
        console.info(
          JSON.stringify({
            route: 'webhooks/resend',
            status,
            applied: result.applied,
            reason: result.applied ? undefined : result.reason,
          }),
        );
        return response(status);
      } catch (error) {
        const invalidPayload = error instanceof ResendWebhookPayloadError;
        const status = invalidPayload ? 400 : 503;
        console.info(
          JSON.stringify({
            route: 'webhooks/resend',
            status,
            reason: invalidPayload
              ? 'payload_rejected'
              : 'processing_unavailable',
          }),
        );
        return response(status);
      } finally {
        await database.close?.();
      }
    },
  };
}
