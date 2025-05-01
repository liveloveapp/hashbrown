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
      <www-symbol-api [density]="'-1'" [symbol]="symbol" />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        padding: 16px;
      }

      .popover {
        display: flex;
        flex-direction: column;
        width: 500px;
        overflow-y: hidden;
        background: #f8f8e7;
        padding: 16px;
        border-radius: 8px;
        box-shadow:
          0 10px 15px -3px rgba(0, 0, 0, 0.16),
          0 4px 6px -4px rgba(0, 0, 0, 0.16);
      }
    `,
  ],
})
export class SymbolPopover {
  summary = inject(SYMBOl_POPOVER_REF);
  symbol = this.summary.members[0];
}
