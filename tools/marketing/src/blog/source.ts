/** The hashbrown repo is public, so merged posts are read without a token. */
const RAW_MAIN = 'https://raw.githubusercontent.com/liveloveapp/hashbrown/main';
const READ_TIMEOUT_MS = 10_000;

/**
 * Reads a merged blog post's markdown from `main`, for the dev.to cross-post.
 *
 * @param slug - The post's slug (its file name without `.md`).
 * @param fetchImpl - `fetch`, replaceable in tests.
 * @throws On any answer other than 200, with the status.
 */
export async function readBlogMarkdown(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const path = `www/content/blog/${encodeURIComponent(slug)}.md`;
  const response = await fetchImpl(`${RAW_MAIN}/${path}`, {
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} reading ${path} from main`);
  }
  return response.text();
}
