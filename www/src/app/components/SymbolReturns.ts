import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-returns',
  imports: [SymbolExcerpt],
  template: `
    @if (returns(); as returns) {
      <code class="symbol">@returns</code>
      <www-symbol-excerpt [excerptTokens]="returns.excerptTokens" />
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;

      > code {
        color: var(--sunset-orange, #fbbb52);

        &.symbol {
          font-weight: 300;
          color: var(--vanilla-ivory, #faf9f0);
        }
      }
    }
  `,
})
export class SymbolReturns {
  symbol = input.required<ApiMember>();
  returns = computed(() => {
    const symbol = this.symbol();
    const returnTypeTokenRange = symbol.returnTypeTokenRange;

    if (!returnTypeTokenRange) {
      return;
    }

    return {
      description: symbol.docs.returns,
      excerptTokens: symbol.excerptTokens.slice(
        returnTypeTokenRange.startIndex,
        returnTypeTokenRange.endIndex,
      ),
    };
  });
}
