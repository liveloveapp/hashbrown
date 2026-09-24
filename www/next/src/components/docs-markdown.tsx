import {
  parseMarkdown,
  type RenderedMarkdown,
  renderMarkdownTree,
} from '../lib/markdown';
import { collectSymbolReferences } from '../lib/symbol-references';
import { symbolPopovers } from './api/symbol-context';
import { docsComponents } from './docs-components';

/**
 * Render docs or blog markdown with hover popovers on its symbol links. The
 * page's `hb-symbol-link` references are collected from the parsed tree and
 * only those symbols' popovers are built, so each page carries data for the
 * symbols it mentions and nothing else. Runs at build time.
 *
 * @param source - Markdown without frontmatter.
 * @param sdk - The SDK whose docs are rendering (blog posts use `react`).
 */
export async function renderDocsMarkdown(
  source: string,
  sdk: string,
): Promise<RenderedMarkdown> {
  const parsed = await parseMarkdown(source);
  const popovers = await symbolPopovers(collectSymbolReferences(parsed.tree));
  return renderMarkdownTree(parsed, docsComponents(sdk, popovers));
}
