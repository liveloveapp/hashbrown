import { Component, inject, input, ViewEncapsulation } from '@angular/core';
import {
  MagicText,
  type MagicTextCitationClickEvent,
  type MagicTextLinkClickEvent,
} from '@hashbrownai/angular';
import { LinkClickHandler } from './link-click-handler';

@Component({
  selector: 'app-magic-text-renderer',
  imports: [MagicText],
  template: `
    <hb-magic-text
      class="magic-text"
      [text]="text()"
      [isComplete]="isComplete()"
      [caret]="false"
      [options]="magicTextOptions"
      (linkClick)="handleLinkClick($event)"
      (citationClick)="handleCitationClick($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        width: var(--article-width);
        margin-bottom: 12px;
        color: var(--gray);
      }

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

  handleCitationClick(event: MagicTextCitationClickEvent) {
    const citationUrl = event.citation.url;
    if (citationUrl) {
      event.mouseEvent.preventDefault();
      this.linkClickHandler.onClickLink(citationUrl);
    }
  }
}
