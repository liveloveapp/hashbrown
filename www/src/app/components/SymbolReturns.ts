import { Component, computed, input } from '@angular/core';
import { InlineMarkdown } from '../pipes/InlineMarkdown';
import { SymbolExcerpt } from './SymbolExcerpt';
import { ApiMember } from '../models/api-report.models';

@Component({
  selector: 'www-symbol-returns',
  imports: [SymbolExcerpt, InlineMarkdown],
  template: `
    @if (returns(); as returns) {
      <div class="returns">
        <code>{{ '@returns' }}</code>
        <div [innerHtml]="returns.description | inlineMarkdown"></div>
        <www-symbol-excerpt [excerptTokens]="returns.excerptTokens" />
      </div>
    }
  `,
  styles: [
    `
      .returns {
        display: grid;
        column-gap: 16px;
        grid-template-areas:
          'returns description'
          'excerpt excerpt';
        grid-template-columns: 104px 1fr;
        align-items: center;

        > code {
          grid-area: returns;
          font: 700 14px/18px monospace;
          color: #fbbb52;
        }

        > div {
          grid-area: description;
          font:
            400 12px/16px Poppins,
            sans-serif;
          color: rgba(250, 249, 240, 0.8);
        }

        > www-symbol-excerpt {
          grid-area: excerpt;
          padding: 16px;
        }
      }
    `,
  ],
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
