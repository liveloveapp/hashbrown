import { workbenchIcon } from './workbench-icons';

/** A "More" button and the menu of inspector views that do not fit the bar. */
export interface WorkbenchMoreMenu {
  /** A wrapper holding the "More" button (`aria-haspopup="menu"`) and its menu. */
  readonly element: HTMLElement;
  /** Replaces the listed views; the whole control hides when the list is empty. */
  sync(items: readonly string[]): void;
  /** Removes the document listeners. */
  dispose(): void;
}

/**
 * Creates the More menu. Choosing an item calls `onSelect` and closes the
 * menu. Arrow keys, Home and End move through the items, Escape closes the
 * menu and returns focus to the button, and a click outside closes it.
 *
 * @param options - A unique id prefix and the selection callback.
 * @returns The element, a `sync` to list the items, and `dispose`.
 */
export function createWorkbenchMoreMenu(options: {
  readonly idPrefix: string;
  readonly onSelect: (tab: string) => void;
}): WorkbenchMoreMenu {
  const element = document.createElement('div');
  element.className = 'wb-more';
  element.hidden = true;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'wb-more-button';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'wb-more-menu';
  menu.id = `${options.idPrefix}-more-menu`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'More inspector views');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);
  const chevron = workbenchIcon('chevron-down');
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append('More', chevron);
  element.append(trigger, menu);

  const entries = () => [
    ...menu.querySelectorAll<HTMLElement>('[role=menuitem]'),
  ];
  function setOpen(open: boolean): void {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }
  function open(focusIndex: number): void {
    setOpen(true);
    const items = entries();
    items[(focusIndex + items.length) % items.length]?.focus();
  }
  trigger.onclick = () => (menu.hidden ? open(0) : setOpen(false));
  trigger.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open(event.key === 'ArrowDown' ? 0 : -1);
    } else if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      setOpen(false);
    }
  };
  menu.onkeydown = (event) => {
    const items = entries();
    const index = items.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : event.key === 'ArrowUp'
          ? (index + items.length - 1) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      items[next].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.focus();
    } else if (event.key === 'Tab') setOpen(false);
  };
  const onDocumentClick = (event: MouseEvent) => {
    if (!element.contains(event.target as Node)) setOpen(false);
  };
  document.addEventListener('click', onDocumentClick);

  return {
    element,
    sync(items) {
      element.hidden = items.length === 0;
      if (items.length === 0) setOpen(false);
      const current = entries().map((item) => item.textContent);
      // Rebuilding would drop focus from an open menu on every render.
      if (
        current.length === items.length &&
        current.every((name, index) => name === items[index])
      )
        return;
      menu.replaceChildren(
        ...items.map((name) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.setAttribute('role', 'menuitem');
          item.tabIndex = -1;
          item.textContent = name;
          item.onclick = () => {
            setOpen(false);
            options.onSelect(name);
          };
          return item;
        }),
      );
    },
    dispose: () => document.removeEventListener('click', onDocumentClick),
  };
}
