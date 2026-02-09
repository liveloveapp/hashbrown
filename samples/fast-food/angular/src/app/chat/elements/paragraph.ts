import { Component, input } from '@angular/core';
import { MagicTextRenderer } from '../magic-text-renderer';

@Component({
  selector: 'app-paragraph',
  imports: [MagicTextRenderer],
  preserveWhitespaces: false,
  template: `
    <p class="paragraph">
      <app-magic-text-renderer [text]="text()"></app-magic-text-renderer>
    </p>
  `,
  host: {
    '[attr.raw-text]': 'text()',
  },
  styles: [
    `
      :host {
        display: block;
        width: var(--article-width);
        margin-bottom: 12px;
      }

      .paragraph {
        line-height: 1.6;
      }
    `,
  ],
})
export class Paragraph {
  readonly text = input.required<string>();
  readonly citations = input<ParagraphCitation[]>([]);
}

type ParagraphCitation = {
  id: string;
  url: string;
};
