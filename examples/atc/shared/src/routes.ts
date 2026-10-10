import { isRecord } from './json';
import type { Route, RouteAirport } from './store';

// Fetched by the browser straight from adsb.lol (CORS allowed), so route
// lookups do not touch our server; the user's IP is visible to adsb.lol.

/** The adsb.lol route file URL for a callsign. */
export function routeUrl(callsign: string): string {
  const key = callsign.trim().toUpperCase();

  return `https://vrs-standing-data.adsb.lol/routes/${key.slice(0, 2)}/${key}.json`;
}

function parseRouteAirport(value: unknown): RouteAirport | null {
  if (!isRecord(value)) {
    return null;
  }
  const iata = value['iata'];
  const name = value['name'];
  const city = value['location'];
  if (
    typeof iata !== 'string' ||
    typeof name !== 'string' ||
    typeof city !== 'string'
  ) {
    return null;
  }

  return { iata, name, city };
}

/** Parses an adsb.lol route file. Returns null unless it has at least two stops. */
export function parseRoute(payload: unknown): Route | null {
  if (!isRecord(payload) || !Array.isArray(payload['_airports'])) {
    return null;
  }
  const stops = payload['_airports'].flatMap((value: unknown) => {
    const stop = parseRouteAirport(value);

    return stop === null ? [] : [stop];
  });

  return stops.length < 2 ? null : { stops };
}

/**
 * Fetches a callsign's scheduled route; null when none is published (a 404 or
 * an unusable file). Throws when the lookup itself fails (offline, a server
 * error), so callers can retry instead of remembering a miss.
 */
export async function fetchRoute(
  callsign: string,
  fetchFn: typeof fetch = fetch,
): Promise<Route | null> {
  const response = await fetchFn(routeUrl(callsign));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Route lookup failed with ${response.status}`);
  }

  return parseRoute(await response.json().catch(() => null));
}
