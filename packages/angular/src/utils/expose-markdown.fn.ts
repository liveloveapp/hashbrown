import { type Provider, reflectComponentType } from '@angular/core';
import type { PartialMarkdownParserOptions } from '@cacheplane/partial-markdown';
import { markdownComponent, type SegmenterOptions } from '@hashbrownai/core';
import {
  type ProseCitationClickEvent,
  type ProseLinkClickEvent,
} from '../components/prose-renderer.component';
import {
  type ProseRendererComponentType,
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

/** @public */
export type ProseExposeInputs = {
  parserOptions?: PartialMarkdownParserOptions;
  segmenter?: SegmenterOptions;
  caret?: boolean;
  className?: string;
};

export type { ProseRendererComponentType };

/**
 * Built-in markdown renderer configuration.
 *
 * @public
 */
export type ExposeMarkdownBuiltInRendererConfig = ProseExposeInputs & {
  renderer?: undefined;
  onLinkClick?: (event: ProseLinkClickEvent) => void;
  onCitationClick?: (event: ProseCitationClickEvent) => void;
};

/**
 * Custom renderer configuration for markdown exposure.
 *
 * The custom renderer must expose `text` and `isComplete` inputs.
 *
 * @public
 */
export type ExposeMarkdownCustomRendererConfig = {
  renderer: ProseRendererComponentType;
  parserOptions?: never;
  segmenter?: never;
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
   * When omitted, the default description of `markdownComponent` (from
   * `@hashbrownai/core`) is used.
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
  const definition = markdownComponent({
    name: config.name,
    description: config.description,
    citations: config.citations,
  });
  const propsSchema = definition.props as unknown as ComponentPropSchema<
    typeof ɵExposedMarkdownComponent
  >;

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
      name: definition.name,
      description: definition.description,
      input: propsSchema,
      providers,
    });
  }

  const runtimeConfig: ɵExposeMarkdownBuiltInRuntimeConfig = {
    parserOptions: config.parserOptions,
    segmenter: config.segmenter,
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
    name: definition.name,
    description: definition.description,
    input: propsSchema,
    providers,
  });
}

function validateCustomRenderer(
  renderer: ProseRendererComponentType,
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
    config.parserOptions !== undefined ||
    config.segmenter !== undefined ||
    config.caret !== undefined ||
    config.className !== undefined ||
    config.onLinkClick !== undefined ||
    config.onCitationClick !== undefined;

  if (hasDisallowedSettings) {
    throw new Error(
      'When `renderer` is provided, `parserOptions`, `segmenter`, `caret`, `className`, `onLinkClick`, and `onCitationClick` are not supported.',
    );
  }
}
