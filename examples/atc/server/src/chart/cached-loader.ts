import { currentCycle } from '@atc/shared';

/** How long a chart payload is served without fetching the FAA again. */
export const CHART_FRESH_MS = 24 * 60 * 60 * 1000;
/** How old a chart payload may be and still stand in when the FAA fails. */
export const CHART_STALE_LIMIT_MS = 30 * CHART_FRESH_MS;
/** The CDN shares each chart response for a day, and up to a week while it revalidates. */
export const CHART_CACHE_CONTROL =
  'public, s-maxage=86400, stale-while-revalidate=604800';

/** What the loader remembers about one key. Replaced, never mutated. */
interface Entry<V> {
  readonly last: { readonly value: V; readonly at: number } | null;
  readonly inFlight: Promise<V> | null;
}

/**
 * Wraps an async `load` with a per-key cache. Concurrent calls for a key share
 * one load, and a value younger than `freshMs` is reused. When a load fails
 * the last value up to `staleLimitMs` old is returned with `stale: true`;
 * with nothing that recent the result is null. Failures are logged.
 */
export function createCachedLoader<V>(options: {
  load: (key: string) => Promise<V>;
  freshMs: number;
  staleLimitMs: number;
  now?: () => number;
}): (key: string) => Promise<{ value: V; stale: boolean } | null> {
  const { load, freshMs, staleLimitMs, now = Date.now } = options;
  const entries = new Map<string, Entry<V>>();
  const entryFor = (key: string): Entry<V> =>
    entries.get(key) ?? { last: null, inFlight: null };
  const update = (key: string, patch: Partial<Entry<V>>) =>
    entries.set(key, { ...entryFor(key), ...patch });

  /** Starts (or joins) the load for a key and records its outcome. */
  const refresh = (key: string): Promise<V> => {
    const pending = entryFor(key).inFlight;
    if (pending) {
      return pending;
    }
    const inFlight = load(key).then(
      (value) => {
        update(key, { last: { value, at: now() }, inFlight: null });
        return value;
      },
      (error: unknown) => {
        console.error('[atc] chart load failed', key, error);
        update(key, { inFlight: null });
        throw error;
      },
    );
    update(key, { inFlight });

    return inFlight;
  };

  return async (key) => {
    const { last } = entryFor(key);
    if (last && now() - last.at < freshMs) {
      return { value: last.value, stale: false };
    }
    try {
      return { value: await refresh(key), stale: false };
    } catch {
      // Fall back to the last good value below.
    }
    const fallback = entryFor(key).last;

    return fallback && now() - fallback.at <= staleLimitMs
      ? { value: fallback.value, stale: true }
      : null;
  };
}

/** The AIRAC cycle a payload is built for. */
type Cycle = ReturnType<typeof currentCycle>;

/**
 * Caches a payload built from the current AIRAC cycle with the chart limits
 * (fresh for 24 h, stale up to 30 days). A build that finishes after the
 * cycle changed is discarded.
 */
export function createCycleLoader<V>(options: {
  build: (cycle: Cycle) => Promise<V>;
  now?: () => number;
}): () => Promise<{ value: V; stale: boolean } | null> {
  const { build, now = Date.now } = options;
  /** The newest payload built for any cycle; replaced, never mutated. */
  let lastGood: { readonly value: V; readonly at: number } | null = null;
  const loadCycle = createCachedLoader<V>({
    freshMs: CHART_FRESH_MS,
    staleLimitMs: CHART_STALE_LIMIT_MS,
    now,
    load: async (ident) => {
      const cycle = currentCycle(new Date(now()));
      if (cycle.ident !== ident) {
        throw new Error(`Cycle changed from ${ident} to ${cycle.ident}`);
      }
      const value = await build(cycle);
      lastGood = { value, at: now() };

      return value;
    },
  });

  return async () => {
    const loaded = await loadCycle(currentCycle(new Date(now())).ident);
    if (loaded !== null) {
      return loaded;
    }
    // A new cycle has no cache entry yet, so if its files are not published
    // (or the fetch fails) fall back to the previous cycle's payload.
    return lastGood && now() - lastGood.at <= CHART_STALE_LIMIT_MS
      ? { value: lastGood.value, stale: true }
      : null;
  };
}
