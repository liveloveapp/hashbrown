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
 * Returns how much of a turn segment the playhead has played, as a percentage
 * of the segment's width (0–100). A one-event segment is either empty or full.
 *
 * @param segment - The turn's first and last event indexes.
 * @param index - The selected event index (the playhead).
 * @param total - The number of captured events.
 */
export function workbenchSegmentFill(
  segment: { readonly start: number; readonly end: number },
  index: number,
  total: number,
): number {
  const left = workbenchTickPercent(segment.start, total);
  const width = workbenchTickPercent(segment.end, total) - left;
  const progress = workbenchTickPercent(index, total);
  if (width <= 0) return progress >= left ? 100 : 0;
  const fill = ((progress - left) / width) * 100;
  return Math.round(Math.min(100, Math.max(0, fill)) * 100) / 100;
}

/** Where the scrubber flag anchors so it stays inside the scrubber. */
export type WorkbenchFlagAnchor = 'start' | 'middle' | 'end';

/**
 * Chooses the flag anchor for a playhead position: left-aligned below 15%,
 * right-aligned above 85%, centred otherwise.
 *
 * @param percent - The playhead position on the scrubber, 0–100.
 */
export function workbenchFlagAnchor(percent: number): WorkbenchFlagAnchor {
  if (percent < 15) return 'start';
  if (percent > 85) return 'end';
  return 'middle';
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

/** Maps a key event to a player shortcut outside interactive controls. */
export function workbenchShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'
  >,
  target: EventTarget | null,
): WorkbenchShortcut | null {
  if (
    target instanceof Element &&
    target.closest(
      [
        'input',
        'textarea',
        'select',
        'button',
        'a[href]',
        'area[href]',
        'summary',
        '[contenteditable]',
        ...[
          'button',
          'checkbox',
          'combobox',
          'grid',
          'gridcell',
          'link',
          'listbox',
          'menu',
          'menubar',
          'menuitem',
          'menuitemcheckbox',
          'menuitemradio',
          'option',
          'radio',
          'radiogroup',
          'scrollbar',
          'searchbox',
          'separator',
          'slider',
          'spinbutton',
          'switch',
          'tab',
          'tablist',
          'tabpanel',
          'textbox',
          'tree',
          'treegrid',
          'treeitem',
        ].map((role) => `[role~=${role}]`),
      ].join(', '),
    )
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
