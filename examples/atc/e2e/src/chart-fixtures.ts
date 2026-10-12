import {
  AIRPORTS,
  type AirspacePayload,
  type AirspaceShelf,
  type ChartAirport,
  type ChartAirports,
  type Runway,
  runwayCorners,
  type Surfaces,
} from '@atc/shared';

/*
 * The chart fixtures the browser's `/api/chart/*` routes are stubbed with: a
 * few Oregon and Seattle airports, their airspace and one taxiway.
 */

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
