import { http, OutcomeUnknownError } from '../http.ts';
import { loadImage } from '../image.ts';
import type { Draft, DraftImage, PostResult } from '../types.ts';
import { X_AUTH_COMMAND, type XAuth } from './auth.ts';

const TWEETS_URL = 'https://api.x.com/2/tweets';

interface TweetResponse {
  data: { id: string; text: string };
}

interface TweetRequestBody {
  text: string;
  reply?: { in_reply_to_tweet_id: string };
  media?: { media_ids: string[] };
}

interface MediaResponse {
  data?: {
    id?: string;
    associated_metadata?: { alt_text?: { text?: string } };
  };
  errors?: unknown[];
}

async function bearer(auth: XAuth): Promise<string> {
  return `Bearer ${await auth.accessToken()}`;
}

/** Prepares media with a deadline over headers and body and credential-safe errors. */
async function prepareMedia(
  auth: XAuth,
  stage: 'upload' | 'metadata',
  body: unknown,
  authorization: string,
): Promise<MediaResponse> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let status: number | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await (auth.fetch ?? fetch)(
        `https://api.x.com/2/media/${stage}`,
        {
          method: 'POST',
          headers: {
            Authorization: attempt === 0 ? authorization : await bearer(auth),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error();
      }
      status = response.status;
      if (status === 401 && attempt === 0) {
        void response.body?.cancel().catch(() => undefined);
        await auth.refresh();
        if (controller.signal.aborted) throw new Error();
        continue;
      }
      if (!response.ok || response.redirected) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error();
      }
      if (!response.body) throw new Error();
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      return JSON.parse(text + decoder.decode()) as MediaResponse;
    }
    throw new Error();
  };
  try {
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          void reader?.cancel().catch(() => undefined);
          reject(new Error());
        }, 20_000);
      }),
    ]);
  } catch {
    const hint =
      status === 401 || status === 403
        ? ` Run \`${X_AUTH_COMMAND}\` to authorize with media.write.`
        : '';
    throw new Error(
      `X image ${stage} ${timedOut ? 'timed out' : status ? `failed (HTTP ${status})` : 'failed'}.${hint}`,
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}

async function uploadImage(auth: XAuth, image: DraftImage): Promise<string> {
  const authorization = await bearer(auth);
  const { bytes } = await loadImage(image, auth.fetch);
  const uploaded = await prepareMedia(
    auth,
    'upload',
    {
      media: Buffer.from(bytes).toString('base64'),
      media_category: 'tweet_image',
    },
    authorization,
  );
  const id = uploaded?.data?.id;
  if (
    typeof id !== 'string' ||
    !/^[0-9]{1,19}$/.test(id) ||
    uploaded.errors?.length
  ) {
    throw new Error('X image upload did not return a valid media id.');
  }

  // XDK OpenAPI 2.159 defines MetadataCreateRequest.metadata.alt_text
  // and the response's associated_metadata.alt_text (AltText.text <= 1000).
  const metadata = await prepareMedia(
    auth,
    'metadata',
    {
      id,
      metadata: { alt_text: { text: image.altText } },
    },
    await bearer(auth),
  );
  if (
    metadata?.data?.id !== id ||
    metadata.data.associated_metadata?.alt_text?.text !== image.altText ||
    metadata.errors?.length
  ) {
    throw new Error('X did not confirm the reviewed image alt text.');
  }
  return id;
}

async function postTweet(auth: XAuth, body: TweetRequestBody): Promise<string> {
  const response = await http<TweetResponse>({
    method: 'POST',
    url: TWEETS_URL,
    headers: {
      Authorization: await bearer(auth),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    fetch: auth.fetch,
    // A retried create can post the tweet twice; fail instead.
    retryOn5xx: false,
    creates: true,
    on401: async () => {
      await auth.refresh();
      return { retry: true, headers: { Authorization: await bearer(auth) } };
    },
  });
  return response.data.id;
}

/**
 * Posts a tweet, or a thread of replies, to X. The draft must already be
 * validated. A reviewed image is uploaded with its alt text and attached to
 * the first tweet only. A 401 refreshes the token once and retries.
 *
 * @throws {OutcomeUnknownError} When a create may have gone through (timeout,
 *   network error, 5xx), or any reply fails after the first tweet is live.
 */
export async function postX(auth: XAuth, draft: Draft): Promise<PostResult> {
  const parts = draft.threadParts ?? (draft.text ? [draft.text] : []);
  if (parts.length === 0) {
    throw new Error('An X draft needs text or threadParts; validate it first.');
  }

  const mediaId = draft.image
    ? await uploadImage(auth, draft.image)
    : undefined;
  const firstId = await postTweet(auth, {
    text: parts[0],
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
  });
  let previousId = firstId;
  for (const [index, text] of parts.slice(1).entries()) {
    try {
      previousId = await postTweet(auth, {
        text,
        reply: { in_reply_to_tweet_id: previousId },
      });
    } catch (error) {
      // The thread is already partly live; posting it again would double it.
      throw new OutcomeUnknownError(
        `X thread is partly live from tweet ${firstId}; part ${index + 2} of ${parts.length} failed: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  return {
    channel: 'x',
    postId: firstId,
    url: `https://x.com/i/status/${firstId}`,
    postedAt: new Date().toISOString(),
  };
}
