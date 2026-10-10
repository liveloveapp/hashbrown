import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  type SheetEvent,
  sheetExpanded,
  startAtcFeed,
  watchSheetEvents,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
 * On phones and upright tablets the map fills the screen and the chat is a
 * bottom sheet. */
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
        #chatSheet
        id="atc-chat-sheet"
        class="atc-panel atc-chat-panel"
        aria-label="Chat"
        [attr.data-snap]="sheet().snap"
        (focusin)="openOnFocus($event)"
        (keydown.escape)="move({ type: 'escape' })"
      >
        <atc-sheet-handle [expanded]="expanded()" (moved)="move($event)" />
        <atc-panel-header />
        <atc-assistant (sent)="move({ type: 'send' })" />
      </section>
      <section class="atc-panel atc-map-panel" aria-label="Map">
        <atc-airspace-map [obstruction]="chatSheet" />
      </section>
    </main>
  `,
})
export class App {
  /** Where the phone bottom sheet rests; ignored on wide screens. */
  protected readonly sheet = signal(INITIAL_SHEET);
  protected readonly expanded = computed(() => sheetExpanded(this.sheet()));

  protected move(event: SheetEvent): void {
    this.sheet.update((sheet) => nextSheet(sheet, event));
  }

  protected openOnFocus(event: FocusEvent): void {
    if (focusOpensSheet(event.target)) {
      this.move({ type: 'focus' });
    }
  }

  constructor() {
    const store = inject(ATC_STORE);
    const stopFeed = startAtcFeed({ store });
    // The assistant moving the map, or a plane picked in the chat, lowers the sheet.
    const stopWatching = watchSheetEvents(store, (event) => this.move(event));
    inject(DestroyRef).onDestroy(() => {
      stopFeed();
      stopWatching();
    });
  }
}
