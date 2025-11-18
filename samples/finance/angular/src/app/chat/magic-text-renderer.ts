import { CommonModule } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { type MagicTextFragment, prepareMagicText } from '@hashbrownai/core';
import { LinkClickHandler } from './link-click-handler';
import { CitationIcon } from './icons/citation-icon';

@Component({
  selector: 'app-magic-text-renderer',
  imports: [CommonModule, CitationIcon],
  template: `
    @for (
      fragment of visibleFragments();
      track fragment.key;
      let index = $index
    ) {
      @if (fragment.kind === 'text') {
        <span
          class="fragment"
          [class.fragment--provisional]="fragment.state === 'provisional'"
          [class.fragment--static]="isStaticFragment(fragment)"
          [style.--fragment-delay.ms]="0"
          [style.--fragment-duration.ms]="
            isStaticFragment(fragment) ? 0 : fragmentDuration
          "
        >
          <ng-container
            [ngTemplateOutlet]="fragmentWhitespace"
            [ngTemplateOutletContext]="{ index, position: 'before' }"
          ></ng-container>
          @if (fragment.marks.link) {
            <a
              [href]="fragment.marks.link.href"
              [attr.title]="fragment.marks.link.title"
              [attr.aria-label]="fragment.marks.link.ariaLabel"
              [attr.rel]="fragment.marks.link.rel ?? defaultLinkRel"
              [attr.target]="fragment.marks.link.target ?? defaultLinkTarget"
              (click)="handleAnchorClick($event, fragment.marks.link.href)"
            >
              <ng-container
                [ngTemplateOutlet]="richWrappers"
                [ngTemplateOutletContext]="{
                  fragment,
                  wrapperIndex: 0,
                }"
              ></ng-container>
            </a>
          } @else {
            <ng-container
              [ngTemplateOutlet]="richWrappers"
              [ngTemplateOutletContext]="{
                fragment,
                wrapperIndex: 0,
              }"
            ></ng-container>
          }
          <ng-container
            [ngTemplateOutlet]="fragmentWhitespace"
            [ngTemplateOutletContext]="{ index, position: 'after' }"
          ></ng-container>
        </span>
      } @else {
        <ng-container
          [ngTemplateOutlet]="fragmentWhitespace"
          [ngTemplateOutletContext]="{ index, position: 'before' }"
        ></ng-container>
        <sup
          class="fragment citation"
          role="doc-noteref"
          [style.--fragment-delay.ms]="0"
          [style.--fragment-duration.ms]="fragmentDuration"
        >
          @if (
            citationLookup().get(fragment.citation.id);
            as resolvedCitation
          ) {
            <a
              class="citation-link"
              data-allow-navigation="true"
              [href]="resolvedCitation.url"
              rel="noopener noreferrer"
              target="_blank"
              [attr.title]="fragment.text"
              [attr.aria-label]="fragment.text"
            >
              <app-citation-icon
                [url]="resolvedCitation.url"
              ></app-citation-icon>
              <span class="sr-only">{{ fragment.text }}</span>
            </a>
          } @else {
            <span
              class="citation-placeholder"
              [attr.aria-label]="fragment.text"
            >
              <span class="citation-placeholder-wrapper">
                <span
                  class="citation-placeholder-icon"
                  aria-hidden="true"
                ></span>
              </span>
              <span class="sr-only">{{ fragment.text }}</span>
            </span>
          }
        </sup>
        <ng-container
          [ngTemplateOutlet]="fragmentWhitespace"
          [ngTemplateOutletContext]="{ index, position: 'after' }"
        ></ng-container>
      }
    }

    <ng-template
      #richWrappers
      let-fragment="fragment"
      let-wrapperIndex="wrapperIndex"
    >
      @if (wrapperIndex < fragment.wrappers.length) {
        @switch (fragment.wrappers[wrapperIndex]) {
          @case ('strong') {
            <strong>
              <ng-container
                [ngTemplateOutlet]="richWrappers"
                [ngTemplateOutletContext]="{
                  fragment,
                  wrapperIndex: wrapperIndex + 1,
                }"
              ></ng-container>
            </strong>
          }
          @case ('em') {
            <em>
              <ng-container
                [ngTemplateOutlet]="richWrappers"
                [ngTemplateOutletContext]="{
                  fragment,
                  wrapperIndex: wrapperIndex + 1,
                }"
              ></ng-container>
            </em>
          }
        }
      } @else {
        <ng-container
          [ngTemplateOutlet]="richCode"
          [ngTemplateOutletContext]="{ $implicit: fragment }"
        ></ng-container>
      }
    </ng-template>

    <ng-template #richCode let-fragment>
      @if (fragment.marks.code) {
        <code
          class="fragment-text fragment-text--code"
          [textContent]="fragment.text"
        ></code>
      } @else {
        <span class="fragment-text" [textContent]="fragment.text"></span>
      }
    </ng-template>

    <ng-template #fragmentWhitespace let-index="index" let-position="position">
      @if (shouldShowWhitespace(index, position)) {
        <span
          class="fragment-space"
          [class.fragment-space--before]="position === 'before'"
          [class.fragment-space--after]="position === 'after'"
          aria-hidden="true"
        >
          &nbsp;
        </span>
      }
    </ng-template>
  `,
  host: {
    '(click)': 'preventLinkNavigation($event)',
    '[attr.raw-text]': 'text() ?? ""',
  },
  styles: [
    `
      :host {
        display: contents;
        color: var(--gray);
      }

      a {
        color: var(--sunshine-yellow-dark);
      }

      .fragment {
        display: inline;
      }

      span,
      em,
      strong,
      sup,
      code {
        opacity: 1;
        transition: opacity 1.2s ease;
        @starting-style {
          opacity: 0;
        }
      }

      .fragment--provisional {
        opacity: 0;
      }

      .fragment--static {
        opacity: 1;
        animation: none;
      }

      .citation {
        font-size: 0.85em;
        margin-left: 2px;
      }

      .citation-link {
        display: inline-flex;
        align-items: center;
      }

      .citation-placeholder {
        display: inline-flex;
        align-items: center;
        color: var(--sunshine-yellow-dark);
      }

      .citation-placeholder-wrapper {
        display: inline-flex;
        margin-right: 4px;
      }

      .citation-placeholder-icon {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.4);
        background-color: transparent;
        opacity: 0.5;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      .fragment-text {
        white-space: pre-wrap;
      }

      .fragment-text--code {
        font-family: var(--code-font, 'SFMono-Regular', 'Consolas', monospace);
        background: var(--fragment-code-bg, rgba(0, 0, 0, 0.08));
        padding: 0 3px;
        border-radius: 4px;
        color: var(--gray-dark);
      }

      .fragment-space {
        display: inline;
        white-space: pre;
        user-select: none;
        pointer-events: none;
      }
    `,
  ],
})
export class MagicTextRenderer {
  private readonly linkClickHandler = inject(LinkClickHandler);

