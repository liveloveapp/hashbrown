import type { AtcStore } from './store';

/** Scroll metrics of an element, as read from the DOM. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Whether a scroller sits at (or within `threshold` px of) its end, so
 * newly streamed content should keep it pinned to the bottom. Once the user
 * scrolls further up than the threshold this returns false and the view is
 * left alone.
 */
export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
  );
}

/** Where the phone bottom sheet rests: a peek, half the screen, or full. */
export type SheetSnap = 'peek' | 'half' | 'full';

/**
 * The bottom sheet's position, and whether the user is holding it at full
 * (they dragged, tapped or typed there), which automatic moves respect.
 */
export interface SheetState {
  readonly snap: SheetSnap;
  readonly held: boolean;
}

/** The sheet before anything happens: peeking. */
export const INITIAL_SHEET: SheetState = { snap: 'peek', held: false };

/**
 * Something that moves the sheet: a drag or tap on its handle (`deltaY`
 * under the drag threshold is a tap), focus in its text field, Escape, a
 * sent message, the assistant moving or marking the map, or the user picking
 * a plane from a card or row.
 */
export type SheetEvent =
  | { readonly type: 'drag'; readonly deltaY: number }
  | { readonly type: 'focus' }
  | { readonly type: 'escape' }
  | { readonly type: 'send' }
  | { readonly type: 'map' }
  | { readonly type: 'reveal' };

/** Pointer travel, in px, that counts as a drag rather than a tap. */
export const SHEET_DRAG_THRESHOLD = 24;
/** A drag at least this long goes straight to the far snap. */
const LONG_DRAG = 160;
const SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

function at(snap: SheetSnap): SheetState {
  return { snap, held: snap === 'full' };
}

/**
 * The sheet after `event`. The handle drags one snap at a time (a long drag
 * goes all the way) and a tap opens it fully or closes it from full. Sending
 * lowers it to half so the map shows above the answer; a map move does too,
 * unless the user is holding it at full; picking a plane from the chat
 * always does. Escape closes it to its peek.
 */
export function nextSheet(state: SheetState, event: SheetEvent): SheetState {
  switch (event.type) {
    case 'drag': {
      const distance = Math.abs(event.deltaY);
      if (distance < SHEET_DRAG_THRESHOLD) {
        return at(state.snap === 'full' ? 'peek' : 'full');
      }
      const steps = distance >= LONG_DRAG ? 2 : 1;
      const index =
        SNAPS.indexOf(state.snap) + (event.deltaY < 0 ? steps : -steps);

      return at(
        SNAPS[Math.max(0, Math.min(SNAPS.length - 1, index))] ?? 'peek',
      );
    }
    case 'focus':
      return at('full');
    case 'escape':
      return INITIAL_SHEET;
    case 'send':
      return { snap: 'half', held: false };
    case 'map':
      return state.snap === 'full' && !state.held
        ? { snap: 'half', held: false }
        : state;
    case 'reveal':
      return state.snap === 'full' ? { snap: 'half', held: false } : state;
  }
}

/** Whether the handle reports the sheet as expanded: only at full. */
export function sheetExpanded(state: SheetState): boolean {
  return state.snap === 'full';
}

/** The parts of the store's state that move the sheet. */
interface SheetSource {
  readonly viewSeq: number;
  readonly followingHex: string | null;
  readonly highlighted: ReadonlySet<string>;
  readonly selectedHex: string | null;
}

/**
 * The sheet event a store change implies: `reveal` when a plane is newly
 * selected, `map` when the map is asked to move, a plane is newly followed
 * or a new set is highlighted, else null.
 */
export function sheetEventFor(
  previous: SheetSource,
  next: SheetSource,
): SheetEvent | null {
  if (next.selectedHex !== null && next.selectedHex !== previous.selectedHex) {
    return { type: 'reveal' };
  }
  const followed =
    next.followingHex !== null && next.followingHex !== previous.followingHex;
  const highlighted =
    next.highlighted !== previous.highlighted && next.highlighted.size > 0;

  return next.viewSeq !== previous.viewSeq || followed || highlighted
    ? { type: 'map' }
    : null;
}

/**
 * Calls `onEvent` with the sheet event of each store change that implies
 * one ({@link sheetEventFor}). Returns a function that stops watching.
 */
export function watchSheetEvents(
  store: AtcStore,
  onEvent: (event: SheetEvent) => void,
): () => void {
  let previous = store.getState();

  return store.subscribe(() => {
    const next = store.getState();
    const event = sheetEventFor(previous, next);
    previous = next;
    if (event !== null) {
      onEvent(event);
    }
  });
}
