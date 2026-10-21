import { filterChips } from '../filter-view';
import type { MapFilter } from '../find-aircraft';
import type { AtcState } from '../store';

/** The map's filter pill and how to update it. */
export interface FilterPill {
  readonly element: HTMLElement;
  /**
   * Shows the state's current map filter as chips, or hides the pill when
   * there is none. `streaming` names the fields still arriving, drawn dashed.
   * Rebuilds only when the chips changed.
   */
  sync(state: AtcState, streaming: ReadonlySet<keyof MapFilter>): void;
}

/**
 * Creates the filter pill (`data-testid="filter-pill"`): a chip per clause of
 * the current map filter and an x button (named "Clear filter") that calls
 * `onClear`. It shows whatever filter is in the store, whoever set it.
 * Content is text nodes only.
 */
export function createFilterPill(
  doc: Document,
  onClear: () => void,
): FilterPill {
  const element = doc.createElement('div');
  element.className = 'atc-filter';
  element.setAttribute('data-testid', 'filter-pill');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Map filter');
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target instanceof Element && event.target.closest('button')) {
      onClear();
    }
  });
  let key = '';

  return {
    element,
    sync(state, streaming) {
      const applied = state.mapFilter;
      const chips =
        applied === null ? [] : filterChips(state, applied.filter, streaming);
      element.classList.toggle('is-open', chips.length > 0);
      const next = JSON.stringify(chips);
      if (next === key) {
        return;
      }
      key = next;
      if (chips.length === 0) {
        element.replaceChildren();
        return;
      }
      const nodes = chips.map((chip) => {
        const node = doc.createElement('span');
        node.className = 'atc-filter-chip';
        node.setAttribute('data-state', chip.state);
        node.append(doc.createTextNode(chip.label));
        if (chip.state !== 'set') {
          const unknown = chip.state === 'unknown';
          const note = doc.createElement('span');
          note.className = unknown ? 'atc-filter-note' : 'atc-filter-hint';
          note.append(
            doc.createTextNode(unknown ? 'unknown place' : 'pending'),
          );
          node.append(doc.createTextNode(' '), note);
        }

        return node;
      });
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Clear filter');
      button.append(doc.createTextNode('✕'));
      element.replaceChildren(...nodes, button);
    },
  };
}
