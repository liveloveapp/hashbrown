import { Component, inject, InjectionToken } from '@angular/core';
import { ApiMemberSummary } from '../models/api-report.models';
import { SymbolApi } from './SymbolApi';
import { SymbolHeader } from './SymbolHeader';
import { SymbolSummary } from './SymbolSummary';
import { Squircle } from './Squircle';

export const SYMBOl_POPOVER_REF = new InjectionToken<ApiMemberSummary>(
  'SYMBOl_POPOVER_REF',
);

@Component({
  selector: 'www-symbol-popover',
  imports: [SymbolHeader, SymbolApi, SymbolSummary, Squircle],
  template: `
    <div
      class="popover"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="1"
      wwwSquircleBorderColor="var(--sky-blue, #9ecfd7)"
    >
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
        background: #fff;
        padding: 16px;
      }
    `,
  ],
})
export class SymbolPopover {
  summary = inject(SYMBOl_POPOVER_REF);
  symbol = this.summary.members[0];
}
