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
      [isComplete]="true"
      [caret]="false"
      [options]="magicTextOptions"
      (linkClick)="handleLinkClick($event)"
      (citationClick)="handleCitationClick($event)"
    />
  `,
  styles: [
    `
      :host {
        display: contents;
        color: var(--gray);
      }

      hb-magic-text a {
        color: var(--sunshine-yellow-dark);
      }

      hb-magic-text strong {
        font-weight: 500;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class MagicTextRenderer {
  private readonly linkClickHandler = inject(LinkClickHandler);

  readonly text = input.required<string>();
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
