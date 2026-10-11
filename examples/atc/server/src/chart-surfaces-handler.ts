import type { Surfaces } from '@atc/shared';
import { createCachedLoader } from './chart/cached-loader';
import { amToSurfaces, osmToSurfaces } from './chart/surfaces';
import {
  fetchAddsAirport,
  fetchAmLayer,
  fetchOsmAeroways,
} from './chart/upstream';
import { type NodeHandler, sendJson } from './http';

const FRESH_MS = 24 * 60 * 60 * 1000;
const STALE_LIMIT_MS = 30 * FRESH_MS;
/** Overpass can take up to 20 s of its own query time. */
const UPSTREAM_TIMEOUT_MS = 18_000;
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';
const CODE = /^[A-Z0-9]{2,4}$/;
/** Cached for well-formed codes the FAA does not know, so they are not refetched. */
const UNKNOWN = 'UNKNOWN';

/**
 * `/api/chart/surfaces?airport=CODE`: taxiways, aprons and hot spots for one
 * airport. FAA Airport Mapping is used when it has taxiways, otherwise
 * OpenStreetMap through Overpass. Results are cached per code for 24 h and a
 * result up to 30 days old stands in (`X-Atc-Stale: 1`) when upstream fails.
 * Codes the FAA does not know return 400, and are cached so they are not
 * refetched.
 */
export function createChartSurfacesHandler(
  options: {
    fetchFn?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
  } = {},
): NodeHandler {
  const {
    fetchFn = fetch,
    now = Date.now,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
  } = options;
  const load = createCachedLoader<Surfaces | typeof UNKNOWN>({
    freshMs: FRESH_MS,
    staleLimitMs: STALE_LIMIT_MS,
    now,
    load: async (code) => {
      const airport = await fetchAddsAirport(fetchFn, code, timeoutMs);
      if (airport === null) {
        return UNKNOWN;
      }
      const [taxiways, aprons, hotspots] = await Promise.all([
        fetchAmLayer(fetchFn, 'AM_Taxiway', airport.faa, timeoutMs),
        fetchAmLayer(fetchFn, 'AM_Apron', airport.faa, timeoutMs),
        fetchAmLayer(fetchFn, 'AM_Hotspot', airport.faa, timeoutMs),
      ]);

      return (
        amToSurfaces(code, { taxiways, aprons, hotspots }) ??
        osmToSurfaces(code, await fetchOsmAeroways(fetchFn, airport, timeoutMs))
      );
    },
  });

  return async (req, res) => {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Use GET' });
    }
    const code = (
      new URL(req.url ?? '/', 'http://localhost').searchParams.get('airport') ??
      ''
    ).toUpperCase();
    if (!CODE.test(code)) {
      return sendJson(res, 400, { error: 'Unknown airport' });
    }
    const result = await load(code);
    if (result === null) {
      return sendJson(res, 502, { error: 'Chart data unavailable' });
    }
    if (result.value === UNKNOWN) {
      return sendJson(res, 400, { error: 'Unknown airport' });
    }
    sendJson(res, 200, result.value, {
      'Cache-Control': CACHE_CONTROL,
      ...(result.stale ? { 'X-Atc-Stale': '1' } : {}),
    });
  };
}
