import { http } from '../http.ts';
import type { Draft, PostResult } from '../types.ts';

const ARTICLES_URL = 'https://dev.to/api/articles';

interface DevToArticleResponse {
  id: number;
  url: string;
  published_at?: string;
}

interface ArticleBody {
  title: string;
  body_markdown: string;
  published: boolean;
  tags?: string[];
  canonical_url?: string;
  description?: string;
}

/**
 * Publishes the draft as a dev.to article through the API. The draft must
 * already be validated.
 *
 * @param fetch - The fetch implementation; defaults to `globalThis.fetch`.
 * @throws When dev.to rejects the API key or the article;
 *   `OutcomeUnknownError` when it may have been published (timeout,
 *   network error, 5xx, unreadable answer).
 */
export async function postDevTo(
  apiKey: string,
  draft: Draft,
  fetch?: typeof globalThis.fetch,
): Promise<PostResult> {
  if (!draft.article || draft.text === undefined) {
    throw new Error(
      'A dev.to draft needs text and an article; validate it first.',
    );
  }
  const { title, tags, canonicalUrl, description } = draft.article;
  const article: ArticleBody = {
    title,
    body_markdown: draft.text,
    published: true,
  };
  if (tags !== undefined) article.tags = tags;
  if (canonicalUrl !== undefined) article.canonical_url = canonicalUrl;
  if (description !== undefined) article.description = description;

  let response: DevToArticleResponse;
  try {
    response = await http<DevToArticleResponse>({
      method: 'POST',
      url: ARTICLES_URL,
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'hashbrown-marketing/1.0',
      },
      body: JSON.stringify({ article }),
      // A retried create can publish the article twice; fail instead.
      retryOn5xx: false,
      creates: true,
      fetch,
    });
  } catch (error) {
    if ((error as Error).message.startsWith('HTTP 401')) {
      throw new Error(
        'Dev.to API key rejected; re-generate at https://dev.to/settings/extensions and update DEVTO_API_KEY.',
      );
    }
    throw error;
  }

  return {
    channel: 'devto',
    postId: String(response.id),
    url: response.url,
    postedAt: response.published_at ?? new Date().toISOString(),
  };
}
