import { startAtcFeed } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { AirspaceMapComponent } from './airspace-map';
import { Assistant } from './assistant';
import { PanelHeaderComponent } from './panel-header';
import { SheetHandleComponent } from './sheet-handle';
import { ATC_STORE } from './store';

/** The page: a two-panel workbench, chat on the left and the live map on the right.
 * Below 768px the map fills the screen and the chat is a bottom sheet. */
@Component({
  selector: 'atc-root',
  imports: [
    AirspaceMapComponent,
    Assistant,
    PanelHeaderComponent,
    SheetHandleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-workbench is-sheet">
      <section
        id="atc-chat-sheet"
        class="atc-panel atc-chat-panel"
        aria-label="Chat"
        [class.is-expanded]="expanded()"
        (focusin)="expanded.set(true)"
        (keydown.escape)="expanded.set(false)"
      >
        <atc-sheet-handle [(expanded)]="expanded" />
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
  /** Whether the phone bottom sheet is open; ignored on wide screens. */
  protected readonly expanded = signal(false);

  constructor() {
    const stop = startAtcFeed({ store: inject(ATC_STORE) });
    inject(DestroyRef).onDestroy(stop);
  }
}
