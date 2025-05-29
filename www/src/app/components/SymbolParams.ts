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
          <code class="name">{{ param.name }}</code>
          @if (param.description) {
            <p
              class="description"
              [innerHtml]="param.description | inlineMarkdown"
            ></p>
          }
        </div>
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
        display: flex;
        flex-direction: column;

        > .header {
          display: grid;
          align-items: center;
          grid-template-columns: 96px 112px 1fr;
          gap: 16px;

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

          > .description {
            font:
              400 12px/16px Poppins,
              sans-serif;
            color: rgba(250, 249, 240, 0.8);
            margin-left: 16px;
          }
        }

        > www-symbol-excerpt {
          padding: 16px;
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
