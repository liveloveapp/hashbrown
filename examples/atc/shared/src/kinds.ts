/** The four marker silhouettes. */
export const KINDS = ['jet', 'twin', 'single', 'rotor'] as const;

/** What an aircraft looks like on the map. */
export type AircraftKind = (typeof KINDS)[number];

const CATEGORY = /^[A-C][0-7]$/;

/**
 * True for an ADS-B emitter category such as `A3` (letters A to C, then a
 * digit 0 to 7). Anything else is not trusted.
 */
export function isCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY.test(value);
}

const JETS = [
  // Airliners
  'A19N A20N A21N A319 A320 A321 A332 A333 A339 A359 A35K A388 BCS1 BCS3',
  'B712 B737 B738 B739 B37M B38M B39M B3XM B744 B748 B752 B753 B762 B763',
  'B764 B772 B77L B77W B788 B789 B78X MD11 MD82 MD83 MD88 MD90',
  'CRJ2 CRJ7 CRJ9 CRJX E135 E145 E170 E75L E75S E190 E195 E290 E295',
  // Business jets
  'C25A C25B C25C C510 C525 C550 C560 C56X C680 C700 C750 CL30 CL35 CL60',
  'GLF4 GLF5 GLF6 GL5T GL7T LJ35 LJ45 LJ60 FA7X FA50 H25B E55P E50P',
].join(' ');

const TWINS =
  'DH8A DH8B DH8C DH8D AT43 AT45 AT72 AT76 SF34 BE20 BE9L B350 BE99 ' +
  'C441 PA34 PA31 BE58 BE55 DA42 DA62 C310 C340 C421 AC90 MU2 SW4';

const SINGLES =
  'C150 C152 C162 C172 C175 C177 C180 C182 C185 C206 C207 C210 C208 PC12 ' +
  'P28A P28R PA28 PA32 PA46 SR20 SR22 BE35 BE36 M20P M20T RV6 RV7 RV8 ' +
  'RV10 RV12 DA40 DA20 TBM7 TBM9 PA18 PA11 J3 AA5 AC11 CH7A BL8 GLID S22T';

const ROTORS =
  'R22 R44 R66 EC20 EC30 EC35 EC45 EC55 H125 H130 H135 H145 AS50 AS55 AS65 ' +
  'B06 B407 B412 B429 S76 S92 S61 UH1 H60 A109 A139 EXPL MD52 MD60 ' +
  'CH47 B105 H500 AS32 AS35';

function table(
  entries: ReadonlyArray<readonly [AircraftKind, string]>,
): ReadonlyMap<string, AircraftKind> {
  return new Map(
    entries.flatMap(([kind, codes]) =>
      codes.split(' ').map((code) => [code, kind] as const),
    ),
  );
}

const TYPE_KINDS = table([
  ['jet', JETS],
  ['twin', TWINS],
  ['single', SINGLES],
  ['rotor', ROTORS],
]);

/**
 * The kind from an ADS-B emitter category: A7 rotorcraft; A3 to A6 jets; A2
 * a twin; A1 and every B category (gliders, balloons, UAVs) a single.
 */
const CATEGORY_KINDS: Readonly<Record<string, AircraftKind>> = {
  A1: 'single',
  A2: 'twin',
  A3: 'jet',
  A4: 'jet',
  A5: 'jet',
  A6: 'jet',
  A7: 'rotor',
};

/**
 * Picks the silhouette for an aircraft. A bundled table of common ICAO type
 * codes decides when the type is known; otherwise the ADS-B category does;
 * otherwise a jet.
 */
export function aircraftKind(aircraft: {
  readonly typeCode: string | null;
  readonly category: string | null;
}): AircraftKind {
  const byType =
    aircraft.typeCode === null
      ? undefined
      : TYPE_KINDS.get(aircraft.typeCode.toUpperCase());
  if (byType !== undefined) {
    return byType;
  }
  if (aircraft.category === null) {
    return 'jet';
  }

  return (
    CATEGORY_KINDS[aircraft.category] ??
    (aircraft.category.startsWith('B') ? 'single' : 'jet')
  );
}

