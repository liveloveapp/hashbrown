import type { Element, Root } from 'hast';
import { type Components, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ComponentType, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
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
  .use(rehypeShiki);

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
): Promise<ReactNode> {
  const tree = (await processor.run(processor.parse(source))) as Root;
  markUnported(tree, components);
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: components as Partial<Components>,
  });
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
