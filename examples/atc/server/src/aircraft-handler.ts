import {
  type AircraftSnapshot,
  type AreaId,
  AREAS,
  isAreaId,
  normalizeAdsbLol,
} from '@atc/shared';
import { type NodeHandler, sendJson } from './http';

/**
 * How long a fetched snapshot is served without calling adsb.lol again.
 * adsb.lol answers 429 to a 250 nm query every 3-5 s from one IP; every 10 s
 * is sustainable. Browsers still poll every 3 s and the CDN caches for 3 s
 * (plus 5 s while revalidating), so they see a new snapshot a few seconds
 * after the server fetches it.
 */
const FRESH_MS = 10_000;
/** How old a snapshot may be and still stand in when adsb.lol fails. */
const STALE_LIMIT_MS = 60_000;
/** How long to leave adsb.lol alone after it answers 429. */
const COOLDOWN_MS = 15_000;
/** How long an upstream call may take before it counts as a failure. */
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_CONTROL = 'public, s-maxage=3, stale-while-revalidate=5';

/** Thrown for a non-ok upstream response, so a 429 can start the cooldown. */
class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`adsb.lol returned ${status}`);
  }
}

/** What the handler remembers about one area. Replaced, never mutated. */
interface AreaCache {
  readonly last: {
    readonly snapshot: AircraftSnapshot;
    readonly at: number;
  } | null;
  readonly inFlight: Promise<AircraftSnapshot> | null;
  readonly coolUntil: number;
}

const EMPTY: AreaCache = { last: null, inFlight: null, coolUntil: 0 };

/**
 * `/api/aircraft?area=pnw`: proxies adsb.lol. Each instance keeps a per-area
 * cache: concurrent requests share one upstream call, a snapshot is reused for
 * 10 s, and when adsb.lol fails (an error, a call over 8 s, or a 429, which
 * also pauses calls for 15 s) the last snapshot up to 60 s old is served with
 * `X-Atc-Stale: 1`. The CDN shares each response for 3 s, plus up to 5 s
 * while it revalidates.
 */
export function createAircraftHandler(
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
  const caches = new Map<AreaId, AreaCache>();
  const cacheFor = (area: AreaId) => caches.get(area) ?? EMPTY;
  const update = (area: AreaId, patch: Partial<AreaCache>) =>
    caches.set(area, { ...cacheFor(area), ...patch });

  const fetchSnapshot = async (area: AreaId): Promise<AircraftSnapshot> => {
    const { lat, lon, radiusNm } = AREAS[area];
    const upstream = await fetchFn(
      `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`,
      {
        // A hung call would hold every waiting request; a timeout is an
        // ordinary failure (stale data, no cooldown), unlike a 429.
        signal: AbortSignal.timeout(timeoutMs),
        // adsb.lol rejects generic user agents.
        headers: {
          accept: 'application/json',
          'user-agent': 'hashbrown-atc-example (https://hashbrown.dev)',
        },
      },
    );
    if (!upstream.ok) {
      throw new UpstreamError(upstream.status);
    }

    return normalizeAdsbLol(await upstream.json(), now());
  };

  /** Starts (or joins) the upstream call for an area and records its outcome. */
  const refresh = (area: AreaId): Promise<AircraftSnapshot> => {
    const pending = cacheFor(area).inFlight;
    if (pending) {
      return pending;
    }
    const inFlight = fetchSnapshot(area).then(
      (snapshot) => {
        update(area, { last: { snapshot, at: now() }, inFlight: null });
        return snapshot;
      },
      (error: unknown) => {
        console.error('[atc] aircraft feed failed', error);
        update(area, {
          inFlight: null,
          ...(error instanceof UpstreamError && error.status === 429
            ? { coolUntil: now() + COOLDOWN_MS }
            : {}),
        });
        throw error;
      },
    );
    update(area, { inFlight });

    return inFlight;
  };

  /** The freshest snapshot available, or null when there is none worth serving. */
  const load = async (
    area: AreaId,
  ): Promise<{ snapshot: AircraftSnapshot; stale: boolean } | null> => {
    const { last, coolUntil } = cacheFor(area);
    if (last && now() - last.at < FRESH_MS) {
      return { snapshot: last.snapshot, stale: false };
    }
    if (now() >= coolUntil) {
      try {
        return { snapshot: await refresh(area), stale: false };
      } catch {
        // Fall back to the last good snapshot below.
      }
    }
    const fallback = cacheFor(area).last;

    return fallback && now() - fallback.at <= STALE_LIMIT_MS
      ? { snapshot: fallback.snapshot, stale: true }
      : null;
  };

  return async (req, res) => {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Use GET' });
    }
    const area =
      new URL(req.url ?? '/', 'http://localhost').searchParams.get('area') ??
      '';
    if (!isAreaId(area)) {
      return sendJson(res, 400, { error: 'Unknown area' });
    }
    const result = await load(area);
    if (result === null) {
      return sendJson(res, 502, { error: 'Aircraft feed unavailable' });
    }
    sendJson(res, 200, result.snapshot, {
      'Cache-Control': CACHE_CONTROL,
      ...(result.stale ? { 'X-Atc-Stale': '1' } : {}),
    });
  };
}
