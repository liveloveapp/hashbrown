import type * as Leaflet from 'leaflet';
import type { Circle, Map as LeafletMap } from 'leaflet';
import { airportByCode } from '../directory';
import type { AtcStore, ShownArea } from '../store';

/** Metres in a nautical mile, for Leaflet's circle radius. */
const METRES_PER_NM = 1852;

/** The faint circle around the shown area. */
export interface AreaOutline {
  /** Draws the outline for `shown`, or removes it when there is none. */
  sync(shown: ShownArea | null): void;
}

/**
 * Creates the shown area's outline: a faint circle of the area's radius
 * around its airport, redrawn only when the shown area changes. An area
 * whose airport is unknown draws nothing.
 */
export function createAreaOutline(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
}): AreaOutline {
  const { L, map, store } = options;
  // The class, not `L.svg()`, which returns null where SVG is not detected.
  const renderer = new L.SVG({ padding: 0.5 });
  let outline: { readonly area: ShownArea; readonly layer: Circle } | null =
    null;

  return {
    sync(shown) {
      if (outline?.area === shown) {
        return;
      }
      outline?.layer.remove();
      outline = null;
      if (shown === null) {
        return;
      }
      const centre = airportByCode(store.getState(), shown.airport);
      if (centre === null) {
        return;
      }
      const layer = L.circle([centre.lat, centre.lon], {
        radius: shown.radiusNm * METRES_PER_NM,
        className: 'atc-area',
        renderer,
        fill: false,
        weight: 1,
        interactive: false,
      }).addTo(map);
      outline = { area: shown, layer };
    },
  };
}
