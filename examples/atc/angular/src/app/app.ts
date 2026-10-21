import {
  type AtcState,
  devFilter,
  FILTER_FAILED_NOTICE,
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
import { DevDrawer } from './dev-drawer';
import { DevMode } from './dev-mode';
import { injectMapFilter } from './filter';
import { KeyboardInset } from './keyboard-inset';
import { PanelHeader } from './panel-header';
import { Rail } from './rail';
import { SheetHandle } from './sheet-handle';
import { ATC_STORE, injectAtcState } from './store';

/**
 * The page: a two-panel workbench, chat on the left and the live map on the
 * right, with a thin rail at the far left that opens the developer drawer
 * under the map. On phones and upright tablets the map fills the screen, the
 * chat is a bottom sheet and the drawer opens as a sheet from the header.
 */
@Component({
  selector: 'atc-root',
  imports: [
    AirspaceMap,
    Assistant,
    DevDrawer,
    PanelHeader,
    Rail,
    SheetHandle,
    KeyboardInset,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-workbench" atcKeyboardInset>
      <atc-rail [on]="dev.on()" (toggleDevMode)="dev.toggle()" />
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
        <atc-panel-header [devMode]="dev.on()" (toggleDevMode)="dev.toggle()" />
        <atc-assistant
          [filterLoading]="mapFilter.loading()"
          (filterRouted)="startRun($event)"
          (filter)="mapFilter.apply($event)"
          (sent)="move({ type: 'send' })"
        />
      </section>
      <div class="atc-map-column">
        <section class="atc-panel atc-map-panel" aria-label="Map">
          <atc-airspace-map
            [obstruction]="chatSheet"
            [streaming]="mapFilter.streaming()"
            [notice]="filterNotice()"
            (clearFilter)="mapFilter.dismissError()"
          />
        </section>
        @if (dev.on()) {
          <atc-dev-drawer [filter]="devFilter()" />
        }
      </div>
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
  protected readonly dev = inject(DevMode);
  private readonly state = injectAtcState();
  // What the last filter run left on the map. The drawer shows the run only
  // while it streams or the map still holds this: the assistant's filter
  // tool, a clear or the pill's x replace it.
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
  /** The drawer's Filter tab: the latest run while it counts, and the map's filter. */
  protected readonly devFilter = computed(() =>
    devFilter({
      route: this.filterRoute(),
      loading: this.mapFilter.loading(),
      current: this.state().mapFilter,
      produced: this.produced(),
      output: this.mapFilter.output(),
    }),
  );

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
