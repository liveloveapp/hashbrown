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
  imports: [SymbolHeader, SymbolApi, SymbolSummary, Squircle],
  template: `
    <div
      class="popover"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="4"
      wwwSquircleBorderColor="var(--sky-blue, #9ecfd7)"
    >
      <div class="content">
        <www-symbol-header
          [name]="summary.name"
          [fileUrlPath]="summary.fileUrlPath"
          [symbol]="symbol"
        />
        <www-symbol-summary [symbol]="symbol" />
        <www-symbol-api [density]="'-1'" [symbol]="symbol" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      padding: 16px;
    }

    .popover {
      display: block;
      overflow: hidden;
      background: #fff;

      > .content {
        display: flex;
        flex-direction: column;
        overflow: auto;
        width: 100%;
        max-width: 752px;
        max-height: 400px;
        padding: 16px;
      }
    }
  `,
})
export class SymbolPopover {
  summary = inject(SYMBOl_POPOVER_REF);
  symbol = this.summary.members[0];
}
