import { loadSurfaces } from './chart/chart-feed';
import { fetchRoute } from './routes';
import type { AtcStore } from './store';
import { createAtcTools } from './tools';

/**
 * The atc tools wired to their data: scheduled routes from
 * vrs-standing-data.adsb.lol and airport surfaces from `/api/chart/surfaces`,
 * loaded into `store` (so `showAirport` can report the diagram it draws).
 * Both apps call this.
 */
export function createBrowserAtcTools(store: AtcStore) {
  return createAtcTools({
    store,
    fetchRoute,
    loadSurfaces: (code) => loadSurfaces({ store, code }),
  });
}
