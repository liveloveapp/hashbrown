import { getHighlighter } from '../../lib/rehype-shiki';
import { type Excerpt, type HighlightedCode, segmentLines } from './excerpt';

/**
 * Load the site's Shiki theme and return a synchronous highlighter for API
 * excerpts, so components can highlight while rendering. Reference spans come
 * back as tagged segments for linking.
 */
export async function createExcerptHighlighter(): Promise<
  (excerpt: Excerpt) => HighlightedCode
> {
  const hl = await getHighlighter();
  return (excerpt) => {
    const { tokens, fg, bg } = hl.codeToTokens(excerpt.code, {
      lang: 'typescript',
      theme: 'hashbrown',
    });
    return {
      fg: fg ?? '',
      bg: bg ?? '',
      lines: segmentLines(tokens, excerpt.ranges),
    };
  };
}
