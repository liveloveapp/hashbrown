import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import {
  ApiMember,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { DeprecatedChip } from './DeprecatedChip';
import { SymbolCodeLink } from './SymbolCodeLink';

@Component({
  selector: 'www-symbol-header',
  imports: [NgClass, DeprecatedChip, SymbolCodeLink],
  template: `
    <header>
      <h1 [ngClass]="{ deprecated: symbol().docs.deprecated }">
        {{ symbol().name }}
      </h1>
      <div class="meta">
        @if (symbol().docs.deprecated) {
          <www-deprecated-chip [reason]="symbol().docs.deprecated" />
        }
        <www-symbol-code-link [fileUrlPath]="fileUrlPath()" />
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
      }

      header {
        display: flex;
        justify-content: space-between;

        > h1 {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: var(--gray, #5e5c5a);
          font:
            800 20px/24px 'JetBrains Mono',
            monospace;

          &:first-child {
            margin-top: 0;
          }

          &.deprecated {
            text-decoration: line-through;
          }

          > .import {
            font:
              700 12px/16px 'JetBrains Mono',
              monospace;
            color: rgba(125, 84, 47, 0.56);
          }

          > .name {
            font:
              700 36px/42px 'JetBrains Mono',
              monospace;
          }
        }

        > .meta {
          display: flex;
          gap: 8px;
        }
      }
    `,
  ],
})
export class SymbolHeader {
  name = input.required<string>();
  fileUrlPath = input.required<string>();
  symbol = input.required<ApiMember>();

  symbolImport = computed(() => {
    const parsedRef = new ParsedCanonicalReference(
      this.symbol().canonicalReference,
    );

    return parsedRef.package;
  });
  typeTokenRange = computed(() => {
    const typeTokenRange = this.symbol().typeTokenRange;
    const returnTypeTokenRange = this.symbol().returnTypeTokenRange;
    const variableTypeTokenRange = this.symbol().variableTypeTokenRange;

    if (typeTokenRange) {
      return this.symbol().excerptTokens.slice(
        typeTokenRange.startIndex,
        typeTokenRange.endIndex,
      );
    }

    if (returnTypeTokenRange) {
      return this.symbol().excerptTokens.slice(
        returnTypeTokenRange.startIndex,
        returnTypeTokenRange.endIndex,
      );
    }

    if (variableTypeTokenRange) {
      return this.symbol().excerptTokens.slice(
        variableTypeTokenRange.startIndex,
        variableTypeTokenRange.endIndex,
      );
    }

    return [];
  });
}
