import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  sheetExpanded,
  startAtcFeed,
  watchSheetEvents,
} from '@atc/shared';
import { type FocusEvent, useEffect, useReducer, useRef } from 'react';
import { AirspaceMap } from './airspace-map';
import { Assistant } from './assistant';
import { useMapFilter } from './filter';
import { useKeyboardInset } from './keyboard-inset';
import { PanelHeader } from './panel-header';
import { SheetHandle } from './sheet-handle';
import { useAtcStore } from './store';

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
        <PanelHeader />
        <Assistant onSent={() => move({ type: 'send' })} />
      </section>
      <section className="atc-panel atc-map-panel" aria-label="Map">
        <AirspaceMap obstruction={chatSheet} streaming={mapFilter.streaming} />
      </section>
    </main>
  );
}
