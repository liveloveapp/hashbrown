/**
 * The id `renderMarkdownTree` (in `markdown.tsx`) gives an `hb-code-example`:
 * `code-example-<order>-<header slug>`, where `order` counts the page's code
 * examples in document order from 0.
 *
 * @param order - The code example's place among the page's code examples.
 * @param header - Its `header` attribute (its file), or `''`.
 */
export function codeExampleId(order: number, header: string): string {
  const slug = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `code-example-${order}${slug ? `-${slug}` : ''}`;
}
