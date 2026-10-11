import {
  type Aircraft,
  aircraftKind,
  type AircraftReadings,
  type AircraftSnapshot,
  AIRPORTS,
  type AirspacePayload,
  type AirspaceShelf,
  applyAirspace,
  applySnapshot,
  AREAS,
  type ChartAirport,
  type ChartAirports,
  displayLabel,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
  type Runway,
  runwayCorners,
  type Surfaces,
} from '@atc/shared';

/** How many frames the synthetic traffic moves for (3 minutes at 3 s a frame). */
const FRAME_COUNT = 60;
const START = Date.UTC(2026, 9, 9, 18, 0, 0);
const { KSEA: SEA } = AIRPORTS;
const centre = AREAS.pnw;

/** One synthetic aircraft: where it is at frame 0 and how it moves per frame. */
interface Track {
  readonly aircraft: Aircraft;
  readonly dLat: number;
  readonly dLon: number;
  readonly dAltFt: number;
}

/** Who an aircraft is: a hex, plus a callsign and registration when it has them. */
interface Ident {
  readonly hex: string;
  readonly callsign?: string;
  readonly registration?: string;
}

function track(
  ident: Ident,
  typeCode: string | null,
  at: { lat: number; lon: number; altitudeFt: number; speedKt: number },
  motion: { dLat: number; dLon: number; dAltFt: number; trackDeg: number },
  readings: AircraftReadings = {},
): Track {
  const { hex, callsign = null, registration = null } = ident;

  return {
    aircraft: {
      hex,
      label: displayLabel({ hex, callsign, registration }),
      callsign,
      registration,
      typeCode,
      category: null,
      kind: aircraftKind({ typeCode, category: null }),
      lat: at.lat,
      lon: at.lon,
      altitudeFt: at.altitudeFt,
      onGround: false,
      groundSpeedKt: at.speedKt,
      trackDeg: motion.trackDeg,
      verticalRateFpm: Math.sign(motion.dAltFt) * 1000,
      ...readings,
    },
    dLat: motion.dLat,
    dLon: motion.dLon,
    dAltFt: motion.dAltFt,
  };
}

/**
 * The synthetic traffic: three airliners descending into SEA from the north,
 * one climbing out right next to Bend (the nearest to the map centre), one
 * cruising highest, one flying fastest and two fillers, plus private traffic
 * labelled by registration (a Cessna and a helicopter) and one aircraft that
 * broadcasts neither callsign nor registration, so only its hex labels it.
 * A Cessna 182 and a Robinson R44 fly slowly near Bend, climbing, so with
 * the regional jet they are the traffic within 25 nm of KBDN and none is
 * approaching it. Every aircraft moves and changes altitude each frame.
 * Six turboprops fly north in a tight block near Klamath Falls
 * ({@link CLUSTER}), so close that their data tags must move aside, and
 * spreading apart frame by frame.
 */
