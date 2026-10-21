import { AREAS, type MapFilter } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { ATC_STORE } from './store';

/**
 * The live Leaflet map. `obstruction` is the element that covers the map's
 * lower part on phones (the chat's bottom sheet). `streaming` is the set of
 * filter fields the model is still writing, shown on the filter pill.
 */
@Component({
  selector: 'atc-airspace-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-map', 'data-testid': 'airspace-map' },
  template: '',
})
export class AirspaceMap {
  readonly obstruction = input<HTMLElement | null>(null);
  readonly streaming = input<ReadonlySet<keyof MapFilter>>(new Set());

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const store = inject(ATC_STORE);
    const controller = new AbortController();
    let handle: AirspaceMapHandle | undefined;
    // Leaflet measures its container, so build the map after the first render.
    afterNextRender(() => {
      void createAirspaceMap({
        element,
        store,
        area: AREAS.pnw,
        obstruction: () => this.obstruction(),
        streamingFilter: () => this.streaming(),
        signal: controller.signal,
      }).then((created) => {
        if (controller.signal.aborted) {
          created.destroy();
        } else {
          handle = created;
        }
      });
    });
    // The pill reads the streaming set through the input; redraw it on change.
    effect(() => {
      this.streaming();
      handle?.syncFilterPill();
    });
    inject(DestroyRef).onDestroy(() => {
      controller.abort();
      handle?.destroy();
    });
  }
}
