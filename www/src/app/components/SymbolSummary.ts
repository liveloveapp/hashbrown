import { Component, input, ViewEncapsulation } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { Markdown } from '../pipes/Markdown';

@Component({
  selector: 'www-symbol-summary',
  imports: [Markdown],
  template: `
    @if (symbol().docs.summary; as summary) {
      <div class="summary" [innerHtml]="summary | markdown"></div>
    }
  `,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      :host {
        display: block;
      }

      .summary {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .summary p {
        color: var(--gray-dark, #3d3c3a);
        font:
          400 15px/21px Fredoka,
          sans-serif;
      }
    `,
  ],
})
export class SymbolSummary {
  symbol = input.required<ApiMember>();
}