const TRACKS: readonly Track[] = [
  track(
    { hex: 'a1c001', callsign: 'ASA301' },
    'B39M',
    { lat: SEA.lat + 0.35, lon: SEA.lon, altitudeFt: 11_000, speedKt: 250 },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 180 },
  ),
  track(
    { hex: 'a1c002', callsign: 'DAL1820' },
    'A321',
    {
      lat: SEA.lat + 0.45,
      lon: SEA.lon + 0.05,
      altitudeFt: 11_500,
      speedKt: 260,
    },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 185 },
  ),
  track(
    { hex: 'a1c003', callsign: 'UAL2244' },
    'B738',
    {
      lat: SEA.lat + 0.55,
      lon: SEA.lon - 0.05,
      altitudeFt: 11_800,
      speedKt: 270,
    },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 175 },
  ),
  track(
    { hex: 'a1c004', callsign: 'SKW3410' },
    'E75L',
    {
      lat: centre.lat + 0.05,
      lon: centre.lon + 0.05,
      altitudeFt: 9_000,
      speedKt: 280,
    },
    { dLat: 0.003, dLon: 0.003, dAltFt: 300, trackDeg: 45 },
  ),
  track(
    { hex: 'a1c005', callsign: 'AAL2711' },
    'A21N',
    { lat: 45.2, lon: -119.8, altitudeFt: 41_000, speedKt: 470 },
    { dLat: 0.002, dLon: 0.006, dAltFt: 10, trackDeg: 70 },
  ),
  track(
    { hex: 'a1c006', callsign: 'FDX1234' },
    'B77L',
    { lat: 43.1, lon: -122.9, altitudeFt: 33_000, speedKt: 560 },
    { dLat: 0.005, dLon: 0.003, dAltFt: -10, trackDeg: 30 },
  ),
  track(
    { hex: 'a1c007', callsign: 'SWA1458' },
    'B38M',
    { lat: 44.9, lon: -123.4, altitudeFt: 24_000, speedKt: 420 },
    { dLat: -0.003, dLon: 0.002, dAltFt: -50, trackDeg: 150 },
  ),
  track(
    { hex: 'a1c008', callsign: 'QXE2045' },
    'DH8D',
    { lat: 42.4, lon: -120.1, altitudeFt: 17_000, speedKt: 300 },
    { dLat: 0.003, dLon: -0.002, dAltFt: 50, trackDeg: 330 },
  ),
  track(
    { hex: 'a1c009', callsign: 'N352LL', registration: 'N352LL' },
    'C172',
    { lat: 44.12, lon: -123.21, altitudeFt: 4_500, speedKt: 110 },
    { dLat: 0.001, dLon: -0.001, dAltFt: 10, trackDeg: 300 },
    { squawk: '1200', qnhHpa: 1016.4, year: '1978', seenS: 0.6 },
  ),
  track(
    { hex: 'a1c00a', registration: 'N911LF' },
    'EC35',
    { lat: 45.55, lon: -122.6, altitudeFt: 1_500, speedKt: 120 },
    { dLat: -0.001, dLon: 0.001, dAltFt: 10, trackDeg: 140 },
  ),
  track(
    { hex: 'a1c00c', registration: 'N4417B' },
    'C182',
    {
      lat: centre.lat - 0.12,
      lon: centre.lon - 0.1,
      altitudeFt: 5_500,
      speedKt: 115,
    },
    { dLat: 0.0005, dLon: 0.0005, dAltFt: 10, trackDeg: 45 },
  ),
  track(
    { hex: 'a1c00d', registration: 'N44RH' },
    'R44',
    {
      lat: centre.lat + 0.1,
      lon: centre.lon - 0.18,
      altitudeFt: 2_000,
      speedKt: 90,
    },
    { dLat: -0.0005, dLon: 0.0005, dAltFt: 10, trackDeg: 135 },
  ),
  track(
    { hex: 'a1c00b' },
    null,
    { lat: 43.56, lon: -116.22, altitudeFt: 8_000, speedKt: 150 },
    { dLat: 0.001, dLon: 0.001, dAltFt: -10, trackDeg: 45 },
  ),
  ...Array.from({ length: 6 }, (_, i) =>
    track(
      { hex: `a1c0${(0x10 + i).toString(16)}`, callsign: `QXE21${i + 10}` },
      'DH8D',
      {
        lat: 42.9 + Math.floor(i / 3) * 0.008,
        lon: -122 + (i % 3) * 0.012,
        altitudeFt: 9_000 + i * 500,
        speedKt: 140 + i * 20,
      },
      // Each flies a little faster and fans out a little more than the one
      // before, so the block keeps changing shape and its tags move.
      {
        dLat: 0.002 + i * 0.001,
        dLon: ((i % 3) - 1) * 0.002,
        dAltFt: 0,
        trackDeg: [350, 0, 10][i % 3] ?? 0,
      },
    ),
  ),
];

