import { s } from '../schema';
import type { UiComponentDefinition } from './ui-json-schema';

const DEFAULT_NAME = 'Markdown';
const DEFAULT_DESCRIPTION = [
  'Render markdown content for the user.',
  '',
  'Write all markdown into the `children` prop.',
  'Use standard markdown for headings, lists, links, tables, and code blocks.',
].join('\n');
const CITATION_GUIDANCE = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

/**
 * Options for {@link markdownComponent}.
 *
 * @public
 */
export interface MarkdownComponentOptions {
  /**
   * The tag name the model uses.
   *
   * @defaultValue "Markdown"
   */
  name?: string;
  /**
   * What the model is told about the component. Replaces the default.
   */
  description?: string;
  /**
   * Appends citation guidance to the default description. Ignored when
   * `description` is set.
   *
   * @defaultValue false
   */
  citations?: boolean;
}

/**
 * The Markdown component's contract with the model: its name, description
 * and streaming `children` prop.
 *
 * `exposeMarkdown` builds from it in the browser. On a server, pass it to
 * `createUiJsonSchema` with your other component definitions to build
 * the same response schema the browser sends, so the server can pin it.
 *
 * @public
 * @param options - The same `name`, `description` and `citations` you pass to `exposeMarkdown`.
 * @returns A component definition for `createUiJsonSchema`.
 */
export function markdownComponent(
  options: MarkdownComponentOptions = {},
): UiComponentDefinition {
  const { name = DEFAULT_NAME, description, citations = false } = options;

  return {
    name,
    description:
      description ??
      (citations
        ? `${DEFAULT_DESCRIPTION}\n${CITATION_GUIDANCE}`
        : DEFAULT_DESCRIPTION),
    props: {
      children: s.node(s.streaming.string('Markdown content to render')),
    },
  };
}
