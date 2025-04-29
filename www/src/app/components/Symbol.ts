import { Component, input } from '@angular/core';
import {
  ApiMember,
  ApiMemberKind,
  ApiMemberSummary,
} from '../models/api-report.models';
import { SymbolApi } from './SymbolApi';
import { SymbolHeader } from './SymbolHeader';
import { SymbolMethods } from './SymbolMethods';
import { SymbolParams } from './SymbolParams';
import { SymbolReturns } from './SymbolReturns';
import { SymbolSummary } from './SymbolSummary';
import { SymbolTypeParams } from './SymbolTypeParams';
import { SymbolUsageNotes } from './SymbolUsageNotes';

@Component({
  selector: 'www-symbol',
  imports: [
    SymbolApi,
    SymbolHeader,
    SymbolMethods,
    SymbolParams,
    SymbolReturns,
    SymbolSummary,
    SymbolTypeParams,
    SymbolUsageNotes,
  ],
  template: `
    @for (symbol of summary().members; track $index) {
      <www-symbol-header
        [name]="summary().name"
        [fileUrlPath]="summary().fileUrlPath"
        [symbol]="symbol"
      />
      <article>
        @if (symbol.docs.summary) {
          <www-symbol-summary [symbol]="symbol" />
        }
        <www-symbol-api [symbol]="symbol" />
        @if (
          symbol.parameters?.length ||
          symbol.typeParameters?.length ||
          symbol.returnTypeTokenRange ||
          symbol.docs.usageNotes
        ) {
          <div class="content">
            @if (symbol.parameters?.length) {
              <www-symbol-params [symbol]="symbol" />
            }
            @if (symbol.typeParameters?.length) {
              <www-symbol-type-params [symbol]="symbol" />
            }
            @if (symbol.returnTypeTokenRange) {
              <www-symbol-returns [symbol]="symbol" />
            }
            @if (symbol.docs.usageNotes) {
              <www-symbol-usage-notes [symbol]="symbol" />
            }
          </div>
        }
        @if (getMethodsForSymbol(symbol).length) {
          <www-symbol-methods [symbol]="symbol" />
        }
      </article>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 32px;
        padding: 32px;
      }

      article {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
        width: 100%;

        > .content {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 16px;
          padding: 32px;
          background-color: rgba(255, 255, 255, 0.08);
        }
      }

      @media screen and (min-width: 1024px) {
        article {
          max-width: 738px;
        }
      }

      @media screen and (min-width: 1281px) {
        article {
          max-width: 956px;
        }
      }
    `,
  ],
})
export class Symbol {
  summary = input.required<ApiMemberSummary>();

  getMethodsForSymbol(symbol: ApiMember): ApiMember[] {
    return symbol.members?.filter((m) => m.kind === ApiMemberKind.Method) ?? [];
  }
}
