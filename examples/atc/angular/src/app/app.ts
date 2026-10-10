import { startAtcFeed } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { AirspaceMapComponent } from './airspace-map';
import { Assistant } from './assistant';
import { PanelHeaderComponent } from './panel-header';
import { ATC_STORE } from './store';

/** The page: a two-panel workbench, chat on the left and the live map on the right. */
@Component({
  selector: 'atc-root',
  imports: [AirspaceMapComponent, Assistant, PanelHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-workbench">
      <section class="atc-panel atc-chat-panel" aria-label="Chat">
        <atc-panel-header />
        <atc-assistant />
      </section>
      <section class="atc-panel atc-map-panel" aria-label="Map">
        <atc-airspace-map />
      </section>
    </main>
  `,
})
export class App {
  constructor() {
    const stop = startAtcFeed({ store: inject(ATC_STORE) });
    inject(DestroyRef).onDestroy(stop);
  }
}
