/** A point on the globe in decimal degrees. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/**
 * ICAO codes of the airports the assistant knows, in lookup priority order:
 * when two airports share a city, the first one wins (KSEA before KBFI).
 */
export const AIRPORT_CODES = [
  'KBDN',
  'KRDM',
  'KSEA',
  'KPDX',
  'KBOI',
  'KEUG',
  'KMFR',
  'KSLE',
  'KPSC',
  'KYKM',
  'KALW',
  'KGEG',
  'KBLI',
  'KPAE',
  'KBFI',
  'KTTD',
  'KHIO',
  'KUAO',
  'KLMT',
  'KOTH',
  'KONP',
  'KAST',
  'KCVO',
  'KSFF',
  'KPUW',
  'KLWS',
  'KEAT',
  'KMWH',
  'KRNT',
  'KOLM',
  'KPWT',
  'KTIW',
  'KAWO',
  'KBVS',
  'KPDT',
  'KBKE',
  'KIDA',
  'KTWF',
  'KSUN',
  'KMYL',
] as const;

/** An ICAO code from the airport table, such as KBDN. */
export type AirportCode = (typeof AIRPORT_CODES)[number];

/** An airport with its reference point. */
export interface Airport extends LatLon {
  /** ICAO code, such as KBDN. */
  readonly code: AirportCode;
  /**
   * FAA location identifier, such as BDN: the ICAO code without its K. For
   * airline airports it is also the IATA code; for others it may not be.
   */
  readonly faa: string;
  readonly name: string;
  readonly city: string;
  /** Two-letter state, such as OR. */
  readonly state: string;
  /** Other names people use, such as SeaTac. */
  readonly aliases: readonly string[];
}

function airport(
  code: AirportCode,
  name: string,
  city: string,
  state: string,
  lat: number,
  lon: number,
  aliases: readonly string[] = [],
): Airport {
  return { code, faa: code.slice(1), name, city, state, lat, lon, aliases };
}

const TABLE: readonly Airport[] = [
  airport('KBDN', 'Bend Municipal', 'Bend', 'OR', 44.0946, -121.2002),
  airport('KRDM', 'Roberts Field', 'Redmond', 'OR', 44.2541, -121.15, [
    'Redmond Municipal',
  ]),
  airport(
    'KSEA',
    'Seattle-Tacoma International',
    'Seattle',
    'WA',
    47.4502,
    -122.3088,
    ['SeaTac', 'Sea-Tac'],
  ),
  airport(
    'KPDX',
    'Portland International',
    'Portland',
    'OR',
    45.5887,
    -122.5975,
  ),
  airport('KBOI', 'Boise Airport', 'Boise', 'ID', 43.5644, -116.2228),
  airport('KEUG', 'Mahlon Sweet Field', 'Eugene', 'OR', 44.1246, -123.219),
  airport(
    'KMFR',
    'Rogue Valley International-Medford',
    'Medford',
    'OR',
    42.3742,
    -122.8735,
  ),
  airport('KSLE', 'McNary Field', 'Salem', 'OR', 44.9095, -123.0026),
  airport('KPSC', 'Tri-Cities Airport', 'Pasco', 'WA', 46.2647, -119.119, [
    'Tri-Cities',
  ]),
  airport('KYKM', 'Yakima Air Terminal', 'Yakima', 'WA', 46.5682, -120.544),
  airport(
    'KALW',
    'Walla Walla Regional',
    'Walla Walla',
    'WA',
    46.0949,
    -118.288,
  ),
  airport('KGEG', 'Spokane International', 'Spokane', 'WA', 47.6199, -117.5338),
  airport(
    'KBLI',
    'Bellingham International',
    'Bellingham',
    'WA',
    48.7928,
    -122.5375,
  ),
  airport('KPAE', 'Paine Field', 'Everett', 'WA', 47.9063, -122.2816),
  airport('KBFI', 'Boeing Field', 'Seattle', 'WA', 47.53, -122.302, [
    'King County International',
  ]),
  airport('KTTD', 'Portland-Troutdale', 'Troutdale', 'OR', 45.5494, -122.4013),
  airport('KHIO', 'Portland-Hillsboro', 'Hillsboro', 'OR', 45.5404, -122.9498),
  airport('KUAO', 'Aurora State', 'Aurora', 'OR', 45.2471, -122.77),
  airport(
    'KLMT',
    'Crater Lake-Klamath Regional',
    'Klamath Falls',
    'OR',
    42.1561,
    -121.7332,
  ),
  airport(
    'KOTH',
    'Southwest Oregon Regional',
    'North Bend',
    'OR',
    43.4171,
    -124.246,
    ['Coos Bay'],
  ),
  airport('KONP', 'Newport Municipal', 'Newport', 'OR', 44.5804, -124.058),
  airport('KAST', 'Astoria Regional', 'Astoria', 'OR', 46.158, -123.8787),
  airport('KCVO', 'Corvallis Municipal', 'Corvallis', 'OR', 44.4972, -123.2897),
  airport('KSFF', 'Felts Field', 'Spokane', 'WA', 47.6828, -117.3226),
  airport(
    'KPUW',
    'Pullman-Moscow Regional',
    'Pullman',
    'WA',
    46.7439,
    -117.11,
    ['Moscow'],
  ),
  airport(
    'KLWS',
    'Lewiston-Nez Perce County',
    'Lewiston',
    'ID',
    46.3745,
    -117.0154,
  ),
  airport('KEAT', 'Pangborn Memorial', 'Wenatchee', 'WA', 47.3989, -120.207),
  airport(
    'KMWH',
    'Grant County International',
    'Moses Lake',
    'WA',
    47.2077,
    -119.32,
  ),
  airport('KRNT', 'Renton Municipal', 'Renton', 'WA', 47.4931, -122.2157),
  airport('KOLM', 'Olympia Regional', 'Olympia', 'WA', 46.9694, -122.9025),
  airport('KPWT', 'Bremerton National', 'Bremerton', 'WA', 47.4902, -122.7648),
  airport('KTIW', 'Tacoma Narrows', 'Tacoma', 'WA', 47.2679, -122.5781, [
    'Gig Harbor',
  ]),
  airport('KAWO', 'Arlington Municipal', 'Arlington', 'WA', 48.1607, -122.159),
  airport('KBVS', 'Skagit Regional', 'Burlington', 'WA', 48.4709, -122.421, [
    'Mount Vernon',
  ]),
  airport(
    'KPDT',
    'Eastern Oregon Regional',
    'Pendleton',
    'OR',
    45.6951,
    -118.841,
  ),
  airport(
    'KBKE',
    'Baker City Municipal',
    'Baker City',
    'OR',
    44.8373,
    -117.809,
  ),
  airport(
    'KIDA',
    'Idaho Falls Regional',
    'Idaho Falls',
    'ID',
    43.5146,
    -112.071,
  ),
  airport(
    'KTWF',
    'Magic Valley Regional',
    'Twin Falls',
    'ID',
    42.4818,
    -114.488,
    ['Joslin Field'],
  ),
  airport('KSUN', 'Friedman Memorial', 'Hailey', 'ID', 43.5044, -114.296, [
    'Sun Valley',
  ]),
  airport('KMYL', 'McCall Municipal', 'McCall', 'ID', 44.8897, -116.101),
];

