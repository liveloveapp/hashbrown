import { http, type HttpOpts } from '../http.ts';
import { type LinkedInAuth, REAUTH_HINT } from './auth.ts';

export const API_BASE = 'https://api.linkedin.com/rest';

// LinkedIn sunsets each monthly API version about a year after release; bump
// this when the docs' deprecation banner names it.
export const LINKEDIN_VERSION = '202610';

const on401: HttpOpts['on401'] = async () => {
  throw new Error(
    `LinkedIn rejected the access token (HTTP 401); ${REAUTH_HINT}.`,
  );
};

/**
 * POST JSON to the versioned LinkedIn API. Returns the body and the
 * x-restli-id header. Every call creates something, so a timeout, network
 * error or 5xx throws `OutcomeUnknownError`.
 */
export async function linkedInPost<T>(
  auth: LinkedInAuth,
  path: string,
  body: unknown,
): Promise<{ data: T; restliId?: string }> {
  let restliId: string | undefined;
  const data = await http<T>({
    method: 'POST',
    url: `${API_BASE}${path}`,
    headers: {
      Authorization: `Bearer ${await auth.accessToken()}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    fetch: auth.fetch,
    // A retried create can double-post; let the caller decide.
    retryOn5xx: false,
    creates: true,
    on401,
    onHeaders: (headers) => {
      restliId = headers.get('x-restli-id') ?? undefined;
    },
  });
  return { data, restliId };
}
