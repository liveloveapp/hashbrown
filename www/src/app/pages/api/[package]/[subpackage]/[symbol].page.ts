import { Component, computed, inject, input } from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import { Symbol } from '../../../../components/Symbol';
import { ReferenceService } from '../../../../services/ReferenceService';

@Component({
  template: `
    @if (resolvedSymbol(); as summary) {
      <www-symbol [summary]="summary" />
    }
  `,
  imports: [Symbol],
})
export default class SubpackageSymbolPage {
  referenceService = inject(ReferenceService);
  package = input.required<string>();
  subpackage = input.required<string>();
  symbol = input.required<string>();
  inputs = computed(() => ({
    package: this.package(),
    subpackage: this.subpackage(),
    symbol: this.symbol(),
  }));
  resolvedSymbol = toSignal(
    toObservable(this.inputs).pipe(
      tap(console.log),
      switchMap((inputs) =>
        this.referenceService.loadReferenceData(
          `${inputs.package}/${inputs.subpackage}`,
          inputs.symbol.split('/').join('.'),
        ),
      ),
      takeUntilDestroyed(),
    ),
  );
}
