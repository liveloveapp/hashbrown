import { expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import { bodyOf, callsOf, headersOf, jsonResponse } from '../test-fetch.ts';
import { createAdapters } from '../registry.ts';
import { XAuth } from './auth.ts';
import { postX } from './post.ts';

function setup(fetchMock: typeof fetch) {
  const credentials = createMemoryCredentialStore({
    x: { accessToken: 'access-1', refreshToken: 'refresh-1' },
  });
  const auth = new XAuth({
    credentials,
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: fetchMock,
  });
  return { auth, credentials };
}

test('postX posts one tweet with the bearer token', async () => {
  const fetchMock = vi.fn(async () =>
    jsonResponse({ data: { id: '1001', text: 'hello' } }, { status: 201 }),
  );
  const { auth } = setup(fetchMock);

  const result = await postX(auth, { channel: 'x', text: 'hello' });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(callsOf(fetchMock)[0][0]).toBe('https://api.x.com/2/tweets');
  expect(headersOf(fetchMock, 0)['Authorization']).toBe('Bearer access-1');
  expect(bodyOf(fetchMock, 0)).toEqual({ text: 'hello' });
  expect(result).toMatchObject({
    channel: 'x',
    postId: '1001',
    url: 'https://x.com/i/status/1001',
  });
});

test('postX chains thread parts as replies', async () => {
  let id = 1000;
  const fetchMock = vi.fn(async () =>
    jsonResponse({ data: { id: String(++id), text: '' } }, { status: 201 }),
  );
  const { auth } = setup(fetchMock);

  const result = await postX(auth, {
    channel: 'x',
    threadParts: ['one', 'two', 'three'],
  });

  expect(bodyOf(fetchMock, 0)).toEqual({ text: 'one' });
  expect(bodyOf(fetchMock, 1)).toEqual({
    text: 'two',
    reply: { in_reply_to_tweet_id: '1001' },
  });
  expect(bodyOf(fetchMock, 2)).toEqual({
    text: 'three',
    reply: { in_reply_to_tweet_id: '1002' },
  });
  expect(result.postId).toBe('1001');
});

test('postX refreshes once on a 401 and retries with the new token', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      jsonResponse({ title: 'Unauthorized' }, { status: 401 }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        expires_in: 7200,
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: '1001', text: 'hello' } }, { status: 201 }),
    );
  const { auth, credentials } = setup(fetchMock);

  const result = await postX(auth, { channel: 'x', text: 'hello' });

  expect(callsOf(fetchMock).map(([url]) => url)).toEqual([
    'https://api.x.com/2/tweets',
    'https://api.x.com/2/oauth2/token',
    'https://api.x.com/2/tweets',
  ]);
  expect(headersOf(fetchMock, 2)['Authorization']).toBe('Bearer access-2');
  expect((await credentials.get('x'))?.refreshToken).toBe('refresh-2');
  expect(result.postId).toBe('1001');
});

test('an X draft over 280 characters is rejected before any fetch call', async () => {
  const fetchMock = vi.fn();
  const { x } = createAdapters({
    credentials: createMemoryCredentialStore({
      x: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    }),
    env: { X_CLIENT_ID: 'cid', X_CLIENT_SECRET: 'csec' },
    fetch: fetchMock,
    dryRun: false,
  });

  await expect(x.post({ channel: 'x', text: 'a'.repeat(281) })).rejects.toThrow(
    /280/,
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
