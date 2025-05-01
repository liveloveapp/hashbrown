import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { Symbol } from '../../../components/Symbol';
import { ReferenceService } from '../../../services/ReferenceService';

@Component({
  imports: [Symbol],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (resolvedSymbol(); as summary) {
      <www-symbol [summary]="summary" />
    }
  `,
  styles: `
    :host {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
    }
  `,
})
export default class PackageSymbolPage {
  referenceService = inject(ReferenceService);
  package = input.required<string>();
  symbol = input.required<string>();
  inputs = computed(() => ({
    package: this.package(),
    symbol: this.symbol(),
  }));
  resolvedSymbol = toSignal(
    toObservable(this.inputs).pipe(
      switchMap((inputs) => {
        return this.referenceService.loadReferenceData(
          inputs.package,
          inputs.symbol,
        );
      }),
    ),
  );
}
