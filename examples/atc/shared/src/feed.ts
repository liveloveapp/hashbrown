import { type AircraftSnapshot, parseSnapshot } from './aircraft';
import type { AreaId } from './places';
import type { AtcStore } from './store';

/** How often the browser asks `/api/aircraft` for fresh positions. */
export const FEED_INTERVAL_MS = 3000;

/** One poll's result: the snapshot, and whether the server marked it stale. */
export interface FeedSnapshot {
  readonly snapshot: AircraftSnapshot;
  readonly stale: boolean;
}

/** A running data feed. */
export interface Feed {
  start(): void;
  stop(): void;
}

/**
 * Polls `load` every `intervalMs`, one request at a time. A stale snapshot is
 * applied but reports `delayed`; the next fresh one reports `live` again. On
 * failure it keeps the last positions and reports `delayed` after 15 s and
 * `stalled` after 60 s without fresh data.
 */
export function createPollingFeed(options: {
  store: AtcStore;
  load: () => Promise<FeedSnapshot>;
  intervalMs: number;
  now?: () => number;
  delayedAfterMs?: number;
  stalledAfterMs?: number;
}): Feed {
  const {
    store,
    load,
    intervalMs,
    now = Date.now,
    delayedAfterMs = 15_000,
    stalledAfterMs = 60_000,
  } = options;
  const startedAt = now();
  let lastSuccessAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = async () => {
    try {
      const { snapshot, stale } = await load();
      if (stopped) {
        return;
      }
      store.applySnapshot(snapshot);
      if (!stale) {
        lastSuccessAt = now();
      }
      store.setFeedStatus(stale ? 'delayed' : 'live');
    } catch {
      if (stopped) {
        return;
      }
      const silentFor = now() - (lastSuccessAt ?? startedAt);
      if (silentFor >= stalledAfterMs) {
        store.setFeedStatus('stalled');
      } else if (silentFor >= delayedAfterMs) {
        store.setFeedStatus('delayed');
      }
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  return {
    start: () => void tick(),
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/**
 * Loads the latest snapshot for an area from `/api/aircraft`. A response with
 * `X-Atc-Stale: 1` (the server's last good snapshot while adsb.lol is failing)
 * is reported as stale.
 */
export function createLiveLoader(
  area: AreaId,
  fetchFn: typeof fetch = fetch,
): () => Promise<FeedSnapshot> {
  return async () => {
    const response = await fetchFn(`/api/aircraft?area=${area}`);
    if (!response.ok) {
      throw new Error(`Aircraft feed returned ${response.status}`);
    }

    return {
      snapshot: parseSnapshot(await response.json()),
      stale: response.headers.get('X-Atc-Stale') === '1',
    };
  };
}

/**
 * Starts polling live data for the Pacific Northwest every
 * {@link FEED_INTERVAL_MS}. Returns a function that stops it.
 */
export function startAtcFeed(options: {
  store: AtcStore;
  fetchFn?: typeof fetch;
}): () => void {
  const { store, fetchFn = fetch } = options;
  const feed = createPollingFeed({
    store,
    load: createLiveLoader('pnw', fetchFn),
    intervalMs: FEED_INTERVAL_MS,
  });
  feed.start();

  return () => feed.stop();
}
