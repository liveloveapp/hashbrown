'use client';

import { CommandIcon } from '../site/icons';
import { SEARCH_OVERLAY_OPEN_EVENT } from '../site/links';
import styles from './DocsMenu.module.css';


/** Ask the search overlay to open. */
export function openSearchOverlay(): void {
  window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_OPEN_EVENT));
}

/** The docs menu's "Search ⌘K" trigger. */
export function SearchButton() {
  return (
    <button type="button" className={styles.search} onClick={openSearchOverlay}>
      <p>Search</p>
      <div>
        <span>
          <CommandIcon height="16px" width="16px" />
        </span>
        <span>k</span>
      </div>
    </button>
  );
}
