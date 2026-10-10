const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Whether an event started somewhere the user is typing. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null;
}

/**
 * Whether focus landing on `target` should open the sheet fully: only a text
 * field, where the user is about to type. Buttons such as the starters and
 * the handle act on their own click (a pointer press focuses them first,
 * which would otherwise open the sheet and then move it again).
 */
export function focusOpensSheet(target: EventTarget | null): boolean {
  return isTyping(target);
}

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

/** Whether a mutation record added a user message to the transcript. */
export function addsUserMessage(record: MutationRecord): boolean {
  return [...record.addedNodes].some(
    (node) =>
      node instanceof Element &&
      (node.matches('.atc-user') || node.querySelector('.atc-user') !== null),
  );
}

/**
 * Whether a chat scroller still shows the empty state. It is never scrolled
 * then, so the headline and starters stay at the top (a short landscape
 * panel would otherwise start scrolled to the bottom).
 */
export function isEmptyChat(scroller: Element): boolean {
  return scroller.querySelector('.atc-empty') !== null;
}

/** True when the user asked the system to minimise motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
