import {
  browserStorage,
  type DevRow,
  type DevStorage,
  readDevMode,
  recordRoute,
  type RouteSend,
  type TurnShown,
  TYPING_EMPTY,
  type TypingShown,
  writeDevMode,
} from '@atc/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
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
  /** What the router makes of the text being typed. */
  readonly typing: TypingShown;
  readonly chat: DevChat;
  /** Every submission and its route, newest first (see {@link useRecordRoute}). */
  readonly routes: readonly RouteSend[];
}

interface FeedStore {
  get(): DevFeed;
  set<K extends keyof DevFeed>(key: K, value: DevFeed[K]): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY_FEED: DevFeed = {
  typing: TYPING_EMPTY,
  chat: { items: [], turns: [], busy: false },
  routes: [],
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
  storage: null,
};

const DevModeContext = createContext<DevMode>(OFF);
const FeedContext = createContext<FeedStore | null>(null);

/**
 * Holds dev mode (off for a first visit, then remembered in `storage`) and what the chat publishes for it. Without a
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
  const [feed] = useState(createFeedStore);
  const mode = useMemo<DevMode>(
    () => ({
      on,
      toggle: () => {
        writeDevMode(storage, !on);
        setOn(!on);
      },
      storage,
    }),
    [on, storage],
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
 * a new object each render republishes each render. Unmounting resets `key`.
 */
export function usePublishDev<K extends keyof DevFeed>(
  key: K,
  value: DevFeed[K],
): void {
  const feed = useContext(FeedContext);
  useEffect(() => {
    feed?.set(key, value);
  }, [feed, key, value]);
  // An unmounted publisher leaves nothing stale behind.
  useEffect(() => () => feed?.set(key, EMPTY_FEED[key]), [feed, key]);
}

/**
 * A function that logs a submission and the route it took for the drawer's
 * Router tab. It logs whether or not dev mode is on (the log is capped), so
 * the drawer shows recent sends when opened later; without a provider it does
 * nothing.
 */
export function useRecordRoute(): (send: RouteSend) => void {
  const feed = useContext(FeedContext);

  return useCallback(
    (send: RouteSend) =>
      feed?.set('routes', recordRoute(feed.get().routes, send)),
    [feed],
  );
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
