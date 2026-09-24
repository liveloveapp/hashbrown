import { buildSearchIndex } from '../../../lib/search-index';

/** Built once at `next build` and served as a static file. */
export const dynamic = 'force-static';

/**
 * GET /_/search-index: the docs sitemap and API symbol tables the search
 * overlay puts in its system prompt. The overlay fetches it when first
 * opened, so pages don't carry it.
 */
export function GET(): Response {
  return Response.json(buildSearchIndex());
}
