import { AREAS, isAreaId, normalizeAdsbLol } from '@atc/shared';
import { type NodeHandler, sendJson } from './http';

/** `/api/aircraft?area=ord`: proxies adsb.lol and lets the CDN share one upstream call every 5 s. */
export function createAircraftHandler(
  options: { fetchFn?: typeof fetch; now?: () => number } = {},
): NodeHandler {
  const { fetchFn = fetch, now = Date.now } = options;

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
    const { lat, lon, radiusNm } = AREAS[area];
    try {
      const upstream = await fetchFn(
        `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`,
        {
          // adsb.lol rejects generic user agents.
          headers: {
            accept: 'application/json',
            'user-agent': 'hashbrown-atc-example (https://hashbrown.dev)',
          },
        },
      );
      if (!upstream.ok) {
        throw new Error(`adsb.lol returned ${upstream.status}`);
      }
      const snapshot = normalizeAdsbLol(await upstream.json(), now());
      sendJson(res, 200, snapshot, {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
      });
    } catch (error) {
      console.error('[atc] aircraft feed failed', error);
      sendJson(res, 502, { error: 'Aircraft feed unavailable' });
    }
  };
}
