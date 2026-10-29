import { expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import type { CredentialStore } from '../../credentials/store.ts';
import { callsOf, jsonResponse } from '../test-fetch.ts';
import { exchangeXCode, XAuth } from './auth.ts';

const stored = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const rotated = {
  access_token: 'access-2',
  refresh_token: 'refresh-2',
  token_type: 'bearer',
  expires_in: 7200,
};

test('XAuth persists rotated tokens before refresh() resolves', async () => {
  const store = createMemoryCredentialStore({ x: stored });
  const events: string[] = [];
  const put = vi.fn(async (...args: Parameters<CredentialStore['put']>) => {
    events.push('put');
    return store.put(...args);
  });
  const fetchMock = vi.fn(async () => jsonResponse(rotated));
  const auth = new XAuth({
    credentials: { ...store, put },
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: fetchMock,
  });

  const refreshed = auth.refresh().then(() => events.push('refreshed'));
  await refreshed;

  expect(events).toEqual(['put', 'refreshed']);
  expect(put).toHaveBeenCalledWith('x', {
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    expiresAt: expect.any(String),
  });
  const [url, init] = callsOf(fetchMock)[0];
  expect(url).toBe('https://api.x.com/2/oauth2/token');
  expect(init.body).toContain('grant_type=refresh_token');
  expect(init.body).toContain('refresh_token=refresh-1');
  expect((init.headers as Record<string, string>)['Authorization']).toMatch(
    /^Basic /,
  );
  await expect(auth.accessToken()).resolves.toBe('access-2');
});

test('XAuth.refresh rejects when the rotated tokens cannot be persisted', async () => {
  const store = createMemoryCredentialStore({ x: stored });
  const auth = new XAuth({
    credentials: {
      ...store,
      put: vi.fn().mockRejectedValue(new Error('database down')),
    },
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: vi.fn(async () => jsonResponse(rotated)),
  });

  await expect(auth.refresh()).rejects.toThrow('database down');
});

test('XAuth.refresh points at the auth CLI when X rejects the refresh token', async () => {
  const auth = new XAuth({
    credentials: createMemoryCredentialStore({ x: stored }),
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: vi.fn(async () =>
      jsonResponse({ error: 'invalid' }, { status: 400 }),
    ),
  });

  await expect(auth.refresh()).rejects.toThrow(/nx run marketing:x-auth/);
});

test('XAuth names the channel and the auth CLI when no credential is stored', async () => {
  const auth = new XAuth({
    credentials: createMemoryCredentialStore(),
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: vi.fn(),
  });

  await expect(auth.accessToken()).rejects.toThrow(
    /X.*nx run marketing:x-auth/,
  );
});

test('exchangeXCode trades the code with the PKCE verifier and stores the tokens', async () => {
  const credentials = createMemoryCredentialStore();
  const fetchMock = vi.fn(async () => jsonResponse(rotated));

  await exchangeXCode({
    credentials,
    clientId: 'cid',
    clientSecret: 'csec',
    code: 'the-code',
    codeVerifier: 'the-verifier',
    redirectUri: 'http://localhost:8723/callback',
    fetch: fetchMock,
  });

  const init = callsOf(fetchMock)[0][1];
  expect(init.body).toContain('grant_type=authorization_code');
  expect(init.body).toContain('code=the-code');
  expect(init.body).toContain('code_verifier=the-verifier');
  await expect(credentials.get('x')).resolves.toEqual({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    expiresAt: expect.any(String),
  });
});

test('exchangeXCode stores nothing when X rejects the code', async () => {
  const credentials = createMemoryCredentialStore();

  await expect(
    exchangeXCode({
      credentials,
      clientId: 'cid',
      clientSecret: 'csec',
      code: 'bad',
      codeVerifier: 'v',
      redirectUri: 'http://localhost:8723/callback',
      fetch: vi.fn(async () =>
        jsonResponse({ error: 'invalid' }, { status: 400 }),
      ),
    }),
  ).rejects.toThrow(/HTTP 400/);
  await expect(credentials.get('x')).resolves.toBeUndefined();
});
