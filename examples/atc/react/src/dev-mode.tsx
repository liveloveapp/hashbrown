import {
  browserStorage,
  type DevRow,
  type DevSelection,
  type DevStorage,
  followLatest,
  readDevMode,
  type RouterShown,
  selectSend,
  type TurnShown,
  writeDevMode,
} from '@atc/shared';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

/** Dev mode, as the rail, the header, the transcript and the drawer see it. */
export interface DevMode {
  /** True while the developer drawer is open. */
  readonly on: boolean;
  /** Opens or closes the drawer, and remembers it. */
  toggle(): void;
  /** Which send the drawer shows. */
  readonly selection: DevSelection;
  /** Shows send `turn`, an index into the recorded turns (not a row). */
  select(turn: number): void;
  /** Goes back to following the newest send. */
  follow(): void;
  /** Where dev mode and the drawer height are remembered. */
  readonly storage: DevStorage | null;
}

/** The chat as the drawer reads it: the transcript rows and recorded sends. */
export interface DevChat {
  readonly items: readonly DevRow[];
  readonly turns: readonly TurnShown[];
  readonly busy: boolean;
}

/** What the chat publishes for the drawer. */
export interface DevFeed {
  /** What the router makes of the text being typed, or null. */
  readonly typing: RouterShown | null;
  readonly chat: DevChat;
}

interface FeedStore {
  get(): DevFeed;
  set<K extends keyof DevFeed>(key: K, value: DevFeed[K]): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY_FEED: DevFeed = {
  typing: null,
  chat: { items: [], turns: [], busy: false },
};

function createFeedStore(): FeedStore {
  let feed = EMPTY_FEED;
  const listeners = new Set<() => void>();

  return {
    get: () => feed,
    set: (key, value) => {
      if (feed[key] === value) return;
      feed = { ...feed, [key]: value };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}

const OFF: DevMode = {
  on: false,
  toggle: () => undefined,
  selection: followLatest(),
  select: () => undefined,
  follow: () => undefined,
  storage: null,
};

const DevModeContext = createContext<DevMode>(OFF);
const FeedContext = createContext<FeedStore | null>(null);

/**
 * Holds dev mode (off for a first visit, then remembered in `storage`), the
 * send the drawer shows, and what the chat publishes for it. Without a
 * provider dev mode is off, so components render without technical UI.
 */
export function DevModeProvider({
  storage = browserStorage(),
  children,
}: {
  storage?: DevStorage | null;
  children: ReactNode;
}) {
  const [on, setOn] = useState(() => readDevMode(storage));
  const [selection, setSelection] = useState(followLatest);
  const [feed] = useState(createFeedStore);
  const mode = useMemo<DevMode>(
    () => ({
      on,
      toggle: () => {
        writeDevMode(storage, !on);
        setOn(!on);
        setSelection(followLatest());
      },
      selection,
      select: (turn) => setSelection(selectSend(turn)),
      follow: () => setSelection(followLatest()),
      storage,
    }),
    [on, selection, storage],
  );

  return (
    <DevModeContext.Provider value={mode}>
      <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>
    </DevModeContext.Provider>
  );
}

/** Dev mode; off (with no-op actions) outside a {@link DevModeProvider}. */
export function useDevMode(): DevMode {
  return useContext(DevModeContext);
}

/**
 * Publishes `value` as the feed's `key` for the drawer. Only the drawer
 * subscribes, so publishing never re-renders the publisher. Memoize `value`:
 * a new object each render republishes each render.
 */
export function usePublishDev<K extends keyof DevFeed>(
  key: K,
  value: DevFeed[K],
): void {
  const feed = useContext(FeedContext);
  useEffect(() => {
    feed?.set(key, value);
  }, [feed, key, value]);
}

/** What the chat published, for the drawer. */
export function useDevFeed(): DevFeed {
  const feed = useContext(FeedContext);

  return useSyncExternalStore(
    feed?.subscribe ?? noSubscribe,
    feed?.get ?? emptyFeed,
  );
}

function noSubscribe(): () => void {
  return () => undefined;
}

function emptyFeed(): DevFeed {
  return EMPTY_FEED;
}
