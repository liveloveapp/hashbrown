import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import { OutcomeUnknownError } from '../http.ts';
import {
  bodyOf,
  callsOf,
  hangingFetch,
  headersOf,
  jsonResponse,
  UNKNOWN_OUTCOME_FAILURES,
} from '../test-fetch.ts';
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

test.each([
  ['a 503', async () => new Response('boom', { status: 503 })],
  [
    'a network error',
    async () => {
      throw new Error('socket hang up');
    },
  ],
])(
  'postX makes exactly one fetch call when the create gets %s',
  async (_, respond) => {
    const fetchMock = vi.fn(respond);
    const { auth } = setup(fetchMock);

    await expect(
      postX(auth, { channel: 'x', threadParts: ['one', 'two'] }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

test('postX does not retry a failed thread reply', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: '1001', text: '' } }, { status: 201 }),
    )
    .mockResolvedValue(new Response('boom', { status: 502 }));
  const { auth } = setup(fetchMock);

  await expect(
    postX(auth, { channel: 'x', threadParts: ['one', 'two'] }),
  ).rejects.toThrow(/HTTP 502/);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

afterEach(() => {
  vi.useRealTimers();
});

test.each(UNKNOWN_OUTCOME_FAILURES)(
  'postX throws OutcomeUnknownError when the create gets %s',
  async (_, respond) => {
    const { auth } = setup(vi.fn(respond));

    const error = await postX(auth, { channel: 'x', text: 'hello' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(OutcomeUnknownError);
  },
);

test('postX throws OutcomeUnknownError when the create times out', async () => {
  vi.useFakeTimers();
  const { auth } = setup(hangingFetch());

  const pending = postX(auth, { channel: 'x', text: 'hello' }).catch(
    (caught: unknown) => caught,
  );
  await vi.advanceTimersByTimeAsync(20_000);

  expect(await pending).toBeInstanceOf(OutcomeUnknownError);
});

test('postX throws an ordinary error when X rejects the create with a 400', async () => {
  const { auth } = setup(
    vi.fn(async () => jsonResponse({ title: 'Invalid' }, { status: 400 })),
  );

  const error = await postX(auth, { channel: 'x', text: 'hello' }).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect((error as Error).message).toMatch(/HTTP 400/);
});

test('postX throws OutcomeUnknownError when a thread reply gets a 503', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: '1001', text: '' } }, { status: 201 }),
    )
    .mockResolvedValue(new Response('boom', { status: 503 }));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, {
    channel: 'x',
    threadParts: ['one', 'two'],
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(OutcomeUnknownError);
});

test('postX throws OutcomeUnknownError when a reply is rejected after the first tweet is live', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: '1001', text: '' } }, { status: 201 }),
    )
    .mockResolvedValue(jsonResponse({ title: 'Invalid' }, { status: 400 }));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, {
    channel: 'x',
    threadParts: ['one', 'two'],
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(OutcomeUnknownError);
  expect((error as Error).message).toMatch(/1001/);
});

test('postX throws an ordinary error when the token refresh fails', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
    .mockResolvedValueOnce(jsonResponse({}, { status: 400 }));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, { channel: 'x', text: 'hello' }).catch(
    (caught: unknown) => caught,
  );

  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect((error as Error).message).toMatch(/refresh failed/);
});

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=',
  'base64',
);
const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A small test image.',
  sha256: createHash('sha256').update(imageBytes).digest('hex'),
};

function imageResponse(): Response {
  return new Response(imageBytes, { headers: { 'Content-Type': 'image/png' } });
}

function metadataResponse(): Response {
  return jsonResponse({
    data: {
      id: '9001',
      associated_metadata: { alt_text: { text: image.altText } },
    },
  });
}

