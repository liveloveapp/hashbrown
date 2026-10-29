import { http } from '../http.ts';
import type { Draft, PostResult } from '../types.ts';
import type { XAuth } from './auth.ts';

const TWEETS_URL = 'https://api.x.com/2/tweets';

interface TweetResponse {
  data: { id: string; text: string };
}

interface TweetRequestBody {
  text: string;
  reply?: { in_reply_to_tweet_id: string };
}

async function bearer(auth: XAuth): Promise<string> {
  return `Bearer ${await auth.accessToken()}`;
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
    on401: async () => {
      await auth.refresh();
      return { retry: true, headers: { Authorization: await bearer(auth) } };
    },
  });
  return response.data.id;
}

/**
 * Posts a tweet, or a thread of replies, to X. The draft must already be
 * validated. A 401 refreshes the token once and retries.
 */
export async function postX(auth: XAuth, draft: Draft): Promise<PostResult> {
  const parts = draft.threadParts ?? (draft.text ? [draft.text] : []);
  if (parts.length === 0) {
    throw new Error('An X draft needs text or threadParts; validate it first.');
  }

  const firstId = await postTweet(auth, { text: parts[0] });
  let previousId = firstId;
  for (const text of parts.slice(1)) {
    previousId = await postTweet(auth, {
      text,
      reply: { in_reply_to_tweet_id: previousId },
    });
  }

  return {
    channel: 'x',
    postId: firstId,
    url: `https://x.com/i/status/${firstId}`,
    postedAt: new Date().toISOString(),
  };
}
