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

/**
 * SVG path data (24 by 24 box, nose up, filled with the current colour) for
 * each kind. The jet has swept wings; the twin has straight wings with two
 * engine pods; the single has a straight wing and a nose prop; the rotor has
 * a fuselage with a rotor disc and tail boom.
 */
export const KIND_PATHS: Readonly<Record<AircraftKind, string>> = {
  jet: 'M12 2l1.6 6.4L21 13v2l-7.3-2.2-.7 5.4 2.5 1.8V21L12 20l-3.5 1v-1l2.5-1.8-.7-5.4L3 15v-2l7.4-4.6z',
  twin: 'M12 2c.9 0 1.4 1.1 1.4 2.8V9.2H22v2H13.4v5.3l2.4 1.5v2.2L12 19.4 8.2 21.2V19l2.4-1.5v-5.3H2v-2h8.6V4.8C10.6 3.1 11.1 2 12 2zM5.6 6.4c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2s-1.2-.5-1.2-1.2V7.6c0-.7.5-1.2 1.2-1.2zm12.8 0c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2s-1.2-.5-1.2-1.2V7.6c0-.7.5-1.2 1.2-1.2z',
  single:
    'M12 4c.9 0 1.4 1 1.4 2.4v3.4H22v2.2h-8.6v5l2.6 1.4V21l-4-.7-4 .7v-1.6l2.6-1.4v-5H2V9.8h8.6V6.4C10.6 5 11.1 4 12 4zM8 2h8v1.5H8z',
  rotor:
    'M12 6.8c1.9 0 3.1 1.4 3.1 3.3v2.6c0 1.6-1 2.8-2.3 3.2l.4 5.1h-2.4l.4-5.1c-1.3-.4-2.3-1.6-2.3-3.2v-2.6c0-1.9 1.2-3.3 3.1-3.3zM3.06 5.75l.88-1.1 17 13.6-.88 1.1zM20.06 4.65l.88 1.1-17 13.6-.88-1.1zM9 21.4h6V22.6H9z',
};
