import { Component, input } from '@angular/core';
import {
  ApiMember,
  ApiMemberKind,
  ApiMemberSummary,
} from '../models/api-report.models';
import { SymbolApi } from './SymbolApi';
import { SymbolChip } from './SymbolChip';
import { SymbolExamples } from './SymbolExamples';
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
    SymbolExamples,
    SymbolHeader,
    SymbolMethods,
    SymbolParams,
    SymbolReturns,
    SymbolSummary,
    SymbolTypeParams,
    SymbolUsageNotes,
    SymbolChip,
  ],
  template: `
    @if (summary().kind === 'Namespace') {
      @for (symbol of summary().members; track $index) {
        <www-symbol-header
          [name]="summary().name"
          [fileUrlPath]="summary().fileUrlPath"
          [symbol]="symbol"
        />
        <div class="symbols">
          @for (childSymbol of symbol.members; track $index) {
            <www-symbol-chip [symbol]="childSymbol" />
          }
        </div>
      }
    } @else {
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
          <www-symbol-api [density]="'0'" [symbol]="symbol" />
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
          @if (symbol.docs.examples?.length) {
            <www-symbol-examples [symbol]="symbol" />
          }
        </article>
      }
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

      .symbols {
        width: 100%;
        padding: 0 24px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        border-left: 1px solid rgba(255, 255, 255, 0.12);
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
          background: #3d3c3a;
          border-radius: 12px;
        }
      }

      @media screen and (min-width: 1024px) {
        .symbols {
          grid-template-columns: repeat(2, 1fr);
        }

        article {
          max-width: 738px;
        }
      }

      @media screen and (min-width: 1281px) {
        .symbols {
          grid-template-columns: repeat(3, 1fr);
        }

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