/**
 * The tight block of six turboprops near Klamath Falls: at the highest zoom
 * a highlight fits to, their icons are 8 to 9 px apart.
 */
export const CLUSTER: readonly string[] = TRACKS.filter(({ aircraft }) =>
  aircraft.callsign?.startsWith('QXE21'),
).map(({ aircraft }) => aircraft.hex);

/**
 * Frame `n` of the synthetic traffic. `at` always increases; positions advance
 * for {@link FRAME_COUNT} frames and then hold, so nothing ever moves backwards
 * (the store ignores snapshots that are not newer than the one it holds).
 */
export function frame(n: number): AircraftSnapshot {
  const i = Math.min(n, FRAME_COUNT - 1);

  return {
    at: START + n * 3000,
    aircraft: TRACKS.map(({ aircraft, dLat, dLon, dAltFt }) => ({
      ...aircraft,
      lat: aircraft.lat + dLat * i,
      lon: aircraft.lon + dLon * i,
      altitudeFt:
        aircraft.altitudeFt === null ? null : aircraft.altitudeFt + dAltFt * i,
    })),
  };
}

/** Every synthetic hex; a rendered card must use one of these. */
export const SYNTHETIC_HEXES: ReadonlySet<string> = new Set(
  TRACKS.map((t) => t.aircraft.hex),
);

const ANY: FindAircraftInput = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  sortBy: 'altitude',
  limit: 20,
};

/** The area the "near KBDN" scenario shows and searches. */
export const NEAR_BEND = { airport: 'KBDN', radiusNm: 25 } as const;

/** A closed ring of `[lon, lat]` points, `radiusNm` around a centre. */
function circle(
  centre: { lat: number; lon: number },
  radiusNm: number,
  points = 32,
): [number, number][] {
  const dLat = radiusNm / 60;
  const dLon = dLat / Math.cos((centre.lat * Math.PI) / 180);
  const ring = Array.from({ length: points }, (_, i): [number, number] => {
    const angle = (2 * Math.PI * i) / points;

    return [
      centre.lon + dLon * Math.sin(angle),
      centre.lat + dLat * Math.cos(angle),
    ];
  });

  return [...ring, ring[0] as [number, number]];
}

/** One airspace shelf around an airport, with its bounding box. */
function shelf(
  fields: Pick<AirspaceShelf, 'airport' | 'name' | 'class' | 'type'> &
    Partial<AirspaceShelf>,
  centre: { lat: number; lon: number },
  radiusNm: number,
  index = 0,
): AirspaceShelf {
  const ring = circle(centre, radiusNm);
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);

  return {
    id: `${fields.airport}-${fields.type}-${index}`,
    floor: { ft: 0, ref: 'SFC' },
    ceiling: null,
    partTime: false,
    rings: [ring],
    bbox: [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ],
    ...fields,
  };
}

/**
 * The `/api/chart/airspace` fixture: Portland's Class C (surface to 4,000 ft
 * MSL, 5 nm), Redmond's part-time Class D (surface to 5,600 ft, 4.3 nm) with
 * a Class E2 shelf, and a Class E2 shelf at Bend.
 */
export const CHART_AIRSPACE: AirspacePayload = {
  cycle: '2610',
  effective: '2026-10-08',
  shelves: [
    shelf(
      {
        airport: 'KPDX',
        name: 'PORTLAND CLASS C',
        class: 'C',
        type: 'C',
        ceiling: { ft: 4000, exclusive: false },
      },
      AIRPORTS.KPDX,
      5,
    ),
    shelf(
      {
        airport: 'KRDM',
        name: 'REDMOND CLASS D',
        class: 'D',
        type: 'D',
        ceiling: { ft: 5600, exclusive: false },
        partTime: true,
      },
      AIRPORTS.KRDM,
      4.3,
    ),
    shelf(
      { airport: 'KRDM', name: 'REDMOND CLASS E', class: 'E', type: 'E2' },
      AIRPORTS.KRDM,
      6,
      1,
    ),
    shelf(
      { airport: 'KBDN', name: 'BEND CLASS E', class: 'E', type: 'E2' },
      AIRPORTS.KBDN,
      4.5,
    ),
  ],
};

