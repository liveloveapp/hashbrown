import type { Element, Root, RootContent } from 'hast';

function referencesIn(node: Root | RootContent): string[] {
  if (node.type !== 'root' && node.type !== 'element') {
    return [];
  }
  const own =
    node.type === 'element' &&
    node.tagName === 'hb-symbol-link' &&
    typeof (node as Element).properties['reference'] === 'string'
      ? [node.properties['reference'] as string]
      : [];
  return [...own, ...node.children.flatMap(referencesIn)];
}

/**
 * The canonical references a page links, from its `hb-symbol-link` elements:
 * the ones `remarkCanonicalReference` made from prose and any written as raw
 * HTML. References inside code aren't elements, so they're not included.
 * Each reference appears once, in document order.
 *
 * @param tree - A parsed markdown tree (see `parseMarkdown`).
 */
export function collectSymbolReferences(tree: Root): string[] {
  return [...new Set(referencesIn(tree))];
}
