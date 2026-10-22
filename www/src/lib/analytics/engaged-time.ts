/**
 * Visible-time accounting for `marketing:engaged_time`, ported from
 * threadplane's website.
 *
 * PostHog derives session duration from the spread of a session's event
 * timestamps, and posthog-js fires `$pageleave` only on `pagehide`/`unload`,
 * never on `visibilitychange`. A visitor who lands, reads, clicks nothing and
 * leaves the tab open emits one event and is scored as a zero-second bounce.
 * This module makes the recorded duration match the real one, and that only
 * holds while it counts visible time and nothing else: time in a hidden
 * background tab is not engagement. `setVisible` keeps that distinction.
 *
 * Framework-free so it can be tested without React, fake timers or a DOM. The
 * caller supplies the clock and drives `tick`.
 */

/**
 * 10s is chosen to match PostHog's own bounce cutoff (`session_duration >= 10s`),
 * so a reader who never clicks stops being recorded as a zero-second visit.
 * 30s is the "actually read something" signal. At most two events per pathname.
 */
export const ENGAGED_TIME_THRESHOLDS_MS = [10_000, 30_000] as const;

/** The tracker returned by {@link createEngagedTimeTracker}. */
export type EngagedTimeTracker = {
  /** Report a visibility transition. Hidden time is never counted. */
  setVisible(visible: boolean): void;
  /** Re-evaluate accumulated time and fire any newly crossed thresholds. */
  tick(): void;
  /** Milliseconds the page has been visible so far. */
  visibleMs(): number;
  /** True once every threshold has fired and ticking is pointless. */
  isComplete(): boolean;
};

/** Options for {@link createEngagedTimeTracker}. */
export type EngagedTimeOptions = {
  /** Called once per threshold, with the threshold in milliseconds. */
  onThreshold: (thresholdMs: number) => void;
  /** Monotonic-enough clock. Production passes `Date.now`. */
  now: () => number;
  /** Whether the page is visible at construction time. */
  startVisible: boolean;
  thresholdsMs?: readonly number[];
};

/**
 * Create a visible-time tracker that calls `onThreshold` once per threshold.
 *
 * @param options - The clock, initial visibility and threshold callback.
 * @returns The tracker.
 */
export function createEngagedTimeTracker({
  onThreshold,
  now,
  startVisible,
  thresholdsMs = ENGAGED_TIME_THRESHOLDS_MS,
}: EngagedTimeOptions): EngagedTimeTracker {
  let accumulatedMs = 0;
  // Timestamp the current visible run began, or null while hidden. Elapsed
  // time is derived from this rather than counted per tick, so a throttled
  // background interval cannot under-report a genuinely visible page.
  let visibleSince: number | null = startVisible ? now() : null;
  const fired = new Set<number>();

  function currentVisibleMs(): number {
    return visibleSince === null
      ? accumulatedMs
      : accumulatedMs + (now() - visibleSince);
  }

  return {
    setVisible(visible: boolean) {
      if (visible) {
        // Already visible — re-asserting must not restart the run and
        // silently discard the elapsed time.
        if (visibleSince === null) visibleSince = now();
        return;
      }
      if (visibleSince !== null) {
        accumulatedMs += now() - visibleSince;
        visibleSince = null;
      }
    },

    tick() {
      const elapsed = currentVisibleMs();
      for (const threshold of thresholdsMs) {
        if (elapsed >= threshold && !fired.has(threshold)) {
          fired.add(threshold);
          onThreshold(threshold);
        }
      }
    },

    visibleMs: currentVisibleMs,

    isComplete() {
      return fired.size === thresholdsMs.length;
    },
  };
}
