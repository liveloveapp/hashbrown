import {
  browserStorage,
  FILTER_FAILED_NOTICE,
  filterBlocks,
  filterPanelVisible,
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  readShowStream,
  type RouterShown,
  sheetExpanded,
  startAtcFeed,
  watchSheetEvents,
  writeShowStream,
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
import { useMapFilter } from './filter';
import { useKeyboardInset } from './keyboard-inset';
import { PanelHeader } from './panel-header';
import { SheetHandle } from './sheet-handle';
import { ShowStreamProvider } from './show-stream';
import { useAtcStore } from './store';
import { StreamPanel } from './stream-panel';

/**
 * The page: a two-panel workbench, chat on the left and the live map on the
 * right. On phones and upright tablets the map fills the screen and the chat
 * is a bottom sheet.
 */
export function App() {
  const store = useAtcStore();
  // Where the phone bottom sheet rests; ignored on wide screens.
  const [sheet, move] = useReducer(nextSheet, INITIAL_SHEET);
  const workbench = useRef<HTMLElement>(null);
  const chatSheet = useRef<HTMLElement>(null);
  const mapFilter = useMapFilter();
  // "Show the stream": on for a first visit, then remembered.
  const [showStream, setShowStream] = useState(() =>
    readShowStream(browserStorage()),
  );
  // The filter on the map. The panel shows only while a run streams, or
  // while the map still holds what the last run produced: the assistant's
  // filter tool, a clear or the pill's x all replace it, and the panel goes.
  const current = useSyncExternalStore(
    store.subscribe,
    () => store.getState().mapFilter,
  );
  const [produced, setProduced] = useState<typeof current>(null);
  const ran = useRef(false);
  // What the router decided for the latest filter request.
  const [filterRoute, setFilterRoute] = useState<RouterShown | null>(null);
  const changeShowStream = (on: boolean) => {
    setShowStream(on);
    writeShowStream(browserStorage(), on);
  };
  const applyFilter = (request: string, routed: RouterShown) => {
    setFilterRoute(routed);
    setProduced(null);
    mapFilter.apply(request);
  };

  // The hook applies a run's last chunk in its own effect, which runs first.
  const loading = mapFilter.loading;
  useEffect(() => {
    if (loading) {
      ran.current = true;
    } else if (ran.current) {
      ran.current = false;
      setProduced(store.getState().mapFilter);
    }
  }, [loading, store]);

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
    <ShowStreamProvider on={showStream}>
      <main ref={workbench} className="atc-workbench">
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
          <PanelHeader
            showStream={showStream}
            onShowStream={changeShowStream}
          />
          <Assistant
            onFilter={applyFilter}
            onSent={() => move({ type: 'send' })}
          />
        </section>
        <section className="atc-panel atc-map-panel" aria-label="Map">
          <AirspaceMap
            obstruction={chatSheet}
            streaming={mapFilter.streaming}
            notice={mapFilter.error ? FILTER_FAILED_NOTICE : null}
            onClearFilter={mapFilter.dismissError}
          />
          {showStream &&
          filterRoute !== null &&
          mapFilter.error === null &&
          filterPanelVisible({
            route: filterRoute,
            loading,
            current,
            produced,
          }) ? (
            <StreamPanel
              className="atc-map-stream"
              label="Filter stream"
              blocks={filterBlocks(
                filterRoute,
                mapFilter.output,
                mapFilter.loading,
              )}
            />
          ) : null}
        </section>
      </main>
    </ShowStreamProvider>
  );
}
