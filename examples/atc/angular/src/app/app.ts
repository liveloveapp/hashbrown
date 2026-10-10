import { focusOpensSheet, startAtcFeed } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { AirspaceMapComponent } from './airspace-map';
import { Assistant } from './assistant';
import { KeyboardInsetDirective } from './keyboard-inset';
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
    KeyboardInsetDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-workbench is-sheet" atcKeyboardInset>
      <section
        id="atc-chat-sheet"
        class="atc-panel atc-chat-panel"
        aria-label="Chat"
        [class.is-expanded]="expanded()"
        (focusin)="openOnFocus($event)"
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

  protected openOnFocus(event: FocusEvent): void {
    if (focusOpensSheet(event.target)) {
      this.expanded.set(true);
    }
  }

  constructor() {
    const stop = startAtcFeed({ store: inject(ATC_STORE) });
    inject(DestroyRef).onDestroy(stop);
  }
}
