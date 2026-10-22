/** Options for {@link createFixedWindowLimiter}. */
export interface FixedWindowLimiterOptions {
  /** The most calls to `take` that succeed per key in one window. */
  limit: number;
  /** The window length, in milliseconds. */
  windowMs: number;
  /** The clock, in milliseconds; tests inject one. Defaults to `Date.now`. */
  now?: () => number;
  /** The most keys held at once; the oldest window is evicted past it. Defaults to 10,000. */
  maxKeys?: number;
}

/** The outcome of one {@link FixedWindowLimiter.take}. */
export interface TakeResult {
  /** Whether the call is within the limit. */
  allowed: boolean;
  /** Whole seconds until the key's window ends; 0 when allowed. */
  retryAfterSec: number;
}

/** A fixed-window, per-key limiter. */
export interface FixedWindowLimiter {
  /** Counts one call for `key` and says whether it is within the limit. */
  take(key: string): TakeResult;
}

/**
 * A pure, framework-free fixed-window limiter, counted per key.
 *
 * Each key gets `limit` calls per window, starting at its first call. State
 * lives in memory, so it is per process: expired windows are pruned on use,
 * and past `maxKeys` the oldest window is evicted, which bounds memory.
 *
 * @param options - The limit, window, clock and key bound.
 * @returns The limiter.
 */
export function createFixedWindowLimiter(
  options: FixedWindowLimiterOptions,
): FixedWindowLimiter {
  const { limit, windowMs, now = Date.now, maxKeys = 10_000 } = options;
  // A Map keeps insertion order, and a window is only ever inserted when it
  // starts, so the first entry is always the oldest.
  const windows = new Map<string, { start: number; count: number }>();

  return {
    take(key) {
      const time = now();
      for (const [k, w] of windows) {
        if (time - w.start < windowMs) {
          break;
        }
        windows.delete(k);
      }
      const current = windows.get(key);
      if (current === undefined) {
        while (windows.size >= maxKeys) {
          const oldest = windows.keys().next();
          if (oldest.done) {
            break;
          }
          windows.delete(oldest.value);
        }
        windows.set(key, { start: time, count: 1 });

        return limit >= 1
          ? { allowed: true, retryAfterSec: 0 }
          : { allowed: false, retryAfterSec: Math.ceil(windowMs / 1000) };
      }
      current.count += 1;
      if (current.count <= limit) {
        return { allowed: true, retryAfterSec: 0 };
      }

      return {
        allowed: false,
        retryAfterSec: Math.ceil((current.start + windowMs - time) / 1000),
      };
    },
  };
}
