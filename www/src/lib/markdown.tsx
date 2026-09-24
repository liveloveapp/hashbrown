import type { Element, Root } from 'hast';
import { type Components, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ComponentType, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { type Heading, rehypeHeadingIds } from './rehype-heading-ids';
import { rehypeShiki } from './rehype-shiki';
import { remarkCanonicalReference } from './remark-canonical-reference';

/** Maps element names, including custom elements like `hb-code-example`, to React components. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- element props vary per tag
export type MarkdownComponents = Record<string, ComponentType<any>>;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkCanonicalReference)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeHeadingIds)
  .use(rehypeShiki);

/** Rendered markdown and the headings for its table of contents. */
export interface RenderedMarkdown {
  content: ReactNode;
  headings: Heading[];
}

/** Markdown parsed to a hast tree, before its elements become components. */
export interface ParsedMarkdown {
  tree: Root;
  headings: Heading[];
}

/**
 * Parse site markdown to hast: GFM, canonical references as `hb-symbol-link`
 * elements, raw HTML, heading ids and highlighted code. Split from
 * {@link renderMarkdownTree} so a page can inspect the tree (for example, to
 * collect its symbol references) before choosing its components.
 *
 * @param source - Markdown without frontmatter.
 */
export function parseMarkdown(source: string): Promise<ParsedMarkdown> {
  return new Promise<ParsedMarkdown>((resolve, reject) => {
    // The callback form hands back the file, where rehypeHeadingIds leaves
    // the headings; the promise form returns only the tree.
    processor.run(processor.parse(source), source, (error, tree, file) => {
      if (error || !tree) {
        reject(error);
        return;
      }
      resolve({
        tree: tree as Root,
        headings: (file?.data['headings'] as Heading[] | undefined) ?? [],
      });
    });
  });
}

/**
 * Turn a parsed tree into React elements. Unmapped `hb-*`/`www-*` elements
 * render as marked placeholders. Works on a copy; the parsed tree is unchanged.
 *
 * @param parsed - Output of {@link parseMarkdown}.
 * @param components - Element-name to component map.
 */
export function renderMarkdownTree(
  { tree, headings }: ParsedMarkdown,
  components: MarkdownComponents,
): RenderedMarkdown {
  const marked = structuredClone(tree);
  markUnported(marked, components);
  return {
    content: toJsxRuntime(marked, {
      Fragment,
      jsx,
      jsxs,
      components: components as Partial<Components>,
    }),
    headings,
  };
}

/**
 * Render site markdown, including inline HTML and `<hb-*>` custom elements, to
 * React elements. Runs at build time in server components.
 *
 * @param source - Markdown without frontmatter.
 * @param components - Element-name to component map. Unmapped `hb-*`/`www-*`
 *   elements render as marked placeholders.
 */
export async function renderMarkdown(
  source: string,
  components: MarkdownComponents,
): Promise<RenderedMarkdown> {
  return renderMarkdownTree(await parseMarkdown(source), components);
}

/**
 * Turn `hb-*`/`www-*` elements that have no component into a visibly marked
 * `<div data-unported="name">`, so gaps show up in pages, tests and the spike
 * report instead of rendering as inert unknown tags.
 */
function markUnported(
  node: Root | Element,
  components: MarkdownComponents,
): void {
  for (const child of node.children) {
    if (child.type !== 'element') {
      continue;
    }
    if (
      /^(hb|www)-/.test(child.tagName) &&
      !Object.hasOwn(components, child.tagName)
    ) {
      child.properties = {
        ...child.properties,
        dataUnported: child.tagName,
        className: ['unported'],
      };
      child.tagName = 'div';
    }
    markUnported(child, components);
  }
}
