import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

/** A heading collected for the on-page table of contents. */
export interface Heading {
  level: number;
  text: string;
  id: string;
}

/** Options for {@link rehypeHeadingIds}. */
export interface HeadingIdsOptions {
  /** Receives the page's `h1`–`h3` headings in document order. */
  onHeadings?: (headings: Heading[]) => void;
}

/**
 * The Analog site's heading id rule (`MarkdownPage.collectHeadings`), kept
 * exactly so existing `#fragment` links keep working: lowercase, spaces to
 * dashes, `:` and `@` removed, `/` to dashes. Periods are kept.
 *
 * @param text - The heading's text content.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/:/g, '')
    .replace(/@/g, '')
    .replace(/\//g, '-');
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') {
    return node.value;
  }
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

const LEVELS: Record<string, number> = { h1: 1, h2: 2, h3: 3 };

/**
 * Rehype plugin: give `h1`–`h3` the ids the Analog site assigned in the
 * browser, and report them for the table of contents, both through
 * `options.onHeadings` and as `file.data.headings`.
 */
export const rehypeHeadingIds: Plugin<[HeadingIdsOptions?], Root> =
  (options = {}) =>
  (tree, file) => {
    const headings: Heading[] = [];
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== 'element') {
          continue;
        }
        const level = LEVELS[child.tagName];
        if (level) {
          const text = textOf(child);
          const id = slugifyHeading(text);
          child.properties = { ...child.properties, id };
          headings.push({ level, text, id });
        } else {
          visit(child);
        }
      }
    };
    visit(tree);
    file.data['headings'] = headings;
    options.onHeadings?.(headings);
  };
