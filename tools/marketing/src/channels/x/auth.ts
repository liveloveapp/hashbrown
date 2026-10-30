import type {
  ChannelCredentials,
  CredentialStore,
} from '../../credentials/store.ts';
import { http } from '../http.ts';

const TOKEN_URL = 'https://api.x.com/2/oauth2/token';

/** What to run when X has no usable stored credential. */
export const X_AUTH_COMMAND = 'nx run marketing:x-auth';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}

/**
 * What X stores. No `expiresAt`: the access token lasts about two hours and is
 * refreshed on a 401, while the rotating refresh token is the credential that
 * matters and has no expiry X reports. Storing the access token's expiry
 * would raise `credential_expiring` on every tick.
 */
function storedTokens(tokens: TokenResponse): ChannelCredentials {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

/** Options for {@link XAuth}. */
export interface XAuthOptions {
  credentials: CredentialStore;
  clientId: string;
  clientSecret: string;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/** X OAuth 2.0 tokens read from, and rotated into, the credential store. */
export class XAuth {
  readonly fetch?: typeof fetch;
  private readonly credentials: CredentialStore;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(options: XAuthOptions) {
    this.credentials = options.credentials;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetch = options.fetch;
  }

  /**
   * The current access token.
   *
   * @throws When X has no stored credential.
   */
  async accessToken(): Promise<string> {
    const stored = await this.credentials.get('x');
    if (!stored) {
      throw new Error(
        `No stored X credential; run \`${X_AUTH_COMMAND}\` to authorize.`,
      );
    }
    return stored.accessToken;
  }

  /**
   * Exchanges the refresh token for a new pair and stores it. X rotates the
   * refresh token on every use, so the new pair is persisted before this
   * resolves and before the new access token is used.
   *
   * @throws When X rejects the refresh or the new tokens cannot be stored.
   */
  async refresh(): Promise<void> {
    const stored = await this.credentials.get('x');
    if (!stored?.refreshToken) {
      throw new Error(
        `No stored X refresh token; run \`${X_AUTH_COMMAND}\` to authorize.`,
      );
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
    let tokens: TokenResponse;
    try {
      tokens = await http<TokenResponse>({
        method: 'POST',
        url: TOKEN_URL,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: stored.refreshToken,
        }).toString(),
        retryOn5xx: false,
        fetch: this.fetch,
      });
    } catch (error) {
      throw new Error(
        `X access token expired and refresh failed; run \`${X_AUTH_COMMAND}\`. Underlying: ${(error as Error).message}`,
      );
    }
    await this.credentials.put('x', storedTokens(tokens));
  }
}

/** Options for {@link exchangeXCode}. */
export interface ExchangeXCodeOptions {
  credentials: CredentialStore;
  clientId: string;
  clientSecret: string;
  /** The authorization code from the OAuth callback. */
  code: string;
  /** The PKCE verifier whose challenge started the flow. */
  codeVerifier: string;
  redirectUri: string;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/**
 * Trades an authorization code for tokens and stores them.
 *
 * @throws When X rejects the code or the tokens cannot be stored.
 */
export async function exchangeXCode(
  options: ExchangeXCodeOptions,
): Promise<void> {
  const basic = Buffer.from(
    `${options.clientId}:${options.clientSecret}`,
  ).toString('base64');
  const tokens = await http<TokenResponse>({
    method: 'POST',
    url: TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier,
      client_id: options.clientId,
    }).toString(),
    retryOn5xx: false,
    fetch: options.fetch,
  });
  await options.credentials.put('x', storedTokens(tokens));
}
