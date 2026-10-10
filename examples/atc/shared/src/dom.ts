const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Whether an event started somewhere the user is typing. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null;
}

/**
 * Whether focus landing on `target` should open the sheet: anything inside it
 * except the handle, whose own click toggles (a pointer press focuses the
 * button first, which would otherwise open and immediately close the sheet).
 */
export function focusOpensSheet(target: EventTarget | null): boolean {
  return !(
    target instanceof Element && target.closest('.atc-sheet-handle') !== null
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
