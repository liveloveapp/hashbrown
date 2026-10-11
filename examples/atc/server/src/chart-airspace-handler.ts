import { type AirspacePayload, AREAS, currentCycle } from '@atc/shared';
import { normaliseAirspace } from './chart/airspace';
import { createCachedLoader } from './chart/cached-loader';
import { fetchClassAirspace } from './chart/upstream';
import { type NodeHandler, sendJson } from './http';

/** How long a built payload is served without fetching the FAA again. */
const FRESH_MS = 24 * 60 * 60 * 1000;
/** How old a payload may be and still stand in when the FAA fails. */
const STALE_LIMIT_MS = 30 * FRESH_MS;
/** One deadline across all pages, inside the 20 s Vercel function limit. */
const LOAD_DEADLINE_MS = 17_000;
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

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
  /** The newest payload built for any cycle; replaced, never mutated. */
  let lastGood: {
    readonly value: AirspacePayload;
    readonly at: number;
  } | null = null;
  const loadCycle = createCachedLoader<AirspacePayload>({
    freshMs: FRESH_MS,
    staleLimitMs: STALE_LIMIT_MS,
    now,
    load: async (ident) => {
      const cycle = currentCycle(new Date(now()));
      if (cycle.ident !== ident) {
        throw new Error(`Cycle changed from ${ident} to ${cycle.ident}`);
      }
      const features = await fetchClassAirspace(
        fetchFn,
        AbortSignal.timeout(deadlineMs),
      );
      const { shelves, dropped } = normaliseAirspace(
        features,
        AREAS.pnw,
        AREAS.pnw.radiusNm,
      );
      if (dropped > 0) {
        console.error(`[atc] airspace dropped ${dropped} shelves`);
      }

      const payload = {
        cycle: cycle.ident,
        effective: cycle.effective,
        shelves,
      };
      lastGood = { value: payload, at: now() };

      return payload;
    },
  });

  return async (req, res) => {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Use GET' });
    }
    const loaded = await loadCycle(currentCycle(new Date(now())).ident);
    const result =
      loaded ??
      (lastGood && now() - lastGood.at <= STALE_LIMIT_MS
        ? { value: lastGood.value, stale: true }
        : null);
    if (result === null) {
      return sendJson(res, 502, { error: 'Airspace data unavailable' });
    }
    sendJson(res, 200, result.value, {
      'Cache-Control': CACHE_CONTROL,
      ...(result.stale ? { 'X-Atc-Stale': '1' } : {}),
    });
  };
}
