import type { CredentialStore } from '../../credentials/store.ts';
import { http } from '../http.ts';

const AUTHOR_URN_RE = /^urn:li:person:[A-Za-z0-9_-]+$/;
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/** What to do when LinkedIn has no usable stored credential. */
export const REAUTH_HINT = 're-run `nx run marketing:linkedin-auth`';

/** Options for {@link LinkedInAuth}. */
export interface LinkedInAuthOptions {
  credentials: CredentialStore;
  /** `LINKEDIN_AUTHOR_URN`: `urn:li:person:<id>`. */
  authorUrn: string;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/**
 * The LinkedIn access token read from the credential store. LinkedIn's
 * self-serve "Share on LinkedIn" product issues 60-day access tokens with no
 * refresh token, so an expired token means running the auth CLI again.
 */
export class LinkedInAuth {
  readonly authorUrn: string;
  readonly fetch?: typeof fetch;
  private readonly credentials: CredentialStore;

  /** @throws When the author URN is not `urn:li:person:<id>`. */
  constructor(options: LinkedInAuthOptions) {
    if (!AUTHOR_URN_RE.test(options.authorUrn)) {
      throw new Error(
        `LINKEDIN_AUTHOR_URN must look like urn:li:person:<id> (got "${options.authorUrn}"); ${REAUTH_HINT}.`,
      );
    }
    this.authorUrn = options.authorUrn;
    this.credentials = options.credentials;
    this.fetch = options.fetch;
  }

  /**
   * The stored access token. Warns on stderr when it expires within 7 days.
   *
   * @throws When LinkedIn has no stored credential or the token has expired.
   */
  async accessToken(now: Date = new Date()): Promise<string> {
    const stored = await this.credentials.get('linkedin');
    if (!stored) {
      throw new Error(`No stored LinkedIn credential; ${REAUTH_HINT}.`);
    }
    if (stored.expiresAt) {
      const remaining = new Date(stored.expiresAt).getTime() - now.getTime();
      if (remaining <= 0) {
        throw new Error(
          `LinkedIn access token expired at ${stored.expiresAt}; ${REAUTH_HINT}.`,
        );
      }
      if (remaining < EXPIRY_WARNING_MS) {
        process.stderr.write(
          `\n! LinkedIn access token expires ${stored.expiresAt}; ${REAUTH_HINT} soon.\n`,
        );
      }
    }
    return stored.accessToken;
  }
}

/** Options for {@link exchangeLinkedInCode}. */
export interface ExchangeLinkedInCodeOptions {
  credentials: CredentialStore;
  clientId: string;
  clientSecret: string;
  /** The authorization code from the OAuth callback. */
  code: string;
  redirectUri: string;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/**
 * Trades an authorization code for an access token and stores it, expiring
 * `expires_in` seconds from now.
 *
 * @returns The access token, so the caller can look up the member id.
 * @throws When LinkedIn rejects the code or the token cannot be stored.
 */
export async function exchangeLinkedInCode(
  options: ExchangeLinkedInCodeOptions,
): Promise<string> {
  const tokens = await http<{ access_token: string; expires_in: number }>({
    method: 'POST',
    url: 'https://www.linkedin.com/oauth/v2/accessToken',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      client_secret: options.clientSecret,
    }).toString(),
    retryOn5xx: false,
    fetch: options.fetch,
  });
  await options.credentials.put('linkedin', {
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  });
  return tokens.access_token;
}
