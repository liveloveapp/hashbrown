import type { Root } from 'hast';
import rehypeRaw from 'rehype-raw';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw);

type Node = { type: string; tagName?: string; children?: Node[] };

/**
 * Count the `hb-*` and `www-*` elements a markdown document actually renders.
 * Code blocks and inline code are text, so tags inside them are not counted.
 *
 * @param markdown - Markdown without frontmatter.
 */
export function customElementsIn(markdown: string): Record<string, number> {
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const counts: Record<string, number> = {};
  const walk = (node: Node): void => {
    if (
      node.type === 'element' &&
      node.tagName &&
      /^(hb|www)-/.test(node.tagName)
    ) {
      counts[node.tagName] = (counts[node.tagName] ?? 0) + 1;
    }
    node.children?.forEach(walk);
  };
  walk(tree as unknown as Node);
  return counts;
}
