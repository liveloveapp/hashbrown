import { Component, computed, input } from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { InlineMarkdown } from '../pipes/InlineMarkdown';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-params',
  imports: [InlineMarkdown, SymbolExcerpt],
  template: `
    @for (param of params(); track $index) {
      <div class="param">
        <div class="header">
          @if (param.required) {
            <code class="symbol">{{ '@param' }}</code>
          } @else {
            <code class="symbol">{{ '@optional' }}</code>
          }
          <code>{{ param.name }}:</code>
          <www-symbol-excerpt [excerptTokens]="param.excerptTokens" />
        </div>
        @if (param.description) {
          <p [innerHtml]="param.description | inlineMarkdown"></p>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-family: 'JetBrains Mono', monospace;
      }

      .param {
        display: flex;
        flex-direction: column;

        > .header {
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

        > p {
          color: var(--vanilla-ivory, #faf9f0);
          font-size: 12px;
        }
      }
    `,
  ],
})
export class SymbolParams {
  symbol = input.required<ApiMember>();
  params = computed(() => {
    const parameters = this.symbol().parameters || [];
    return parameters.map((param) => {
      const docs = this.symbol().docs.params.find(
        (p) => p.name === param.parameterName,
      );

      return {
        name: param.parameterName,
        required: !param.isOptional,
        excerptTokens: this.symbol().excerptTokens.slice(
          param.parameterTypeTokenRange.startIndex,
          param.parameterTypeTokenRange.endIndex,
        ),
        description: docs?.description || '',
      };
    });
  });
}
