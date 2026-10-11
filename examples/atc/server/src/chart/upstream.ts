import type { LatLon } from '@atc/shared';
import { readZipEntries } from './zip';
import type { NasrFiles } from './nasr';

const NASR_BASE = 'https://nfdc.faa.gov/webContent/28DaySub/extra';
const ARCGIS_BASE =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'hashbrown-atc-example (https://hashbrown.dev)';

/** Downloads one NASR zip and unpacks it. Throws on a non-ok response. */
async function fetchZip(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Map<string, string>> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`FAA NASR returned ${response.status} for ${url}`);
  }

  return readZipEntries(new Uint8Array(await response.arrayBuffer()));
}

/** Pulls one named file out of an unpacked zip. */
function entry(entries: Map<string, string>, name: string): string {
  const text = entries.get(name);
  if (text === undefined) {
    throw new Error(`NASR zip is missing ${name}`);
  }

  return text;
}

/**
 * Fetches the APT and FRQ CSV subscription zips for a NASR cycle date (such
 * as `01_Oct_2026`) in parallel and returns the four files the chart reads.
 * Throws on a non-ok response, a timeout, or a missing file.
 */
export async function fetchNasr(
  fetchFn: typeof fetch,
  nasrDate: string,
  timeoutMs: number,
): Promise<NasrFiles> {
  const [apt, frq] = await Promise.all([
    fetchZip(fetchFn, `${NASR_BASE}/${nasrDate}_APT_CSV.zip`, timeoutMs),
    fetchZip(fetchFn, `${NASR_BASE}/${nasrDate}_FRQ_CSV.zip`, timeoutMs),
  ]);

  return {
    aptBase: entry(apt, 'APT_BASE.csv'),
    aptRwy: entry(apt, 'APT_RWY.csv'),
    aptRwyEnd: entry(apt, 'APT_RWY_END.csv'),
    frq: entry(frq, 'FRQ.csv'),
  };
}

/** GETs a URL and parses JSON. Throws on a non-ok response or a timeout. */
async function getJson(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} for ${url}`);
  }

  const body: unknown = await response.json();
  // ArcGIS reports quota and query errors as a 200 with an `error` member.
  if (typeof body === 'object' && body !== null && 'error' in body) {
    throw new Error(`Upstream error for ${url}: ${JSON.stringify(body.error)}`);
  }

  return body;
}

/**
 * Looks up a public-use airport in the FAA ADDS US_Airport layer by ident or
 * ICAO code. The code must already match `^[A-Z0-9]{2,4}$`. Returns the FAA
 * ident and position of the first match, or null when there is none.
 */
export async function fetchAddsAirport(
  fetchFn: typeof fetch,
  code: string,
  timeoutMs: number,
): Promise<{ faa: string; lat: number; lon: number } | null> {
  const query = new URLSearchParams({
    where: `(IDENT='${code}' OR ICAO_ID='${code}') AND PRIVATEUSE=0`,
    outFields: 'IDENT,ICAO_ID',
    outSR: '4326',
    f: 'geojson',
  });
  const json = await getJson(
    fetchFn,
    `${ARCGIS_BASE}/US_Airport/FeatureServer/0/query?${query}`,
    timeoutMs,
  );
  const features = (json as { features?: unknown }).features;
  const first: unknown = Array.isArray(features) ? features[0] : undefined;
  const properties = (first as { properties?: { IDENT?: unknown } } | undefined)
    ?.properties;
  const coordinates = (
    first as { geometry?: { coordinates?: unknown } } | undefined
  )?.geometry?.coordinates;
  const faa = properties?.IDENT;
  if (
    typeof faa !== 'string' ||
    !/^[A-Z0-9]{2,4}$/.test(faa) ||
    !Array.isArray(coordinates)
  ) {
    return null;
  }
  const [lon, lat] = coordinates as unknown[];

  return typeof lon === 'number' && typeof lat === 'number'
    ? { faa, lat, lon }
    : null;
}

/**
 * Fetches one FAA Airport Mapping layer for an airport as GeoJSON in WGS84,
 * with coordinates at 6 decimals. `faa` must come from `fetchAddsAirport`.
 */
export function fetchAmLayer(
  fetchFn: typeof fetch,
  layer: 'AM_Taxiway' | 'AM_Apron' | 'AM_Hotspot',
  faa: string,
  timeoutMs: number,
): Promise<unknown> {
  const query = new URLSearchParams({
    where: `FAA_ID='${faa}'`,
    // Each layer only has one of the two fields, and unknown fields are an error.
    outFields: layer === 'AM_Hotspot' ? 'HOT_ID' : 'DESIGNATOR',
    outSR: '4326',
    f: 'geojson',
    geometryPrecision: '6',
  });

  return getJson(
    fetchFn,
    `${ARCGIS_BASE}/${layer}/FeatureServer/0/query?${query}`,
    timeoutMs,
  );
}

/**
 * Fetches taxiways, aprons and holding positions within 3 km of a point from
 * OpenStreetMap through Overpass, with geometry. Throws on a non-ok response.
 */
export async function fetchOsmAeroways(
  fetchFn: typeof fetch,
  at: LatLon,
  timeoutMs: number,
): Promise<unknown> {
  const ql = `[out:json][timeout:20];way(around:3000,${at.lat},${at.lon})["aeroway"~"^(taxiway|taxilane|apron|holding_position)$"];out geom tags;`;
  const response = await fetchFn(OVERPASS_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(ql)}`,
  });
  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}`);
  }

  return response.json();
}
