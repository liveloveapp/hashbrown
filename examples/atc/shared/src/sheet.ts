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

/**
 * Decides the bottom sheet's state when a drag on its handle ends.
 * Dragging up (negative `deltaY`) past `threshold` opens it, dragging down
 * closes it, and a smaller movement is a tap that toggles it.
 */
export function sheetAfterDrag(
  expanded: boolean,
  deltaY: number,
  threshold = 24,
): boolean {
  if (deltaY <= -threshold) {
    return true;
  }
  if (deltaY >= threshold) {
    return false;
  }
  return !expanded;
}
