import { isIP } from 'node:net';

/**
 * Version of the Get unstuck form's consent copy. Stored on the consent record
 * and required in every submission; bump it whenever the disclosure changes.
 */
export const UNSTUCK_FORM_POLICY_VERSION = 'unstuck_v1.2026-10-22';

/**
 * The disclosure shown beside the Send button. The route stores it verbatim as
 * the consent record's `notice_text`.
 */
export const UNSTUCK_FORM_DISCLOSURE =
  'By sending, you agree Brian may follow up by email about your request, including a short three-email note about building with Hashbrown. Unsubscribe anytime.';

/**
 * Where visitors can write when the form is off or fails. Temporary until
 * `brian@hashbrown.dev` exists.
 */
export const UNSTUCK_FALLBACK_ADDRESS = 'brian@liveloveapp.com';

/**
 * Whether the Get unstuck form accepts submissions. Only the exact value
 * `true` turns it on; any other set value other than `false` is logged once
 * per call (without the value) as a misconfiguration.
 *
 * @param env - The environment to read `GROWTH_UNSTUCK_FORM_ENABLED` from.
 */
export function unstuckFormEnabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const value = env['GROWTH_UNSTUCK_FORM_ENABLED'];
  if (value === 'true') return true;
  if (value !== undefined && value !== 'false') {
    console.warn('[unstuck-form-misconfigured]');
  }
  return false;
}

/**
 * The visitor's IP, trusted only from the platform-set `x-vercel-forwarded-for`
 * header and only when running on Vercel; any other forwarded header is
 * ignored.
 *
 * @param request - The incoming request.
 * @returns The lower-cased IP, or `undefined` when it cannot be trusted.
 */
export function trustedFormClientIp(request: Request): string | undefined {
  if (process.env['VERCEL'] !== '1') return undefined;
  const ip = request.headers.get('x-vercel-forwarded-for')?.trim();
  return ip && isIP(ip) ? ip.toLowerCase() : undefined;
}

/**
 * A JSON response that is never cached: `Cache-Control: no-store` replaces
 * any value passed in `headers`.
 *
 * @param body - The JSON body.
 * @param status - The HTTP status; defaults to 200.
 * @param headers - Extra headers, such as `Retry-After`.
 */
export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
): Response {
  const merged = new Headers(headers);
  merged.set('Cache-Control', 'no-store');
  return Response.json(body, { status, headers: merged });
}