/** The airspace the Portland scenario searches. */
export const PORTLAND_CLASS_C = { airport: 'KPDX', class: 'C' } as const;

/** The scenario aircraft, found with the app's own search over frame 0. */
export const scenario = (() => {
  const state = applySnapshot(INITIAL_STATE, frame(0));
  const selected = findAircraft(state, { ...ANY, sortBy: 'distance' })[0];
  const highest = findAircraft(state, ANY)[0];
  const fastest = findAircraft(state, { ...ANY, sortBy: 'speed' }).find(
    (row) => row.hex !== highest?.hex,
  );
  const arrivals = findAircraft(state, {
    ...ANY,
    approaching: 'KSEA',
    sortBy: 'distance',
    limit: 10,
  });
  const approachingEveryFrame = Array.from(
    { length: FRAME_COUNT },
    (_, n) =>
      findAircraft(applySnapshot(INITIAL_STATE, frame(n)), {
        ...ANY,
        approaching: 'KSEA',
      }).length,
  ).every((count) => count === arrivals.length);
  const nearBend = { ...ANY, near: NEAR_BEND, sortBy: 'distance' } as const;
  const nearby = findAircraft(state, nearBend);
  const nearbyEveryFrame = Array.from({ length: FRAME_COUNT }, (_, n) =>
    findAircraft(applySnapshot(INITIAL_STATE, frame(n)), nearBend)
      .map((row) => row.hex)
      .sort()
      .join(),
  ).every(
    (hexes) =>
      hexes ===
      nearby
        .map((row) => row.hex)
        .sort()
        .join(),
  );
  const inPortland = {
    ...ANY,
    inAirspace: PORTLAND_CLASS_C,
    sortBy: 'distance',
  } as const;
  const portland = findAircraft(
    applyAirspace(state, CHART_AIRSPACE),
    inPortland,
  );
  const nearbyKinds = new Set(nearby.map((row) => row.kind));
  if (
    !selected ||
    !highest ||
    !fastest ||
    arrivals.length < 3 ||
    !approachingEveryFrame ||
    !nearbyEveryFrame ||
    portland.length < 1 ||
    !['jet', 'single', 'rotor'].every((kind) => nearbyKinds.has(kind))
  ) {
    throw new Error('The synthetic frames lack a scenario aircraft.');
  }

  return { selected, highest, fastest, arrivals, nearby, portland };
})();

/** The JSON a UI chat answer contains. */
export function ui(
  ...components: Record<string, { props: Record<string, unknown> }>[]
): string {
  return JSON.stringify({ ui: components });
}

/** A runway between two surveyed ends, with its true-size corners. */
function runway(
  a: { id: string; lat: number; lon: number },
  b: { id: string; lat: number; lon: number },
  lengthFt: number,
  bearingDeg: number,
  widthFt = 150,
): Runway {
  return {
    id: `${a.id}/${b.id}`,
    lengthFt,
    widthFt,
    surface: 'ASPH',
    hard: true,
    ends: [a, b],
    corners: runwayCorners(a, b, widthFt),
    bearingDeg,
  };
}

/** One chart airport; the fields the scenarios do not look at stay neutral. */
function airport(
  fields: Pick<
    ChartAirport,
    'code' | 'faa' | 'name' | 'city' | 'lat' | 'lon' | 'elevationFt' | 'rank'
  > &
    Partial<ChartAirport>,
): ChartAirport {
  return {
    state: 'OR',
    aliases: [],
    kind: 'airport',
    towered: false,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: null, unicom: null },
    weather: null,
    lighting: 'none',
    fuel: false,
    military: false,
    runways: [],
    ...fields,
  };
}

