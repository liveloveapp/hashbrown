// One-time OAuth 2.0 bootstrapper for the LinkedIn adapter.
// Run via: nx run marketing:linkedin-auth
//
// LinkedIn access tokens last 60 days and self-serve apps get no refresh token,
// so re-run this before the token expires.
//
// Needs LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, DATABASE_URL and
// MARKETING_CREDENTIALS_KEY in the environment. Stores the token encrypted in
// the growth database and prints the LINKEDIN_AUTHOR_URN to set as env config.

import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

import { createDatabaseExecutor } from '../../growth.ts';
import { createCredentialStore } from '../../credentials/store.ts';
import { exchangeLinkedInCode } from './auth.ts';

const PORT = 8724;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'openid profile w_member_social';
const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const TIMEOUT_MS = 5 * 60 * 1000;

function fail(message: string): never {
  process.stderr.write(`x ${message}\n`);
  process.exit(1);
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function openInBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {
    // Best effort; the URL is printed so it can be pasted.
  });
}

function waitForCode(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(
        new Error('Timed out waiting for OAuth callback after 5 minutes.'),
      );
    }, TIMEOUT_MS);

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const problem =
        url.searchParams.get('state') !== state
          ? 'OAuth state parameter mismatch.'
          : error || !code
            ? `OAuth callback returned ${error ?? 'no code'}: ${url.searchParams.get('error_description') ?? ''}`
            : undefined;
      clearTimeout(timer);
      server.close();
      if (problem || !code) {
        response.writeHead(400).end('authorization failed');
        reject(new Error(problem));
        return;
      }
      response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          '<html><body><h1>Got it. You can close this tab.</h1></body></html>',
        );
      resolve(code);
    });
    server.listen(PORT);
  });
}

async function main(): Promise<void> {
  const clientId = process.env['LINKEDIN_CLIENT_ID'];
  const clientSecret = process.env['LINKEDIN_CLIENT_SECRET'];
  const key = process.env['MARKETING_CREDENTIALS_KEY'];
  if (!clientId || !clientSecret || !key) {
    fail(
      'LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and MARKETING_CREDENTIALS_KEY must be set in your environment.\n' +
        'Create an app at https://www.linkedin.com/developers/apps, add the "Share on LinkedIn" and\n' +
        '"Sign In with LinkedIn using OpenID Connect" products, and add the redirect URL\n' +
        `${REDIRECT_URI} under Auth.`,
    );
  }

  const state = base64Url(randomBytes(16));
  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', SCOPES);
  authorizeUrl.searchParams.set('state', state);

  process.stdout.write(
    `\nOpening browser to authorize the marketing app...\n${authorizeUrl.toString()}\n\n`,
  );
  openInBrowser(authorizeUrl.toString());
  const code = await waitForCode(state);

  const executor = createDatabaseExecutor();
  let accessToken: string;
  try {
    accessToken = await exchangeLinkedInCode({
      credentials: createCredentialStore(executor, key),
      clientId,
      clientSecret,
      code,
      redirectUri: REDIRECT_URI,
    });
  } finally {
    await executor.close?.();
  }

  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    fail(`Failed to fetch /v2/userinfo: HTTP ${response.status}`);
  }
  const me = (await response.json()) as { sub: string; name?: string };

  process.stdout.write(
    `\nStored the LinkedIn token (encrypted)${me.name ? ` for ${me.name}` : ''}.\n` +
      `Set this as env config if it is not already:\n\n` +
      `LINKEDIN_AUTHOR_URN=urn:li:person:${me.sub}\n\n`,
  );
}

main().then(
  () => process.exit(0),
  (error) => fail(error instanceof Error ? error.message : String(error)),
);
