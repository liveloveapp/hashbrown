import {
  type DevToolInput,
  FILTER_FAILED_NOTICE,
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  type RouterShown,
  sheetExpanded,
  startAtcFeed,
  watchSheetEvents,
} from '@atc/shared';
import {
  type FocusEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AirspaceMap } from './airspace-map';
import { Assistant } from './assistant';
import { DevDrawer } from './dev-drawer';
import { DevModeProvider, useDevMode } from './dev-mode';
import { useMapFilter } from './filter';
import { useKeyboardInset } from './keyboard-inset';
import { PanelHeader } from './panel-header';
import { Rail } from './rail';
import { SheetHandle } from './sheet-handle';
import { useAtcStore } from './store';

/**
 * The page: a two-panel workbench, chat on the left and the live map on the
 * right, with a thin rail at the far left that opens the developer drawer
 * under the map. On phones and upright tablets the map fills the screen, the
 * chat is a bottom sheet and the drawer opens as a sheet from the header.
 */
export function App() {
  return (
    <DevModeProvider>
      <Workbench />
    </DevModeProvider>
  );
}

function Workbench() {
  const store = useAtcStore();
  const dev = useDevMode();
  // Where the phone bottom sheet rests; ignored on wide screens.
  const [sheet, move] = useReducer(nextSheet, INITIAL_SHEET);
  const workbench = useRef<HTMLElement>(null);
  const chatSheet = useRef<HTMLElement>(null);
  const mapFilter = useMapFilter();
  // The filter on the map, whoever applied it.
  const applied = useSyncExternalStore(
    store.subscribe,
    () => store.getState().mapFilter,
  );
  // What the router decided for the latest filter request.
  const [filterRoute, setFilterRoute] = useState<RouterShown | null>(null);
  const applyFilter = (request: string, routed: RouterShown) => {
    setFilterRoute(routed);
    mapFilter.apply(request);
  };
  // The drawer's Filter tab: the latest run and the filter on the map.
  const filter: DevToolInput['filter'] =
    filterRoute === null && applied === null
      ? null
      : {
          router: filterRoute,
          output: mapFilter.output,
          streaming: mapFilter.loading,
          applied: applied?.filter ?? null,
        };

  useEffect(() => startAtcFeed({ store }), [store]);
  // The assistant moving the map, or a plane picked in the chat, lowers the sheet.
  useEffect(() => watchSheetEvents(store, move), [store]);
  useKeyboardInset(workbench);

  const openOnFocus = (event: FocusEvent) => {
    if (focusOpensSheet(event.target)) {
      move({ type: 'focus' });
    }
  };

  return (
    <main ref={workbench} className="atc-workbench">
      <Rail on={dev.on} onToggle={dev.toggle} />
      <section
        ref={chatSheet}
        id="atc-chat-sheet"
        className="atc-panel atc-chat-panel"
        data-snap={sheet.snap}
        aria-label="Chat"
        onFocus={openOnFocus}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            move({ type: 'escape' });
          }
        }}
      >
        <SheetHandle expanded={sheetExpanded(sheet)} onMove={move} />
        <PanelHeader devMode={dev.on} onToggleDevMode={dev.toggle} />
        <Assistant
          onFilter={applyFilter}
          onSent={() => move({ type: 'send' })}
        />
      </section>
      <div className="atc-map-column">
        <section className="atc-panel atc-map-panel" aria-label="Map">
          <AirspaceMap
            obstruction={chatSheet}
            streaming={mapFilter.streaming}
            notice={mapFilter.error ? FILTER_FAILED_NOTICE : null}
            onClearFilter={mapFilter.dismissError}
          />
        </section>
        <DevDrawer filter={filter} />
      </div>
    </main>
  );
}
