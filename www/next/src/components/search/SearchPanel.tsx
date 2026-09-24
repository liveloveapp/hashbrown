'use client';

import { HashbrownProvider, useUiChat } from '@hashbrownai/react';
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SearchIndex } from '../../lib/search-index';
import { CloseIcon, LoaderIcon } from '../site/icons';
import { searchSystemPrompt } from './search-prompt';
import { SEARCH_RESULT_COMPONENTS, SearchOverlayContext } from './SearchResults';
import styles from './SearchOverlay.module.css';

/** The chat endpoint, as the Angular app's `provideHashbrown` configured. */
const CHAT_URL = '/_/chat';

const EMPTY_INDEX: SearchIndex = { sitemap: '', apiReferences: '' };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab and Shift+Tab inside the dialog, as `aria-modal` promises. */
function trapFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
  ];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Props for {@link SearchPanel}. */
export interface SearchPanelProps {
  /** Whether the dialog is showing. The chat outlives closing it. */
  open: boolean;
  /** The search index, once loaded; searching waits for it. */
  index: SearchIndex | undefined;
  /** Whether loading the index failed. */
  indexFailed: boolean;
  /** Close the dialog. */
  onClose: () => void;
}

function SearchDialog({ open, index, indexFailed, onClose }: SearchPanelProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [iconHovered, setIconHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const system = useMemo(
    () => searchSystemPrompt(index ?? EMPTY_INDEX),
    [index],
  );
  const chat = useUiChat({
    debugName: 'search-overlay',
    system,
    components: SEARCH_RESULT_COMPONENTS,
  });

  // Focus and select the query whenever the dialog appears.
  const focusQuery = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    input?.focus();
    input?.select();
  }, []);

  const context = useMemo(
    () => ({ close: onClose, isLoading: chat.isLoading }),
    [onClose, chat.isLoading],
  );

  if (!open) {
    return null;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!index) {
      return;
    }
    chat.sendMessage({ role: 'user', content: { query } });
  };

  const onIconClick = () => {
    if (chat.isLoading) {
      chat.stop();
    }
    setQuery('');
    setIconHovered(false);
    inputRef.current?.focus();
  };

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const message = chat.lastAssistantMessage;

  return (
    <SearchOverlayContext.Provider value={context}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div
        className={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={onOverlayClick}
        onKeyDown={trapFocus}
      >
        <div className={styles.panel}>
          <form onSubmit={onSubmit}>
            <label className={styles.visuallyHidden} htmlFor={inputId}>
              Search query
            </label>
            <div className={chat.isLoading ? styles.loading : undefined}>
              <input
                ref={focusQuery}
                type="text"
                id={inputId}
                name="query"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Search the site"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {(query || chat.isLoading) && (
                <button
                  type="button"
                  aria-label={chat.isLoading ? 'Cancel search' : 'Clear search'}
                  onClick={onIconClick}
                  onMouseEnter={() => setIconHovered(true)}
                  onMouseLeave={() => setIconHovered(false)}
                >
                  {chat.isLoading && !iconHovered ? (
                    <LoaderIcon height="20px" width="20px" />
                  ) : (
                    <CloseIcon height="20px" width="20px" />
                  )}
                </button>
              )}
            </div>
            <button type="submit" disabled={!index}>
              Search
            </button>
          </form>

          {indexFailed && (
            <p className={styles.error} role="alert">
              Search couldn’t load. Close it and try again.
            </p>
          )}
          {chat.error && !chat.isLoading && (
            <p className={styles.error} role="alert">
              Search failed. Try again.
            </p>
          )}
          {message && <section>{message.ui}</section>}
        </div>
      </div>
    </SearchOverlayContext.Provider>
  );
}

/**
 * The search dialog and its chat with the model, through `/_/chat`. Loaded
 * lazily by `SearchOverlay` the first time search opens, so pages don't
 * carry the hashbrown runtime until someone searches.
 */
export default function SearchPanel(props: SearchPanelProps) {
  return (
    <HashbrownProvider url={CHAT_URL}>
      <SearchDialog {...props} />
    </HashbrownProvider>
  );
}
