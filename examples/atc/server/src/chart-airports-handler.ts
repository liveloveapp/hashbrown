import { AREAS, type ChartAirports, currentCycle } from '@atc/shared';
import { createCachedLoader } from './chart/cached-loader';
import { buildChartAirports } from './chart/nasr';
import { fetchNasr } from './chart/upstream';
import { type NodeHandler, sendJson } from './http';

/** How long a built payload is served without fetching the FAA again. */
const FRESH_MS = 24 * 60 * 60 * 1000;
/** How old a payload may be and still stand in when the FAA fails. */
const STALE_LIMIT_MS = 30 * FRESH_MS;
/** The APT zip is about 8 MB, so the upstream call gets a generous timeout. */
const UPSTREAM_TIMEOUT_MS = 25_000;
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

/**
 * `/api/chart/airports`: airports, runways and frequencies for the map's
 * sectional-style layer, built from the FAA NASR subscription files of the
 * current AIRAC cycle. Each instance caches the payload per cycle: concurrent
 * requests share one build, a payload is reused for 24 h, and when the FAA
 * fails the last one up to 30 days old is served with `X-Atc-Stale: 1`. The
 * CDN shares each response for a day.
 */
export function createChartAirportsHandler(
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
  const loadCycle = createCachedLoader<ChartAirports>({
    freshMs: FRESH_MS,
    staleLimitMs: STALE_LIMIT_MS,
    now,
    load: async (ident) => {
      const cycle = currentCycle(new Date(now()));
      if (cycle.ident !== ident) {
        throw new Error(`Cycle changed from ${ident} to ${cycle.ident}`);
      }
      const files = await fetchNasr(fetchFn, cycle.nasrDate, timeoutMs);
      const { airports, dropped } = buildChartAirports(
        files,
        AREAS.pnw,
        AREAS.pnw.radiusNm,
      );
      if (dropped > 0) {
        console.error(`[atc] chart airports dropped ${dropped} rows`);
      }

      return { cycle: cycle.ident, effective: cycle.effective, airports };
    },
  });

  return async (req, res) => {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Use GET' });
    }
    const result = await loadCycle(currentCycle(new Date(now())).ident);
    if (result === null) {
      return sendJson(res, 502, { error: 'Chart data unavailable' });
    }
    sendJson(res, 200, result.value, {
      'Cache-Control': CACHE_CONTROL,
      ...(result.stale ? { 'X-Atc-Stale': '1' } : {}),
    });
  };
}