/** A point on the 24 by 24 icon grid, x then y, y pointing down. */
type Point = readonly [x: number, y: number];

/** Twice the signed area; positive means clockwise on screen (y down). */
function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0);
}

/**
 * A closed polygon as absolute path commands, always wound clockwise so
 * overlapping parts of one silhouette fill as a union (nonzero fill rule).
 */
function polygon(points: readonly Point[]): string {
  const wound = signedArea(points) < 0 ? [...points].reverse() : points;
  return (
    wound.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('') + 'Z'
  );
}

/** Reflects points across the centre line x = 12. */
function mirror(points: readonly Point[]): Point[] {
  return points.map(([x, y]) => [24 - x, y] as const);
}

/**
 * A polygon from its right half, traced from a point on the centre line to
 * another point on the centre line. The left half is its exact mirror, so
 * the outline is symmetric by construction.
 */
function symmetric(rightHalf: readonly Point[]): string {
  const left = mirror(rightHalf.slice(1, -1)).reverse();
  return polygon([...rightHalf, ...left]);
}

/**
 * Vector silhouettes on a 24 by 24 grid, nose up, filled with the current
 * colour. Every vertex sits on a quarter-unit grid, every shape is mirror
 * symmetric about x = 12, and stays inside the 20-unit keyline (x and y 2
 * to 22). The fixed-wing kinds span the full keyline so they read at the
 * same size; the rotor disc is about as wide as the fuselage is long. The jet has swept
 * wings; the twin has straight wings with two engine pods; the single has a
 * straight wing and a short, thin prop (about a fifth of the span, as on a
 * Cessna); the rotor has a fuselage, tail boom and crossed rotor blades.
 */
export const KIND_PATHS: Readonly<Record<AircraftKind, string>> = {
  jet: symmetric([
    [12, 2],
    [13, 3.25],
    [13.5, 5],
    [13.5, 9],
    [22, 14],
    [22, 16],
    [13.5, 13.5],
    [13, 18.5],
    [16, 20.5],
    [16, 22],
    [12, 21],
  ]),
  twin: symmetric([
    [12, 2.5],
    [13, 3.5],
    [13.5, 5.5],
    [13.5, 9.5],
    [16, 9.5],
    [16, 7],
    [16.5, 6.5],
    [17.5, 6.5],
    [18, 7],
    [18, 9.5],
    [22, 10],
    [22, 12],
    [18, 12],
    [18, 13.5],
    [16, 13.5],
    [16, 12],
    [13.5, 12],
    [13, 18.5],
    [16.5, 20],
    [16.5, 21.5],
    [12, 21],
  ]),
  single:
    symmetric([
      [12, 4],
      [13, 4.75],
      [13.5, 6.5],
      [13.5, 8.5],
      [22, 8.5],
      [22, 11],
      [13.5, 11],
      [13, 17.5],
      [15.75, 18.75],
      [15.75, 20.5],
      [12, 20],
    ]) +
    polygon([
      [10.25, 2.5],
      [13.75, 2.5],
      [13.75, 3.25],
      [10.25, 3.25],
    ]),
  rotor:
    symmetric([
      [12, 6],
      [13.75, 6.5],
      [14.75, 8.25],
      [14.75, 12.75],
      [13.75, 14.5],
      [12.75, 15.25],
      [12.75, 20.25],
      [15, 20.25],
      [15, 21.75],
      [12, 21.75],
    ]) +
    polygon([
      [5.5, 3],
      [19.5, 17],
      [18.5, 18],
      [4.5, 4],
    ]) +
    polygon(
      mirror([
        [5.5, 3],
        [19.5, 17],
        [18.5, 18],
        [4.5, 4],
      ]),
    ),
};
