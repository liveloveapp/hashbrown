'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { trackEngagedTime } from '../../lib/analytics/client';
import { createEngagedTimeTracker } from '../../lib/analytics/engaged-time';

/**
 * How often to re-evaluate. The tracker derives elapsed time from a clock
 * rather than counting ticks, so a throttled background interval delays the
 * event but never miscounts it.
 */
const TICK_MS = 1_000;

/**
 * Emits `marketing:engaged_time` once the visitor has been looking at the
 * page for 10 s, and again at 30 s. Without it a visitor who reads and clicks
 * nothing sends a single `$pageview`, which PostHog scores as a bounce.
 *
 * Re-created per pathname so engaged time is measured per page, matching
 * `capture_pageview: 'history_change'`. Renders nothing.
 */
export function EngagedTimeSignal() {
  const pathname = usePathname();

  useEffect(() => {
    const tracker = createEngagedTimeTracker({
      now: () => Date.now(),
      startVisible: document.visibilityState === 'visible',
      onThreshold: (thresholdMs) =>
        trackEngagedTime(Math.round(thresholdMs / 1000)),
    });

    const onVisibilityChange = () => {
      tracker.setVisible(document.visibilityState === 'visible');
      // Returning to a tab that already passed a threshold should not wait
      // out another interval.
      tracker.tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    // Stop waking up once both thresholds have fired.
    const intervalId = window.setInterval(() => {
      tracker.tick();
      if (tracker.isComplete()) window.clearInterval(intervalId);
    }, TICK_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  return null;
}
