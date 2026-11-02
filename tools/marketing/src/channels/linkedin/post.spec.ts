import { createHash } from 'node:crypto';
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

test('postLinkedIn keeps a link in the post body and makes no comment call', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => created());

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Read it: https://hashbrown.dev/blog/x',
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(
    'https://api.linkedin.com/rest/posts',
  );
  expect(bodyOf(fetchMock, 0)).toMatchObject({
    commentary: 'Read it: https://hashbrown.dev/blog/x',
  });
  expect(result.warnings).toBeUndefined();
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

const IMAGE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=',
  'base64',
);
const IMAGE = {
  url: 'https://hashbrown.dev/marketing/post.png',
  altText: 'A diagram explaining local inference',
  sha256: createHash('sha256').update(IMAGE_BYTES).digest('hex'),
};
const IMAGE_URN = 'urn:li:image:C4E10AQFoyyAjHPMQuQ';
const UPLOAD_URL =
  'https://www.linkedin.com/dms-uploads/image?signature=secret';

function imageResponse(): Response {
  return new Response(IMAGE_BYTES, {
    headers: { 'Content-Type': 'image/png' },
  });
}

function initialized(uploadUrl = UPLOAD_URL, image = IMAGE_URN): Response {
  return jsonResponse({ value: { uploadUrl, image } });
}

test('postLinkedIn loads, initializes and uploads the image before publishing', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(initialized())
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(created());

  const result = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Image post',
    image: IMAGE,
  });

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    IMAGE.url,
    'https://api.linkedin.com/rest/images?action=initializeUpload',
    UPLOAD_URL,
    'https://api.linkedin.com/rest/posts',
  ]);
  expect(bodyOf(fetchMock, 1)).toEqual({
    initializeUploadRequest: { owner: AUTHOR },
  });
  expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: 'Bearer li-access-1',
    'LinkedIn-Version': '202610',
    'X-Restli-Protocol-Version': '2.0.0',
  });
  expect(fetchMock.mock.calls[1][1]?.redirect).toBe('error');
  expect(fetchMock.mock.calls[2][1]).toMatchObject({
    method: 'PUT',
    redirect: 'error',
  });
  expect(Buffer.from(fetchMock.mock.calls[2][1]?.body as Uint8Array)).toEqual(
    IMAGE_BYTES,
  );
  expect(
    new Headers(fetchMock.mock.calls[2][1]?.headers).get('Content-Type'),
  ).toBe('image/png');
  expect(bodyOf(fetchMock, 3)).toMatchObject({
    content: { media: { id: IMAGE_URN, altText: IMAGE.altText } },
  });
  expect(result.postId).toBe(POST_URN);
});

test('postLinkedIn stops before initialization when the source image cannot be loaded', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }));

  const error = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Image post',
    image: IMAGE,
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each([
  'https://linkedin.com.evil.example/upload',
  'https://evil.example/upload',
  'http://www.linkedin.com/upload',
  'https://user:secret@www.linkedin.com/upload',
  'https://www.linkedin.com:444/upload',
])(
  'postLinkedIn refuses an untrusted upload URL %s before sending a token or creating a post',
  async (uploadUrl) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(initialized(uploadUrl));

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((error as Error).message).not.toContain(uploadUrl);
  },
);

test.each(['', 'urn:li:share:123', 'urn:li:image:abc/def'])(
  'postLinkedIn refuses missing or invalid image URN %s',
  async (imageUrn) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(initialized(UPLOAD_URL, imageUrn));

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test.each([400, 503, 302])(
  'postLinkedIn stops on image initialization HTTP %s without an unknown public-post outcome',
  async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(new Response(UPLOAD_URL, { status }));

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect((error as Error).message).not.toContain('signature=secret');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test.each([400, 503, 302])(
  'postLinkedIn stops on image upload HTTP %s without leaking provider errors',
  async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(initialized())
      .mockResolvedValueOnce(new Response(UPLOAD_URL, { status }));

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect((error as Error).message).not.toContain('signature=secret');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  },
);

test('postLinkedIn bounds the binary image upload and does not create a post on timeout', async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(initialized())
    .mockImplementationOnce(hangingFetch());

  const pending = postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Image post',
    image: IMAGE,
  }).catch((caught: unknown) => caught);
  await vi.advanceTimersByTimeAsync(20_000);

  const error = await pending;
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('postLinkedIn keeps unknown outcome semantics after the image is uploaded', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(initialized())
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(new Response('bad', { status: 503 }));

  const error = await postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Image post',
    image: IMAGE,
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(OutcomeUnknownError);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test.each([{}, { value: {} }, { value: { image: IMAGE_URN } }])(
  'postLinkedIn rejects incomplete image initialization data %j',
  async (data) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(jsonResponse(data));

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test.each(['initialization', 'upload'])(
  'postLinkedIn sanitizes a network failure during image %s without posting',
  async (stage) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse());
    if (stage === 'upload') fetchMock.mockResolvedValueOnce(initialized());
    fetchMock.mockRejectedValueOnce(
      new Error(`Connection failed: ${UPLOAD_URL} li-access-1`),
    );

    const error = await postLinkedIn(authWith(fetchMock), {
      channel: 'linkedin',
      text: 'Image post',
      image: IMAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect((error as Error).message).not.toMatch(
      /signature=secret|li-access-1/,
    );
    expect((error as Error).cause).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(stage === 'upload' ? 3 : 2);
  },
);

test('postLinkedIn bounds image initialization response-body reads before posting', async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(new Response(new ReadableStream()));

  const pending = postLinkedIn(authWith(fetchMock), {
    channel: 'linkedin',
    text: 'Image post',
    image: IMAGE,
  }).catch((caught: unknown) => caught);
  await vi.advanceTimersByTimeAsync(20_000);

  expect(await pending).not.toBeInstanceOf(OutcomeUnknownError);
  expect(await pending).toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
