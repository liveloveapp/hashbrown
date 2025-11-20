import { Component, inject, input, ViewEncapsulation } from '@angular/core';
import {
  MagicText,
  MagicTextCitation,
  MagicTextRenderCitation,
  MagicTextRenderCitationContext,
  MagicTextRenderLink,
  MagicTextRenderLinkContext,
} from '@hashbrownai/angular';
import { RouterLink } from '@angular/router';
import { LinkClickHandler } from './link-click-handler';
import { CitationIcon } from './icons/citation-icon';

@Component({
  selector: 'app-magic-text-renderer',
  imports: [
    MagicText,
    MagicTextRenderLink,
    MagicTextRenderCitation,
    CitationIcon,
    RouterLink,
  ],
  template: `
    <hb-magic-text class="magic-text" [text]="text()" [citations]="citations()">
      <ng-template hbMagicTextRenderLink let-node>
        @if (node.href.startsWith('/')) {
          <a
            class="fragment-link"
            [routerLink]="node.href"
            [attr.title]="node.title || null"
            [attr.aria-label]="node.ariaLabel || null"
            [attr.rel]="node.rel || defaultLinkRel"
            [attr.target]="node.target || defaultLinkTarget"
            >{{ node.text }}</a
          >
        } @else {
          <a
            class="fragment-link"
            [href]="node.href"
            [attr.title]="node.title || null"
            [attr.aria-label]="node.ariaLabel || null"
            [attr.rel]="node.rel || defaultLinkRel"
            [attr.target]="node.target || defaultLinkTarget"
            target="_blank"
            rel="noopener noreferrer"
            >{{ node.text }}</a
          >
        }
      </ng-template>

      <ng-template hbMagicTextRenderCitation let-node>
        @if (node.citation.url) {
          <a
            class="citation"
            role="doc-noteref"
            data-allow-navigation="true"
            [href]="node.citation.url"
            rel="noopener noreferrer"
            target="_blank"
            [attr.title]="node.text"
            [attr.aria-label]="node.text"
          >
            <app-citation-icon [url]="node.citation.url"></app-citation-icon>
            <span class="sr-only">{{ node.text }}</span>
          </a>
        } @else {
          <button
            type="button"
            class="citation citation--placeholder"
            role="doc-noteref"
            [attr.aria-label]="node.text"
            (click)="handleCitationClick($event, node)"
          >
            <span class="citation-placeholder"></span>
            <span class="sr-only">{{ node.text }}</span>
          </button>
        }
      </ng-template>
    </hb-magic-text>
  `,
  styles: [
    `
      :host {
        display: contents;
        color: var(--gray);
      }

      .fragment-link {
        color: var(--sunshine-yellow-dark);
      }

      .citation {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85em;
      }

      .citation--placeholder {
        border: none;
        background: transparent;
        padding: 0;
        color: var(--sunshine-yellow-dark);
        cursor: pointer;
      }

      .citation-placeholder {
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

      hb-magic-text .hb-text--strong {
        font-weight: 500;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class MagicTextRenderer {
  private readonly linkClickHandler = inject(LinkClickHandler);

  readonly text = input.required<string>();
  readonly citations = input<MagicTextCitation[]>([]);
  protected readonly defaultLinkTarget = '_blank';
  protected readonly defaultLinkRel = 'noopener noreferrer';

  handleLinkClick(event: MouseEvent, node: MagicTextRenderLinkContext) {
    const href = node.href;
    if (href) {
      event.preventDefault();
      this.linkClickHandler.onClickLink(href);
    }
  }

  handleCitationClick(event: MouseEvent, node: MagicTextRenderCitationContext) {
    const href = node.citation.url;
    if (href) {
      event.preventDefault();
      this.linkClickHandler.onClickLink(href);
    }
  }
}
