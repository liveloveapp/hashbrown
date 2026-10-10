import { SOURCE_URLS, startAtcFeed } from '@atc/shared';
import { useEffect } from 'react';
import { AirspaceMap } from './airspace-map';
import { Assistant } from './assistant';
import { FeedBadge } from './feed-badge';
import { useAtcStore } from './store';

/** The page: live map, top bar and the overlay chat. */
export function App() {
  const store = useAtcStore();

  useEffect(
    () =>
      startAtcFeed({
        store,
        search: window.location.search,
        baseUri: document.baseURI,
      }),
    [store],
  );

  return (
    <main className="atc-shell">
      <AirspaceMap />
      <header className="atc-topbar">
        <span className="atc-brand">atc</span>
        <span className="atc-toggle">
          React · <a href={`../angular/${window.location.search}`}>Angular</a>
        </span>
        <FeedBadge />
        <a
          className="atc-source"
          href={SOURCE_URLS.react}
          target="_blank"
          rel="noreferrer"
        >
          View the core file
        </a>
      </header>
      <Assistant />
    </main>
  );
}
