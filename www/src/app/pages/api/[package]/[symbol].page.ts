import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  resource,
} from '@angular/core';
import { Symbol } from '../../../components/Symbol';
import { ReferenceService } from '../../../services/ReferenceService';

@Component({
  imports: [Symbol],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (symbolResource.value(); as summary) {
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

  symbolResource = resource({
    params: () => ({
      package: this.package(),
      symbol: this.symbol(),
    }),
    loader: ({ params }) =>
      this.referenceService.loadReferenceData(params.package, params.symbol),
  });
}
