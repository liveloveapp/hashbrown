import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-type-params',
  imports: [SymbolExcerpt],
  template: `
    @for (param of params(); track $index) {
      <div class="param">
        <code class="symbol">{{ '@type' }}</code>
        <code class="name">{{ param.name }}</code>
        <www-symbol-excerpt [excerptTokens]="param.excerptTokens" />
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .param {
        display: grid;
        align-items: center;
        grid-template-columns: 96px 112px 1fr;
        gap: 16px;

        > code {
          font:
            500 12px/16px 'Operator Mono',
            monospace;
          font-variant-ligatures: none;
        }

        > .symbol {
          font:
            700 14px/18px 'Operator Mono',
            monospace;
          color: #fbbb52;
        }

        > .name {
          font:
            700 14px/18px 'Operator Mono',
            monospace;
          color: #ffa657;
        }
      }
    `,
  ],
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
