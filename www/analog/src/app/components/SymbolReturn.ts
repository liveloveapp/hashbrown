import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ApiMember } from '../models/api-report.models';
import { SymbolExcerpt } from './SymbolExcerpt';

@Component({
  selector: 'www-symbol-return',
  imports: [SymbolExcerpt],
  template: `
    @if (returns(); as returns) {
      <www-symbol-excerpt [excerptTokens]="returns.excerptTokens" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class SymbolReturn {
  member = input.required<ApiMember>();
  returns = computed(() => {
    const member = this.member();
    const returnTypeTokenRange = member.returnTypeTokenRange;

    if (!returnTypeTokenRange) {
      return;
    }

    return {
      description: member.docs.returns,
      excerptTokens: member.excerptTokens.slice(
        returnTypeTokenRange.startIndex,
        returnTypeTokenRange.endIndex,
      ),
    };
  });
}
