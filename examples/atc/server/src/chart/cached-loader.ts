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
