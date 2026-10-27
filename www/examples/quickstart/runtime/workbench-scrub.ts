/** Options for {@link attachWorkbenchScrub}. */
export interface WorkbenchScrubOptions {
  readonly track: HTMLElement;
  /** Maps a fraction, 0 to 1, across the track width to an event index. */
  readonly indexAt: (fraction: number) => number | null;
  /** Called on press and on each move to a new index. */
  readonly onScrub: (index: number) => void;
  readonly isDisabled?: () => boolean;
  /** Presses on a match are clicks until the pointer moves past the threshold. */
  readonly tickSelector?: string;
}

const dragThreshold = 4;

/**
 * Makes a track scrubbable with a pointer: a press seeks to the nearest event
 * and the drag follows the pointer. A press on a tick waits for more than 4px of
 * movement before it scrubs, so a still press stays a click on the tick.
 *
 * @param options - The track, the position mapping and the scrub callback.
 * @returns A function that removes the listeners and ends any drag.
 */
export function attachWorkbenchScrub(
  options: WorkbenchScrubOptions,
): () => void {
  const { track, indexAt, onScrub, isDisabled, tickSelector } = options;
  let stopDrag: (() => void) | undefined;

  const onDown = (event: Event) => {
    if (isDisabled?.()) return;
    stopDrag?.();
    const down = event as PointerEvent;
    const pointerId = down.pointerId;
    const startX = down.clientX;
    const target = down.target;
    const onTick =
      !!tickSelector &&
      target instanceof Element &&
      target.closest(tickSelector) !== null;
    let moved = false;
    let lastIndex: number | undefined;

    const scrubTo = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      const index = indexAt(fraction);
      if (index === null || index === lastIndex) return;
      lastIndex = index;
      onScrub(index);
    };

    const own = (e: Event) => (e as PointerEvent).pointerId === pointerId;
    const move = (e: Event) => {
      if (!own(e)) return;
      const x = (e as PointerEvent).clientX;
      if (Math.abs(x - startX) > dragThreshold) moved = true;
      if (!onTick || moved) scrubTo(x);
    };
    const end = (e?: Event) => {
      if (e && !own(e)) return;
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', end);
      track.removeEventListener('pointercancel', end);
      track.removeEventListener('lostpointercapture', end);
      stopDrag = undefined;
    };

    track.setPointerCapture?.(pointerId);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    stopDrag = end;
    if (!onTick) {
      scrubTo(down.clientX);
      event.preventDefault();
    }
  };

  track.addEventListener('pointerdown', onDown);
  return () => {
    track.removeEventListener('pointerdown', onDown);
    stopDrag?.();
  };
}
