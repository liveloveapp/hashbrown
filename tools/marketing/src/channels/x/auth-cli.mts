// One-time OAuth 2.0 bootstrapper for the X adapter.
// Run via: nx run marketing:x-auth
//
// Needs X_CLIENT_ID, X_CLIENT_SECRET, DATABASE_URL and MARKETING_CREDENTIALS_KEY
// in the environment. Stores the tokens encrypted in the growth database.

import { exec } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

import { createDatabaseExecutor } from '../../growth.ts';
import { createCredentialStore } from '../../credentials/store.ts';
import { exchangeXCode } from './auth.ts';

const PORT = 8723;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'tweet.read tweet.write users.read offline.access media.write';
const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
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
      const problem =
        url.searchParams.get('state') !== state
          ? 'OAuth state parameter mismatch.'
          : !code
            ? 'OAuth callback missing code parameter.'
            : undefined;
      clearTimeout(timer);
      server.close();
      if (problem || !code) {
        response.writeHead(400).end(problem);
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
  const clientId = process.env['X_CLIENT_ID'];
  const clientSecret = process.env['X_CLIENT_SECRET'];
  const key = process.env['MARKETING_CREDENTIALS_KEY'];
  if (!clientId || !clientSecret || !key) {
    fail(
      'X_CLIENT_ID, X_CLIENT_SECRET and MARKETING_CREDENTIALS_KEY must be set in your environment.\n' +
        'Create an app at https://developer.x.com/en/portal/dashboard and use its OAuth 2.0 Client ID and Secret.',
    );
  }

  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(16));

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', SCOPES);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  process.stdout.write(
    `\nOpening browser to authorize the marketing app...\n${authorizeUrl.toString()}\n\n`,
  );
  openInBrowser(authorizeUrl.toString());
  const code = await waitForCode(state);

  const executor = createDatabaseExecutor();
  try {
    await exchangeXCode({
      credentials: createCredentialStore(executor, key),
      clientId,
      clientSecret,
      code,
      codeVerifier: verifier,
      redirectUri: REDIRECT_URI,
    });
  } finally {
    await executor.close?.();
  }

  process.stdout.write('\nStored the X tokens (encrypted).\n');
}

main().then(
  () => process.exit(0),
  (error) => fail(error instanceof Error ? error.message : String(error)),
);
