'use client';

import { CommandIcon } from './icons';
import { SEARCH_OVERLAY_OPEN_EVENT } from './links';
import styles from './Header.module.css';

/**
 * The header's search trigger. Dispatches the search overlay's open event on
 * `window` and shows the ⌘K shortcut hint.
 */
export function SearchButton() {
  const search = () => {
    window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_OPEN_EVENT));
  };

  return (
    <button
      type="button"
      className={styles.search}
      aria-label="Search"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={search}
    >
      <kbd>
        <CommandIcon height="12px" width="12px" />
      </kbd>
      <kbd>k</kbd>
    </button>
  );
}
