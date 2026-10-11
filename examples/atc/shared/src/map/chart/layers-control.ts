import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import type { AtcState, AtcStore } from '../../store';

/** A mounted Layers control. */
export interface LayersControl {
  /** Stops following the store and removes the control. */
  destroy(): void;
}

/** Gives each control's panel its own id for `aria-controls`. */
let nextPanelId = 0;

/**
 * Adds the Layers pill to `map`: a button that opens a small panel with an
 * Airports checkbox (`store.setLayers`) and the FAA cycle. The checkbox and
 * its text follow the store; a limited chart reads "Airports · limited
 * data". Enter or a click opens the panel, Escape closes it and returns
 * focus to the button. Clicks and scrolls inside never reach the map. Add it
 * after the zoom control: Leaflet stacks later bottom controls above.
 */
export function createLayersControl(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  position?: 'bottomright';
}): LayersControl {
  const { L, map, store, position = 'bottomright' } = options;
  const doc = map.getContainer().ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  const container = make('div', 'leaflet-control atc-layers');
  const panelId = `atc-layers-panel-${nextPanelId++}`;
  const toggle = make('button', 'atc-layers-toggle');
  toggle.type = 'button';
  toggle.textContent = 'Layers';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panelId);

  const panel = make('div', 'atc-layers-panel');
  panel.id = panelId;
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Map layers');
  const row = make('label', 'atc-layers-row');
  const airports = make('input');
  airports.type = 'checkbox';
  airports.name = 'airports';
  const text = make('span');
  row.append(airports, text);
  const cycle = make('p', 'atc-layers-cycle');
  panel.append(row, cycle);
  container.append(toggle, panel);

  let open = false;
  const setOpen = (value: boolean) => {
    open = value;
    panel.hidden = !value;
    toggle.setAttribute('aria-expanded', String(value));
  };
  toggle.addEventListener('click', () => setOpen(!open));
  airports.addEventListener('change', () =>
    store.setLayers({ airports: airports.checked }),
  );
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return;
    // Handled here, so the map's Escape does not also clear the selection.
    event.preventDefault();
    setOpen(false);
    toggle.focus();
  });
  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  let shown: Pick<AtcState, 'chart' | 'layers'> | null = null;
  /** Updates the panel when the chart or the layers changed. */
  const render = (state: AtcState) => {
    if (shown?.chart === state.chart && shown.layers === state.layers) return;
    shown = { chart: state.chart, layers: state.layers };
    airports.checked = state.layers.airports;
    text.textContent =
      state.chart.status === 'limited' ? 'Airports · limited data' : 'Airports';
    cycle.textContent = state.chart.cycle
      ? `FAA cycle ${state.chart.cycle}`
      : '';
    cycle.hidden = !state.chart.cycle;
  };

  const Control = L.Control.extend({ onAdd: () => container });
  const control = new Control({ position });
  control.addTo(map);
  render(store.getState());
  const unsubscribe = store.subscribe(() => render(store.getState()));

  return {
    destroy() {
      unsubscribe();
      control.remove();
    },
  };
}
