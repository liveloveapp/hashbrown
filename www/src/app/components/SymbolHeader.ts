import { Component, computed, input } from '@angular/core';
import { NgClass } from '@angular/common';
import {
  ApiMember,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { DeprecatedChip } from './DeprecatedChip';
import { SymbolCodeLink } from './SymbolCodeLink';

@Component({
  selector: 'www-symbol-header',
  imports: [SymbolCodeLink, NgClass, DeprecatedChip],
  template: `
    <header>
      <h1 [ngClass]="{ deprecated: symbol().docs.deprecated }">
        <span class="import">{{ symbolImport() }}</span>
        <span class="name">{{ symbol().name }}</span>
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
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;

          &.deprecated {
            text-decoration: line-through;
          }

          > .import {
            font: 700 12px/16px monospace;
            color: #ffd866;
          }

          > .name {
            font: 500 36px/42px monospace;
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
