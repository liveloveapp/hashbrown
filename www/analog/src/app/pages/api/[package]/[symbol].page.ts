import { RouteMeta } from '@analogjs/router';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  resource,
} from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { Symbol } from '../../../components/Symbol';
import { ApiService } from '../../../services/ApiService';

export const routeMeta: RouteMeta = {
  title: (route: ActivatedRouteSnapshot) => {
    return `@hashbrownai/${route.params['package']}.${route.params['symbol']}: Hashbrown API`;
  },
  meta: (route: ActivatedRouteSnapshot) => {
    return [
      {
        name: 'og:title',
        content: `@hashbrownai/${route.params['package']}.${route.params['symbol']}: Hashbrown API`,
      },
      {
        name: 'og:image',
        content: `https://hashbrown.dev/image/meta/og-default.png`,
      },
    ];
  },
};

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
  apiService = inject(ApiService);
  package = input.required<string>();
  symbol = input.required<string>();

  symbolResource = resource({
    params: () => ({
      package: this.package(),
      symbol: this.symbol(),
    }),
    loader: ({ params }) =>
      this.apiService.loadReferenceData(params.package, params.symbol),
  });
}
