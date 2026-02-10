import { Component, inject, input, ViewEncapsulation } from '@angular/core';
import {
  MagicText,
  type MagicTextCitationRenderContext,
  type MagicTextLinkClickEvent,
  MagicTextRenderCitation,
} from '@hashbrownai/angular';
import { CitationIcon } from './icons/citation-icon';
import { LinkClickHandler } from './link-click-handler';

@Component({
  selector: 'app-magic-text-renderer',
  imports: [MagicText, MagicTextRenderCitation, CitationIcon],
  template: `
    <hb-magic-text
      class="magic-text"
      [text]="text()"
      [isComplete]="isComplete()"
      [caret]="false"
      [options]="magicTextOptions"
      (linkClick)="handleLinkClick($event)"
    >
      <ng-template
        hbMagicTextRenderCitation
        let-citation="citation"
        let-label="label"
      >
        @if (citation.url; as citationUrl) {
          <sup class="citation-node" data-magic-text-node="citation">
            <a
              class="citation"
              role="doc-noteref"
              [href]="citationUrl"
              [attr.title]="getCitationLabel(citation, label)"
              [attr.aria-label]="getCitationLabel(citation, label)"
              rel="noopener noreferrer"
              target="_blank"
              (click)="handleCitationClick($event, citationUrl)"
            >
              <app-citation-icon [url]="citationUrl"></app-citation-icon>
              <span class="sr-only">{{
                getCitationLabel(citation, label)
              }}</span>
            </a>
          </sup>
        } @else {
          <sup class="citation-node" data-magic-text-node="citation">
            <span
              class="citation citation--placeholder"
              role="doc-noteref"
              [attr.aria-label]="getCitationLabel(citation, label)"
            >
              <span class="citation-placeholder"></span>
              <span class="sr-only">{{
                getCitationLabel(citation, label)
              }}</span>
            </span>
          </sup>
        }
      </ng-template>
    </hb-magic-text>
  `,
  host: {
    '[style.display]': "'block'",
    '[style.width]': "'var(--article-width)'",
    '[style.max-width]': "'var(--article-width)'",
    '[style.min-width]': "'var(--article-width)'",
    '[style.margin-bottom.px]': '12',
    '[style.color]': "'var(--gray)'",
    '[style.box-sizing]': "'border-box'",
  },
  styles: [
    `
      hb-magic-text a {
        color: var(--sunshine-yellow-dark);
      }

      hb-magic-text strong {
        font-weight: 500;
      }

      hb-magic-text p[data-magic-text-node='paragraph'] {
        margin: 0 0 12px;
        line-height: 1.6;
      }

      hb-magic-text p[data-magic-text-node='paragraph']:last-child {
        margin-bottom: 0;
      }

      hb-magic-text ol[data-magic-text-node='list'] {
        margin: 0 0 12px;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        list-style-type: decimal;
      }

      hb-magic-text ol[data-magic-text-node='list']:last-child {
        margin-bottom: 0;
      }

      hb-magic-text ul[data-magic-text-node='list'] {
        margin: 0 0 12px;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        list-style-type: disc;
      }

      hb-magic-text ul[data-magic-text-node='list']:last-child {
        margin-bottom: 0;
      }

      hb-magic-text li[data-magic-text-node='list-item'] {
        line-height: 1.3;
      }

      .citation-node {
        vertical-align: baseline;
      }

      .citation {
        display: inline-flex;
        align-items: center;
        line-height: 1;
        transform: translateY(-0.15em);
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
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class MagicTextRenderer {
  private readonly linkClickHandler = inject(LinkClickHandler);

  readonly text = input.required<string>();
  readonly isComplete = input(false);
  readonly magicTextOptions = { segmenter: { granularity: 'word' as const } };

  handleLinkClick(event: MagicTextLinkClickEvent) {
    if (event.url) {
      event.mouseEvent.preventDefault();
      this.linkClickHandler.onClickLink(event.url);
    }
  }

  handleCitationClick(event: MouseEvent, url: string) {
    event.preventDefault();
    this.linkClickHandler.onClickLink(url);
  }

  getCitationLabel(
    citation: MagicTextCitationRenderContext['citation'],
    label: string,
  ): string {
    return citation.text ? `[${label}] ${citation.text}` : `[${label}]`;
  }
}
