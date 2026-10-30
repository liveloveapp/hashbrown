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

/** Diagram IDs in document order, excluding tags shown as code examples. */
export function diagramIdsIn(markdown: string): string[] {
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const ids: string[] = [];
  const walk = (node: Root | Root['children'][number]): void => {
    if (node.type === 'element' && node.tagName === 'hb-diagram') {
      ids.push(String(node.properties.diagram ?? ''));
    }
    if ('children' in node) node.children.forEach(walk);
  };
  walk(tree);
  return ids;
}

/** Keep route segments intact when discovering the authored diagram placements. */
export function diagramTargetsIn(
  documents: readonly { sdk: string; slug: readonly string[]; body: string }[],
) {
  return documents.flatMap(({ sdk, slug, body }) => {
    const ids = diagramIdsIn(body);
    return ids.length ? [{ path: `/docs/${sdk}/${slug.join('/')}`, ids }] : [];
  });
}
