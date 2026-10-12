import type { Surfaces } from '@atc/shared';
import { createCachedLoader } from './chart/cached-loader';
import { airportMappingToSurfaces, osmToSurfaces } from './chart/surfaces';
import {
  fetchAddsAirport,
  fetchAirportMappingLayer,
  fetchOsmAeroways,
} from './chart/upstream';
import { type NodeHandler, sendJson } from './http';

const FRESH_MS = 24 * 60 * 60 * 1000;
const STALE_LIMIT_MS = 30 * FRESH_MS;
/**
 * One deadline for the whole load (ADDS lookup, Airport Mapping, Overpass), so
 * it ends inside the 20 s Vercel function limit. Overpass is asked for 12 s.
 */
const LOAD_DEADLINE_MS = 17_000;
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';
const CODE = /^[A-Z0-9]{2,4}$/;
/** Cached for well-formed codes the FAA does not know, so they are not refetched. */
const UNKNOWN = 'UNKNOWN';

/** The Airport Mapping surfaces, or null when there are none or a layer fails. */
async function loadAm(
  fetchFn: typeof fetch,
  code: string,
  faa: string,
  signal: AbortSignal,
): Promise<Surfaces | null> {
  try {
    const [taxiways, aprons, hotspots] = await Promise.all([
      fetchAirportMappingLayer(fetchFn, 'AM_Taxiway', faa, signal),
      fetchAirportMappingLayer(fetchFn, 'AM_Apron', faa, signal),
      fetchAirportMappingLayer(fetchFn, 'AM_Hotspot', faa, signal),
    ]);

    return airportMappingToSurfaces(code, { taxiways, aprons, hotspots });
  } catch {
    // Treated as "no FAA data", so OpenStreetMap can still draw the airport.
    return null;
  }
}

/**
 * `/api/chart/surfaces?airport=CODE`: taxiways, aprons and hot spots for one
 * airport. FAA Airport Mapping is used when it has taxiways, otherwise
 * OpenStreetMap through Overpass. Results are cached per code for 24 h and a
 * result up to 30 days old stands in (`X-Atc-Stale: 1`) when upstream fails.
 * Codes the FAA does not know return 400, and are cached so they are not
 * refetched. An Airport Mapping failure counts as no FAA data; a failed
 * airport lookup or Overpass fetch fails the load. The whole load shares one
 * `deadlineMs` (17 s by default).
 */
export function createChartSurfacesHandler(
  options: {
    fetchFn?: typeof fetch;
    now?: () => number;
    deadlineMs?: number;
  } = {},
): NodeHandler {
  const {
    fetchFn = fetch,
    now = Date.now,
    deadlineMs = LOAD_DEADLINE_MS,
  } = options;
  const load = createCachedLoader<Surfaces | typeof UNKNOWN>({
    freshMs: FRESH_MS,
    staleLimitMs: STALE_LIMIT_MS,
    now,
    load: async (code) => {
      const signal = AbortSignal.timeout(deadlineMs);
      const airport = await fetchAddsAirport(fetchFn, code, signal);
      if (airport === null) {
        return UNKNOWN;
      }
      const faa = await loadAm(fetchFn, code, airport.faa, signal);

      return (
        faa ??
        osmToSurfaces(code, await fetchOsmAeroways(fetchFn, airport, signal))
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
