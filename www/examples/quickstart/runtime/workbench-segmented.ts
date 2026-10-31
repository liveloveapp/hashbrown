/** A compact single-choice toggle with radiogroup semantics and roving focus. */
export interface WorkbenchSegmented {
  /** The `role="radiogroup"` element to place in the document. */
  readonly element: HTMLElement;
  /** Renders the options and checks one, keeping focus on the same option id. */
  sync(modes: readonly { id: string; label: string }[], selected: string): void;
  /** Removes the keyboard listener. */
  dispose(): void;
}

/**
 * Creates a segmented control whose options are radios in one radiogroup.
 * Left/Right wrap, Home/End jump, and only the checked radio is tabbable.
 *
 * @param options - The accessible group label and the change callback.
 * @returns The element, a `sync` to render options, and `dispose`.
 */
export function createWorkbenchSegmented(options: {
  label: string;
  onChange(id: string): void;
}): WorkbenchSegmented {
  const element = document.createElement('div');
  element.className = 'wb-segmented';
  element.setAttribute('role', 'radiogroup');
  element.setAttribute('aria-label', options.label);
  const radios = () => [
    ...element.querySelectorAll<HTMLElement>('[role=radio]'),
  ];
  function onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const items = radios();
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
    const id = items[next].dataset.mode ?? '';
    options.onChange(id);
    radios()
      .find((item) => item.dataset.mode === id)
      ?.focus();
  }
  element.addEventListener('keydown', onKeydown);
  return {
    element,
    sync(modes, selected) {
      const existing = radios();
      const same =
        existing.length === modes.length &&
        existing.every(
          (item, i) =>
            item.dataset.mode === modes[i].id &&
            item.textContent === modes[i].label,
        );
      if (!same) {
        element.replaceChildren(
          ...modes.map((mode) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.setAttribute('role', 'radio');
            item.dataset.mode = mode.id;
            item.textContent = mode.label;
            item.onclick = () => options.onChange(mode.id);
            return item;
          }),
        );
      }
      radios().forEach((item) => {
        const checked = item.dataset.mode === selected;
        item.setAttribute('aria-checked', String(checked));
        item.tabIndex = checked ? 0 : -1;
      });
    },
    dispose: () => element.removeEventListener('keydown', onKeydown),
  };
}
