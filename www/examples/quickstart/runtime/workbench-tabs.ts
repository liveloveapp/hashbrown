/** Local keyboard navigation and semantics for a horizontal automatic tablist. */
export interface WorkbenchTabs {
  /** Synchronizes selection after tabs are created or replaced, without moving focus. */
  sync(selectedId: string): void;
  /** Removes the delegated keyboard listener. */
  dispose(): void;
}

/**
 * Adds roving focus and automatic arrow/Home/End activation to a tablist.
 * Existing click handlers own selection; replacement tabs retain focus by id.
 *
 * @param tablist - The horizontal tablist containing tabs with stable ids.
 * @param panel - The shared panel controlled by the selected tab.
 * @returns Selection synchronization and listener cleanup.
 */
export function createWorkbenchTabs(
  tablist: HTMLElement,
  panel: HTMLElement,
): WorkbenchTabs {
  const tabs = () => [...tablist.querySelectorAll<HTMLElement>('[role=tab]')];
  tablist.setAttribute('aria-orientation', 'horizontal');
  panel.tabIndex = 0;
  function onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const items = tabs();
    const index = items.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % items.length
        : event.key === 'ArrowLeft'
          ? (index + items.length - 1) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const id = items[next].id;
    items[next].click();
    tabs()
      .find((item) => item.id === id)
      ?.focus();
  }
  tablist.addEventListener('keydown', onKeydown);
  return {
    sync: (selectedId) => {
      tabs().forEach((item) => {
        const selected = item.id === selectedId;
        item.tabIndex = selected ? 0 : -1;
        item.setAttribute('aria-selected', String(selected));
        item.setAttribute('aria-controls', panel.id);
        if (selected) panel.setAttribute('aria-labelledby', item.id);
      });
    },
    dispose: () => tablist.removeEventListener('keydown', onKeydown),
  };
}