test('postX uploads reviewed image bytes and alt text before attaching media to the first thread part', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }))
    .mockResolvedValueOnce(metadataResponse())
    .mockResolvedValueOnce(jsonResponse({ data: { id: '1001', text: 'one' } }))
    .mockResolvedValueOnce(jsonResponse({ data: { id: '1002', text: 'two' } }));
  const { auth } = setup(fetchMock);

  const result = await postX(auth, {
    channel: 'x',
    threadParts: ['one', 'two'],
    image,
  });

  expect(callsOf(fetchMock).map(([url]) => url)).toEqual([
    image.url,
    'https://api.x.com/2/media/upload',
    'https://api.x.com/2/media/metadata',
    'https://api.x.com/2/tweets',
    'https://api.x.com/2/tweets',
  ]);
  expect(
    new Headers(callsOf(fetchMock)[0][1].headers).has('Authorization'),
  ).toBe(false);
  expect(headersOf(fetchMock, 1)['Authorization']).toBe('Bearer access-1');
  expect(bodyOf(fetchMock, 1)).toEqual({
    media: imageBytes.toString('base64'),
    media_category: 'tweet_image',
  });
  expect(bodyOf(fetchMock, 2)).toEqual({
    id: '9001',
    metadata: { alt_text: { text: image.altText } },
  });
  expect(bodyOf(fetchMock, 3)).toEqual({
    text: 'one',
    media: { media_ids: ['9001'] },
  });
  expect(bodyOf(fetchMock, 4)).toEqual({
    text: 'two',
    reply: { in_reply_to_tweet_id: '1001' },
  });
  expect(result.postId).toBe('1001');
});

test.each([400, 403, 503])(
  'postX never creates a tweet after an image upload returns HTTP %s',
  async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        jsonResponse({ title: 'Upload failed' }, { status }),
      );
    const { auth } = setup(fetchMock);

    const error = await postX(auth, {
      channel: 'x',
      text: 'hello',
      image,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test.each([undefined, '', 'invalid', 9001])(
  'postX rejects an unusable upload media id %s before publishing',
  async (id) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(jsonResponse({ data: { id } }));
    const { auth } = setup(fetchMock);

    await expect(
      postX(auth, { channel: 'x', text: 'hello', image }),
    ).rejects.toThrow(/media.*id/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test('postX refreshes once when the media upload returns a 401', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        expires_in: 7200,
      }),
    )
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }))
    .mockResolvedValueOnce(metadataResponse())
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: '1001', text: 'hello' } }),
    );
  const { auth } = setup(fetchMock);

  await postX(auth, { channel: 'x', text: 'hello', image });

  expect(headersOf(fetchMock, 3)['Authorization']).toBe('Bearer access-2');
  expect(headersOf(fetchMock, 4)['Authorization']).toBe('Bearer access-2');
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

test('postX never publishes if image alt text metadata is rejected', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }))
    .mockResolvedValueOnce(jsonResponse({}, { status: 400 }));
  const { auth } = setup(fetchMock);

  await expect(
    postX(auth, { channel: 'x', text: 'hello', image }),
  ).rejects.toThrow(/HTTP 400/);

  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('postX requires confirmation of the reviewed alt text before publishing', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }))
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }));
  const { auth } = setup(fetchMock);

  await expect(
    postX(auth, { channel: 'x', text: 'hello', image }),
  ).rejects.toThrow(/alt text/i);

  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('postX never publishes or retries after an image upload loses its connection', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockRejectedValueOnce(new TypeError('socket closed'));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, { channel: 'x', text: 'hello', image }).catch(
    (caught: unknown) => caught,
  );

  expect(error).not.toBeInstanceOf(OutcomeUnknownError);
  expect((error as Error).message).toBe('X image upload failed.');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('postX stops after a second image-upload 401 without refreshing twice', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        expires_in: 7200,
      }),
    )
    .mockResolvedValueOnce(jsonResponse({}, { status: 401 }));
  const { auth } = setup(fetchMock);

  await expect(
    postX(auth, { channel: 'x', text: 'hello', image }),
  ).rejects.toThrow(/HTTP 401/);

  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(
    callsOf(fetchMock).filter(([url]) => url.endsWith('/oauth2/token')),
  ).toHaveLength(1);
});

