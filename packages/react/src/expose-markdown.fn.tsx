import { type JsonResolvedValue, s } from '@hashbrownai/core';
import type { ComponentType } from 'react';
import {
  MagicTextRenderer,
  type MagicTextRendererProps,
} from './magic-text-renderer';
import {
  type ComponentPropSchema,
  exposeComponent,
  type ExposedComponent,
} from './expose-component.fn';

const DEFAULT_COMPONENT_NAME = 'Markdown';
const DEFAULT_DESCRIPTION = [
  'Render markdown content for the user.',
  '',
  'Write all markdown into the `children` prop.',
  'Use standard markdown for headings, lists, links, tables, and code blocks.',
].join('\n');
const CITATION_DESCRIPTION_SUFFIX = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

interface MarkdownNodeProp {
  complete: boolean;
  partialValue: JsonResolvedValue;
  value?: string;
}

interface ExposedMarkdownComponentProps
  extends Omit<MagicTextRendererProps, 'children' | 'isComplete'> {
  children?: MarkdownNodeProp;
}

/**
 * Configuration for `exposeMarkdown`.
 *
 * @public
 */
export type ExposeMarkdownConfig = Omit<
  MagicTextRendererProps,
  'children' | 'isComplete'
> & {
  /**
   * Component tag name exposed to the LLM.
   *
   * @default "Markdown"
   */
  name?: string;

  /**
   * LLM-facing component description.
   *
   * When omitted, a default description is used.
   */
  description?: string;

  /**
   * When true, appends citation formatting guidance to the default description.
   *
   * Ignored when `description` is explicitly provided.
   *
   * @default false
   */
  citations?: boolean;
};

/**
 * Exposes a markdown renderer component to the LLM while deriving parser completion state from `s.node(...)`.
 *
 * The LLM controls only the `children` prop. All other renderer behavior is developer-controlled.
 *
 * @public
 */
export function exposeMarkdown(
  config: ExposeMarkdownConfig = {},
): ExposedComponent<ComponentType<ExposedMarkdownComponentProps>> {
  const {
    name = DEFAULT_COMPONENT_NAME,
    description,
    citations = false,
    ...rendererProps
  } = config;

  const effectiveDescription = description
    ?? `${DEFAULT_DESCRIPTION}${citations ? `\n${CITATION_DESCRIPTION_SUFFIX}` : ''}`;
  const propsSchema = {
    children: s.node(s.streaming.string('Markdown content to render')),
  } as unknown as ComponentPropSchema<ComponentType<ExposedMarkdownComponentProps>>;

  const ExposedMarkdownComponent = ({
    children,
  }: ExposedMarkdownComponentProps) => {
    const text = typeof children?.value === 'string'
      ? children.value
      : typeof children?.partialValue === 'string'
        ? children.partialValue
        : '';
    const isComplete = children?.complete ?? false;

    return (
      <MagicTextRenderer
        {...rendererProps}
        caret={rendererProps.caret ?? true}
        isComplete={isComplete}
      >
        {text}
      </MagicTextRenderer>
    );
  };

  return exposeComponent(ExposedMarkdownComponent, {
    name,
    description: effectiveDescription,
    props: propsSchema,
  });
}
