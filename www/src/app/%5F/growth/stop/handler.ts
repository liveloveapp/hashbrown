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

import {
  escapeHtmlAttribute,
  failureResponse,
  htmlResponse,
  readActionToken,
  retryableFailureResponse,
} from '../../_internal/action-page';
import { readBoundedBody } from '../../_internal/read-bounded-body';

const POLICY_VERSION = 'growth-lifecycle-v1';
const MAX_REQUEST_BODY_LENGTH = 2_048;

interface FounderStopRouteDependencies {
  now: () => Date;
  loadTokenKeyring: () => GrowthTokenKeyring;
  createDatabase: () => SqlExecutor;
  stopContact: (
    executor: SqlExecutor,
    input: StopContactInput,
  ) => Promise<Pick<StopContactResult, 'applied' | 'effective'>>;
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

/**
 * Builds the `/_/growth/stop` handlers. GET verifies a 24 hour `founder_stop`
 * token and renders the confirm form; POST stops the contact. An invalid token
 * gets 400; a database fault gets 503 with `Retry-After: 30`.
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
      const token = await readActionToken(
        request,
        MAX_REQUEST_BODY_LENGTH,
        readBoundedBody,
      );
      if (!token) return failureResponse();
      const payload = verify(token, receivedAt);
      if (!payload) return failureResponse();

      let executor: SqlExecutor;
      try {
        executor = dependencies.createDatabase();
      } catch {
        return retryableFailureResponse();
      }
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
        return retryableFailureResponse();
      } finally {
        await executor.close?.();
      }
    },
  };
}
