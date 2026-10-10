import { focusOpensSheet, startAtcFeed } from '@atc/shared';
import { useEffect, useRef, useState } from 'react';
import { AirspaceMap } from './airspace-map';
import { Assistant } from './assistant';
import { useKeyboardInset } from './dom-hooks';
import { PanelHeader } from './panel-header';
import { SheetHandle } from './sheet-handle';
import { useAtcStore } from './store';

/** The page: a two-panel workbench, chat on the left and the live map on the right.
 * On phones and upright tablets the map fills the screen and the chat is a
 * bottom sheet. */
export function App() {
  const store = useAtcStore();
  // Whether the phone bottom sheet is open; ignored on wide screens.
  const [expanded, setExpanded] = useState(false);
  const workbench = useRef<HTMLElement>(null);

  useEffect(() => startAtcFeed({ store }), [store]);
  useKeyboardInset(workbench);

  return (
    <main ref={workbench} className="atc-workbench is-sheet">
      <section
        id="atc-chat-sheet"
        className={`atc-panel atc-chat-panel${expanded ? ' is-expanded' : ''}`}
        aria-label="Chat"
        onFocus={(event) => {
          if (focusOpensSheet(event.target)) setExpanded(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false);
        }}
      >
        <SheetHandle expanded={expanded} onExpandedChange={setExpanded} />
        <PanelHeader />
        <Assistant />
      </section>
      <section className="atc-panel atc-map-panel" aria-label="Map">
        <AirspaceMap />
      </section>
    </main>
  );
}
