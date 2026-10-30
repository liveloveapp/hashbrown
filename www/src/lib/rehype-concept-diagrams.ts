import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

function containsDiagram(node: Element): boolean {
  return (
    ['hb-concept-diagram', 'hb-diagram'].includes(node.tagName) ||
    node.children.some(
      (child) => child.type === 'element' && containsDiagram(child),
    )
  );
}

function normalize(node: Element): Element;
function normalize(node: Root): Root;
function normalize(node: Root | Element): Root | Element {
  if (node.type === 'root') {
    return {
      ...node,
      children: node.children.map((child) =>
        child.type === 'element' ? normalize(child) : child,
      ),
    };
  }
  const children = node.children.map((child) =>
    child.type === 'element' ? normalize(child) : child,
  );
  if (
    node.tagName === 'p' &&
    children.some((child) => child.type === 'element' && containsDiagram(child))
  ) {
    const meaningful = children.filter(
      (child) => child.type !== 'text' || child.value.trim().length > 0,
    );
    if (
      meaningful.length !== 1 ||
      meaningful[0].type !== 'element' ||
      !['hb-concept-diagram', 'hb-diagram'].includes(meaningful[0].tagName)
    ) {
      throw new Error('Concept diagrams must occupy their own paragraph');
    }
    return meaningful[0];
  }
  return { ...node, children };
}

/**
 * Keep concept flows at block level, including one-line custom-element syntax.
 * A paragraph around the rendered figure is invalid HTML and breaks hydration.
 */
export const rehypeConceptDiagrams: Plugin<[], Root> = () => (tree) =>
  normalize(tree);
