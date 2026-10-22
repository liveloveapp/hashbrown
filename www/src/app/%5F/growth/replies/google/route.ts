import {
  createDatabaseExecutor,
  type GoogleMailboxEvent,
  parseGoogleMailboxEvent,
  processGoogleMailboxEvent,
  type ProcessGoogleMailboxEventInput,
  type ProcessGoogleMailboxEventResult,
  sha256Base64Url,
  type SqlExecutor,
  verifyGoogleReplySignature,
} from '@hashbrownai-internal/growth';

import { readBoundedBody } from '../../../_internal/read-bounded-body';

const MAX_BODY_BYTES = 32_768;
const MAX_HEADER_LENGTH = 256;

interface GoogleRepliesRouteDependencies {
  now: () => Date;
  loadSecret: () => string;
  verifySignature: typeof verifyGoogleReplySignature;
  parseEvent: (rawBody: string) => GoogleMailboxEvent;
  createDatabase: () => SqlExecutor;
  processEvent: (
    executor: SqlExecutor,
    input: ProcessGoogleMailboxEventInput,
  ) => Promise<ProcessGoogleMailboxEventResult>;
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
    value.length > MAX_HEADER_LENGTH ||
    /[\r\n\0]/u.test(value)
  ) {
    return null;
  }
  return value;
}

function isJson(request: Request): boolean {
  return (
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() === 'application/json'
  );
}

function defaultDependencies(): GoogleRepliesRouteDependencies {
  return {
    now: () => new Date(),
    loadSecret: () => process.env['GOOGLE_REPLY_HMAC_SECRET'] ?? '',
    verifySignature: verifyGoogleReplySignature,
    parseEvent: parseGoogleMailboxEvent,
    createDatabase: () => createDatabaseExecutor(),
    processEvent: processGoogleMailboxEvent,
  };
}

/**
 * Builds the `POST /_/growth/replies/google` handler for the signed mailbox
 * relay. Answers plain text: 400 for a bad envelope, signature or schema, 413
 * for an oversize body, 503 for a persistence fault, 200 `Accepted` otherwise.
 * The request digest is computed over the same bytes the signature covers.
 *
 * @param dependencies - Collaborators to replace, for tests.
 */
export function createGoogleRepliesRoute(
  dependencies: GoogleRepliesRouteDependencies = defaultDependencies(),
): { POST: (request: Request) => Promise<Response> } {
  return {
    async POST(request: Request): Promise<Response> {
      if (!isJson(request)) return response(400);
      const timestamp = requiredHeader(request, 'x-hashbrown-timestamp');
      const nonce = requiredHeader(request, 'x-hashbrown-nonce');
      const signature = requiredHeader(request, 'x-hashbrown-signature');
      if (!timestamp || !nonce || !signature) return response(400);

      const rawBody = await readBoundedBody(request, MAX_BODY_BYTES);
      if (rawBody === null) return response(413);

      const receivedAt = dependencies.now();
      let secret: string;
      try {
        secret = dependencies.loadSecret();
      } catch {
        return response(503);
      }
      // A missing secret is a retryable configuration fault, not a bad request.
      if (secret.length === 0) return response(503);
      try {
        dependencies.verifySignature({
          rawBody,
          timestamp,
          nonce,
          signature,
          secret,
          now: receivedAt,
        });
      } catch {
        return response(400);
      }

      let event: GoogleMailboxEvent;
      try {
        event = dependencies.parseEvent(rawBody);
      } catch {
        return response(400);
      }

      let database: SqlExecutor;
      try {
        database = dependencies.createDatabase();
      } catch {
        return response(503);
      }
      try {
        await dependencies.processEvent(database, {
          event,
          nonce,
          timestamp,
          requestDigest: sha256Base64Url(rawBody),
          receivedAt,
        });
        return response(200);
      } catch {
        // Authentication/schema failures are terminal 400 responses above.
        // Once the request reaches persistence, failures are retryable
        // infrastructure errors; authenticated domain rejections resolve 200.
        return response(503);
      } finally {
        await database.close?.();
      }
    },
  };
}

/** POST /_/growth/replies/google. */
export const { POST } = createGoogleRepliesRoute();
