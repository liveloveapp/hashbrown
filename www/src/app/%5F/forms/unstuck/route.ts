import {
  acceptFormSubmission,
  createDatabaseExecutor,
  type EmailHmacKeyring,
  FormRateLimitError,
  normalizeRecipientEmail,
  parseEmailHmacKeyring,
  type SqlExecutor,
  UNSTUCK_FRAMEWORKS,
} from '@hashbrownai-internal/growth';
import { z } from 'zod';

import {
  jsonResponse,
  trustedFormClientIp,
  UNSTUCK_FORM_DISCLOSURE,
  UNSTUCK_FORM_POLICY_VERSION,
  unstuckFormEnabled,
} from '../../../../lib/growth/form-route';
import { nudgeLifecycle } from '../../../../lib/growth/lifecycle-client';
import { readBoundedBody } from '../../_internal/read-bounded-body';

/** Always evaluated per request. */
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8_192;

// `.trim()` then `.min/.max` count UTF-16 code units, exactly as the growth
// library's `acceptFormSubmission` does.
const unstuckSchema = z.strictObject({
  policy_version: z.string(),
  submission_id: z.uuidv4(),
  email: z.string().max(254),
  framework: z.enum(UNSTUCK_FRAMEWORKS),
  message: z.string().trim().min(20).max(1_000),
  website_url: z.string().max(200).optional(),
});

/** Replaceable collaborators of the Get unstuck route, for tests. */
export interface UnstuckRouteDependencies {
  enabled: () => boolean;
  accept: typeof acceptFormSubmission;
  createDatabase: () => SqlExecutor;
  loadKeyring: () => EmailHmacKeyring;
  now: () => Date;
  nudge: typeof nudgeLifecycle;
}

function defaultDependencies(): UnstuckRouteDependencies {
  return {
    enabled: () => unstuckFormEnabled(process.env),
    accept: acceptFormSubmission,
    createDatabase: () => createDatabaseExecutor(),
    loadKeyring: () => parseEmailHmacKeyring(process.env),
    now: () => new Date(),
    nudge: nudgeLifecycle,
  };
}

function badRequest(error = 'Invalid form submission'): Response {
  return jsonResponse({ error }, 400);
}

function unableToAccept(): Response {
  return jsonResponse(
    { error: 'Unable to accept request', retryable: true },
    503,
  );
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

/**
 * Builds the `POST /_/forms/unstuck` handler. With the switch off it answers
 * 503 before reading the body. Otherwise it validates the body (400, or 409
 * for a missing or stale `policy_version`), accepts the submission in one
 * transaction, closes the database, and only then nudges the lifecycle
 * service; a nudge failure never reaches the visitor. A rate limit answers
 * 429 with `Retry-After`; faults answer a retryable 503. Responses never echo
 * submitted values.
 *
 * @param deps - Collaborators to replace, for tests.
 */
export function createUnstuckRoute(
  deps: UnstuckRouteDependencies = defaultDependencies(),
): { POST: (request: Request) => Promise<Response> } {
  return {
    async POST(request) {
      if (!deps.enabled()) return unableToAccept();

      if (!isJson(request)) {
        if (request.body !== null && !request.body.locked) {
          await request.body.cancel().catch(() => undefined);
        }
        return badRequest();
      }
      const raw = await readBoundedBody(request, MAX_BODY_BYTES);
      if (raw === null) return badRequest();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return badRequest();
      }
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return badRequest();
      }

      if (
        (parsed as Record<string, unknown>)['policy_version'] !==
        UNSTUCK_FORM_POLICY_VERSION
      ) {
        return jsonResponse(
          {
            error: 'This form changed. Please retry.',
            policy_version: UNSTUCK_FORM_POLICY_VERSION,
            retryable: true,
          },
          409,
          { 'Retry-After': '0' },
        );
      }

      const result = unstuckSchema.safeParse(parsed);
      if (!result.success) return badRequest();
      const form = result.data;

      let email: string;
      try {
        email = normalizeRecipientEmail(form.email);
      } catch {
        return badRequest('Valid email required');
      }

      let keyring: EmailHmacKeyring;
      let database: SqlExecutor;
      try {
        keyring = deps.loadKeyring();
        database = deps.createDatabase();
      } catch {
        return unableToAccept();
      }

      const honeypot = form.website_url?.trim();
      const trustedClientIp = trustedFormClientIp(request);
      let accepted = false;
      let deliverySuppressed = false;
      let failure: Response | undefined;
      try {
        const outcome = await deps.accept(database, {
          ...(honeypot ? { honeypot } : {}),
          ...(trustedClientIp ? { trustedClientIp } : {}),
          submissionId: form.submission_id,
          email,
          form: { framework: form.framework, message: form.message },
          noticeText: UNSTUCK_FORM_DISCLOSURE,
          noticeVersion: `${UNSTUCK_FORM_POLICY_VERSION}.unstuck`,
          policyVersion: UNSTUCK_FORM_POLICY_VERSION,
          occurredAt: deps.now(),
          keyring,
        });
        accepted = true;
        deliverySuppressed = outcome.deliverySuppressed === true;
      } catch (error) {
        failure =
          error instanceof FormRateLimitError
            ? jsonResponse(
                { error: 'Please try again later', retryable: true },
                429,
                { 'Retry-After': String(error.retryAfterSec) },
              )
            : undefined;
      }

      try {
        await database.close?.();
      } catch {
        return unableToAccept();
      }
      if (failure) return failure;
      if (!accepted) return unableToAccept();
      if (deliverySuppressed) return jsonResponse({ ok: true });

      // The durable jobs stay available to the scheduled dispatcher.
      await deps
        .nudge({ submissionId: form.submission_id })
        .catch(() => undefined);
      return jsonResponse({ ok: true });
    },
  };
}

/** POST /_/forms/unstuck. */
export const POST = createUnstuckRoute().POST;
