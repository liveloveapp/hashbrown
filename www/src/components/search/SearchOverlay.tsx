'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import type { SearchIndex } from '../../lib/search-index';
import { SEARCH_OVERLAY_OPEN_EVENT } from '../site/links';
import { isSearchShortcut } from './search-shortcut';

const SearchPanel = lazy(() => import('./SearchPanel'));

/** The prerendered index route (`src/app/%5F/search-index/route.ts`). */
const INDEX_URL = '/_/search-index';

/**
 * The site's AI search, ported from the Angular `SearchOverlay`. The model
 * answers a query by rendering docs and API links from an index of the site
 * (`/_/search-index`) through `/_/chat`.
 *
 * Opens on `hashbrown:search-overlay:open` and ⌘K/Ctrl+K (outside inputs).
 * Escape, the backdrop or following a result closes it, and focus returns to
 * where it was. The dialog, the chat runtime and the index load on first
 * open; until then this only listens for those two triggers.
 */
export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState<SearchIndex>();
  const [indexFailed, setIndexFailed] = useState(false);
  const indexRequested = useRef(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const loadIndex = () => {
    if (indexRequested.current) {
      return;
    }
    indexRequested.current = true;
    setIndexFailed(false);
    fetch(INDEX_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${INDEX_URL} answered ${response.status}`);
        }
        return response.json() as Promise<SearchIndex>;
      })
      .then(setIndex)
      .catch(() => {
        indexRequested.current = false;
        setIndexFailed(true);
      });
  };

  const openOverlay = useEffectEvent(() => {
    if (open) {
      return;
    }
    returnFocusTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpen(true);
    setStarted(true);
    loadIndex();
  });

  const close = useCallback(() => {
    setOpen(false);
    returnFocusTo.current?.focus();
    returnFocusTo.current = null;
  }, []);

  // Open on the window event the header and docs menu dispatch, and on ⌘K.
  useEffect(() => {
    const onOpen = () => openOverlay();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        openOverlay();
      }
    };
    window.addEventListener(SEARCH_OVERLAY_OPEN_EVENT, onOpen);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(SEARCH_OVERLAY_OPEN_EVENT, onOpen);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // While open: Escape closes, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) {
      return;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  if (!started) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <SearchPanel
        open={open}
        index={index}
        indexFailed={indexFailed}
        onClose={close}
      />
    </Suspense>
  );
}
