import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-type-params',
  imports: [SymbolExcerpt],
  template: `
    @for (param of params(); track $index) {
      <div class="param">
        <code class="symbol">@type</code>
        <code class="name">{{ param.name }}</code>
        <www-symbol-excerpt [excerptTokens]="param.excerptTokens" />
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-family: 'JetBrains Mono', monospace;
    }

    .param {
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
export class SymbolTypeParams {
  symbol = input.required<ApiMember>();
  params = computed(() => {
    const parameters = this.symbol().typeParameters || [];
    return parameters.map((param) => {
      return {
        name: param.typeParameterName,
        excerptTokens: [
          ...this.symbol().excerptTokens.slice(
            param.constraintTokenRange.startIndex,
            param.constraintTokenRange.endIndex,
          ),
        ],
      };
    });
  });
}
