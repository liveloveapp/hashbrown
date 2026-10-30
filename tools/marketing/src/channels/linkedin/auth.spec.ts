import { expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import { callsOf, jsonResponse } from '../test-fetch.ts';
import { exchangeLinkedInCode, LinkedInAuth } from './auth.ts';

const AUTHOR = 'urn:li:person:abc123';
const now = new Date('2026-11-01T00:00:00.000Z');

function authWith(expiresAt?: string, authorUrn = AUTHOR): LinkedInAuth {
  return new LinkedInAuth({
    credentials: createMemoryCredentialStore({
      linkedin: { accessToken: 'li-1', expiresAt },
    }),
    authorUrn,
  });
}

test('LinkedInAuth returns the stored token while it is valid', async () => {
  const auth = authWith('2027-01-01T00:00:00.000Z');

  await expect(auth.accessToken(now)).resolves.toBe('li-1');
});

test('LinkedInAuth refuses an expired token and names the auth CLI', async () => {
  const auth = authWith('2026-10-01T00:00:00.000Z');

  await expect(auth.accessToken(now)).rejects.toThrow(
    /expired.*nx run marketing:linkedin-auth/,
  );
});

test('LinkedInAuth warns on stderr when the token expires within 7 days', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

  await authWith('2026-11-05T00:00:00.000Z').accessToken(now);

  expect(write).toHaveBeenCalledWith(
    expect.stringMatching(/expires 2026-11-05.*nx run marketing:linkedin-auth/),
  );
  write.mockRestore();
});

test('LinkedInAuth names the channel and the auth CLI when no credential is stored', async () => {
  const auth = new LinkedInAuth({
    credentials: createMemoryCredentialStore(),
    authorUrn: AUTHOR,
  });

  await expect(auth.accessToken(now)).rejects.toThrow(
    /LinkedIn.*nx run marketing:linkedin-auth/,
  );
});

test('LinkedInAuth rejects an author URN that is not urn:li:person:<id>', () => {
  expect(() => authWith(undefined, 'urn:li:organization:1')).toThrow(
    /urn:li:person/,
  );
});

test('exchangeLinkedInCode stores the token expiring expires_in seconds from now', async () => {
  vi.useFakeTimers({ now });
  const credentials = createMemoryCredentialStore();
  const fetchMock = vi.fn(async () =>
    jsonResponse({ access_token: 'li-new', expires_in: 5_184_000 }),
  );

  const token = await exchangeLinkedInCode({
    credentials,
    clientId: 'cid',
    clientSecret: 'csec',
    code: 'the-code',
    redirectUri: 'http://localhost:8724/callback',
    fetch: fetchMock,
  });
  vi.useRealTimers();

  expect(token).toBe('li-new');
  expect(callsOf(fetchMock)[0][1].body).toContain('code=the-code');
  await expect(credentials.get('linkedin')).resolves.toEqual({
    accessToken: 'li-new',
    expiresAt: '2026-12-31T00:00:00.000Z',
  });
});
