import { Component, InjectionToken, inject } from '@angular/core';
import { ApiMemberSummary } from '../models/api-report.models';
import { SymbolApi } from './SymbolApi';
import { SymbolHeader } from './SymbolHeader';
import { SymbolSummary } from './SymbolSummary';

export const SYMBOl_POPOVER_REF = new InjectionToken<ApiMemberSummary>(
  'SYMBOl_POPOVER_REF',
);

@Component({
  selector: 'www-symbol-popover',
  imports: [SymbolHeader, SymbolApi, SymbolSummary],
  template: `
    <div class="popover">
      <www-symbol-header
        [name]="summary.name"
        [fileUrlPath]="summary.fileUrlPath"
        [symbol]="symbol"
      />
      <www-symbol-summary [symbol]="symbol" />
      <www-symbol-api [symbol]="symbol" />
    </div>
  `,
  styles: [
    `
      .popover {
        display: flex;
        flex-direction: column;
        width: 500px;
        background-color: rgba(16, 8, 20, 0.72);
        border-radius: 4px;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(8px);
        overflow-y: hidden;
      }
    `,
  ],
})
export class SymbolPopover {
  summary = inject(SYMBOl_POPOVER_REF);
  symbol = this.summary.members[0];
}