test('postX preserves unknown post outcomes after image preparation and never repeats the create', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(jsonResponse({ data: { id: '9001' } }))
    .mockResolvedValueOnce(metadataResponse())
    .mockResolvedValueOnce(jsonResponse({}, { status: 503 }));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, { channel: 'x', text: 'hello', image }).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(OutcomeUnknownError);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('postX refuses an image without a stored token before downloading it', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const auth = new XAuth({
    credentials: createMemoryCredentialStore(),
    clientId: 'cid',
    clientSecret: 'csec',
    fetch: fetchMock,
  });

  await expect(
    postX(auth, { channel: 'x', text: 'hello', image }),
  ).rejects.toThrow(/No stored X credential/);

  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['upload', 'metadata'])(
  'postX bounds a hung %s JSON body to 20 seconds and aborts it',
  async (stage) => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (url === image.url) return imageResponse();
      if (stage === 'metadata' && String(url).endsWith('/upload'))
        return jsonResponse({ data: { id: '9001' } });
      signals.push(init?.signal as AbortSignal);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{'));
          },
        }),
      );
    });
    const { auth } = setup(fetchMock);
    let outcome: unknown;

    const pending = postX(auth, { channel: 'x', text: 'hello', image }).catch(
      (error: unknown) => {
        outcome = error;
      },
    );
    await vi.advanceTimersByTimeAsync(20_000);

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(OutcomeUnknownError);
    expect((outcome as Error | undefined)?.message).toMatch(/timed out/i);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(callsOf(fetchMock).some(([url]) => url.endsWith('/tweets'))).toBe(
      false,
    );
    await pending;
  },
);

test.each(['upload', 'metadata'])(
  'postX does not leak an echoed bearer token or signed URL from a rejected %s',
  async (stage) => {
    const sentinel =
      'Bearer secret-sentinel https://media.example/image?signature=secret';
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (url === image.url) return imageResponse();
      if (stage === 'metadata' && String(url).endsWith('/upload'))
        return jsonResponse({ data: { id: '9001' } });
      return jsonResponse({ detail: sentinel }, { status: 403 });
    });
    const { auth } = setup(fetchMock);

    const error = await postX(auth, {
      channel: 'x',
      text: 'hello',
      image,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/HTTP 403/);
    expect(String(error)).not.toContain('secret');
    expect((error as Error).cause).toBeUndefined();
    expect(callsOf(fetchMock).some(([url]) => url.endsWith('/tweets'))).toBe(
      false,
    );
  },
);

test.each([
  ['an empty body', () => new Response('', { status: 201 })],
  ['no data', () => jsonResponse({}, { status: 201 })],
  ['no id', () => jsonResponse({ data: { text: 'hello' } }, { status: 201 })],
])(
  'postX throws OutcomeUnknownError when the create answers 2xx with %s',
  async (_, respond) => {
    const fetchMock = vi.fn(async () => respond());
    const { auth } = setup(fetchMock);

    const error = await postX(auth, { channel: 'x', text: 'hello' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(OutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

test('postX stops a thread whose first tweet answered 2xx without an id', async () => {
  const fetchMock = vi.fn(async () => jsonResponse({}, { status: 201 }));
  const { auth } = setup(fetchMock);

  const error = await postX(auth, {
    channel: 'x',
    threadParts: ['one', 'two'],
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(OutcomeUnknownError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('postX saves a rotated refresh token before failing an image upload that timed out mid-refresh', async () => {
  vi.useFakeTimers();
  const later = (ms: number, response: Response) =>
    new Promise<Response>((resolve) => setTimeout(() => resolve(response), ms));
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(imageResponse())
    // The upload's 401 arrives late, and the refresh outlasts its deadline.
    .mockImplementationOnce(() =>
      later(15_000, jsonResponse({}, { status: 401 })),
    )
    .mockImplementationOnce(() =>
      later(
        10_000,
        jsonResponse({
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          token_type: 'bearer',
          expires_in: 7200,
        }),
      ),
    );
  const { auth, credentials } = setup(fetchMock);

  const pending = postX(auth, { channel: 'x', text: 'hello', image }).catch(
    async (caught: unknown) => ({
      error: caught,
      stored: await credentials.get('x'),
    }),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  const { error, stored } = (await pending) as {
    error: unknown;
    stored: Awaited<ReturnType<typeof credentials.get>>;
  };

  expect((error as Error).message).toMatch(/timed out/);
  expect(stored).toMatchObject({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
  });
  expect(callsOf(fetchMock).some(([url]) => url.endsWith('/tweets'))).toBe(
    false,
  );
});
