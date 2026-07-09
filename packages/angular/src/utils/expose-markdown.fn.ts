import { type Provider, reflectComponentType } from '@angular/core';
import { type MagicTextParserOptions, s } from '@hashbrownai/core';
import {
  type MagicTextCitationClickEvent,
  type MagicTextLinkClickEvent,
} from '../components/magic-text-renderer.component';
import {
  type MagicTextRendererComponentType,
  ɵExposedMarkdownComponent,
  ɵExposedMarkdownCustomRendererComponent,
  type ɵExposeMarkdownBuiltInRuntimeConfig,
  type ɵExposeMarkdownCustomRuntimeConfig,
  ɵHB_EXPOSE_MARKDOWN_CONFIG,
} from './exposed-markdown.component';
import {
  type ComponentPropSchema,
  exposeComponent,
  type ExposedComponent,
} from './expose-component.fn';

const DEFAULT_COMPONENT_NAME = 'Markdown';
const DEFAULT_MARKDOWN_DESCRIPTION = [
  'Render markdown content for the user.',
  '',
  'Write all markdown into the `children` prop.',
  'Use standard markdown for headings, lists, links, tables, and code blocks.',
].join('\n');
const CITATION_DESCRIPTION_SUFFIX = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

/** @public */
export type MagicTextExposeInputs = {
  options?: Partial<MagicTextParserOptions>;
  caret?: boolean;
  className?: string;
};

export type { MagicTextRendererComponentType };

/**
 * Built-in markdown renderer configuration.
 *
 * @public
 */
export type ExposeMarkdownBuiltInRendererConfig = MagicTextExposeInputs & {
  renderer?: undefined;
  onLinkClick?: (event: MagicTextLinkClickEvent) => void;
  onCitationClick?: (event: MagicTextCitationClickEvent) => void;
};

/**
 * Custom renderer configuration for markdown exposure.
 *
 * The custom renderer must expose `text` and `isComplete` inputs.
 *
 * @public
 */
export type ExposeMarkdownCustomRendererConfig = {
  renderer: MagicTextRendererComponentType;
  options?: never;
  caret?: never;
  className?: never;
  onLinkClick?: never;
  onCitationClick?: never;
};

/**
 * Configuration options for `exposeMarkdown`.
 *
 * @public
 */
export type ExposeMarkdownConfig = {
  /**
   * Component tag name exposed to the LLM.
   *
   * @default "Markdown"
   */
  name?: string;

  /**
   * LLM-facing component description.
   *
   * @default DEFAULT_MARKDOWN_DESCRIPTION
   */
  description?: string;

  /**
   * Append citation guidance to the default description.
   *
   * Ignored when `description` is provided.
   *
   * @default false
   */
  citations?: boolean;
} & (ExposeMarkdownBuiltInRendererConfig | ExposeMarkdownCustomRendererConfig);

/**
 * Exposes markdown rendering as a constrained UI component where only `children`
 * is model-controlled.
 *
 * @public
 */
export function exposeMarkdown(
  config: ExposeMarkdownConfig = {},
): ExposedComponent<
  | typeof ɵExposedMarkdownComponent
  | typeof ɵExposedMarkdownCustomRendererComponent
> {
  const {
    name = DEFAULT_COMPONENT_NAME,
    description,
    citations = false,
  } = config;

  const effectiveDescription =
    description ??
    `${DEFAULT_MARKDOWN_DESCRIPTION}${citations ? `\n${CITATION_DESCRIPTION_SUFFIX}` : ''}`;

  const propsSchema = {
    children: s.node(s.streaming.string('Markdown content to render')),
  } as unknown as ComponentPropSchema<typeof ɵExposedMarkdownComponent>;

  if ('renderer' in config && config.renderer) {
    validateCustomRenderer(config.renderer);
    validateCustomRendererConfig(config);

    const runtimeConfig: ɵExposeMarkdownCustomRuntimeConfig = {
      renderer: config.renderer,
    };

    const providers: Provider[] = [
      {
        provide: ɵHB_EXPOSE_MARKDOWN_CONFIG,
        useValue: runtimeConfig,
      },
    ];

    return exposeComponent(ɵExposedMarkdownCustomRendererComponent, {
      name,
      description: effectiveDescription,
      input: propsSchema,
      providers,
    });
  }

  const runtimeConfig: ɵExposeMarkdownBuiltInRuntimeConfig = {
    options: config.options,
    caret: config.caret ?? true,
    className: config.className,
    onLinkClick: config.onLinkClick,
    onCitationClick: config.onCitationClick,
  };

  const providers: Provider[] = [
    {
      provide: ɵHB_EXPOSE_MARKDOWN_CONFIG,
      useValue: runtimeConfig,
    },
  ];

  return exposeComponent(ɵExposedMarkdownComponent, {
    name,
    description: effectiveDescription,
    input: propsSchema,
    providers,
  });
}

function validateCustomRenderer(
  renderer: MagicTextRendererComponentType,
): void {
  const reflected = reflectComponentType(renderer);
  if (!reflected) {
    throw new Error('Custom markdown renderer must be an Angular component.');
  }

  const inputNames = new Set<string>();
  for (const inputDef of reflected.inputs) {
    inputNames.add(inputDef.propName);
    inputNames.add(inputDef.templateName);
  }

  if (!inputNames.has('text') || !inputNames.has('isComplete')) {
    throw new Error(
      'Custom markdown renderer must define both `text` and `isComplete` inputs.',
    );
  }
}

function validateCustomRendererConfig(config: ExposeMarkdownConfig): void {
  const hasDisallowedSettings =
    config.options !== undefined ||
    config.caret !== undefined ||
    config.className !== undefined ||
    config.onLinkClick !== undefined ||
    config.onCitationClick !== undefined;

  if (hasDisallowedSettings) {
    throw new Error(
      'When `renderer` is provided, `options`, `caret`, `className`, `onLinkClick`, and `onCitationClick` are not supported.',
    );
  }
}
