import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-return',
  imports: [SymbolExcerpt],
  template: `
    @if (returns(); as returns) {
      <www-symbol-excerpt [excerptTokens]="returns.excerptTokens" />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class SymbolReturn {
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