  readonly text = input.required<string>();
  readonly citations = input<MagicTextRendererCitation[]>([]);
  protected readonly fragmentDuration = 220;
  protected readonly defaultLinkTarget = '_blank';
  protected readonly defaultLinkRel = 'noopener noreferrer';
  private readonly normalizedCitations = computed<NormalizedCitation[]>(() => {
    const entries = this.citations() ?? [];
    const normalized: NormalizedCitation[] = [];
    for (const citation of entries) {
      if (
        citation == null ||
        (typeof citation.id !== 'number' && typeof citation.id !== 'string')
      ) {
        continue;
      }
      const id = String(citation.id).trim();
      const url =
        typeof citation.url === 'string' ? citation.url.trim() : undefined;
      if (!id || !url) {
        continue;
      }
      normalized.push({ id, url });
    }
    return normalized;
  });
  protected readonly citationLookup = computed(() => {
    const lookup = new Map<string, NormalizedCitation>();
    for (const citation of this.normalizedCitations()) {
      lookup.set(citation.id, citation);
    }
    return lookup;
  });
  protected readonly prepared = computed(() =>
    prepareMagicText(this.text() ?? ''),
  );
  protected readonly visibleFragments = computed(
    () => this.prepared().fragments,
  );

  protected readonly isStaticFragment = (
    fragment: MagicTextFragment,
  ): boolean =>
    fragment.state === 'provisional' ||
    (fragment.kind === 'text' && fragment.text.trim().length === 0);

  protected readonly shouldShowWhitespace = (
    index: number,
    position: 'before' | 'after',
  ): boolean => {
    const fragments = this.visibleFragments();
    const fragment = fragments[index];
    if (!fragment) {
      return false;
    }
    if (position === 'before') {
      if (!fragment.whitespace.before) {
        return false;
      }
      const previous = fragments[index - 1];
      return !previous || previous.state === 'provisional';
    }
    if (!fragment.whitespace.after) {
      return false;
    }
    const next = fragments[index + 1];
    return !next || next.state === 'provisional';
  };

  handleAnchorClick(event: MouseEvent, href?: string) {
    event.preventDefault();
    if (href) {
      this.linkClickHandler.onClickLink(href);
    }
  }

  preventLinkNavigation(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest('a');
    if (!anchor || anchor.hasAttribute('data-allow-navigation')) {
      return;
    }
    event.preventDefault();
  }
}

type NormalizedCitation = {
  id: string;
  url: string;
};

export type MagicTextRendererCitation = {
  id: number;
  url: string;
};
