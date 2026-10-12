import { AREAS, type ChartAirports } from '@atc/shared';
import { CHART_CACHE_CONTROL, createCycleLoader } from './chart/cached-loader';
import { buildChartAirports } from './chart/nasr';
import { fetchNasr } from './chart/upstream';
import { type NodeHandler, sendCached, sendJson } from './http';

/** The APT zip is about 8 MB, so the upstream call gets a generous timeout. */
const UPSTREAM_TIMEOUT_MS = 25_000;

/**
 * `/api/chart/airports`: airports, runways and frequencies for the map's
 * sectional-style layer, built from the FAA NASR subscription files of the
 * current AIRAC cycle. Each instance caches the payload per cycle: concurrent
 * requests share one build, a payload is reused for 24 h, and when the FAA
 * fails (including the first request of a new cycle) the last one up to 30
 * days old is served with `X-Atc-Stale: 1`. The CDN shares each response for
 * a day.
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
  const load = createCycleLoader<ChartAirports>({
    now,
    build: async (cycle) => {
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
    const result = await load();
    if (result === null) {
      return sendJson(res, 502, { error: 'Chart data unavailable' });
    }
    sendCached(res, result.value, {
      stale: result.stale,
      cacheControl: CHART_CACHE_CONTROL,
    });
  };
}
