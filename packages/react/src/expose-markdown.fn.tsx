import { type JsonResolvedValue, markdownComponent } from '@hashbrownai/core';
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
  const { name, description, citations, ...rendererProps } = config;
  const definition = markdownComponent({ name, description, citations });

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
    name: definition.name,
    description: definition.description,
    props: definition.props as unknown as ComponentPropSchema<
      ComponentType<ExposedMarkdownComponentProps>
    >,
  });
}