/** Pacific Northwest airport reference points, keyed by ICAO code. */
export const AIRPORTS = Object.fromEntries(
  TABLE.map((entry) => [entry.code, entry]),
) as Readonly<Record<AirportCode, Airport>>;

/** Returns true when `value` is an ICAO code from the airport table. */
export function isAirportCode(value: string): value is AirportCode {
  return Object.hasOwn(AIRPORTS, value);
}

/** Words that do not tell airports apart, dropped before matching. */
const FILLER = new Set([
  'airport',
  'international',
  'intl',
  'regional',
  'municipal',
  'the',
  'or',
  'oregon',
  'wa',
  'washington',
  'id',
  'idaho',
]);

/** Lowercase words with punctuation and filler removed: "Bend, OR" is "bend". */
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word !== '' && !FILLER.has(word))
    .join(' ');
}

/**
 * Resolves a place the user named to an airport in the table: an ICAO or
 * FAA code (the IATA code at airline airports), an airport name or alias, or a city, ignoring case,
 * punctuation and words such as "airport" or "Oregon". Exact matches win;
 * otherwise a name or city that starts with the query (three letters or
 * more). Returns null for places outside the table, such as Tokyo or KJFK.
 */
export function lookupPlace(query: string): Airport | null {
  const wanted = words(query);
  if (wanted === '') {
    return null;
  }
  const exact = TABLE.find((entry) =>
    [entry.code, entry.faa, entry.name, entry.city, ...entry.aliases].some(
      (candidate) => words(candidate) === wanted,
    ),
  );
  if (exact || wanted.length < 3) {
    return exact ?? null;
  }

  return (
    TABLE.find((entry) =>
      [entry.name, entry.city, ...entry.aliases].some((candidate) =>
        words(candidate).startsWith(wanted),
      ),
    ) ?? null
  );
}

/** Areas the server may fetch. */
export type AreaId = 'pnw';

/** A map area: the centre and radius of its feed, and the map's home view. */
export interface Area extends LatLon {
  readonly id: AreaId;
  readonly label: string;
  readonly radiusNm: number;
  /** Where the map opens and where `resetMap` returns it. */
  readonly view: LatLon & { readonly zoom: number };
}

/**
 * The allowlisted areas. `pnw` fetches adsb.lol's maximum radius, 250 nm,
 * around Bend Municipal (KBDN); the map opens zoomed in on central Oregon,
 * framing Bend, Redmond, Sisters and Prineville.
 */
export const AREAS: Readonly<Record<AreaId, Area>> = {
  pnw: {
    id: 'pnw',
    label: 'Pacific Northwest',
    lat: 44.0946,
    lon: -121.2002,
    radiusNm: 250,
    view: { lat: 44.2, lon: -121.2, zoom: 9 },
  },
};

/** Returns true when `value` names an allowlisted area. */
export function isAreaId(value: string): value is AreaId {
  return Object.hasOwn(AREAS, value);
}
