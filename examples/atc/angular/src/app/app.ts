import {
  type AtcState,
  FILTER_FAILED_NOTICE,
  filterBlocks,
  filterPanelVisible,
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
  effect,
  inject,
  signal,
  untracked,
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
          (filterRouted)="startRun($event)"
          (filter)="mapFilter.apply($event)"
          (sent)="move({ type: 'send' })"
        />
      </section>
      <section class="atc-panel atc-map-panel" aria-label="Map">
        <atc-airspace-map
          [obstruction]="chatSheet"
          [streaming]="mapFilter.streaming()"
          [notice]="filterNotice()"
          (clearFilter)="mapFilter.dismissError()"
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
  // The filter on the map. The panel shows only while a run streams, or while
  // the map still holds what the last run produced: the assistant's filter
  // tool, a clear or the pill's x all replace it, and the panel goes.
  private readonly produced = signal<AtcState['mapFilter']>(null);
  private ran = false;
  private readonly settleRun = effect(() => {
    const loading = this.mapFilter.loading();
    untracked(() => {
      if (loading) {
        this.ran = true;
      } else if (this.ran) {
        this.ran = false;
        this.produced.set(this.state().mapFilter);
      }
    });
  });
  /** What the filter pill says after a failed filter request, or null. */
  protected readonly filterNotice = computed(() =>
    this.mapFilter.error() ? FILTER_FAILED_NOTICE : null,
  );
  /** The panel blocks under the filter pill, or null when there are none. */
  protected readonly filterPanel = computed(() => {
    const route = this.filterRoute();
    if (
      !this.showStream.on() ||
      this.mapFilter.error() !== null ||
      !filterPanelVisible({
        route,
        loading: this.mapFilter.loading(),
        current: this.state().mapFilter,
        produced: this.produced(),
      })
    ) {
      return null;
    }

    return filterBlocks(
      route as RouterShown,
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

  protected startRun(routed: RouterShown): void {
    this.filterRoute.set(routed);
    this.produced.set(null);
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
