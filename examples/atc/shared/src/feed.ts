import {
  type AircraftSnapshot,
  parseReplayFile,
  parseSnapshot,
} from './aircraft';
import type { AreaId } from './places';
import type { AtcStore } from './store';

/** Page options read from the query string. */
export interface AtcOptions {
  readonly replay: boolean;
  readonly tickMs: number;
}

/** Reads `?replay=1` and `?tick=<ms>` (250 to 60,000; default 5,000). */
export function readAtcOptions(search: string): AtcOptions {
  const params = new URLSearchParams(search);
  const tick = Number(params.get('tick') ?? '5000');

  return {
    replay: params.get('replay') === '1',
    tickMs: Number.isFinite(tick)
      ? Math.min(60_000, Math.max(250, tick))
      : 5000,
  };
}

/** A running data feed. */
export interface Feed {
  start(): void;
  stop(): void;
}

/**
 * Polls `load` every `intervalMs`, one request at a time. On failure it keeps
 * the last positions and reports `delayed` after 15 s and `stalled` after 60 s
 * without fresh data.
 */
export function createPollingFeed(options: {
  store: AtcStore;
  load: () => Promise<AircraftSnapshot>;
  intervalMs: number;
  mode: 'live' | 'replay';
  now?: () => number;
  delayedAfterMs?: number;
  stalledAfterMs?: number;
}): Feed {
  const {
    store,
    load,
    intervalMs,
    mode,
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
      const snapshot = await load();
      if (stopped) {
        return;
      }
      store.applySnapshot(snapshot);
      lastSuccessAt = now();
      store.setFeedStatus(mode);
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

/** Loads the latest snapshot for an area from `/api/aircraft`. */
export function createLiveLoader(
  area: AreaId,
  fetchFn: typeof fetch = fetch,
): () => Promise<AircraftSnapshot> {
  return async () => {
    const response = await fetchFn(`/api/aircraft?area=${area}`);
    if (!response.ok) {
      throw new Error(`Aircraft feed returned ${response.status}`);
    }

    return parseSnapshot(await response.json());
  };
}

/** Plays recorded frames in order, starting again after the last one. */
export function createReplayLoader(
  frames: readonly AircraftSnapshot[],
): () => Promise<AircraftSnapshot> {
  let index = 0;

  return async () => {
    const frame = frames[index % frames.length];
    index += 1;

    return frame;
  };
}

/**
 * Starts the right feed for the page: live data, or the recorded replay at
 * `replay/ord.json` relative to `baseUri`. Returns a function that stops it.
 */
export function startAtcFeed(options: {
  store: AtcStore;
  search: string;
  baseUri: string;
  fetchFn?: typeof fetch;
}): () => void {
  const { store, search, baseUri, fetchFn = fetch } = options;
  const { replay, tickMs } = readAtcOptions(search);
  let feed: Feed | undefined;
  let stopped = false;

  if (replay) {
    void fetchFn(new URL('replay/ord.json', baseUri))
      .then((response) => response.json())
      .then((json: unknown) => {
        if (stopped) {
          return;
        }
        feed = createPollingFeed({
          store,
          load: createReplayLoader(parseReplayFile(json).frames),
          intervalMs: tickMs,
          mode: 'replay',
        });
        feed.start();
      })
      .catch(() => store.setFeedStatus('stalled'));
  } else {
    feed = createPollingFeed({
      store,
      load: createLiveLoader('ord', fetchFn),
      intervalMs: tickMs,
      mode: 'live',
    });
    feed.start();
  }

  return () => {
    stopped = true;
    feed?.stop();
  };
}
