import {
  createDatabaseExecutor,
  growthStopEventKey,
  type GrowthTokenKeyring,
  loadGrowthTokenKeyring,
  type SqlExecutor,
  stopContact,
  type StopContactInput,
  type StopContactResult,
  verifyGrowthActionToken,
} from '@hashbrownai-internal/growth';

import { readBoundedBody } from '../_internal/read-bounded-body';

const UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS = 5 * 365 * 24 * 60 * 60;
const POLICY_VERSION = 'growth-lifecycle-v1';
const MAX_REQUEST_BODY_LENGTH = 2_048;
const FAILURE_BODY = 'Unable to process this request.';

interface UnsubscribeRouteDependencies {
  now: () => Date;
  loadTokenKeyring: () => GrowthTokenKeyring;
  createDatabase: () => SqlExecutor;
  stopContact: (
    executor: SqlExecutor,
    input: StopContactInput,
  ) => Promise<Pick<StopContactResult, 'applied' | 'effective'>>;
}

interface PostInput {
  token: string;
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
    'Confirm email preference',
    'Submit this form to unsubscribe from Hashbrown emails.',
    `<form method="post" action="/_/unsubscribe"><input type="hidden" name="token" value="${escapeHtmlAttribute(token)}"><button type="submit">Confirm</button></form>`,
  );
}

function successResponse(): Response {
  return htmlResponse('Email preference updated', 'The request was recorded.');
}

/**
 * A server fault is never reported as a recorded preference. The recipient gets
 * a retryable answer with no internal detail, and the caller can try again.
 */
function retryableFailureResponse(): Response {
  return new Response(FAILURE_BODY, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '30',
    },
  });
}

function defaultDependencies(): UnsubscribeRouteDependencies {
  return {
    now: () => new Date(),
    loadTokenKeyring: () => loadGrowthTokenKeyring(),
    createDatabase: () => createDatabaseExecutor(),
    stopContact,
  };
}

async function readPostInput(request: Request): Promise<PostInput | null> {
  const url = new URL(request.url);
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
  const queryEntries = [...url.searchParams.entries()];
  const formEntries = [...new URLSearchParams(bodyText).entries()];

  if (queryEntries.length > 0) {
    const queryToken = queryEntries[0]?.[1].trim() ?? '';
    return queryEntries.length === 1 &&
      queryEntries[0]?.[0] === 'token' &&
      queryToken.length > 0 &&
      formEntries.length === 1 &&
      formEntries[0]?.[0] === 'List-Unsubscribe' &&
      formEntries[0]?.[1] === 'One-Click'
      ? { token: queryToken }
      : null;
  }

  const bodyToken = formEntries[0]?.[1].trim() ?? '';
  return formEntries.length === 1 &&
    formEntries[0]?.[0] === 'token' &&
    bodyToken.length > 0
    ? { token: bodyToken }
    : null;
}

async function withDatabase<T>(
  dependencies: UnsubscribeRouteDependencies,
  operation: (executor: SqlExecutor) => Promise<T>,
): Promise<T> {
  const executor = dependencies.createDatabase();
  try {
    return await operation(executor);
  } finally {
    await executor.close?.();
  }
}

function signedStopInput(
  payload: NonNullable<ReturnType<typeof verifyGrowthActionToken>>,
  receivedAt: Date,
): StopContactInput {
  return {
    contactId: payload.contactId,
    reason: 'unsubscribe',
    eventKey: growthStopEventKey(payload),
    occurredAt: receivedAt,
    source: 'signed_unsubscribe',
    provenance: {
      actor: 'recipient',
      kind: 'one_click',
      policyVersion: POLICY_VERSION,
    },
  };
}

/**
 * Builds the `/_/unsubscribe` handlers. GET renders the confirm form for a
 * valid token and answers 400 to anything else, including a request without a
 * token; POST accepts an RFC 8058 one-click or the confirm form and stops the
 * contact.
 *
 * @param overrides - Dependencies to replace, for tests.
 */
export function createUnsubscribeRoute(
  overrides: Partial<UnsubscribeRouteDependencies> = {},
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  const dependencies = { ...defaultDependencies(), ...overrides };

  return {
    async GET(request) {
      const url = new URL(request.url);
      const token = url.searchParams.get('token')?.trim();
      if (!token) return failureResponse();

      let payload;
      try {
        payload = verifyGrowthActionToken(token, {
          expectedPurpose: 'unsubscribe',
          keyring: dependencies.loadTokenKeyring(),
          now: dependencies.now(),
          maxAgeSeconds: UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS,
        });
      } catch {
        return failureResponse();
      }
      return payload ? confirmationResponse(token) : failureResponse();
    },

    async POST(request) {
      const receivedAt = dependencies.now();
      const input = await readPostInput(request);
      if (!input) return failureResponse();

      let payload;
      try {
        payload = verifyGrowthActionToken(input.token, {
          expectedPurpose: 'unsubscribe',
          keyring: dependencies.loadTokenKeyring(),
          now: receivedAt,
          maxAgeSeconds: UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS,
        });
      } catch {
        return failureResponse();
      }
      if (!payload) return failureResponse();

      try {
        await withDatabase(dependencies, (executor) =>
          dependencies.stopContact(
            executor,
            signedStopInput(payload, receivedAt),
          ),
        );
        return successResponse();
      } catch {
        return retryableFailureResponse();
      }
    },
  };
}

const route = createUnsubscribeRoute();

/** GET /_/unsubscribe. */
export const GET = route.GET;
/** POST /_/unsubscribe. */
export const POST = route.POST;
