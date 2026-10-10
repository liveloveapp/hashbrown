import { isRecord } from './json';
import type { Route, RouteAirport } from './store';

/** The adsb.lol route file URL for a callsign. These files allow browser requests. */
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

/** Fetches a callsign's scheduled route. Misses and network errors return null. */
export async function fetchRoute(
  callsign: string,
  fetchFn: typeof fetch = fetch,
): Promise<Route | null> {
  try {
    const response = await fetchFn(routeUrl(callsign));

    return response.ok ? parseRoute(await response.json()) : null;
  } catch {
    return null;
  }
}
