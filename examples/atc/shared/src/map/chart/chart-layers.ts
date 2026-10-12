import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import type { AtcState, AtcStore } from '../../store';
import { createAirportLayer } from './airport-layer';
import { createAirspaceLayer } from './airspace-layer';
import { placeChartLabels } from './chart-labels';
import { createDiagramLayer } from './diagram-layer';

/** The chart overlay panes and their z-index, bottom to top. */
const CHART_PANES = [
  ['atc-airspace', 410],
  ['atc-diagram', 420],
  ['atc-airports', 430],
] as const;

/** The mounted chart overlays. */
export interface ChartLayers {
  /** Syncs every layer with `state`; places the labels when a layer changed. */
  sync(state: AtcState): void;
  /** Redraws every layer for the current view and places the labels. */
  redraw(): void;
  /** Removes every layer. */
  destroy(): void;
}

/**
 * The chart overlays as one: airspace, airports and diagrams, each in its own
 * pane above the tiles and below the planes (Leaflet's marker pane is 600).
 * Airport and airspace labels are placed together (`placeChartLabels`) after
 * the layers redraw for a settled view, or after a sync that changed them;
 * aircraft snapshots never place them.
 */
export function createChartLayers(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  element: HTMLElement;
  fetchFn?: typeof fetch;
}): ChartLayers {
  const { L, map, store, element, fetchFn } = options;
  for (const [name, zIndex] of CHART_PANES) {
    map.createPane(name).style.zIndex = String(zIndex);
  }
  const airspace = createAirspaceLayer({
    L,
    map,
    store,
    pane: 'atc-airspace',
  });
  const airports = createAirportLayer({ L, map, store, pane: 'atc-airports' });
  const diagrams = createDiagramLayer({
    L,
    map,
    store,
    pane: 'atc-diagram',
    element,
    fetchFn,
  });
  const placeLabels = () =>
    placeChartLabels({
      sources: [airspace, airports],
      airportBoxes: airports.airportBoxes,
    });

  return {
    sync(state) {
      const changed = [airspace.sync(state), airports.sync(state)];
      diagrams.sync(state);
      if (changed.some(Boolean)) {
        placeLabels();
      }
    },
    redraw() {
      airspace.redraw();
      airports.redraw();
      diagrams.redraw();
      placeLabels();
    },
    destroy() {
      airspace.destroy();
      airports.destroy();
      diagrams.destroy();
    },
  };
}
