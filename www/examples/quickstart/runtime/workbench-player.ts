/** A run of consecutive events that belong to one turn (inclusive indexes). */
export interface WorkbenchTurnSegment {
  readonly turn: number;
  readonly start: number;
  readonly end: number;
}

/** An action requested through a player keyboard shortcut. */
export type WorkbenchShortcut =
  | 'toggle-play'
  | 'previous-event'
  | 'next-event'
  | 'previous-turn'
  | 'next-turn'
  | 'live'
  | 'toggle-sidebar';

/** Splits ordered events into contiguous turn segments with inclusive indexes. */
export function workbenchTurnSegments(
  events: readonly { readonly turn: number }[],
): readonly WorkbenchTurnSegment[] {
  return events.reduce<readonly WorkbenchTurnSegment[]>(
    (segments, event, i) => {
      const last = segments[segments.length - 1];
      if (last && last.turn === event.turn) {
        return [...segments.slice(0, -1), { ...last, end: i }];
      }
      return [...segments, { turn: event.turn, start: i, end: i }];
    },
    [],
  );
}

/** Returns the horizontal percentage of an event index on the scrubber. */
export function workbenchTickPercent(index: number, total: number): number {
  return total <= 1 ? 0 : (index / (total - 1)) * 100;
}

/**
 * Finds the event index a previous/next-turn jump lands on. A `null` cursor
 * means the last event. Previous returns the start of the current turn when
 * the cursor is past it, otherwise the previous turn's start.
 */
export function adjacentTurnIndex(
  events: readonly { readonly turn: number }[],
  cursor: number | null,
  direction: -1 | 1,
): number | null {
  if (events.length === 0) return null;
  const segments = workbenchTurnSegments(events);
  const last = events.length - 1;
  const at = cursor === null ? last : Math.min(Math.max(cursor, 0), last);
  const current = segments.findIndex((s) => at >= s.start && at <= s.end);
  if (direction === -1) {
    if (at > segments[current].start) return segments[current].start;
    return current > 0 ? segments[current - 1].start : null;
  }
  return current < segments.length - 1 ? segments[current + 1].start : null;
}

/** Formats milliseconds as seconds with two decimals, such as `2.14 s`. */
export function formatPlaybackSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Cycles playback speed 0.5 to 1 to 2 and back; unknown values become 1. */
export function nextPlaybackSpeed(speed: number): 0.5 | 1 | 2 {
  if (speed === 0.5) return 1;
  if (speed === 1) return 2;
  if (speed === 2) return 0.5;
  return 1;
}

/** Maps a key event to a player shortcut, ignoring text fields and buttons. */
export function workbenchShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'
  >,
  target: EventTarget | null,
): WorkbenchShortcut | null {
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, button, [contenteditable]')
  ) {
    return null;
  }
  const { key, shiftKey, metaKey, ctrlKey, altKey } = event;
  if (altKey) return null;
  if (metaKey || ctrlKey) {
    return (key === 'b' || key === 'B') && !shiftKey ? 'toggle-sidebar' : null;
  }
  if (key === 'ArrowLeft') return shiftKey ? 'previous-turn' : 'previous-event';
  if (key === 'ArrowRight') return shiftKey ? 'next-turn' : 'next-event';
  if (shiftKey) return null;
  if (key === ' ') return 'toggle-play';
  if (key === 'l' || key === 'L') return 'live';
  return null;
}
