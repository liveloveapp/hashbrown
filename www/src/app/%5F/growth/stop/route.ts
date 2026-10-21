import {
  createDatabaseExecutor,
  FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS,
  growthStopEventKey,
  type GrowthTokenKeyring,
  loadGrowthTokenKeyring,
  type SqlExecutor,
  stopContact,
  type StopContactInput,
  type StopContactResult,
  verifyGrowthActionToken,
} from '@hashbrownai-internal/growth';

import { readBoundedBody } from '../../_internal/read-bounded-body';

const POLICY_VERSION = 'growth-lifecycle-v1';
const MAX_REQUEST_BODY_LENGTH = 2_048;
const FAILURE_BODY = 'Unable to process this request.';

interface FounderStopRouteDependencies {
  now: () => Date;
  loadTokenKeyring: () => GrowthTokenKeyring;
  createDatabase: () => SqlExecutor;
  stopContact: (
    executor: SqlExecutor,
    input: StopContactInput,
  ) => Promise<Pick<StopContactResult, 'applied' | 'effective'>>;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"'`]/gu, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return '&#96;';
    }
  });
}

function htmlResponse(title: string, message: string, form = ''): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`,
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  );
}

function failureResponse(): Response {
  return new Response(FAILURE_BODY, {
    status: 400,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function confirmationResponse(token: string): Response {
  return htmlResponse(
    'Confirm contact stop',
    'Submit this form to stop automated contact.',
    `<form method="post" action="/_/growth/stop"><input type="hidden" name="token" value="${escapeHtmlAttribute(token)}"><button type="submit">Confirm</button></form>`,
  );
}

function successResponse(): Response {
  return htmlResponse('Contact stop recorded', 'The request was recorded.');
}

function defaultDependencies(): FounderStopRouteDependencies {
  return {
    now: () => new Date(),
    loadTokenKeyring: () => loadGrowthTokenKeyring(),
    createDatabase: () => createDatabaseExecutor(),
    stopContact,
  };
}

async function readToken(request: Request): Promise<string | null> {
  if ([...new URL(request.url).searchParams].length > 0) return null;
  const contentType = request.headers.get('content-type');
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/x-www-form-urlencoded'
  ) {
    return null;
  }

  let bodyText: string;
  try {
    const boundedBody = await readBoundedBody(request, MAX_REQUEST_BODY_LENGTH);
    if (boundedBody === null) return null;
    bodyText = boundedBody;
  } catch {
    return null;
  }
  if (bodyText.length === 0) {
    return null;
  }
  const entries = [...new URLSearchParams(bodyText).entries()];
  const token = entries[0]?.[1].trim() ?? '';
  return entries.length === 1 && entries[0]?.[0] === 'token' && token.length > 0
    ? token
    : null;
}

/**
 * Builds the `/_/growth/stop` handlers. GET verifies a 24 hour `founder_stop`
 * token and renders the confirm form; POST stops the contact.
 *
 * @param overrides - Dependencies to replace, for tests.
 */
export function createFounderStopRoute(
  overrides: Partial<FounderStopRouteDependencies> = {},
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  const dependencies = { ...defaultDependencies(), ...overrides };

  function verify(token: string, verifiedAt = dependencies.now()) {
    try {
      return verifyGrowthActionToken(token, {
        expectedPurpose: 'founder_stop',
        keyring: dependencies.loadTokenKeyring(),
        now: verifiedAt,
        maxAgeSeconds: FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS,
      });
    } catch {
      return null;
    }
  }

  return {
    async GET(request) {
      const token = new URL(request.url).searchParams.get('token')?.trim();
      if (!token) return failureResponse();
      return verify(token) ? confirmationResponse(token) : failureResponse();
    },

    async POST(request) {
      const receivedAt = dependencies.now();
      const token = await readToken(request);
      if (!token) return failureResponse();
      const payload = verify(token, receivedAt);
      if (!payload) return failureResponse();

      const executor = dependencies.createDatabase();
      try {
        await dependencies.stopContact(executor, {
          contactId: payload.contactId,
          reason: 'manual_suppression',
          eventKey: growthStopEventKey(payload),
          occurredAt: receivedAt,
          source: 'signed_founder_stop',
          provenance: {
            actor: 'founder',
            kind: 'founder_action',
            policyVersion: POLICY_VERSION,
          },
        });
        return successResponse();
      } catch {
        return failureResponse();
      } finally {
        await executor.close?.();
      }
    },
  };
}

const route = createFounderStopRoute();

/** GET /_/growth/stop. */
export const GET = route.GET;
/** POST /_/growth/stop. */
export const POST = route.POST;
