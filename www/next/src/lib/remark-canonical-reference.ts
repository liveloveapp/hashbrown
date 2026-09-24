import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { CANONICAL_REFERENCE_PATTERN } from './canonical-reference';

interface SymbolLinkNode {
  type: 'symbolLink';
  data: { hName: 'hb-symbol-link'; hProperties: { reference: string } };
}

type Node = { type: string; children?: Node[] };

/** Node types whose text must stay literal: code, and links (no nested anchors). */
const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'html']);

function splitText(node: Text): (Text | SymbolLinkNode)[] {
  const parts: (Text | SymbolLinkNode)[] = [];
  let last = 0;
  for (const match of node.value.matchAll(CANONICAL_REFERENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ type: 'text', value: node.value.slice(last, index) });
    }
    parts.push({
      type: 'symbolLink',
      data: { hName: 'hb-symbol-link', hProperties: { reference: match[0] } },
    });
    last = index + match[0].length;
  }
  if (last === 0) {
    return [node];
  }
  if (last < node.value.length) {
    parts.push({ type: 'text', value: node.value.slice(last) });
  }
  return parts;
}

function visit(node: Node): void {
  if (!node.children) {
    return;
  }
  node.children = node.children.flatMap((child): Node[] => {
    if (child.type === 'text') {
      return splitText(child as unknown as Text) as unknown as Node[];
    }
    if (!SKIP.has(child.type)) {
      visit(child);
    }
    return [child];
  });
}

/**
 * Remark plugin: replace canonical references in prose with `<hb-symbol-link>`
 * elements. Code, inline code and link text are left untouched.
 */
export const remarkCanonicalReference: Plugin<[], Root> = () => (tree) => {
  visit(tree as unknown as Node);
};
