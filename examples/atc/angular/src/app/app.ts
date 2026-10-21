import {
  filterBlocks,
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  type RouterShown,
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
import { AirspaceMap } from './airspace-map';
import { Assistant } from './assistant';
import { injectMapFilter } from './filter';
import { KeyboardInset } from './keyboard-inset';
import { PanelHeader } from './panel-header';
import { SheetHandle } from './sheet-handle';
import { ShowStream } from './show-stream';
import { ATC_STORE, injectAtcState } from './store';
import { StreamPanel } from './stream-panel';

/**
 * The page: a two-panel workbench, chat on the left and the live map on the
 * right. On phones and upright tablets the map fills the screen and the chat
 * is a bottom sheet.
 */
@Component({
  selector: 'atc-root',
  imports: [
    AirspaceMap,
    Assistant,
    PanelHeader,
    SheetHandle,
    KeyboardInset,
    StreamPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-workbench" atcKeyboardInset>
      <section
        #chatSheet
        id="atc-chat-sheet"
        class="atc-panel atc-chat-panel"
        aria-label="Chat"
        [attr.data-snap]="sheet().snap"
        (focusin)="openOnFocus($event)"
        (keydown.escape)="move({ type: 'escape' })"
      >
        <atc-sheet-handle [expanded]="expanded()" (move)="move($event)" />
        <atc-panel-header />
        <atc-assistant
          (filterRouted)="filterRoute.set($event)"
          (filter)="mapFilter.apply($event)"
          (sent)="move({ type: 'send' })"
        />
      </section>
      <section class="atc-panel atc-map-panel" aria-label="Map">
        <atc-airspace-map
          [obstruction]="chatSheet"
          [streaming]="mapFilter.streaming()"
        />
        @if (filterPanel(); as blocks) {
          <atc-stream-panel
            class="atc-map-stream"
            label="Filter stream"
            [blocks]="blocks"
          />
        }
      </section>
    </main>
  `,
})
export class App {
  /** Where the phone bottom sheet rests; ignored on wide screens. */
  protected readonly sheet = signal(INITIAL_SHEET);
  protected readonly expanded = computed(() => sheetExpanded(this.sheet()));
  /** The natural-language map filter; the router calls its `apply`. */
  protected readonly mapFilter = injectMapFilter();
  /** What the router decided for the latest filter request. */
  protected readonly filterRoute = signal<RouterShown | null>(null);
  private readonly showStream = inject(ShowStream);
  private readonly state = injectAtcState();
  // The panel waits for a filter, and goes with it when it is cleared.
  private readonly filtered = computed(() => this.state().mapFilter !== null);
  /** The panel blocks under the filter pill, or null when there are none. */
  protected readonly filterPanel = computed(() => {
    const route = this.filterRoute();
    if (
      !this.showStream.on() ||
      route === null ||
      !(this.filtered() || this.mapFilter.loading())
    ) {
      return null;
    }

    return filterBlocks(
      route,
      this.mapFilter.output(),
      this.mapFilter.loading(),
    );
  });

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

  protected move(event: SheetEvent): void {
    this.sheet.update((sheet) => nextSheet(sheet, event));
  }

  protected openOnFocus(event: FocusEvent): void {
    if (focusOpensSheet(event.target)) {
      this.move({ type: 'focus' });
    }
  }
}
