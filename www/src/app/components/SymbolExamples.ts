import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { Markdown } from '../pipes/Markdown';

@Component({
  selector: 'www-symbol-examples',
  imports: [Markdown],
  template: `
    <h2>Examples</h2>
    <div class="content">
      @for (example of examples(); track $index) {
        <div class="example" [innerHTML]="example | markdown"></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .content {
      overflow: hidden;

      > .example {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 16px;

        > p {
          color: var(--gray-dark, #3d3c3a);
          font:
            400 15px/21px Fredoka,
            sans-serif;
        }

        > pre {
          overflow: hidden;
        }

        pre.shiki.hashbrown {
          padding: 24px;
          border-radius: 16px;
          border: 4px solid var(--gray-light, #a4a3a1);
          background: var(--gray-dark, #3d3c3a) !important;
          overflow-x: auto;
        }

        code:not(pre code) {
          font:
            700 14px/21px 'JetBrains Mono',
            monospace;
        }
      }
    }
  `,
})
export class SymbolExamples {
  symbol = input.required<ApiMember>();
  examples = computed(() => this.symbol().docs.examples);
}
