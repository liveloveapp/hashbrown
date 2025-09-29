import { Component, computed, inject, input } from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { Symbol } from '../../../../components/Symbol';
import { ApiService } from '../../../../services/ApiService';
import { RouteMeta } from '@analogjs/router';
import { ActivatedRouteSnapshot } from '@angular/router';

export const routeMeta: RouteMeta = {
  title: (route: ActivatedRouteSnapshot) => {
    return `@hashbrownai/${route.params['package']}/${route.params['subpackage']}.${route.params['symbol']}: Hashbrown API`;
  },
  meta: (route: ActivatedRouteSnapshot) => {
    return [
      {
        name: 'og:title',
        content: `@hashbrownai/${route.params['package']}/${route.params['subpackage']}.${route.params['symbol']}: Hashbrown API`,
      },
      {
        name: 'og:image',
        content: `https://hashbrown.dev/image/meta/og-default.png`,
      },
    ];
  },
};

@Component({
  template: `
    @if (resolvedSymbol(); as summary) {
      <www-symbol [summary]="summary" />
    }
  `,
  imports: [Symbol],
})
export default class SubpackageSymbolPage {
  apiService = inject(ApiService);
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
      switchMap((inputs) =>
        this.apiService.loadReferenceData(
          `${inputs.package}/${inputs.subpackage}`,
          inputs.symbol.split('/').join('.'),
        ),
      ),
      takeUntilDestroyed(),
    ),
  );
}
