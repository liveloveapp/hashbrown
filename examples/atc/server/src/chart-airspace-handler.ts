import { type AirspacePayload, AREAS } from '@atc/shared';
import { normalizeAirspace } from './chart/airspace';
import { CHART_CACHE_CONTROL, createCycleLoader } from './chart/cached-loader';
import { fetchClassAirspace } from './chart/upstream';
import { type NodeHandler, sendCached, sendJson } from './http';

/** One deadline across all pages, inside the 20 s Vercel function limit. */
const LOAD_DEADLINE_MS = 17_000;

/**
 * `/api/chart/airspace`: Class B, C, D and E surface airspace shelves from the
 * FAA ADDS Class_Airspace layer, for the map's airspace layer. Each instance
 * caches the payload per AIRAC cycle: concurrent requests share one build, a
 * payload is reused for 24 h, and when the FAA fails (including the first
 * request of a new cycle) the last one up to 30 days old is served with
 * `X-Atc-Stale: 1`. All pages share one `deadlineMs` (17 s by default). The
 * CDN shares each response for a day.
 */
export function createChartAirspaceHandler(
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
  const load = createCycleLoader<AirspacePayload>({
    now,
    build: async (cycle) => {
      const features = await fetchClassAirspace(
        fetchFn,
        AbortSignal.timeout(deadlineMs),
      );
      const { shelves, dropped } = normalizeAirspace(
        features,
        AREAS.pnw,
        AREAS.pnw.radiusNm,
      );
      if (dropped > 0) {
        console.error(`[atc] airspace dropped ${dropped} shelves`);
      }

      return { cycle: cycle.ident, effective: cycle.effective, shelves };
    },
  });

  return async (req, res) => {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Use GET' });
    }
    const result = await load();
    if (result === null) {
      return sendJson(res, 502, { error: 'Airspace data unavailable' });
    }
    sendCached(res, result.value, {
      stale: result.stale,
      cacheControl: CHART_CACHE_CONTROL,
    });
  };
}
