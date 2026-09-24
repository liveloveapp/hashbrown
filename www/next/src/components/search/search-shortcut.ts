/** Elements whose typing ⌘K/Ctrl+K belongs to, not the search shortcut. */
const EDITABLE =
  'input, textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * Whether a document keydown should open search: ⌘K or Ctrl+K, not already
 * handled, and not typed into an input, textarea or contenteditable. Ported
 * from the Angular `AppComponent`'s `document:keydown` listener.
 *
 * @param event - A keydown that reached the document.
 */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {
    return false;
  }
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.closest(EDITABLE) || target.isContentEditable)
  ) {
    return false;
  }
  return (
    (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
  );
}
