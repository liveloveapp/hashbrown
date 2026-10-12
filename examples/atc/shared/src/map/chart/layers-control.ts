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
 * Adds the Layers pill to `map`: a button that opens a small panel with
 * Airports and Airspace checkboxes (`store.setLayers`) and the FAA cycle.
 * The checkboxes and their text follow the store; a limited chart reads
 * "Airports · limited data" and failed airspace "Airspace · unavailable".
 * Enter or a click opens the panel, Escape closes it and returns focus to the
 * button. Clicks and scrolls inside never reach the map. Add it after the
 * zoom control: Leaflet stacks later bottom controls above.
 */
export function createLayersControl(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
}): LayersControl {
  const { L, map, store } = options;
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
  /** A labelled checkbox row and its text. */
  const checkboxRow = (name: string) => {
    const row = make('label', 'atc-layers-row');
    const input = make('input');
    input.type = 'checkbox';
    input.name = name;
    const text = make('span');
    row.append(input, text);
    return { row, input, text };
  };
  const airports = checkboxRow('airports');
  const airspace = checkboxRow('airspace');
  const cycle = make('p', 'atc-layers-cycle');
  panel.append(airports.row, airspace.row, cycle);
  container.append(toggle, panel);

  let open = false;
  const setOpen = (value: boolean) => {
    open = value;
    panel.hidden = !value;
    toggle.setAttribute('aria-expanded', String(value));
  };
  toggle.addEventListener('click', () => setOpen(!open));
  airports.input.addEventListener('change', () =>
    store.setLayers({ airports: airports.input.checked }),
  );
  airspace.input.addEventListener('change', () =>
    store.setLayers({ airspace: airspace.input.checked }),
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

  let shown: Pick<AtcState, 'chart' | 'layers' | 'airspace'> | null = null;
  /** Updates the panel when the chart, the airspace or the layers changed. */
  const render = (state: AtcState) => {
    if (
      shown?.chart === state.chart &&
      shown.layers === state.layers &&
      shown.airspace === state.airspace
    ) {
      return;
    }
    shown = {
      chart: state.chart,
      layers: state.layers,
      airspace: state.airspace,
    };
    airports.input.checked = state.layers.airports;
    airports.text.textContent =
      state.chart.status === 'limited' ? 'Airports · limited data' : 'Airports';
    airspace.input.checked = state.layers.airspace;
    airspace.text.textContent =
      state.airspace.status === 'failed'
        ? 'Airspace · unavailable'
        : 'Airspace';
    cycle.textContent = state.chart.cycle
      ? `FAA cycle ${state.chart.cycle}`
      : '';
    cycle.hidden = !state.chart.cycle;
  };

  const Control = L.Control.extend({ onAdd: () => container });
  const control = new Control({ position: 'bottomright' });
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
