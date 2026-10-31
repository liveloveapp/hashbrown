import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  input,
  type Type,
} from '@angular/core';
import {
  type JsonResolvedValue,
  type SegmenterOptions,
} from '@hashbrownai/core';
import type { PartialMarkdownParserOptions } from '@cacheplane/partial-markdown';
import {
  Prose,
  type ProseCitationClickEvent,
  type ProseLinkClickEvent,
} from '../components/prose-renderer.component';

/**
 * Minimal contract for custom markdown renderer components used by `exposeMarkdown`.
 *
 * @public
 */
export type ProseRendererComponentType = Type<{
  text: unknown;
  isComplete: unknown;
}>;

export type ɵMarkdownNodeProp = {
  complete: boolean;
  partialValue: JsonResolvedValue;
  value?: string;
};

export type ɵExposeMarkdownBuiltInRuntimeConfig = {
  renderer?: undefined;
  parserOptions?: PartialMarkdownParserOptions;
  segmenter?: SegmenterOptions;
  caret: boolean;
  className?: string;
  onLinkClick?: (event: ProseLinkClickEvent) => void;
  onCitationClick?: (event: ProseCitationClickEvent) => void;
};

export type ɵExposeMarkdownCustomRuntimeConfig = {
  renderer: ProseRendererComponentType;
};

export type ɵExposeMarkdownRuntimeConfig =
  ɵExposeMarkdownBuiltInRuntimeConfig | ɵExposeMarkdownCustomRuntimeConfig;

export const ɵHB_EXPOSE_MARKDOWN_CONFIG =
  new InjectionToken<ɵExposeMarkdownRuntimeConfig>('HB_EXPOSE_MARKDOWN_CONFIG');

@Component({
  selector: 'hb-exposed-markdown',
  standalone: true,
  imports: [Prose],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <hb-prose
      [text]="text()"
      [isComplete]="isComplete()"
      [parserOptions]="parserOptions()"
      [segmenter]="segmenter()"
      [caret]="caret()"
      [className]="className()"
      (linkClick)="handleLinkClick($event)"
      (citationClick)="handleCitationClick($event)"
    />
  `,
})
export class ɵExposedMarkdownComponent {
  children = input<ɵMarkdownNodeProp | undefined>(undefined);

  private readonly config = inject(
    ɵHB_EXPOSE_MARKDOWN_CONFIG,
  ) as ɵExposeMarkdownBuiltInRuntimeConfig;

  text = computed(() => {
    const node = this.children();
    if (typeof node?.value === 'string') {
      return node.value;
    }

    return typeof node?.partialValue === 'string' ? node.partialValue : '';
  });

  isComplete = computed(() => this.children()?.complete ?? false);
  parserOptions = computed(() => this.config.parserOptions);
  segmenter = computed(() => this.config.segmenter ?? true);
  caret = computed(() => this.config.caret);
  className = computed(() => this.config.className);

  handleLinkClick(event: ProseLinkClickEvent): void {
    this.config.onLinkClick?.(event);
  }

  handleCitationClick(event: ProseCitationClickEvent): void {
    this.config.onCitationClick?.(event);
  }
}

@Component({
  selector: 'hb-exposed-markdown-custom-renderer',
  standalone: true,
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <ng-container
      *ngComponentOutlet="
        renderer();
        inputs: { text: text(), isComplete: isComplete() }
      "
    />
  `,
})
export class ɵExposedMarkdownCustomRendererComponent {
  children = input<ɵMarkdownNodeProp | undefined>(undefined);

  private readonly config = inject(
    ɵHB_EXPOSE_MARKDOWN_CONFIG,
  ) as ɵExposeMarkdownCustomRuntimeConfig;

  renderer = computed(() => this.config.renderer);

  text = computed(() => {
    const node = this.children();
    if (typeof node?.value === 'string') {
      return node.value;
    }

    return typeof node?.partialValue === 'string' ? node.partialValue : '';
  });

  isComplete = computed(() => this.children()?.complete ?? false);
}