/** The `/api/chart/airports` fixture: two towered fields, a Bend field and 6K5. */
export const CHART_AIRPORTS: ChartAirports = {
  cycle: '2610',
  effective: '2026-10-08',
  airports: [
    airport({
      code: 'KRDM',
      faa: 'RDM',
      name: 'ROBERTS FLD/REDMOND MUNI',
      city: 'REDMOND',
      aliases: ['redmond'],
      lat: 44.2541,
      lon: -121.15,
      elevationFt: 3080,
      towered: true,
      towerPartTime: true,
      frequencies: {
        tower: '124.5',
        atis: '119.025',
        ctaf: '124.5',
        unicom: '122.95',
      },
      weather: { kind: 'AWOS-3', frequency: '134.425' },
      lighting: 'limited',
      fuel: true,
      rank: 0,
      runways: [
        runway(
          { id: '05', lat: 44.24950936, lon: -121.16178461 },
          { id: '23', lat: 44.25905422, lon: -121.13844225 },
          7038,
          50,
        ),
        runway(
          { id: '11', lat: 44.2585, lon: -121.1625 },
          { id: '29', lat: 44.2515, lon: -121.1385 },
          6830,
          110,
        ),
      ],
    }),
    airport({
      code: 'KBDN',
      faa: 'BDN',
      name: 'BEND MUNI',
      city: 'BEND',
      aliases: ['bend'],
      lat: 44.0948,
      lon: -121.2002,
      elevationFt: 3460,
      frequencies: { tower: null, atis: null, ctaf: '122.8', unicom: '122.8' },
      rank: 1,
      runways: [
        runway(
          { id: '17', lat: 44.1018, lon: -121.2008 },
          { id: '35', lat: 44.0878, lon: -121.1996 },
          5200,
          180,
          100,
        ),
      ],
    }),
    airport({
      code: 'KSEA',
      faa: 'SEA',
      name: 'SEATTLE-TACOMA INTL',
      city: 'SEATTLE',
      state: 'WA',
      aliases: ['seattle'],
      lat: 47.4502,
      lon: -122.3088,
      elevationFt: 433,
      towered: true,
      frequencies: {
        tower: '119.9',
        atis: '118.0',
        ctaf: null,
        unicom: null,
      },
      lighting: 'full',
      fuel: true,
      rank: 0,
      runways: [
        runway(
          { id: '16L', lat: 47.4637, lon: -122.3118 },
          { id: '34R', lat: 47.4337, lon: -122.3058 },
          11901,
          180,
          150,
        ),
      ],
    }),
    airport({
      code: '6K5',
      faa: '6K5',
      name: 'SUNRIVER',
      city: 'SUNRIVER',
      lat: 43.8706,
      lon: -121.4531,
      elevationFt: 4160,
      frequencies: { tower: null, atis: null, ctaf: '122.9', unicom: null },
      rank: 2,
      runways: [
        {
          id: '18/36',
          lengthFt: 4900,
          widthFt: 75,
          surface: 'ASPH',
          hard: true,
          ends: null,
          corners: null,
          bearingDeg: null,
        },
      ],
    }),
  ],
};

/**
 * The `/api/chart/surfaces` fixture: KRDM gets one taxiway line A beside
 * 05/23, offset 0.002 degrees of latitude; any other field is runways-only.
 */
export function chartSurfaces(code: string): Surfaces {
  if (code !== 'KRDM') return { code, source: 'runways-only', features: [] };

  return {
    code,
    source: 'faa',
    features: [
      {
        kind: 'taxiway',
        shape: 'line',
        ref: 'A',
        widthFt: 75,
        points: [
          [-121.16178461, 44.24950936 + 0.002],
          [-121.13844225, 44.25905422 + 0.002],
        ],
      },
    ],
  };
}
