import { Component, input } from '@angular/core';
import { MagicTextRenderer } from '../magic-text-renderer';

@Component({
  selector: 'app-executive-summary',
  imports: [MagicTextRenderer],
  template: `
    <section class="executive-summary" aria-label="Executive summary">
      <app-magic-text-renderer [text]="text()"></app-magic-text-renderer>
    </section>
  `,
  host: {
    '[attr.raw-text]': 'text()',
  },
  styles: [
    `
      :host {
        display: block;
        width: var(--article-width);
        margin-bottom: 4px;
      }

      .executive-summary {
        font-size: 1.2rem;
        line-height: 1.5;
        letter-spacing: 0.01em;
        font-weight: 300;
        color: var(--gray);
      }
    `,
  ],
})
export class ExecutiveSummary {
  readonly text = input.required<string>();
}
