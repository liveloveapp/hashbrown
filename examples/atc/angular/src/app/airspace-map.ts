import { AREAS } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { ATC_STORE } from './store';

/** The live Leaflet map. */
@Component({
  selector: 'atc-airspace-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-map', 'data-testid': 'airspace-map' },
  template: '',
})
export class AirspaceMapComponent {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const store = inject(ATC_STORE);
    const controller = new AbortController();
    let handle: AirspaceMapHandle | undefined;
    afterNextRender(() => {
      void createAirspaceMap({
        element,
        store,
        area: AREAS.ord,
        signal: controller.signal,
      }).then((created) => {
        if (controller.signal.aborted) {
          created.destroy();
        } else {
          handle = created;
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      controller.abort();
      handle?.destroy();
    });
  }
}
