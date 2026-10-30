import { afterEach, expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import { OutcomeUnknownError } from '../http.ts';
import {
  bodyOf,
  hangingFetch,
  jsonResponse,
  UNKNOWN_OUTCOME_FAILURES,
} from '../test-fetch.ts';
import { LINKEDIN_VERSION } from './api.ts';
import { LinkedInAuth } from './auth.ts';
import { postLinkedIn } from './post.ts';

const AUTHOR = 'urn:li:person:abc123';
const POST_URN = 'urn:li:share:7000000000000000001';

function authWith(fetchMock: typeof fetch): LinkedInAuth {
  return new LinkedInAuth({
    credentials: createMemoryCredentialStore({
      linkedin: {
        accessToken: 'li-access-1',
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    }),
    authorUrn: AUTHOR,
    fetch: fetchMock,
  });
}

function created(): Response {
  return new Response(null, {
    status: 201,
    headers: { 'x-restli-id': POST_URN },
  });
}

test('postLinkedIn creates a post with versioned headers and escaped parentheses', async () => {
  const fetchMock = vi.fn(async () => created());

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Who owns it (you)?',
  });

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe('https://api.linkedin.com/rest/posts');
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer li-access-1',
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  });
  expect(bodyOf(fetchMock, 0)).toEqual({
    author: AUTHOR,
    commentary: 'Who owns it \\(you\\)?',
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  expect(result).toMatchObject({
    channel: 'linkedin',
    postId: POST_URN,
    url: `https://www.linkedin.com/feed/update/${POST_URN}/`,
  });
  expect(result.warnings).toBeUndefined();
});

test('postLinkedIn posts firstComment on the new post after the post, unescaped', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(created())
    .mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'hi',
    firstComment: 'Read it: https://hashbrown.dev/blog/x?utm_source=linkedin',
  });

  expect(fetchMock.mock.calls[1][0]).toBe(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(POST_URN)}/comments`,
  );
  expect(bodyOf(fetchMock, 1)).toEqual({
    actor: AUTHOR,
    object: POST_URN,
    message: {
      text: 'Read it: https://hashbrown.dev/blog/x?utm_source=linkedin',
    },
  });
  expect(result.warnings).toBeUndefined();
});

test('postLinkedIn returns the live post with a warning when the comment fails', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(created())
    .mockResolvedValueOnce(
      jsonResponse({ message: 'ACCESS_DENIED' }, { status: 403 }),
    );

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'hi',
    firstComment: 'link',
  });

  expect(result.postId).toBe(POST_URN);
  expect(result.warnings?.[0]).toMatch(/first comment failed.*403/);
});

test('postLinkedIn does not retry a 5xx create, so a post is never doubled', async () => {
  const fetchMock = vi.fn(async () => new Response('boom', { status: 503 }));

  await expect(
    postLinkedIn(authWith(fetchMock), { channel: 'linkedin', text: 'hi' }),
  ).rejects.toThrow(/HTTP 503/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('postLinkedIn turns a 401 into the auth CLI hint', async () => {
  const fetchMock = vi.fn(async () =>
    jsonResponse({ code: 'EXPIRED_ACCESS_TOKEN' }, { status: 401 }),
  );

  await expect(
    postLinkedIn(authWith(fetchMock), { channel: 'linkedin', text: 'hi' }),
  ).rejects.toThrow(/nx run marketing:linkedin-auth/);
});

test('postLinkedIn fails loudly when the create response has no post id', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));

  await expect(
    postLinkedIn(authWith(fetchMock), { channel: 'linkedin', text: 'hi' }),
  ).rejects.toThrow(/x-restli-id/);
});

afterEach(() => {
  vi.useRealTimers();
});

test.each(UNKNOWN_OUTCOME_FAILURES)(
  'postLinkedIn throws OutcomeUnknownError when the create gets %s',
  async (_, respond) => {
    const error = await postLinkedIn(authWith(vi.fn(respond)), {
      channel: 'linkedin',
      text: 'hi',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OutcomeUnknownError);
  },
);

test('postLinkedIn throws OutcomeUnknownError when the create times out', async () => {
  vi.useFakeTimers();

  const pending = postLinkedIn(authWith(hangingFetch()), {
    channel: 'linkedin',
    text: 'hi',
  }).catch((caught: unknown) => caught);
  await vi.advanceTimersByTimeAsync(20_000);

  expect(await pending).toBeInstanceOf(OutcomeUnknownError);
});

test('postLinkedIn throws OutcomeUnknownError when a created post has no id', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));

  const error = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'hi',
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(OutcomeUnknownError);
});

test('postLinkedIn throws an ordinary error when LinkedIn rejects the create with a 400', async () => {
  const fetchMock = vi.fn(async () =>
    jsonResponse({ message: 'bad' }, { status: 400 }),
  );

  const error = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'hi',
  }).catch((caught: unknown) => caught);

  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect((error as Error).message).toMatch(/HTTP 400/);
});

test('postLinkedIn keeps a 503 on the first comment as a warning', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(created())
    .mockResolvedValueOnce(new Response('boom', { status: 503 }));

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'hi',
    firstComment: 'link',
  });

  expect(result.postId).toBe(POST_URN);
  expect(result.warnings?.[0]).toMatch(/first comment failed/);
});
