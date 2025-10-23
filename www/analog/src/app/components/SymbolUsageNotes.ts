import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { Markdown } from '../pipes/Markdown';

@Component({
  selector: 'www-symbol-usage-notes',
  imports: [Markdown],
  template: `
    @if (notes()) {
      <div class="notes">
        <h2>{{ '@usageNotes' }}</h2>
        <div [innerHTML]="notes() | markdown"></div>
      </div>
    }
  `,
  styles: [
    `
      .notes {
        display: block;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      h2 {
        font:
          700 14px/18px 'JetBrains Mono',
          monospace;
        color: rgba(255, 255, 255, 0.88);
      }

      code {
        background: transparent;
      }
    `,
  ],
})
export class SymbolUsageNotes {
  symbol = input.required<ApiMember>();
  notes = computed(() => this.symbol().docs.usageNotes);
}
