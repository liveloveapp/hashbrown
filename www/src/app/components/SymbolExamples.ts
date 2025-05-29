import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { Markdown } from '../pipes/Markdown';

@Component({
  selector: 'www-symbol-examples',
  imports: [Markdown],
  template: `
    <section class="examples-section">
      <h2 class="section-heading">Examples</h2>
      <div class="content">
        @for (example of examples(); track $index) {
          <div class="example" [innerHTML]="example | markdown"></div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .examples-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .section-heading {
        font: 600 20px/24px system-ui;
        margin: 0;
      }

      .content {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
        padding: 32px;
        background: #3d3c3a;
        border-radius: 12px;
      }

      .example {
        font: 400 14px/20px system-ui;
        color: rgba(255, 255, 255, 0.88);

        :global(pre) {
          background: #1d1c1a;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 16px 0;
        }

        :global(code) {
          font-family: monospace;
          background: transparent;
        }
      }
    `,
  ],
})
export class SymbolExamples {
  symbol = input.required<ApiMember>();
  examples = computed(() => this.symbol().docs.examples);
}
