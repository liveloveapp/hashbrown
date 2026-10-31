/** Chooses an inspector panel mode by id, as a reader would with the toggle. */
export function chooseInspectorMode(host: HTMLElement, id: string): void {
  const radio = host.querySelector<HTMLElement>(
    `[role=radiogroup][aria-label="Inspector view"] [data-mode="${id}"]`,
  );
  if (!radio) throw new Error(`Missing inspector mode ${id}`);
  radio.click();
}

/** The text of the single inspector panel for the selected tab and mode. */
export function inspectorPanelText(host: HTMLElement): string {
  return host.querySelector('[data-captured]')?.textContent ?? '';
}

/** Chooses a panel mode and returns the text of its code block. */
export function inspectorPre(host: HTMLElement, id: string): string | null {
  chooseInspectorMode(host, id);
  // The State tree exposes its value as JSON on the tree element.
  return (
    host.querySelector<HTMLElement>('[data-captured] [role=tree]')?.dataset
      .json ??
    host.querySelector('[data-captured] pre')?.textContent ??
    null
  );
}

/**
 * Reads the two sections a tab used to show side by side. The State tab merges
 * them in its Tree mode, with the bottom section under `moment`.
 */
export function inspectorSections(
  host: HTMLElement,
  tab: string,
): { captured: unknown; interpreted: unknown } {
  if (tab === 'State') {
    const { moment, ...captured } = JSON.parse(
      inspectorPre(host, 'tree') ?? 'null',
    );
    return { captured, interpreted: moment };
  }
  return {
    captured: JSON.parse(inspectorPre(host, 'top') ?? 'null'),
    interpreted: JSON.parse(inspectorPre(host, 'bottom') ?? 'null'),
  };
}
