import {
  approveContactFromInstallDigest,
  type ApproveContactFromInstallDigestInput,
  type ApproveContactFromInstallDigestResult,
  createDatabaseExecutor,
  type EmailHmacKeyring,
  FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS,
  growthStopEventKey,
  type GrowthTokenKeyring,
  loadGrowthTokenKeyring,
  parseEmailHmacKeyring,
  type SqlExecutor,
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

const MAX_REQUEST_BODY_LENGTH = 2_048;

interface FounderApproveInstallRouteDependencies {
  now: () => Date;
  loadTokenKeyring: () => GrowthTokenKeyring;
  loadEmailKeyring: () => EmailHmacKeyring;
  createDatabase: () => SqlExecutor;
  approveContactFromInstallDigest: (
    executor: SqlExecutor,
    input: ApproveContactFromInstallDigestInput,
  ) => Promise<ApproveContactFromInstallDigestResult>;
}

function confirmationResponse(token: string): Response {
  return htmlResponse(
    'Confirm outreach approval',
    'Submit this form to approve founder outreach for this installer.',
    `<form method="post" action="/_/growth/approve-install"><input type="hidden" name="token" value="${escapeHtmlAttribute(token)}"><button type="submit">Approve</button></form>`,
  );
}

function successResponse(): Response {
  return htmlResponse('Outreach approved', 'Outreach approved.');
}

function defaultDependencies(): FounderApproveInstallRouteDependencies {
  return {
    now: () => new Date(),
    loadTokenKeyring: () => loadGrowthTokenKeyring(),
    loadEmailKeyring: () => parseEmailHmacKeyring(process.env),
    createDatabase: () => createDatabaseExecutor(),
    approveContactFromInstallDigest,
  };
}

/**
 * Builds the `/_/growth/approve-install` handlers. GET verifies a 7 day
 * `founder_approve_install` token and renders a confirm form (approval is
 * POST-only, so a link prefetcher cannot approve). POST approves the contact
 * from the install digest. An invalid token or a refused approval gets 400; a
 * database fault gets 503 with `Retry-After: 30`.
 *
 * @param overrides - Dependencies to replace, for tests.
 */
export function createFounderApproveInstallRoute(
  overrides: Partial<FounderApproveInstallRouteDependencies> = {},
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  const dependencies = { ...defaultDependencies(), ...overrides };

  function verify(token: string, verifiedAt = dependencies.now()) {
    try {
      return verifyGrowthActionToken(token, {
        expectedPurpose: 'founder_approve_install',
        keyring: dependencies.loadTokenKeyring(),
        now: verifiedAt,
        maxAgeSeconds: FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS,
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
        const result = await dependencies.approveContactFromInstallDigest(
          executor,
          {
            installObservationId: payload.contactId,
            occurredAt: receivedAt,
            eventKey: growthStopEventKey(payload),
            keyring: dependencies.loadEmailKeyring(),
          },
        );
        return result.approved ? successResponse() : failureResponse();
      } catch {
        return retryableFailureResponse();
      } finally {
        await executor.close?.();
      }
    },
  };
}

const route = createFounderApproveInstallRoute();

/** GET /_/growth/approve-install. */
export const GET = route.GET;
/** POST /_/growth/approve-install. */
export const POST = route.POST;
