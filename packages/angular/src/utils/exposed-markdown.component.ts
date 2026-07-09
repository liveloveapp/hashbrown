import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  InjectionToken,
  input,
  type Type,
} from '@angular/core';
import {
  type JsonResolvedValue,
  type MagicTextParserOptions,
} from '@hashbrownai/core';
import {
  MagicText,
  type MagicTextCitationClickEvent,
  type MagicTextLinkClickEvent,
} from '../components/magic-text-renderer.component';

/**
 * Minimal contract for custom markdown renderer components used by `exposeMarkdown`.
 *
 * @public
 */
export type MagicTextRendererComponentType = Type<{
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
  options?: Partial<MagicTextParserOptions>;
  caret: boolean;
  className?: string;
  onLinkClick?: (event: MagicTextLinkClickEvent) => void;
  onCitationClick?: (event: MagicTextCitationClickEvent) => void;
};

export type ɵExposeMarkdownCustomRuntimeConfig = {
  renderer: MagicTextRendererComponentType;
};

export type ɵExposeMarkdownRuntimeConfig =
  | ɵExposeMarkdownBuiltInRuntimeConfig
  | ɵExposeMarkdownCustomRuntimeConfig;

export const ɵHB_EXPOSE_MARKDOWN_CONFIG =
  new InjectionToken<ɵExposeMarkdownRuntimeConfig>('HB_EXPOSE_MARKDOWN_CONFIG');

@Component({
  selector: 'hb-exposed-markdown',
  standalone: true,
  imports: [MagicText],
  template: `
    <hb-magic-text
      [text]="text()"
      [isComplete]="isComplete()"
      [options]="options()"
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
  options = computed(() => this.config.options);
  caret = computed(() => this.config.caret);
  className = computed(() => this.config.className);

  handleLinkClick(event: MagicTextLinkClickEvent): void {
    this.config.onLinkClick?.(event);
  }

  handleCitationClick(event: MagicTextCitationClickEvent): void {
    this.config.onCitationClick?.(event);
  }
}

@Component({
  selector: 'hb-exposed-markdown-custom-renderer',
  standalone: true,
  imports: [NgComponentOutlet],
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
